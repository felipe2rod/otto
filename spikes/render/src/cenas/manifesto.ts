// Arquivos que o spike usa, com a chave que o documento declara. Compartilhado por Node e navegador.

/** Fontes de poc/fontes: os mesmos arquivos nos dois lados. */
export const FONTES_DO_SPIKE: readonly { familia: string; peso: number; arquivo: string }[] = [
  { familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf' },
  { familia: 'Bebas Neue', peso: 400, arquivo: 'BebasNeue-Regular.ttf' },
  { familia: 'DM Serif Display', peso: 400, arquivo: 'DMSerifDisplay-Regular.ttf' },
  { familia: 'Instrument Serif', peso: 400, arquivo: 'InstrumentSerif-Regular.ttf' },
  { familia: 'IBM Plex Sans', peso: 300, arquivo: 'IBMPlexSans-Light.ttf' },
  { familia: 'IBM Plex Sans', peso: 400, arquivo: 'IBMPlexSans-Regular.ttf' },
  { familia: 'IBM Plex Sans', peso: 500, arquivo: 'IBMPlexSans-Medium.ttf' },
  { familia: 'IBM Plex Sans', peso: 700, arquivo: 'IBMPlexSans-Bold.ttf' },
  { familia: 'IBM Plex Serif', peso: 400, arquivo: 'IBMPlexSerif-Regular.ttf' },
  { familia: 'Space Mono', peso: 400, arquivo: 'SpaceMono-Regular.ttf' },
  { familia: 'Playfair Display', peso: 600, arquivo: 'google/PlayfairDisplay-600.ttf' },
  { familia: 'Fraunces', peso: 600, arquivo: 'google/Fraunces-600.ttf' },
];

/** Imagens sintéticas geradas por scripts/gerar-imagens.ts e versionadas em recursos/. */
export const IMAGENS_DO_SPIKE: readonly { arquivo: string; nome: string }[] = [
  { arquivo: 'foto-paisagem', nome: 'foto-paisagem.jpg' },
  { arquivo: 'foto-retrato', nome: 'foto-retrato.jpg' },
  { arquivo: 'recorte-com-alfa', nome: 'recorte-com-alfa.png' },
];
