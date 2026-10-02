// A miniatura de um vetor importado: um SVG montado AQUI, a partir dos caminhos que o importador leu e o
// esquema validou. É o vetor "como o Otto o entendeu" (docs/mvp/experiencia.md, 3.3): o que ficou de fora
// na importação não aparece. Nada do arquivo de origem é repassado: só <svg> e <path>, com `d` restrito aos
// comandos do catálogo e cores em hexadecimal. Não há render: é texto.
import type { CaminhoVetorial } from '@otto/documento';

/** Os caminhos do documento só têm M, C e Z com números. Qualquer outra coisa não entra na miniatura. */
const D_VALIDO = /^[MCZmcz0-9eE\s.,+-]+$/;
const COR = /^#[0-9a-fA-F]{6}$/;
const PONTA = { reta: 'butt', redonda: 'round', quadrada: 'square' } as const;
const JUNCAO = { angular: 'miter', redonda: 'round', chanfrada: 'bevel' } as const;

const numero = (n: number): string => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0');

export function miniaturaDoVetor(vetor: { moldura: readonly [number, number]; caminhos: readonly CaminhoVetorial[] }): string {
  const caminhos = vetor.caminhos.flatMap((c) => {
    if (!D_VALIDO.test(c.d)) return [];
    const atributos = [`d="${c.d}"`, `fill="${c.preenchimento && COR.test(c.preenchimento) ? c.preenchimento : 'none'}"`];
    if (c.regra === 'par-impar') atributos.push('fill-rule="evenodd"');
    if (c.traco && COR.test(c.traco.cor)) {
      atributos.push(`stroke="${c.traco.cor}"`, `stroke-width="${numero(c.traco.espessura)}"`);
      const ponta = PONTA[c.traco.ponta as keyof typeof PONTA];
      const juncao = JUNCAO[c.traco.juncao as keyof typeof JUNCAO];
      if (ponta) atributos.push(`stroke-linecap="${ponta}"`);
      if (juncao) atributos.push(`stroke-linejoin="${juncao}"`);
    }
    return [`<path ${atributos.join(' ')}/>`];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${numero(vetor.moldura[0])} ${numero(vetor.moldura[1])}">${caminhos.join('')}</svg>`;
}
