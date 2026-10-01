// O relatório de exportação como a tela o mostra. Função pura: recebe o relatório da API e devolve
// só o que vai aparecer, já com as frases de textos/. As frases que vêm de @otto/psd (`avisos[].texto`
// e `camadas[].observacao`) ficam de fora de propósito: não passaram pelo guardião da marca e afirmam
// coisas sobre o Photoshop e o Illustrator que ninguém conferiu. A frase é escolhida pelo código.
import type { RelatorioDeExportacao } from '@otto/shared';
import { editor } from '../../textos/editor';
import { exportar } from '../../textos/exportar';

const t = exportar.relatorio;

export type FormatoDeExportacao = 'psd' | 'pdf' | 'svg' | 'png';

export interface RelatorioNaTela {
  /** Falso no PNG: não há camada no arquivo, e o resumo e a tabela não aparecem. */
  temCamadas: boolean;
  resumo: string;
  comEdicao: number;
  /** "Vai em pixel" no PSD, "Vai como imagem" no SVG e no PDF. */
  tituloDoEmPixel: string;
  emPixel: { onde: string; motivo: string }[];
  /** Só no SVG e no PDF: o que não vai para o arquivo. É onde a peça exportada pode mudar de aparência. */
  deFora: { onde: string; motivo: string }[];
  /** Só no SVG e no PDF: há camada que perdeu o modo de mesclagem. */
  modoTrocado: boolean;
  fontes: string[];
  /** Só em pedido de pacote: as fontes que vão no .zip e as que não vão, com o motivo. */
  pacote?: { vao: string[]; naoVao: string[] };
  pesosTrocados: string[];
  emFalta: string[];
  imagens: { texto: string; pagina?: string }[];
  observacoes: string[];
  camadas: { onde: string; tipo: string; comoVai: string }[];
}

type Linha = RelatorioDeExportacao['camadas'][number];
const TIPOS: Readonly<Record<string, string>> = { ...editor.camadas.tipos, prancheta: t.todas.fundoDaPrancheta };
const prefixo = (mapeamento: string): string => mapeamento.split(':')[0] ?? '';
const nomeDaFonte = (familia: string, peso: number): string => t.fontes.item(familia, editor.propriedades.nomeDoPeso(peso, editor.propriedades.pesos[peso]));

/** No vetor, o mapeamento que no PSD é "filtro fora de foto" é só "tem filtro": lá nenhum filtro continua ajustável. */
const NO_VETOR: Readonly<Record<string, string>> = { 'filtro-fora-de-foto': t.emPixel.porPrefixo.filtro ?? t.emPixel.generico };

function motivoDoPixel(linha: Linha, vetorial: boolean): string {
  const proprio = (vetorial ? NO_VETOR[linha.mapeamento] : undefined) ?? t.emPixel.motivos[linha.mapeamento] ?? t.emPixel.porPrefixo[prefixo(linha.mapeamento)];
  return proprio ?? (linha.destino === 'nativo-pixel' ? t.emPixel.semOriginal : t.emPixel.generico);
}

const motivoDeFora = (linha: Linha): string => (prefixo(linha.mapeamento) === 'ajuste' || linha.tipo === 'ajuste' ? t.deFora.ajuste : t.deFora.generico);

/** Só http e https viram link: o endereço vem do documento, que é dado do cliente. */
function paginaSegura(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function fontesDoPacote(pacote: NonNullable<RelatorioDeExportacao['pacote']>): NonNullable<RelatorioNaTela['pacote']> {
  const motivos = t.pacote.motivos;
  return {
    vao: pacote.fontes.filter((f) => f.incluida).map((f) => nomeDaFonte(f.familia, f.peso)),
    naoVao: pacote.fontes
      .filter((f) => !f.incluida)
      .map((f) => {
        const motivo = f.motivo === 'licenca_nao_permite' ? motivos.licenca_nao_permite(f.licenca) : f.motivo === 'licenca_desconhecida' ? motivos.licenca_desconhecida : motivos.generico;
        return t.pacote.naoVai(nomeDaFonte(f.familia, f.peso), motivo);
      }),
  };
}

export function lerRelatorio(relatorio: RelatorioDeExportacao, formato: FormatoDeExportacao = 'psd'): RelatorioNaTela {
  const comEdicao = relatorio.camadas.filter((c) => c.destino === 'nativo-editavel').length;
  const onde = (c: Linha) => t.onde(c.prancheta, c.camada);
  const vetorial = formato === 'svg' || formato === 'pdf';
  const emPixel = relatorio.camadas.filter((c) => c.destino === 'nativo-pixel' || c.destino === 'raster-com-aviso').map((c) => ({ onde: onde(c), motivo: motivoDoPixel(c, vetorial) }));
  const deFora = relatorio.camadas.filter((c) => c.destino === 'omitido-com-aviso').map((c) => ({ onde: onde(c), motivo: motivoDeFora(c) }));
  return {
    temCamadas: relatorio.camadas.length > 0,
    resumo: t.resumo(comEdicao, emPixel.length, relatorio.fontes.length, deFora.length),
    comEdicao,
    tituloDoEmPixel: (vetorial ? t.emPixel.tituloNoVetor : t.emPixel.titulo)(emPixel.length),
    emPixel,
    deFora,
    modoTrocado: relatorio.avisos.some((a) => a.codigo === 'modo-de-mesclagem-trocado'),
    fontes: relatorio.fontes.map((f) => nomeDaFonte(f.familia, f.peso)),
    ...(relatorio.pacote ? { pacote: fontesDoPacote(relatorio.pacote) } : {}),
    pesosTrocados: relatorio.substituicoes.map((s) => t.pesosTrocados.item(s.camada, s.pedida.familia, s.pedida.peso, s.usada.peso)),
    emFalta: [...relatorio.emFalta.fontes.map((f) => t.emFalta.fonte(f.familia, f.camadas)), ...relatorio.emFalta.imagens.map((i) => t.emFalta.imagem(i.camadas))],
    imagens: relatorio.imagens.map((i) => {
      const pagina = paginaSegura(i.url);
      return { texto: t.imagens.item(i.camada, i.banco, i.autor, i.licenca), ...(pagina ? { pagina } : {}) };
    }),
    observacoes: relatorio.avisos.flatMap((a) => t.observacoes.doCodigo[a.codigo] ?? []),
    camadas: relatorio.camadas.map((c) => ({ onde: onde(c), tipo: TIPOS[c.tipo] ?? c.tipo, comoVai: t.todas.destinos[c.destino] })),
  };
}
