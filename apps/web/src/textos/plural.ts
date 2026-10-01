// Plural em português do Brasil. Não é texto: é a regra que escolhe entre os textos.
const regras = new Intl.PluralRules('pt-BR');

export function plural(n: number, formas: { um: string; outros: string; zero?: string }): string {
  if (n === 0 && formas.zero !== undefined) return formas.zero;
  return regras.select(n) === 'one' ? formas.um : formas.outros;
}
