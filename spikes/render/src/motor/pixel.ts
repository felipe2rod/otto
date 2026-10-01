// Laço de pixel para o raster de CPU: modos de mesclagem que o Skia não tem e camadas de ajuste.
// Motivo medido no spike: shader próprio (SkSL) em raster de CPU no WebAssembly custa de 0,5 a 7 µs por pixel
// (o binário publicado não tem SIMD e interpreta o shader um pixel por vez). O laço abaixo faz o mesmo
// de 10 a 150 vezes mais rápido (8 a 130 ms por megapixel), direto na memória da superfície, com a mesma fórmula da referência.
// Na GPU o caminho é o shader (mesclagem.ts e ajustes.ts).
import { ajustePorCanal, funcaoDoAjuste } from './ajustes.ts';
import { POR_CANAL, POR_COR } from './mesclagem.ts';
import type { Ajuste, ModoDeMesclagem } from './tipos.ts';

const tabelasDeModo = new Map<ModoDeMesclagem, Uint8Array>();

/** B(fundo, cima) para todos os pares de níveis de 8 bits. É dado derivado e imutável da fórmula, não estado de sessão. */
function tabelaDoModo(modo: ModoDeMesclagem): Uint8Array | undefined {
  const f = POR_CANAL[modo];
  if (!f) return undefined;
  let t = tabelasDeModo.get(modo);
  if (!t) {
    t = new Uint8Array(65536);
    for (let b = 0; b < 256; b++) for (let s = 0; s < 256; s++) t[(b << 8) | s] = Math.round(Math.min(1, Math.max(0, f(b / 255, s / 255))) * 255);
    tabelasDeModo.set(modo, t);
  }
  return t;
}

const lim1 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Mescla "origem" sobre "destino", os dois em RGBA premultiplicado de 8 bits.
 * A origem (ow × oh) entra no destino a partir de (dx, dy). Mesma composição da referência:
 * cor = (1−αs)·αb·Cb + αs·(1−αb)·Cs + αs·αb·B(Cb, Cs).
 */
export function mesclarPremultiplicado(destino: Uint8Array, larguraDoDestino: number, dx: number, dy: number, origem: Uint8Array, ow: number, oh: number, modo: ModoDeMesclagem, opacidade: number): void {
  const tabela = tabelaDoModo(modo);
  const porCanal = POR_CANAL[modo];
  const porCor = POR_COR[modo];
  const cb = [0, 0, 0];
  const cs = [0, 0, 0];
  for (let y = 0; y < oh; y++) {
    let j = y * ow * 4;
    let i = ((dy + y) * larguraDoDestino + dx) * 4;
    for (let x = 0; x < ow; x++, i += 4, j += 4) {
      const sa8 = origem[j + 3]!;
      if (sa8 === 0) continue;
      const da8 = destino[i + 3]!;
      if (tabela && sa8 === 255 && da8 === 255) {
        // caso comum: os dois opacos. Tabela de 8 bits e mistura pela opacidade.
        for (let k = 0; k < 3; k++) {
          const d = destino[i + k]!;
          const m = tabela[(d << 8) | origem[j + k]!]!;
          destino[i + k] = opacidade >= 1 ? m : Math.round(d + (m - d) * opacidade);
        }
        continue;
      }
      const as = (sa8 / 255) * opacidade;
      const ab = da8 / 255;
      for (let k = 0; k < 3; k++) {
        cs[k] = lim1(origem[j + k]! / sa8);
        cb[k] = da8 ? lim1(destino[i + k]! / da8) : 0;
      }
      const ao = as + ab - as * ab;
      const mix = porCor ? porCor(cb, cs) : undefined;
      for (let k = 0; k < 3; k++) {
        const m = mix ? mix[k]! : lim1(porCanal!(cb[k]!, cs[k]!));
        destino[i + k] = Math.round(((1 - as) * ab * cb[k]! + as * (1 - ab) * cs[k]! + as * ab * m) * 255);
      }
      destino[i + 3] = Math.round(ao * 255);
    }
  }
}

/**
 * Aplica o ajuste ao destino (RGBA premultiplicado). A cobertura é uma superfície do mesmo tamanho:
 * o alfa dela é a máscara já recortada pela prancheta; a opacidade da camada multiplica.
 */
export function ajustarPremultiplicado(destino: Uint8Array, cobertura: Uint8Array, ajuste: Ajuste, opacidade: number): void {
  const f = funcaoDoAjuste(ajuste);
  let tabela: Uint8Array | undefined;
  if (ajustePorCanal(ajuste)) {
    tabela = new Uint8Array(256);
    for (let v = 0; v < 256; v++) tabela[v] = Math.round(lim1(f(v / 255, v / 255, v / 255)[0]) * 255);
  }
  for (let i = 0; i < destino.length; i += 4) {
    const c8 = cobertura[i + 3]!;
    if (c8 === 0) continue;
    const a8 = destino[i + 3]!;
    if (a8 === 0) continue;
    const peso = (c8 / 255) * opacidade;
    if (a8 === 255) {
      if (tabela) {
        for (let k = 0; k < 3; k++) {
          const d = destino[i + k]!;
          const m = tabela[d]!;
          destino[i + k] = peso >= 1 ? m : Math.round(d + (m - d) * peso);
        }
      } else {
        const r = destino[i]!;
        const g = destino[i + 1]!;
        const b = destino[i + 2]!;
        const cor = f(r / 255, g / 255, b / 255);
        destino[i] = Math.round(r + (lim1(cor[0]) * 255 - r) * peso);
        destino[i + 1] = Math.round(g + (lim1(cor[1]) * 255 - g) * peso);
        destino[i + 2] = Math.round(b + (lim1(cor[2]) * 255 - b) * peso);
      }
      continue;
    }
    const a = a8 / 255;
    const r = lim1(destino[i]! / a8);
    const g = lim1(destino[i + 1]! / a8);
    const b = lim1(destino[i + 2]! / a8);
    const cor = f(r, g, b);
    destino[i] = Math.round((r + (lim1(cor[0]) - r) * peso) * a * 255);
    destino[i + 1] = Math.round((g + (lim1(cor[1]) - g) * peso) * a * 255);
    destino[i + 2] = Math.round((b + (lim1(cor[2]) - b) * peso) * a * 255);
  }
}
