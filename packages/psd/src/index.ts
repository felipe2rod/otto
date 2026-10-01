// Exportação do documento do Otto para arquivo em camadas (ADR 028): mapeamento Otto → PSD, relatório e a porta
// FormatoDeArquivoEmCamadas (ADR 020).
//
// Regras deste pacote (testes em testes/fronteira, na raiz):
// - não importa NestJS, Prisma, Next nem React;
// - o nome da biblioteca que grava o arquivo só aparece em src/adaptadores;
// - recursos (bytes de imagem e de fonte) entram por parâmetro: quem confere a conta dona é quem chama;
// - nada entra no documento sem linha em mapeamento.ts e em docs/tecnico/psd.md (o teste confere as duas).
export const NOME_DO_PACOTE = '@otto/psd' as const;

export { criarFormatoPdf } from './adaptadores/biblioteca-de-pdf';
export { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
export { criarFormatoSvg } from './adaptadores/svg';
export {
  type ArquivoExportado,
  exportarPng,
  exportarPsd,
  type FonteDaExportacao,
  type ImagemDaExportacao,
  nomeDeArquivo,
  type OpcoesDeExportacao,
  type OpcoesDoPng,
  type RecursosConhecidos,
  type RecursosDaExportacao,
  type ResultadoDaExportacao,
  relatorioDeExportacao,
  tipoDaImagem,
} from './exportar';
export { exportarVetorial, type OpcoesDoVetorial, type ResultadoDaExportacaoVetorial, relatorioDeExportacaoVetorial } from './exportar-vetorial';
export { type ChaveDoMapeamento, type DestinoDoMapeamento, type DestinoVetorialDoMapeamento, type LinhaDoMapeamento, linhaEmMarkdown, MAPEAMENTO } from './mapeamento';
export type { FonteDisponivel, ImagemDisponivel, TipoDeImagem } from './montar';
export { perfilSrgb } from './perfil-srgb';
export * from './porta';
export {
  type AvisoDoRelatorio,
  type CodigoDeAviso,
  type CodigoDeAvisoVetorial,
  type Destino,
  type DestinoVetorial,
  type FonteDoRelatorio,
  type LinhaDoRelatorio,
  type LinhaDoRelatorioVetorial,
  type RelatorioDeExportacao,
  type RelatorioDeExportacaoVetorial,
  relatorioEmTexto,
} from './relatorio';
