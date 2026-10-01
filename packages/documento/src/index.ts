// Núcleo do documento do Otto (ADR 027): esquema, catálogo de operações, transação, resumo e lint.
//
// Regras deste pacote (testes em testes/fronteira, na raiz):
// - TypeScript puro e ESM: roda igual no navegador, na API e no worker;
// - não importa NestJS, Prisma, Next, React nem módulo "node:";
// - nenhum nome de fornecedor;
// - não conhece motor de render: medidor de tinta e meios de verificação são portas (Medidor, MeiosDeVerificacao).

/** Nome do pacote. A API o devolve na rota de saúde, como prova de que o núcleo ESM carrega dentro do NestJS. */
export const NOME_DO_PACOTE = '@otto/documento' as const;

export * from './esquema';
export { caixaDasPranchetas, deslocarNo, deslocarNos, disporPranchetas, VAO_ENTRE_PRANCHETAS } from './geometria';
export { type GeradorDeId, idsDoLote } from './ids';
export {
  type Aviso,
  type Gravidade,
  hexParaRgb,
  type LinhaDeTexto,
  type MeiosDeVerificacao,
  type RenderDeVerificacao,
  razaoDeContraste,
  type TextoDiagramado,
  verificarDocumento,
  verificarPrancheta,
} from './lint';
export {
  acharNo,
  acharPrancheta,
  aplicarLote,
  type ContextoDoLote,
  caixaDe,
  descreverErro,
  type ErroDeOperacao,
  Lote,
  loteDependeDeMedida,
  type Medidor,
  type NoAchado,
  OPERACOES_QUE_MEDEM,
  Operacao,
  type ResultadoDoLote,
} from './operacoes';
export { type OpcoesDoResumo, resumirDocumento } from './resumo';
