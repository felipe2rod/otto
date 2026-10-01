// O relatório de exportação como a tela o mostra. Função pura: recebe o relatório da API e devolve
// só o que vai aparecer, já com as frases de textos/. As frases que vêm de @otto/psd (`avisos[].texto`
// e `camadas[].observacao`) ficam de fora de propósito: não passaram pelo guardião da marca e afirmam
// coisas sobre o Photoshop que ninguém conferiu. A frase é escolhida pelo código.
import type { RelatorioDeExportacao } from '@otto/shared';
import { editor } from '../../textos/editor';
import { exportar } from '../../textos/exportar';

const t = exportar.relatorio;

export interface RelatorioNaTela {
  /** Falso no PNG: não há camada no arquivo, e o resumo e a tabela não aparecem. */
  temCamadas: boolean;
  resumo: string;
  comEdicao: number;
  emPixel: { onde: string; motivo: string }[];
  fontes: string[];
  pesosTrocados: string[];
  emFalta: string[];
  imagens: { texto: string; pagina?: string }[];
  observacoes: string[];
  camadas: { onde: string; tipo: string; comoVai: string }[];
}

const TIPOS: Readonly<Record<string, string>> = { ...editor.camadas.tipos, prancheta: t.todas.fundoDaPrancheta };

function motivo(linha: RelatorioDeExportacao['camadas'][number]): string {
  return t.emPixel.motivos[linha.mapeamento] ?? (linha.destino === 'nativo-pixel' ? t.emPixel.semOriginal : t.emPixel.generico);
}

/** Só http e https viram link: o endereço vem do documento, que é dado do cliente. */
function paginaSegura(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function lerRelatorio(relatorio: RelatorioDeExportacao): RelatorioNaTela {
  const comEdicao = relatorio.camadas.filter((c) => c.destino === 'nativo-editavel').length;
  const emPixel = relatorio.camadas.filter((c) => c.destino !== 'nativo-editavel').map((c) => ({ onde: t.onde(c.prancheta, c.camada), motivo: motivo(c) }));
  return {
    temCamadas: relatorio.camadas.length > 0,
    resumo: t.resumo(comEdicao, emPixel.length, relatorio.fontes.length),
    comEdicao,
    emPixel,
    fontes: relatorio.fontes.map((f) => t.fontes.item(f.familia, editor.propriedades.nomeDoPeso(f.peso, editor.propriedades.pesos[f.peso]))),
    pesosTrocados: relatorio.substituicoes.map((s) => t.pesosTrocados.item(s.camada, s.pedida.familia, s.pedida.peso, s.usada.peso)),
    emFalta: [...relatorio.emFalta.fontes.map((f) => t.emFalta.fonte(f.familia, f.camadas)), ...relatorio.emFalta.imagens.map((i) => t.emFalta.imagem(i.camadas))],
    imagens: relatorio.imagens.map((i) => {
      const pagina = paginaSegura(i.url);
      return { texto: t.imagens.item(i.camada, i.banco, i.autor, i.licenca), ...(pagina ? { pagina } : {}) };
    }),
    observacoes: relatorio.avisos.flatMap((a) => t.observacoes.doCodigo[a.codigo] ?? []),
    camadas: relatorio.camadas.map((c) => ({ onde: t.onde(c.prancheta, c.camada), tipo: TIPOS[c.tipo] ?? c.tipo, comoVai: t.todas.destinos[c.destino] })),
  };
}
