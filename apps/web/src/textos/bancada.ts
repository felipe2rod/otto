// RASCUNHO: texto de tela só de desenvolvimento (a rota /editor/bancada não existe em produção).
// Não precisa passar pelo guardião da marca enquanto for só de desenvolvimento; fica aqui para a
// regra "componente não tem texto literal" não ter exceção.

export const bancada = {
  nomeDaPeca: 'Documento de exemplo',
} as const;
