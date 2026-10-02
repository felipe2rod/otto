import { describe, expect, it, vi } from 'vitest';
import { desenharSobreposicoes } from './sobreposicoes';

function contextoFalso() {
  const limpezas: [number, number, number, number][] = [];
  const nada = () => undefined;
  const ctx = {
    setTransform: nada,
    clearRect: (x: number, y: number, largura: number, altura: number) => void limpezas.push([x, y, largura, altura]),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 10 }),
    beginPath: nada,
    moveTo: nada,
    lineTo: nada,
    stroke: vi.fn(),
    closePath: nada,
    arc: nada,
    fill: nada,
    setLineDash: nada,
    save: nada,
    restore: nada,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  return { ctx: ctx as unknown as Parameters<typeof desenharSobreposicoes>[0], limpezas, falso: ctx };
}

const CENA = {
  camera: { x: 0, y: 0, zoom: 1 },
  area: { largura: 801, altura: 600 },
  pixelsPorPonto: 2,
  pranchetas: [],
  selecao: null,
  contornos: [],
  distanciaDoGiro: 24,
  tocados: new Set<string>(),
  rotuloDaZonaDaInterface: 'zona',
} satisfies Parameters<typeof desenharSobreposicoes>[1];

describe('sobreposições do canvas', () => {
  it('limpa o canvas inteiro, mas nunca com um retângulo só (o navegador descarta o quadro que só tem essa limpeza)', () => {
    const { ctx, limpezas } = contextoFalso();
    desenharSobreposicoes(ctx, CENA);

    const [largura, altura] = [801 * 2, 600 * 2];
    expect(limpezas.length).toBeGreaterThan(1);
    for (const [, , l, a] of limpezas) expect(l * a).toBeLessThan(largura * altura);
    // juntas cobrem tudo, sem buraco: faixas lado a lado, da altura inteira
    const faixas = [...limpezas].sort((a, b) => a[0] - b[0]);
    let ate = 0;
    for (const [x, y, l, a] of faixas) {
      expect([x, y, a]).toEqual([ate, 0, altura]);
      ate = x + l;
    }
    expect(ate).toBe(largura);
  });

  it('peça sem prancheta: nada é desenhado depois da limpeza', () => {
    const { ctx, falso } = contextoFalso();
    desenharSobreposicoes(ctx, CENA);
    expect(falso.strokeRect).not.toHaveBeenCalled();
    expect(falso.fillText).not.toHaveBeenCalled();
    expect(falso.stroke).not.toHaveBeenCalled();
  });
});
