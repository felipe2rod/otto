// Arquivos de teste da importação: os goldens que o próprio Otto exporta e os PSDs de fora (packages/psd).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PSD = path.resolve(import.meta.dirname, '../../../../../../packages/psd');
const RENDER = path.resolve(import.meta.dirname, '../../../../../../packages/render/recursos-de-teste');

/** Um PSD exportado pelo Otto (packages/psd/goldens). */
export const golden = (nome: string): Uint8Array => new Uint8Array(readFileSync(path.join(PSD, 'goldens', `${nome}.psd`)));
/** Um PSD de fora do Otto, quase todos gravados pelo Photoshop (packages/psd/recursos-de-teste/psd-de-fora). */
export const deFora = (nome: string): Uint8Array => new Uint8Array(readFileSync(path.join(PSD, 'recursos-de-teste/psd-de-fora', nome)));
export const FONTE_ANTON = new Uint8Array(readFileSync(path.join(RENDER, 'fontes/Anton-Regular.ttf')));
export const anton = () => ({ familia: 'Anton', peso: 400, postScript: 'Anton-Regular', bytes: Uint8Array.from(FONTE_ANTON) });
export const FONTE_PLEX_BOLD = new Uint8Array(readFileSync(path.join(RENDER, 'fontes/IBMPlexSans-Bold.ttf')));
export const plexBold = () => ({ familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold', bytes: Uint8Array.from(FONTE_PLEX_BOLD) });
