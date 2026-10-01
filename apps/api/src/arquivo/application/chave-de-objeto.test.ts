import { lerContaId } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { ChaveDeObjetoInvalida, chaveDeArquivoDaConta, chaveDeExportacao } from './chave-de-objeto';

const escopo = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-000000000001'));
const SHA = 'a'.repeat(64);

describe('chaveDeArquivoDaConta', () => {
  it('monta a chave com o prefixo da conta e o hash do conteúdo', () => {
    expect(chaveDeArquivoDaConta(escopo, SHA)).toBe(`contas/01990000-0000-7000-8000-000000000001/arquivos/${SHA}`);
  });

  it('recusa o que não é SHA-256 em hexadecimal minúsculo (a chave nunca nasce de texto do cliente)', () => {
    for (const ruim of ['', 'abc', 'A'.repeat(64), `${'a'.repeat(63)}/`, '../../etc/passwd', `${SHA}.png`]) {
      expect(() => chaveDeArquivoDaConta(escopo, ruim)).toThrow(ChaveDeObjetoInvalida);
    }
  });
});

describe('chaveDeExportacao', () => {
  it('monta a chave com o prefixo da conta, a exportação e o índice do arquivo', () => {
    expect(chaveDeExportacao(escopo, '01990000-0000-7000-8000-0000000000e1', 2, 'psd')).toBe('contas/01990000-0000-7000-8000-000000000001/exportacoes/01990000-0000-7000-8000-0000000000e1/2.psd');
  });

  it('recusa id, índice ou extensão que não sejam nossos', () => {
    expect(() => chaveDeExportacao(escopo, '../outra', 0, 'psd')).toThrow(ChaveDeObjetoInvalida);
    expect(() => chaveDeExportacao(escopo, 'e1', -1, 'psd')).toThrow(ChaveDeObjetoInvalida);
    expect(() => chaveDeExportacao(escopo, 'e1', 0, 'psd/..')).toThrow(ChaveDeObjetoInvalida);
  });
});
