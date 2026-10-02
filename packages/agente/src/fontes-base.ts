// Para que serve cada família da biblioteca base do Otto. Vai ao prompt junto com o nome e os pesos
// ("# Fontes disponíveis"): sem isto o agente e o diretor escolhem fonte só pelo nome.
// Veio de poc/src/render/fontes.ts. Família que não está aqui vai ao prompt sem o uso.
import type { FamiliaDeFonte } from './portas';

export const USO_DAS_FONTES: Readonly<Record<string, string>> = {
  Anton: 'título condensado de impacto; esporte, varejo, urgência',
  'Bebas Neue': 'título condensado só em caixa alta; evento, esporte, sinalização',
  'Archivo Black': 'título largo e pesado; tecnologia, promoção, marca jovem',
  'Alfa Slab One': 'serifa grossa de cartaz; comida de rua, cerveja, retrô',
  'DM Serif Display': 'serifada de título elegante; gastronomia, moda, beleza',
  'Abril Fatface': 'didone de alto contraste; revista, cultura, luxo',
  'Instrument Serif': 'serifada condensada contemporânea; editorial, arquitetura, arte, marca premium',
  'IBM Plex Sans': 'texto, subtítulo, botão (300 leve em corpo grande, 400 texto, 500 subtítulo, 600 sobretítulo, 700 botão e preço)',
  'IBM Plex Sans Condensed': 'informação densa, etiqueta, preço grande',
  'IBM Plex Serif': 'texto serifado e título sóbrio; editorial, institucional',
  'Space Mono': 'monoespaçada; detalhe técnico, data, numeração',
};

/** As famílias, com o uso das que a biblioteca base conhece. O que já vem com `uso` fica como está. */
export function comUsoDasFontes(familias: readonly FamiliaDeFonte[]): FamiliaDeFonte[] {
  return familias.map((f) => {
    const uso = f.uso ?? USO_DAS_FONTES[f.familia];
    return uso ? { ...f, uso } : { ...f };
  });
}
