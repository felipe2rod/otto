// Sobe o NestJS de verdade (sem porta de rede) e chama as rotas de saúde.
// Prova a regra 6 de docs/mvp/backend.md, seção 4: o núcleo ESM (@otto/documento) carrega dentro
// do NestJS, e a injeção funciona por token explícito, sem metadado de tipo emitido pelo compilador.

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RespostaDeSaude } from '@otto/shared';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configurarAplicacao, ModuloRaiz } from '../../aplicacao';
import { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { lerConfiguracao } from '../config/configuracao';
import { BarramentoEmMemoria } from '../fila/adaptadores/memoria/barramento-em-memoria';
import { BarramentoDeEventos } from '../fila/barramento-de-eventos';
import { SondaDoBanco } from './sonda-do-banco';

const env = {
  AMBIENTE: 'teste',
  NIVEL_DE_LOG: 'silent',
  BANCO_URL_APP: 'postgresql://ninguem:nada@host-que-nao-existe.invalid:5432/otto',
  CONTA_FIXA_ID: '01990000-0000-7000-8000-000000000001',
  ARMAZENAMENTO_ADAPTADOR: 'disco-local',
  ARMAZENAMENTO_PASTA: '/tmp/otto-teste-de-saude',
};

class SondaFixa extends SondaDoBanco {
  constructor(private readonly resposta: boolean) {
    super();
  }
  async responde(): Promise<boolean> {
    return this.resposta;
  }
}

class ArmazenamentoForaDoAr extends ArmazenamentoEmMemoria {
  override async responde(): Promise<boolean> {
    return false;
  }
}

describe.each(['api', 'worker'] as const)('saúde do serviço %s', (servico) => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const subir = async (banco: boolean, armazenamento: ArmazenamentoDeArquivo = new ArmazenamentoEmMemoria()) => {
    const modulo = await Test.createTestingModule({ imports: [ModuloRaiz.para(servico, lerConfiguracao(env))] })
      .overrideProvider(SondaDoBanco)
      .useValue(new SondaFixa(banco))
      .overrideProvider(ArmazenamentoDeArquivo)
      .useValue(armazenamento)
      // a fila de verdade mora no banco, e este teste não tem banco
      .overrideProvider(BarramentoDeEventos)
      .useValue(new BarramentoEmMemoria())
      .compile();
    app = configurarAplicacao(modulo.createNestApplication({ bodyParser: false }));
    await app.init();
    return request(app.getHttpServer());
  };

  it('GET /api/saude/vivo responde 200 sem consultar dependência, com o nome do núcleo carregado', async () => {
    const http = await subir(false);
    const r = await http.get('/api/saude/vivo');
    expect(r.status).toBe(200);
    expect(RespostaDeSaude.parse(r.body)).toEqual({ estado: 'vivo', servico, nucleo: '@otto/documento' });
  });

  it('GET /api/saude/pronto responde 200 quando banco e armazenamento respondem', async () => {
    const http = await subir(true);
    const r = await http.get('/api/saude/pronto');
    expect(r.status).toBe(200);
    expect(RespostaDeSaude.parse(r.body)).toEqual({ estado: 'pronto', servico, nucleo: '@otto/documento', dependencias: { banco: true, armazenamento: true } });
  });

  it('GET /api/saude/pronto responde 503 quando o banco não responde', async () => {
    const http = await subir(false);
    const r = await http.get('/api/saude/pronto');
    expect(r.status).toBe(503);
    expect(RespostaDeSaude.parse(r.body).dependencias).toEqual({ banco: false, armazenamento: true });
  });

  it('GET /api/saude/pronto responde 503 quando o armazenamento não responde', async () => {
    const http = await subir(true, new ArmazenamentoForaDoAr());
    const r = await http.get('/api/saude/pronto');
    expect(r.status).toBe(503);
    expect(RespostaDeSaude.parse(r.body).dependencias).toEqual({ banco: true, armazenamento: false });
  });

  it('rota desconhecida responde 404 no formato de erro da API, sem frase de interface', async () => {
    const http = await subir(true);
    const r = await http.get('/api/nao-existe');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ codigo: 'rota_nao_encontrada' });
    expect(r.headers['content-type']).toContain('application/problem+json');
  });
});
