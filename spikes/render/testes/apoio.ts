import type { CanvasKit } from 'canvaskit-wasm';
import { canvasKit, carregarFontes } from '../src/node/carregar.ts';
import { criarSessao, type ImagemDeArquivo, type Sessao } from '../src/motor/sessao.ts';
import type { No, Prancheta } from '../src/motor/tipos.ts';

export async function novaSessao(imagens: ImagemDeArquivo[] = []): Promise<{ ck: CanvasKit; sessao: Sessao }> {
  const ck = await canvasKit();
  return { ck, sessao: criarSessao(ck, { fontes: await carregarFontes(), imagens }) };
}

export function prancheta(largura: number, altura: number, filhos: No[], fundo = '#ffffff'): Prancheta {
  return { id: 'p', nome: 'Teste', x: 0, y: 0, largura, altura, fundo, filhos };
}

/** Gerador com semente: os testes de pixel não podem depender de Math.random. */
export function aleatorio(semente: number): () => number {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pixelsAleatorios(n: number, semente: number, alfa: 'opaco' | 'variado'): Uint8Array {
  const r = aleatorio(semente);
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    d[i * 4] = Math.floor(r() * 256);
    d[i * 4 + 1] = Math.floor(r() * 256);
    d[i * 4 + 2] = Math.floor(r() * 256);
    d[i * 4 + 3] = alfa === 'opaco' ? 255 : 64 + Math.floor(r() * 192);
  }
  return d;
}

export function pixel(rgba: Uint8Array, largura: number, x: number, y: number): [number, number, number, number] {
  const i = (Math.round(y) * largura + Math.round(x)) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

/** Caixa dos pixels com alfa acima do limiar: é a tinta de fato, medida no raster. */
export function caixaDaTinta(rgba: Uint8Array, largura: number, altura: number, limiar = 8): { x: number; y: number; w: number; h: number } {
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (rgba[(y * largura + x) * 4 + 3]! > limiar) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function diferencaMaxima(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, somenteComAlfaMinimo = 0): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3]! < somenteComAlfaMinimo && b[i + 3]! < somenteComAlfaMinimo) continue;
    for (let k = 0; k < 4; k++) max = Math.max(max, Math.abs(a[i + k]! - b[i + k]!));
  }
  return max;
}
