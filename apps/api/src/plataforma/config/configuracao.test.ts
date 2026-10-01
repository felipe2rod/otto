import { describe, expect, it } from 'vitest';
import { ConfiguracaoInvalida, lerConfiguracao } from './configuracao';

const valida = {
  AMBIENTE: 'teste',
  PORTA: '3000',
  NIVEL_DE_LOG: 'info',
  BANCO_URL_APP: 'postgresql://otto_app:segredo-do-banco@banco:5432/otto',
  CONTA_FIXA_ID: '01990000-0000-7000-8000-000000000001',
  ARMAZENAMENTO_ADAPTADOR: 'disco-local',
  ARMAZENAMENTO_PASTA: '/dados/arquivos',
};

function erroDe(env: Record<string, string | undefined>): ConfiguracaoInvalida {
  try {
    lerConfiguracao(env);
  } catch (e) {
    if (e instanceof ConfiguracaoInvalida) return e;
    throw e;
  }
  throw new Error('esperava ConfiguracaoInvalida, e a configuração foi aceita');
}

describe('lerConfiguracao', () => {
  it('aceita a configuração completa e devolve valores tipados', () => {
    const c = lerConfiguracao(valida);
    expect(c.porta).toBe(3000);
    expect(c.ambiente).toBe('teste');
    expect(c.banco.urlDoApp).toBe(valida.BANCO_URL_APP);
    expect(c.contaFixaId).toBe(valida.CONTA_FIXA_ID);
    expect(c.armazenamento).toEqual({ adaptador: 'disco-local', pasta: '/dados/arquivos' });
  });

  it('usa os padrões de porta e de nível de log quando não vêm', () => {
    const { PORTA: _p, NIVEL_DE_LOG: _n, ...semOpcionais } = valida;
    const c = lerConfiguracao(semOpcionais);
    expect(c.porta).toBe(3000);
    expect(c.nivelDeLog).toBe('info');
  });

  it('recusa quando falta a URL do banco, e diz qual variável', () => {
    const { BANCO_URL_APP: _b, ...sem } = valida;
    expect(erroDe(sem).variaveis).toEqual(['BANCO_URL_APP']);
  });

  it('lista todas as variáveis com problema de uma vez', () => {
    const e = erroDe({ ...valida, PORTA: 'abc', CONTA_FIXA_ID: 'conta-do-felipe', AMBIENTE: 'homologacao' });
    expect([...e.variaveis].sort()).toEqual(['AMBIENTE', 'CONTA_FIXA_ID', 'PORTA']);
  });

  it('recusa URL de banco que não é postgresql', () => {
    expect(erroDe({ ...valida, BANCO_URL_APP: 'mysql://x/y' }).variaveis).toEqual(['BANCO_URL_APP']);
  });

  it('exige a pasta quando o armazenamento é em disco local', () => {
    const { ARMAZENAMENTO_PASTA: _p, ...sem } = valida;
    expect(erroDe(sem).variaveis).toEqual(['ARMAZENAMENTO_PASTA']);
  });

  const comS3 = {
    ...valida,
    ARMAZENAMENTO_ADAPTADOR: 's3',
    ARMAZENAMENTO_ENDERECO: 'http://armazenamento:7070',
    ARMAZENAMENTO_BUCKET: 'otto',
    ARMAZENAMENTO_CHAVE_DE_ACESSO: 'acesso',
    ARMAZENAMENTO_CHAVE_SECRETA: 'segredo-do-armazenamento',
  };

  it('aceita o armazenamento compatível com S3, com região padrão', () => {
    expect(lerConfiguracao(comS3).armazenamento).toEqual({
      adaptador: 's3',
      endereco: 'http://armazenamento:7070',
      regiao: 'us-east-1',
      bucket: 'otto',
      chaveDeAcesso: 'acesso',
      chaveSecreta: 'segredo-do-armazenamento',
    });
  });

  it('com S3, exige endereço, bucket e as duas chaves, e diz quais faltam', () => {
    const { ARMAZENAMENTO_ENDERECO: _e, ARMAZENAMENTO_CHAVE_SECRETA: _s, ...sem } = comS3;
    expect([...erroDe(sem).variaveis].sort()).toEqual(['ARMAZENAMENTO_CHAVE_SECRETA', 'ARMAZENAMENTO_ENDERECO']);
  });

  it('com S3, o endereço precisa ser http ou https', () => {
    expect(erroDe({ ...comS3, ARMAZENAMENTO_ENDERECO: 'armazenamento:7070' }).variaveis).toEqual(['ARMAZENAMENTO_ENDERECO']);
  });

  it('limites de envio têm padrão e aceitam troca; valor absurdo é recusado', () => {
    expect(lerConfiguracao(valida).limites).toEqual({ bytesPorArquivo: 25 * 1024 * 1024, ladoMaximoDeImagem: 12_000, megapixelsNoMaximo: 80 });
    expect(lerConfiguracao({ ...valida, BYTES_MAXIMOS_POR_ARQUIVO: '1048576', LADO_MAXIMO_DE_IMAGEM: '4000' }).limites).toMatchObject({ bytesPorArquivo: 1_048_576, ladoMaximoDeImagem: 4000 });
    expect([...erroDe({ ...valida, BYTES_MAXIMOS_POR_ARQUIVO: '0', LADO_MAXIMO_DE_IMAGEM: 'grande' }).variaveis].sort()).toEqual(['BYTES_MAXIMOS_POR_ARQUIVO', 'LADO_MAXIMO_DE_IMAGEM']);
  });

  it('recusa adaptador de armazenamento desconhecido', () => {
    expect(erroDe({ ...valida, ARMAZENAMENTO_ADAPTADOR: 'ftp' }).variaveis).toEqual(['ARMAZENAMENTO_ADAPTADOR']);
  });

  it('a mensagem do erro cita o nome da variável e nunca o valor (o valor pode ser segredo)', () => {
    const e = erroDe({ ...valida, BANCO_URL_APP: 'http://usuario:senha-super-secreta@host/base' });
    expect(e.message).toContain('BANCO_URL_APP');
    expect(e.message).not.toContain('senha-super-secreta');
  });

  it('a URL do papel migrador não pode existir no processo da API nem do worker (ADR 023)', () => {
    const e = erroDe({ ...valida, BANCO_URL_MIGRADOR: 'postgresql://otto_migrador:x@banco:5432/otto' });
    expect(e.variaveis).toEqual(['BANCO_URL_MIGRADOR']);
  });
});
