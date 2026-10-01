import { describe, expect, it } from 'vitest';
import { NOME_DO_PACOTE } from './index';

describe('@otto/documento', () => {
  it('é resolvido pelo workspace e exporta o próprio nome', () => {
    expect(NOME_DO_PACOTE).toBe('@otto/documento');
  });
});
