// Borda do Node: é o único lugar do spike que lê disco. O motor (src/motor) só recebe bytes.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { CanvasKit } from 'canvaskit-wasm';
import { FONTES_DO_SPIKE, IMAGENS_DO_SPIKE } from '../cenas/manifesto.ts';
import type { FonteDeArquivo, ImagemDeArquivo } from '../motor/sessao.ts';

const require = createRequire(import.meta.url);

export const RAIZ = path.resolve(import.meta.dirname, '../..');
export const PASTA_CANVASKIT = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
export const PASTA_FONTES = process.env['PASTA_FONTES'] ?? path.resolve(RAIZ, '../../poc/fontes');
export const PASTA_IMAGENS = path.join(RAIZ, 'recursos');

type Iniciar = (opcoes: { locateFile: (arquivo: string) => string; wasmBinary?: ArrayBuffer | Uint8Array }) => Promise<CanvasKit>;

/**
 * Variantes que o pacote canvaskit-wasm publica. A "padrao" (7,3 MB) só codifica PNG;
 * a "completa" (8,2 MB) também codifica JPEG e WebP. Nenhuma das duas escreve PDF.
 */
export type Variante = 'padrao' | 'completa';
const PASTA_DA_VARIANTE: Record<Variante, string> = { padrao: PASTA_CANVASKIT, completa: path.join(PASTA_CANVASKIT, 'full') };

/** Cada chamada cria uma instância nova, com memória própria: é a "sessão por job" do R2. */
export async function carregarCanvasKit(variante: Variante = 'padrao', wasm?: Uint8Array): Promise<CanvasKit> {
  const pasta = PASTA_DA_VARIANTE[variante];
  const iniciar = require(path.join(pasta, 'canvaskit.js')) as Iniciar;
  return iniciar({ locateFile: (arquivo) => path.join(pasta, arquivo), ...(wasm ? { wasmBinary: wasm } : {}) });
}

let unica: Promise<CanvasKit> | undefined;
/** Instância compartilhada, só para testes e scripts de medida. */
export function canvasKit(): Promise<CanvasKit> {
  unica ??= carregarCanvasKit();
  return unica;
}

export async function carregarFontes(): Promise<FonteDeArquivo[]> {
  return Promise.all(FONTES_DO_SPIKE.map(async (f) => ({ familia: f.familia, peso: f.peso, bytes: new Uint8Array(await readFile(path.join(PASTA_FONTES, f.arquivo))) })));
}

export async function carregarImagens(): Promise<ImagemDeArquivo[]> {
  return Promise.all(IMAGENS_DO_SPIKE.map(async (i) => ({ arquivo: i.arquivo, bytes: new Uint8Array(await readFile(path.join(PASTA_IMAGENS, i.nome))) })));
}
