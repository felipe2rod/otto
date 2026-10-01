// Fontes são arquivos do Otto, nunca do sistema operacional (ADR 027, item 7).
// Mesmo arquivo no navegador e no servidor: mesmo desenho de letra nos dois.

export interface ArquivoDeFonte {
  familia: string;
  peso: 300 | 400 | 500 | 600 | 700;
  arquivo: string;
  /** Nome PostScript: é o que o Photoshop procura para a camada de texto continuar editável. */
  postScript: string;
  uso: string;
}

/** Fontes da biblioteca base (arquivos no repositório). As do Google Fonts entram em tempo de execução. */
export const FONTES: ArquivoDeFonte[] = [
  { familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf', postScript: 'Anton-Regular', uso: 'título condensado de impacto; esporte, varejo, urgência' },
  { familia: 'Bebas Neue', peso: 400, arquivo: 'BebasNeue-Regular.ttf', postScript: 'BebasNeue-Regular', uso: 'título condensado só em caixa alta; evento, esporte, sinalização' },
  { familia: 'Archivo Black', peso: 400, arquivo: 'ArchivoBlack-Regular.ttf', postScript: 'ArchivoBlack-Regular', uso: 'título largo e pesado; tecnologia, promoção, marca jovem' },
  { familia: 'Alfa Slab One', peso: 400, arquivo: 'AlfaSlabOne-Regular.ttf', postScript: 'AlfaSlabOne-Regular', uso: 'serifa grossa de cartaz; comida de rua, cerveja, retrô' },
  { familia: 'DM Serif Display', peso: 400, arquivo: 'DMSerifDisplay-Regular.ttf', postScript: 'DMSerifDisplay-Regular', uso: 'serifada de título elegante; gastronomia, moda, beleza' },
  { familia: 'Abril Fatface', peso: 400, arquivo: 'AbrilFatface-Regular.ttf', postScript: 'AbrilFatface-Regular', uso: 'didone de alto contraste; revista, cultura, luxo' },
  { familia: 'Instrument Serif', peso: 400, arquivo: 'InstrumentSerif-Regular.ttf', postScript: 'InstrumentSerif-Regular', uso: 'serifada condensada contemporânea; editorial, arquitetura, arte, marca premium' },
  { familia: 'IBM Plex Sans', peso: 300, arquivo: 'IBMPlexSans-Light.ttf', postScript: 'IBMPlexSans-Light', uso: 'texto leve em tamanho grande, subtítulo elegante' },
  { familia: 'IBM Plex Sans', peso: 400, arquivo: 'IBMPlexSans-Regular.ttf', postScript: 'IBMPlexSans', uso: 'texto corrido, legenda, rodapé' },
  { familia: 'IBM Plex Sans', peso: 500, arquivo: 'IBMPlexSans-Medium.ttf', postScript: 'IBMPlexSans-Medm', uso: 'subtítulo, chamada' },
  { familia: 'IBM Plex Sans', peso: 600, arquivo: 'IBMPlexSans-SemiBold.ttf', postScript: 'IBMPlexSans-SmBld', uso: 'sobretítulo em caixa alta, destaque' },
  { familia: 'IBM Plex Sans', peso: 700, arquivo: 'IBMPlexSans-Bold.ttf', postScript: 'IBMPlexSans-Bold', uso: 'botão, preço, título em grotesca' },
  { familia: 'IBM Plex Sans Condensed', peso: 500, arquivo: 'IBMPlexSansCondensed-Medium.ttf', postScript: 'IBMPlexSansCond-Medm', uso: 'informação densa, ficha técnica, etiqueta' },
  { familia: 'IBM Plex Sans Condensed', peso: 700, arquivo: 'IBMPlexSansCondensed-Bold.ttf', postScript: 'IBMPlexSansCond-Bold', uso: 'título grotesco condensado, preço grande' },
  { familia: 'IBM Plex Serif', peso: 400, arquivo: 'IBMPlexSerif-Regular.ttf', postScript: 'IBMPlexSerif-Regular', uso: 'texto serifado; editorial, institucional' },
  { familia: 'IBM Plex Serif', peso: 600, arquivo: 'IBMPlexSerif-SemiBold.ttf', postScript: 'IBMPlexSerif-SemiBold', uso: 'título serifado sóbrio' },
  { familia: 'Space Mono', peso: 400, arquivo: 'SpaceMono-Regular.ttf', postScript: 'SpaceMono-Regular', uso: 'monoespaçada; detalhe técnico, data, numeração, tecnologia' },
  { familia: 'Space Mono', peso: 700, arquivo: 'SpaceMono-Bold.ttf', postScript: 'SpaceMono-Bold', uso: 'monoespaçada em destaque' },
];

export function acharFonte(familia: string, peso: number): ArquivoDeFonte | undefined {
  const daFamilia = FONTES.filter((f) => f.familia === familia);
  if (daFamilia.length === 0) return undefined;
  return daFamilia.reduce((melhor, f) => (Math.abs(f.peso - peso) < Math.abs(melhor.peso - peso) ? f : melhor));
}

export function familiasDisponiveis(): string[] {
  return [...new Set(FONTES.map((f) => f.familia))];
}

/** Registra uma fonte baixada (Google Fonts). Mesma chamada no servidor e no navegador. */
export function registrarFonte(f: ArquivoDeFonte): void {
  if (!FONTES.some((x) => x.familia === f.familia && x.peso === f.peso)) FONTES.push(f);
}

/** Família na biblioteca base (as que o agente conhece de cor). */
export function ehFonteBase(familia: string): boolean {
  return FONTES_BASE.has(familia);
}
const FONTES_BASE = new Set(FONTES.map((f) => f.familia));
