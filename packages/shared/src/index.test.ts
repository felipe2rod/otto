import { describe, expect, it } from 'vitest';
import { ErroDaApi, lerContaId, RespostaDeSaude } from './index';

describe('ContaId', () => {
  it('aceita um UUID e devolve o mesmo valor', () => {
    const id = '0199a3f0-0000-7000-8000-000000000001';
    expect(lerContaId(id)).toBe(id);
  });

  it('recusa o que não é UUID', () => {
    expect(() => lerContaId('conta-do-felipe')).toThrow();
    expect(() => lerContaId('')).toThrow();
    expect(() => lerContaId(undefined)).toThrow();
  });
});

describe('RespostaDeSaude', () => {
  it('aceita a resposta de "vivo" sem dependências', () => {
    const r = RespostaDeSaude.parse({ estado: 'vivo', servico: 'api', nucleo: '@otto/documento' });
    expect(r.estado).toBe('vivo');
  });

  it('aceita "indisponivel" com o estado de cada dependência', () => {
    const r = RespostaDeSaude.parse({
      estado: 'indisponivel',
      servico: 'worker',
      nucleo: '@otto/documento',
      dependencias: { banco: false, armazenamento: true },
    });
    expect(r.dependencias?.banco).toBe(false);
  });

  it('recusa estado desconhecido', () => {
    expect(RespostaDeSaude.safeParse({ estado: 'ok', servico: 'api', nucleo: 'x' }).success).toBe(false);
  });
});

describe('ErroDaApi', () => {
  it('tem código estável e detalhe opcional, sem frase de interface', () => {
    expect(ErroDaApi.parse({ codigo: 'versao_desatualizada', detalhe: { versaoAtual: 42 } }).codigo).toBe('versao_desatualizada');
    expect(ErroDaApi.safeParse({ erro: 'documento não encontrado' }).success).toBe(false);
  });
});
