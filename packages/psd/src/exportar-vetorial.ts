// A exportação vetorial (ADR 034): junta o mapeamento vetorial, o motor (que diz como o texto quebrou e rasteriza o que
// não tem equivalente em vetor) e a porta do formato. Um arquivo por prancheta no SVG; uma página por prancheta no PDF.
import type { Documento, No, NoTexto, Prancheta } from '@otto/documento';
import { codificarPng, criarSessao, limitesDoNo, nomePostScript, renderizarPrancheta, type Sessao } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { type ArquivoExportado, nomeDeArquivo, type OpcoesDeExportacao, type RecursosConhecidos, type RecursosDaExportacao, tipoDaImagem } from './exportar';
import type { FonteDisponivel, ImagemDisponivel } from './montar';
import { type MeiosDoVetorial, montarVetorial } from './montar-vetorial';
import type { FormatoDeArquivoEmCamadas, ImagemDoArquivo } from './porta';
import { fecharRelatorioVetorial, type RelatorioDeExportacaoVetorial, relatorioVazio } from './relatorio';

export interface OpcoesDoVetorial extends Pick<OpcoesDeExportacao, 'nome' | 'pranchetas' | 'entreEtapas'> {
  /**
   * 'juntas': um arquivo só, com uma página por prancheta. Só para formato com páginas (PDF), e é o padrão dele.
   * 'por-prancheta': um arquivo por prancheta. É o único jeito do SVG.
   */
  arquivos?: 'por-prancheta' | 'juntas';
  /** pixels por unidade do documento nas camadas que viram imagem. Padrão: 2 (o vetor costuma ser ampliado). */
  escalaDaImagem?: number;
}

export interface ResultadoDaExportacaoVetorial {
  arquivos: ArquivoExportado[];
  relatorio: RelatorioDeExportacaoVetorial;
}

function pranchetasPedidas(doc: Documento, ids: readonly string[] | undefined): Prancheta[] {
  if (!ids) return doc.pranchetas;
  const desconhecida = ids.find((id) => !doc.pranchetas.some((p) => p.id === id));
  if (desconhecida) throw new Error(`A prancheta "${desconhecida}" não existe no documento`);
  return doc.pranchetas.filter((p) => ids.includes(p.id));
}

/** A área que os nós ocupam (grupo: tudo dentro), em coordenadas da prancheta. */
function areaDe(sessao: Sessao, nos: readonly No[]): { x0: number; y0: number; x1: number; y1: number } | undefined {
  let area: { x0: number; y0: number; x1: number; y1: number } | undefined;
  const somar = (n: No): void => {
    if (n.tipo === 'grupo') {
      for (const f of n.filhos) somar(f);
      return;
    }
    if (n.tipo === 'ajuste') return;
    const l = limitesDoNo(sessao, n);
    area = area ? { x0: Math.min(area.x0, l.x), y0: Math.min(area.y0, l.y), x1: Math.max(area.x1, l.x + l.w), y1: Math.max(area.y1, l.y + l.h) } : { x0: l.x, y0: l.y, x1: l.x + l.w, y1: l.y + l.h };
  };
  for (const n of nos) somar(n);
  return area;
}

function meiosDoMotor(sessao: Sessao, doc: Documento, escala: number): MeiosDoVetorial {
  return {
    linhas(no: NoTexto) {
      const d = sessao.texto.diagramar(no);
      return d.linhas.map((l, k) => ({ x: l.x, base: l.base, inicio: d.intervalos[k]?.[0] ?? 0, fim: d.intervalos[k]?.[1] ?? 0 }));
    },
    rasterizar(p: Prancheta, nos: readonly No[]): ImagemDoArquivo | undefined {
      const area = areaDe(sessao, nos);
      if (!area) return undefined;
      const x0 = Math.max(0, Math.floor(area.x0));
      const y0 = Math.max(0, Math.floor(area.y0));
      const x1 = Math.min(p.largura, Math.ceil(area.x1));
      const y1 = Math.min(p.altura, Math.ceil(area.y1));
      if (x1 <= x0 || y1 <= y0) return undefined;
      const r = renderizarPrancheta(sessao, doc, { ...p, filhos: [...nos] }, { fundo: false, regiao: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, escala });
      return { tipo: 'png', bytes: codificarPng(sessao, r), largura: r.largura, altura: r.altura, transformacao: [(x1 - x0) / r.largura, 0, 0, (y1 - y0) / r.altura, x0, y0] };
    },
  };
}

/**
 * Exporta o documento num formato vetorial (SVG ou PDF, pela porta). O texto sai como texto, na quebra do motor; forma,
 * vetor e foto saem editáveis; o que não tem equivalente vira imagem ou fica de fora, e o relatório diz qual e por quê.
 * `formato` grava um arquivo por prancheta.
 */
export async function exportarVetorial(
  ck: CanvasKit,
  formato: FormatoDeArquivoEmCamadas,
  doc: Documento,
  recursos: RecursosDaExportacao,
  opcoes: OpcoesDoVetorial,
): Promise<ResultadoDaExportacaoVetorial> {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const sessao = criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
  try {
    const fontes: (FonteDisponivel & { bytes: Uint8Array })[] = recursos.fontes.map((f) => {
      const postScript = f.postScript ?? nomePostScript(f.bytes);
      if (!postScript) throw new Error(`O arquivo da fonte ${f.familia} ${f.peso} não tem nome PostScript`);
      return { familia: f.familia, peso: f.peso, postScript, bytes: f.bytes, ...(f.arquivo ? { arquivo: f.arquivo } : {}) };
    });
    const imagens: ImagemDisponivel[] = recursos.imagens.map((i) => {
      const tipo = i.tipo ?? tipoDaImagem(i.bytes);
      if (!tipo) throw new Error(`A imagem ${i.arquivo.slice(0, 12)} não é PNG, JPEG nem WebP`);
      const decodificada = sessao.imagem(i.arquivo);
      return { arquivo: i.arquivo, tipo, bytes: i.bytes, ...(decodificada ? { largura: decodificada.width(), altura: decodificada.height() } : {}) };
    });
    const rel = relatorioVazio(doc, pranchetas) as unknown as RelatorioDeExportacaoVetorial;
    const meios = meiosDoMotor(sessao, doc, opcoes.escalaDaImagem ?? 2);
    const arquivos: ArquivoExportado[] = [];
    let modoTrocado = false;
    const juntas = (opcoes.arquivos ?? (formato.capacidades?.paginas ? 'juntas' : 'por-prancheta')) === 'juntas';
    if (juntas && !formato.capacidades?.paginas) throw new Error('Este formato leva uma prancheta por arquivo');
    const semDegradeTransparente = formato.capacidades?.degradeTransparente === false;
    const fontesDe = (usadas: readonly string[]) => fontes.filter((f) => usadas.includes(f.postScript)).map((f) => ({ postScript: f.postScript, bytes: f.bytes }));
    const montadas: { p: Prancheta; m: ReturnType<typeof montarVetorial> }[] = [];
    for (const p of pranchetas) {
      await opcoes.entreEtapas?.();
      const m = montarVetorial({ doc, prancheta: p, fontes, imagens, meios, rel, semDegradeTransparente });
      modoTrocado ||= m.modoTrocado;
      montadas.push({ p, m });
    }
    const gravar = async (nome: string, arquivo: Parameters<FormatoDeArquivoEmCamadas['escrever']>[0]): Promise<void> => {
      const gravado = await formato.escrever({ titulo: nome, ...arquivo });
      rel.arquivos.push(`${nomeDeArquivo(nome)}.${gravado.extensao}`);
      arquivos.push({ nome: `${nomeDeArquivo(nome)}.${gravado.extensao}`, bytes: gravado.bytes });
    };
    if (juntas) {
      // uma página por prancheta: cada prancheta é uma camada de cima com as camadas dela dentro, em coordenadas próprias
      await gravar(opcoes.nome, {
        largura: Math.max(...montadas.map((x) => x.m.largura)),
        altura: Math.max(...montadas.map((x) => x.m.altura)),
        camadas: montadas.map(({ p, m }) => ({
          nome: p.nome,
          opacidade: 1,
          modo: 'atravessar',
          oculta: false,
          recortadaNaDeBaixo: false,
          bloqueada: false,
          prancheta: { x: 0, y: 0, largura: m.largura, altura: m.altura, fundo: { r: 0, g: 0, b: 0 } },
          filhos: m.camadas,
        })),
        embutidos: [],
        fontes: fontesDe(montadas.flatMap((x) => x.m.fontesUsadas)),
      });
    } else {
      for (const { p, m } of montadas)
        await gravar(pranchetas.length === 1 ? opcoes.nome : `${opcoes.nome} - ${p.nome}`, {
          largura: m.largura,
          altura: m.altura,
          camadas: m.camadas,
          embutidos: [],
          fontes: fontesDe(m.fontesUsadas),
        });
    }
    return { arquivos, relatorio: fecharRelatorioVetorial(rel, modoTrocado) };
  } finally {
    sessao.destruir();
  }
}

/** O relatório de uma exportação vetorial que ainda não foi feita, sem renderizar: é o mesmo código que monta o arquivo. */
export function relatorioDeExportacaoVetorial(
  doc: Documento,
  recursos: RecursosConhecidos,
  opcoes: Pick<OpcoesDeExportacao, 'pranchetas'> & { formato?: 'svg' | 'pdf' } = {},
): RelatorioDeExportacaoVetorial {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const rel = relatorioVazio(doc, pranchetas) as unknown as RelatorioDeExportacaoVetorial;
  let modoTrocado = false;
  for (const p of pranchetas)
    modoTrocado = montarVetorial({ doc, prancheta: p, fontes: recursos.fontes, imagens: recursos.imagens, rel, semDegradeTransparente: opcoes.formato === 'pdf' }).modoTrocado || modoTrocado;
  return fecharRelatorioVetorial(rel, modoTrocado);
}
