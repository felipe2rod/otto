// Alças de redimensionar: onde ficam, qual está sob o ponteiro, e a caixa nova para cada arraste.
import { describe, expect, it } from 'vitest';
import { alcaEm, alcasDe, redimensionar } from './alcas';

const caixa = { x: 100, y: 200, w: 300, h: 150 };

describe('alças', () => {
  it('são oito: quatro cantos e quatro lados', () => {
    const alcas = alcasDe(caixa);
    expect(Object.keys(alcas).sort()).toEqual(['l', 'n', 'ne', 'no', 'o', 's', 'se', 'so']);
    expect(alcas.no).toEqual({ x: 100, y: 200 });
    expect(alcas.se).toEqual({ x: 400, y: 350 });
    expect(alcas.n).toEqual({ x: 250, y: 200 });
    expect(alcas.l).toEqual({ x: 400, y: 275 });
  });

  it('acha a alça sob o ponto, com folga; longe de todas, nenhuma', () => {
    expect(alcaEm(caixa, { x: 402, y: 348 }, 4)).toBe('se');
    expect(alcaEm(caixa, { x: 250, y: 203 }, 4)).toBe('n');
    expect(alcaEm(caixa, { x: 250, y: 275 }, 4)).toBeUndefined();
  });
});

describe('redimensionar', () => {
  it('o canto sudeste cresce para a direita e para baixo; a origem não muda', () => {
    expect(redimensionar(caixa, 'se', 50, 20)).toEqual({ x: 100, y: 200, w: 350, h: 170 });
  });

  it('o canto noroeste move a origem e mantém o canto oposto parado', () => {
    expect(redimensionar(caixa, 'no', 30, 10)).toEqual({ x: 130, y: 210, w: 270, h: 140 });
  });

  it('alça de lado mexe só numa dimensão', () => {
    expect(redimensionar(caixa, 'l', 40, 999)).toEqual({ x: 100, y: 200, w: 340, h: 150 });
    expect(redimensionar(caixa, 'n', 999, -50)).toEqual({ x: 100, y: 150, w: 300, h: 200 });
  });

  it('não deixa a caixa virar do avesso: o mínimo é 1, com o lado oposto parado', () => {
    expect(redimensionar(caixa, 'l', -1000, 0)).toEqual({ x: 100, y: 200, w: 1, h: 150 });
    expect(redimensionar(caixa, 'o', 1000, 0)).toEqual({ x: 399, y: 200, w: 1, h: 150 });
  });

  it('com Shift, o canto mantém a proporção, pelo eixo que mais andou', () => {
    // 300×150 é 2:1. Largura +100 → 400×200
    expect(redimensionar(caixa, 'se', 100, 0, { proporcional: true })).toEqual({ x: 100, y: 200, w: 400, h: 200 });
    // pelo noroeste, o canto sudeste fica parado
    expect(redimensionar(caixa, 'no', -100, 0, { proporcional: true })).toEqual({ x: 0, y: 150, w: 400, h: 200 });
  });

  it('valores inteiros: o documento não ganha meia unidade por causa do zoom', () => {
    const r = redimensionar(caixa, 'se', 10.4, 7.6);
    expect(r).toEqual({ x: 100, y: 200, w: 310, h: 158 });
  });
});
