import { describe, expect, it } from 'vitest';
import { uuidV7 } from './uuid-v7';

describe('uuidV7', () => {
  it('tem o formato de UUID, versão 7 e variante RFC', () => {
    const id = uuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('carrega o instante nos primeiros 48 bits', () => {
    const id = uuidV7(() => 0x0199_a3f0_1234);
    expect(id.startsWith('0199a3f0-1234-7')).toBe(true);
  });

  it('ids gerados em instantes crescentes ordenam como texto', () => {
    let agora = 1_790_000_000_000;
    const ids = Array.from({ length: 50 }, () => uuidV7(() => agora++));
    expect([...ids].sort()).toEqual(ids);
  });

  it('não repete no mesmo milissegundo', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uuidV7(() => 1_790_000_000_000)));
    expect(ids.size).toBe(2000);
  });
});
