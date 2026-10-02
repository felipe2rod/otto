import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256EmPedacos } from './sha256-em-pedacos';

describe('sha256EmPedacos', () => {
  it('dá o mesmo hash que o cálculo de uma vez, para qualquer tamanho', async () => {
    for (const tamanho of [0, 1, 1000, 4 * 1024 * 1024, 9 * 1024 * 1024 + 7]) {
      const bytes = new Uint8Array(tamanho).map((_, i) => (i * 31) % 251);
      expect(await sha256EmPedacos(bytes, 4 * 1024 * 1024)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('cede a vez ao laço de eventos entre os pedaços: um arquivo grande não segura as outras requisições', async () => {
    let voltas = 0;
    const relogio = setInterval(() => voltas++, 0);
    await sha256EmPedacos(new Uint8Array(8 * 1024 * 1024), 1024 * 1024);
    clearInterval(relogio);
    expect(voltas).toBeGreaterThanOrEqual(3);
  });
});
