import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256';

describe('sha256 próprio', () => {
  it('dá o mesmo que o do Node, em todos os tamanhos em volta dos limites de bloco', () => {
    for (const tamanho of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 65_537]) {
      const bytes = new Uint8Array(tamanho);
      for (let i = 0; i < tamanho; i++) bytes[i] = (i * 31 + 7) & 255;
      expect(sha256(bytes), `${tamanho} bytes`).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('os vetores conhecidos', () => {
    expect(sha256(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
