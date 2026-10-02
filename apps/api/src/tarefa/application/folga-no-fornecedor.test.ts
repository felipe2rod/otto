import { describe, expect, it } from 'vitest';
import { folgaNoFornecedor } from './folga-no-fornecedor';

const T0 = new Date('2026-10-05T14:42:00.000Z');
const depois = (minutos: number) => new Date(T0.getTime() + minutos * 60_000);
const BALDE = { capacidade: 4_500_000, reposicaoPorHora: 900_000 };

describe('folgaNoFornecedor: o limite do fornecedor é um balde que se repõe, não um contador do dia', () => {
  it('sem leitura nenhuma do fornecedor, não há o que conferir', () => {
    expect(folgaNoFornecedor({}, T0, BALDE)).toBeUndefined();
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_000_000 }, T0, BALDE)).toBe(2_000_000);
  });

  it('na hora da leitura vale o que o fornecedor disse', () => {
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_252_161, vistoEm: T0 }, T0, BALDE)).toBe(2_252_161);
  });

  it('com o tempo o balde se repõe: a leitura velha não segura as tarefas para sempre', () => {
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_252_161, vistoEm: T0 }, depois(60), BALDE)).toBe(3_152_161);
    // medido em 2026-10-02: 2,25 milhões às 14h42, cheio de novo às 17h11
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_252_161, vistoEm: T0 }, depois(149), BALDE)).toBe(4_487_161);
  });

  it('nunca passa da capacidade, e relógio para trás não tira folga', () => {
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_252_161, vistoEm: T0 }, depois(24 * 60), BALDE)).toBe(4_500_000);
    expect(folgaNoFornecedor({ restanteNoFornecedor: 2_252_161, vistoEm: T0 }, depois(-30), BALDE)).toBe(2_252_161);
  });

  it('se o fornecedor mostrar mais que a capacidade suposta, vale o que ele mostrou', () => {
    expect(folgaNoFornecedor({ restanteNoFornecedor: 40_000_000, vistoEm: T0 }, depois(10), BALDE)).toBe(40_000_000);
  });
});
