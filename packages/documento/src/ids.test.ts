import { describe, expect, it } from 'vitest';
import { idsDoLote } from './ids';

describe('ids derivados do lote', () => {
  it('o mesmo lote, a mesma operação e a mesma ordem dão o mesmo id, em qualquer máquina', () => {
    expect(idsDoLote('lote-a')(3, 0)).toBe(idsDoLote('lote-a')(3, 0));
  });

  it('muda com o lote, com a operação e com a ordem dentro da operação', () => {
    const base = idsDoLote('lote-a')(0, 0);
    expect(idsDoLote('lote-b')(0, 0)).not.toBe(base);
    expect(idsDoLote('lote-a')(1, 0)).not.toBe(base);
    expect(idsDoLote('lote-a')(0, 1)).not.toBe(base);
  });

  it('tem a forma de UUID versão 8', () => {
    expect(idsDoLote('0199a2b4-7c11-7d3e-9f00-5a5b5c5d5e5f')(0, 0)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('não repete em 200 lotes de 50 operações com 20 nós cada', () => {
    const vistos = new Set<string>();
    for (let l = 0; l < 200; l++) {
      const gerar = idsDoLote(`0199a2b4-7c11-7d3e-9f00-${l.toString(16).padStart(12, '0')}`);
      for (let o = 0; o < 50; o++) for (let s = 0; s < 20; s++) vistos.add(gerar(o, s));
    }
    expect(vistos.size).toBe(200 * 50 * 20);
  });
});
