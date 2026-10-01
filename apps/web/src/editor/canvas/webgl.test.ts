import { describe, expect, it, vi } from 'vitest';
import { temWebGL } from './webgl';

const canvasQue = (contextos: Record<string, unknown>) => () => ({ getContext: vi.fn((tipo: string) => contextos[tipo] ?? null) }) as unknown as HTMLCanvasElement;

describe('detecção de WebGL', () => {
  it('há WebGL quando o navegador entrega o contexto webgl2', () => {
    expect(temWebGL(canvasQue({ webgl2: {} }))).toBe(true);
  });

  it('aceita webgl quando não há webgl2', () => {
    expect(temWebGL(canvasQue({ webgl: {} }))).toBe(true);
  });

  it('não há WebGL quando nenhum contexto vem', () => {
    expect(temWebGL(canvasQue({}))).toBe(false);
  });

  it('não há WebGL quando pedir o contexto estoura', () => {
    expect(
      temWebGL(() => {
        throw new Error('bloqueado');
      }),
    ).toBe(false);
  });
});
