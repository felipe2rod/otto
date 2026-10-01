// O que de um erro pode ir para o log (ADR 031): o tipo e de onde veio, NUNCA a mensagem. A mensagem
// de um erro do núcleo ou de um fornecedor pode citar nome de camada, de fonte ou de arquivo.
export function semConteudo(erro: unknown): { erro: string; onde?: string[] } {
  if (!(erro instanceof Error)) return { erro: typeof erro };
  const onde = (erro.stack ?? '')
    .split('\n')
    .filter((linha) => linha.trimStart().startsWith('at '))
    .slice(0, 4)
    .map((linha) => linha.trim());
  return { erro: erro.name, ...(onde.length > 0 ? { onde } : {}) };
}
