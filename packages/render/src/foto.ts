// Ajuste de cor da foto (brilho, contraste, saturação e duotone). No PSD vira pilha de camadas de ajuste
// com recorte sobre a foto; aqui é filtro de cor do próprio Skia (matriz), igual em CPU e em GPU.
// A ordem e as fórmulas são as da POC (poc/src/render/ajustes.ts).
import type { CanvasKit, ColorFilter } from 'canvaskit-wasm';

export interface AjusteDeCorResolvido {
  /** -100 a 100 */
  brilho: number;
  /** -100 a 100 */
  contraste: number;
  /** -100 (preto e branco) a 100 */
  saturacao: number;
  /** mapa de degradê de duas cores, já em #rrggbb */
  duotone?: { sombras: string; luzes: string };
}

const CINZA = [0.299, 0.587, 0.114] as const;

function rgb(cor: string): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function ajusteNeutro(a: AjusteDeCorResolvido | undefined): boolean {
  return !a || (a.brilho === 0 && a.contraste === 0 && a.saturacao === 0 && !a.duotone);
}

const ganhoDoContraste = (contraste: number): number => (contraste >= 0 ? 1 + contraste / 50 : 1 + contraste / 100);

/** As etapas do ajuste, cada uma como matriz de cor 4 × 5 (deslocamento em 0..1). O resultado de cada etapa é limitado a 0..1. */
function etapas(a: AjusteDeCorResolvido): number[][] {
  const lista: number[][] = [];
  const c = ganhoDoContraste(a.contraste);
  const b = (a.brilho * 1.5) / 255;
  if (b !== 0 || c !== 1) {
    const d = (128 / 255) * (1 - c) + b;
    lista.push([c, 0, 0, 0, d, 0, c, 0, 0, d, 0, 0, c, 0, d, 0, 0, 0, 1, 0]);
  }
  const s = 1 + a.saturacao / 100;
  if (s !== 1) {
    const linha = (k: number): number[] => [...CINZA.map((p, j) => p * (1 - s) + (j === k ? s : 0)), 0, 0];
    lista.push([...linha(0), ...linha(1), ...linha(2), 0, 0, 0, 1, 0]);
  }
  if (a.duotone) {
    const escuro = rgb(a.duotone.sombras);
    const claro = rgb(a.duotone.luzes);
    const linha = (k: number): number[] => [...CINZA.map((p) => p * ((claro[k] as number) - (escuro[k] as number))), 0, escuro[k] as number];
    lista.push([...linha(0), ...linha(1), ...linha(2), 0, 0, 0, 1, 0]);
  }
  return lista;
}

/** Filtro de cor para desenhar a foto. Quem chama apaga. Devolve undefined quando o ajuste é neutro. */
export function filtroDeCorDaFoto(ck: CanvasKit, a: AjusteDeCorResolvido | undefined): ColorFilter | undefined {
  if (!a || ajusteNeutro(a)) return undefined;
  let filtro: ColorFilter | undefined;
  for (const matriz of etapas(a)) {
    const etapa = ck.ColorFilter.MakeMatrix(matriz);
    if (!filtro) filtro = etapa;
    else {
      const composto = ck.ColorFilter.MakeCompose(etapa, filtro);
      filtro.delete();
      etapa.delete();
      filtro = composto;
    }
  }
  return filtro;
}

/** A mesma conta em TypeScript, sobre RGBA de 8 bits não premultiplicado. Oráculo dos testes. */
export function referenciaDeAjusteDeCor(dados: Uint8Array | Uint8ClampedArray, a: AjusteDeCorResolvido): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(dados);
  const lim = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const matrizes = etapas(a);
  for (let i = 0; i < saida.length; i += 4) {
    let cor = [(dados[i] as number) / 255, (dados[i + 1] as number) / 255, (dados[i + 2] as number) / 255];
    for (const m of matrizes) {
      const [r, g, b] = cor as [number, number, number];
      cor = [0, 1, 2].map((k) => lim((m[k * 5] as number) * r + (m[k * 5 + 1] as number) * g + (m[k * 5 + 2] as number) * b + (m[k * 5 + 4] as number)));
    }
    saida[i] = (cor[0] as number) * 255;
    saida[i + 1] = (cor[1] as number) * 255;
    saida[i + 2] = (cor[2] as number) * 255;
  }
  return saida;
}
