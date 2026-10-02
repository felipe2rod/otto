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
      enderecoPublico: 'http://armazenamento:7070',
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

  it('com S3, o endereço público é opcional e vale o interno quando falta', () => {
    expect(lerConfiguracao(comS3).armazenamento).toMatchObject({ enderecoPublico: 'http://armazenamento:7070' });
    expect(lerConfiguracao({ ...comS3, ARMAZENAMENTO_ENDERECO_PUBLICO: 'http://localhost:8081' }).armazenamento).toMatchObject({
      endereco: 'http://armazenamento:7070',
      enderecoPublico: 'http://localhost:8081',
    });
    expect(erroDe({ ...comS3, ARMAZENAMENTO_ENDERECO_PUBLICO: 'localhost' }).variaveis).toEqual(['ARMAZENAMENTO_ENDERECO_PUBLICO']);
  });

  it('com disco local, o segredo de assinatura dos links é opcional, mas não pode ser curto', () => {
    expect(lerConfiguracao(valida).armazenamento).toEqual({ adaptador: 'disco-local', pasta: '/dados/arquivos' });
    const segredo = 'um-segredo-de-assinatura-com-mais-de-32-caracteres';
    expect(lerConfiguracao({ ...valida, SEGREDO_DE_ASSINATURA: segredo }).armazenamento).toEqual({ adaptador: 'disco-local', pasta: '/dados/arquivos', segredoDeAssinatura: segredo });
    expect(erroDe({ ...valida, SEGREDO_DE_ASSINATURA: 'curto' }).variaveis).toEqual(['SEGREDO_DE_ASSINATURA']);
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

  it('exportações ao mesmo tempo por worker: 2 por padrão, de 1 a 8, e nada fora disso', () => {
    expect(lerConfiguracao(valida).worker.exportacoesAoMesmoTempo).toBe(2);
    expect(lerConfiguracao({ ...valida, EXPORTACOES_AO_MESMO_TEMPO: '4' }).worker.exportacoesAoMesmoTempo).toBe(4);
    for (const ruim of ['0', '9', 'muitas', '1.5']) expect(erroDe({ ...valida, EXPORTACOES_AO_MESMO_TEMPO: ruim }).variaveis).toEqual(['EXPORTACOES_AO_MESMO_TEMPO']);
  });
});

describe('configuração da tarefa do Otto', () => {
  it('fora de produção o padrão é o modelo roteirizado, sem chave e sem custo', () => {
    const c = lerConfiguracao(valida);
    expect(c.agente.modelo).toEqual({ adaptador: 'roteirizado', velocidade: 0.05 });
    expect(c.agente).toMatchObject({ tarefasPorDia: 30, naFilaPorConta: 3, tetoDiarioDeTokens: 40_000_000, restoMinimoNoFornecedor: 3_000_000 });
    expect(c.worker.tarefasAoMesmoTempo).toBe(2);
  });

  it('o modelo de verdade exige a chave, e o erro cita o nome da variável, nunca o valor', () => {
    expect(erroDe({ ...valida, MODELO_DO_AGENTE: 'claude' }).variaveis).toEqual(['MODELO_CHAVE']);
    const c = lerConfiguracao({ ...valida, MODELO_DO_AGENTE: 'claude', MODELO_CHAVE: 'chave-de-mentira-123', MODELO_NOME: 'anthropic-claude-5-sonnet' });
    expect(c.agente.modelo).toEqual({ adaptador: 'claude', chave: 'chave-de-mentira-123', nome: 'anthropic-claude-5-sonnet' });
    const erro = erroDe({ ...valida, MODELO_DO_AGENTE: 'claude', MODELO_CHAVE: 'chave-de-mentira-123', MODELO_ENDERECO: 'http://sem-tls.example' });
    expect(erro.variaveis).toEqual(['MODELO_ENDERECO']);
    expect(erro.message).not.toContain('chave-de-mentira');
  });

  it('a API não recebe o modelo: não exige a chave, e ignora a que vier no ambiente', () => {
    expect(lerConfiguracao({ ...valida, AMBIENTE: 'producao' }, 'api').agente.modelo).toEqual({ adaptador: 'nenhum' });
    expect(lerConfiguracao({ ...valida, MODELO_DO_AGENTE: 'claude' }, 'api').agente.modelo).toEqual({ adaptador: 'nenhum' });
    const comChave = lerConfiguracao({ ...valida, MODELO_DO_AGENTE: 'claude', MODELO_CHAVE: 'chave-de-mentira-123' }, 'api');
    expect(JSON.stringify(comChave)).not.toContain('chave-de-mentira');
  });

  it('produção não sobe com o modelo roteirizado', () => {
    expect(erroDe({ ...valida, AMBIENTE: 'producao' }).variaveis).toEqual(['MODELO_DO_AGENTE']);
    expect(lerConfiguracao({ ...valida, AMBIENTE: 'producao', MODELO_DO_AGENTE: 'claude', MODELO_CHAVE: 'chave-de-mentira-123' }).agente.modelo.adaptador).toBe('claude');
  });
});
