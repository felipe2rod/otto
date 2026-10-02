// A exportação vetorial (ADR 034): junta o mapeamento vetorial, o motor (que diz como o texto quebrou e rasteriza o que
// não tem equivalente em vetor) e a porta do formato. Um arquivo por prancheta no SVG; uma página por prancheta no PDF.
import type { Documento, No, NoTexto, Prancheta } from '@otto/documento';
import { codificarJpeg, codificarPng, criarSessao, limitesDoNo, nomePostScript, renderizarPrancheta, type Sessao } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { type ArquivoExportado, nomeDeArquivo, type OpcoesDeExportacao, type RecursosConhecidos, type RecursosDaExportacao, tipoDaImagem } from './exportar';
import type { FonteDisponivel, ImagemDisponivel } from './montar';
import { type MeiosDoVetorial, montarVetorial } from './montar-vetorial';
import { type FormatoDeArquivoEmCamadas, type ImagemDoArquivo, MODOS_DO_PDF } from './porta';
import { fecharRelatorioVetorial, type RelatorioDeExportacaoVetorial, relatorioVazio } from './relatorio';

export interface OpcoesDoVetorial extends Pick<OpcoesDeExportacao, 'nome' | 'pranchetas' | 'entreEtapas'> {
  /**
   * 'por-prancheta' (padrão): um arquivo por prancheta. É o único jeito do SVG, e é o que o Illustrator abre inteiro
   * (de um PDF de várias páginas ele abre só a primeira, a não ser que a pessoa mexa na janela de importação).
   * 'juntas': um arquivo só, com uma página por prancheta. Só para formato com páginas (PDF).
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

/**
 * A imagem (cor e alfa) que, posta em modo normal por cima de `sem`, dá `com`. As duas são a mesma área, opacas, em RGBA.
 * Para cada pixel: cor × alfa + sem × (1 − alfa) = com, com o menor alfa que deixa a cor entre 0 e 255 nos três canais.
 * Onde as duas são iguais (ou diferem em 1 nível) o alfa é zero. Devolve também a área em que há diferença.
 */
export function imagemEquivalenteEmNormal(sem: Uint8Array, com: Uint8Array, largura: number, altura: number): { rgba: Uint8Array; area: { x: number; y: number; w: number; h: number } | undefined } {
  const rgba = new Uint8Array(largura * altura * 4);
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0, px = 0; i < rgba.length; i += 4, px++) {
    let alfa = 0;
    for (let c = 0; c < 3; c++) {
      const b = sem[i + c] as number;
      const r = com[i + c] as number;
      if (r > b) alfa = Math.max(alfa, (r - b) / (255 - b));
      else if (r < b) alfa = Math.max(alfa, (b - r) / b);
    }
    // diferença de até 1 nível em todos os canais não se vê, e é o que mais pesa no arquivo: fica transparente
    if (
      alfa === 0 ||
      Math.max(Math.abs((com[i] as number) - (sem[i] as number)), Math.abs((com[i + 1] as number) - (sem[i + 1] as number)), Math.abs((com[i + 2] as number) - (sem[i + 2] as number))) <= 1
    )
      continue;
    // o alfa arredonda para cima, para a cor caber em 8 bits
    const alfa8 = Math.min(255, Math.ceil(alfa * 255));
    const a = alfa8 / 255;
    for (let c = 0; c < 3; c++) {
      const b = sem[i + c] as number;
      rgba[i + c] = Math.max(0, Math.min(255, Math.round(b + ((com[i + c] as number) - b) / a)));
    }
    rgba[i + 3] = alfa8;
    const x = px % largura;
    const y = (px - x) / largura;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { rgba, area: x1 < 0 ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

function meiosDoMotor(sessao: Sessao, doc: Documento, escala: number): MeiosDoVetorial {
  return {
    linhas(no: NoTexto) {
      const d = sessao.texto.diagramar(no);
      return d.linhas.map((l, k) => ({ x: l.x, base: l.base, inicio: d.intervalos[k]?.[0] ?? 0, fim: d.intervalos[k]?.[1] ?? 0 }));
    },
    rasterizar(p: Prancheta, nos: readonly No[], opcoes = {}): ImagemDoArquivo | undefined {
      const area = opcoes.comFundo ? { x0: 0, y0: 0, x1: p.largura, y1: p.altura } : areaDe(sessao, nos);
      if (!area) return undefined;
      const x0 = Math.max(0, Math.floor(area.x0));
      const y0 = Math.max(0, Math.floor(area.y0));
      const x1 = Math.min(p.largura, Math.ceil(area.x1));
      const y1 = Math.min(p.altura, Math.ceil(area.y1));
      if (x1 <= x0 || y1 <= y0) return undefined;
      const r = renderizarPrancheta(
        sessao,
        doc,
        { ...p, filhos: [...nos] },
        { fundo: opcoes.comFundo === true, regiao: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, escala: Math.min(escala, opcoes.escalaMaxima ?? escala) },
      );
      const transformacao: ImagemDoArquivo['transformacao'] = [(x1 - x0) / r.largura, 0, 0, (y1 - y0) / r.altura, x0, y0];
      // sem transparência nenhuma, vai em JPEG (quando o motor codifica JPEG): o arquivo fica muito menor e abre mais rápido
      let opaca = true;
      for (let i = 3; i < r.rgba.length && opaca; i += 4) opaca = r.rgba[i] === 255;
      const jpeg = opaca ? codificarJpeg(sessao, r) : undefined;
      return jpeg
        ? { tipo: 'jpeg', bytes: jpeg, largura: r.largura, altura: r.altura, transformacao }
        : { tipo: 'png', bytes: codificarPng(sessao, r), largura: r.largura, altura: r.altura, transformacao };
    },
    equivalenteEmNormal(p: Prancheta, antes: readonly No[], depois: readonly No[]): ImagemDoArquivo | undefined {
      // Na resolução do documento, e não no dobro como as outras imagens: esta imagem costuma cobrir a prancheta inteira
      // (grão, textura, luz) e, com transparência, só cabe em PNG. No dobro, um grão de 1080 × 1350 passa de 15 MB.
      const render = (nos: readonly No[]) => renderizarPrancheta(sessao, doc, { ...p, filhos: [...nos] }, { fundo: true, escala: 1 });
      const sem = render(antes);
      const com = render(depois);
      const { rgba, area } = imagemEquivalenteEmNormal(sem.rgba, com.rgba, com.largura, com.altura);
      if (!area) return undefined;
      // só a área em que a camada muda alguma coisa
      const recorte = new Uint8Array(area.w * area.h * 4);
      for (let y = 0; y < area.h; y++) recorte.set(rgba.subarray(((area.y + y) * com.largura + area.x) * 4, ((area.y + y) * com.largura + area.x + area.w) * 4), y * area.w * 4);
      const k = p.largura / com.largura;
      return { tipo: 'png', bytes: codificarPng(sessao, { largura: area.w, altura: area.h, rgba: recorte }), largura: area.w, altura: area.h, transformacao: [k, 0, 0, k, area.x * k, area.y * k] };
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
    let achatadas = 0;
    let modosEmImagem = 0;
    let imagemSobreTexto = false;
    const juntas = opcoes.arquivos === 'juntas';
    if (juntas && !formato.capacidades?.paginas) throw new Error('Este formato leva uma prancheta por arquivo');
    const semDegradeTransparente = formato.capacidades?.degradeTransparente === false;
    const fontesDe = (usadas: readonly string[]) => fontes.filter((f) => usadas.includes(f.postScript)).map((f) => ({ postScript: f.postScript, bytes: f.bytes }));
    const montadas: { p: Prancheta; m: ReturnType<typeof montarVetorial> }[] = [];
    for (const p of pranchetas) {
      await opcoes.entreEtapas?.();
      const m = montarVetorial({ doc, prancheta: p, fontes, imagens, meios, rel, semDegradeTransparente, modos: formato.capacidades?.modos ?? [] });
      achatadas += m.achatadas;
      modosEmImagem += m.modosEmImagem;
      imagemSobreTexto ||= m.imagemSobreTexto;
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
    return {
      arquivos,
      relatorio: fecharRelatorioVetorial(rel, { achatadas, modosEmImagem, imagemSobreTexto, ...(opcoes.escalaDaImagem !== undefined ? { escalaDaImagem: opcoes.escalaDaImagem } : {}) }),
    };
  } finally {
    sessao.destruir();
  }
}

/** O relatório de uma exportação vetorial que ainda não foi feita, sem renderizar: é o mesmo código que monta o arquivo. */
export function relatorioDeExportacaoVetorial(
  doc: Documento,
  recursos: RecursosConhecidos,
  opcoes: Pick<OpcoesDeExportacao, 'pranchetas'> & { formato?: 'svg' | 'pdf'; escalaDaImagem?: number } = {},
): RelatorioDeExportacaoVetorial {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const rel = relatorioVazio(doc, pranchetas) as unknown as RelatorioDeExportacaoVetorial;
  let achatadas = 0;
  let modosEmImagem = 0;
  let imagemSobreTexto = false;
  for (const p of pranchetas) {
    const m = montarVetorial({
      doc,
      prancheta: p,
      fontes: recursos.fontes,
      imagens: recursos.imagens,
      rel,
      semDegradeTransparente: opcoes.formato === 'pdf',
      modos: opcoes.formato === 'pdf' ? MODOS_DO_PDF : [],
    });
    achatadas += m.achatadas;
    modosEmImagem += m.modosEmImagem;
    imagemSobreTexto ||= m.imagemSobreTexto;
  }
  return fecharRelatorioVetorial(rel, { achatadas, modosEmImagem, imagemSobreTexto, ...(opcoes.escalaDaImagem !== undefined ? { escalaDaImagem: opcoes.escalaDaImagem } : {}) });
}
