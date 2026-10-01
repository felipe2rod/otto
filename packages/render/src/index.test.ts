import { describe, expect, it } from 'vitest';
import { DEPENDE_DE, NOME_DO_PACOTE } from './index';

describe('@otto/render', () => {
  it('é resolvido pelo workspace e enxerga @otto/documento', () => {
    expect(NOME_DO_PACOTE).toBe('@otto/render');
    expect(DEPENDE_DE).toEqual(['@otto/documento']);
  });
});
