import { lerContaId } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { ResolvedorDeContaFixa } from './adaptadores/resolvedor-de-conta-fixa';
import { EscopoDaConta } from './escopo-da-conta';
import { escopoDoTrabalho } from './escopo-do-trabalho';

const CONTA = '01990000-0000-7000-8000-000000000001';

describe('EscopoDaConta', () => {
  it('carrega o id da conta, marcado', () => {
    const escopo = EscopoDaConta.abrir(lerContaId(CONTA));
    expect(escopo.contaId).toBe(CONTA);
  });

  it('é imutável', () => {
    const escopo = EscopoDaConta.abrir(lerContaId(CONTA));
    expect(() => {
      (escopo as { contaId: string }).contaId = '01990000-0000-7000-8000-000000000002';
    }).toThrow();
  });

  it('não vaza para texto nem para JSON por acidente além do id', () => {
    const escopo = EscopoDaConta.abrir(lerContaId(CONTA));
    expect(JSON.parse(JSON.stringify(escopo))).toEqual({ contaId: CONTA });
  });
});

describe('ResolvedorDeContaFixa (sem login no MVP: suposição a confirmar com o Felipe)', () => {
  it('resolve sempre a conta fixa da configuração, com ou sem credencial', async () => {
    const resolvedor = new ResolvedorDeContaFixa(lerContaId(CONTA));
    expect((await resolvedor.resolverDaRequisicao(undefined)).contaId).toBe(CONTA);
    expect((await resolvedor.resolverDaRequisicao('qualquer-coisa')).contaId).toBe(CONTA);
  });
});

describe('escopoDoTrabalho (a conta do payload é hipótese; a prova é a linha lida sob RLS)', () => {
  it('abre o escopo com a conta que veio no trabalho', () => {
    expect(escopoDoTrabalho({ contaId: CONTA }).contaId).toBe(CONTA);
  });

  it('conta que não é UUID não abre escopo', () => {
    expect(() => escopoDoTrabalho({ contaId: 'todas' })).toThrow();
    expect(() => escopoDoTrabalho({ contaId: '' })).toThrow();
  });
});
