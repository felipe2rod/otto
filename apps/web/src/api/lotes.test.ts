// Envio de lote, desfazer e refazer (docs/mvp/backend.md, seções 7.3 e 17.3).
import { documentoVazio, type Operacao } from '@otto/documento';
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDeLotes } from './lotes';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const PECA = '0199a000-0000-7000-8000-000000000001';
const LOTE = '0199a000-0000-7000-8000-0000000000aa';
const mover: Operacao[] = [{ op: 'mover', alvo: 'x', x: 1, y: 2 }];
const alinhar: Operacao[] = [{ op: 'alinhar', alvos: ['x'], borda: 'esquerda', referencia: 'primeiro' }];

function montar(resposta: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (_u: string, _i?: RequestInit) => resposta());
  return { api: criarApiDeLotes(criarCliente({ fetch }), PECA), fetch };
}
const corpo = (fetch: ReturnType<typeof montar>['fetch']) => JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

describe('enviar lote', () => {
  it('manda id, versão base, descrição e operações, e devolve a versão confirmada', async () => {
    const { api, fetch } = montar(() => json(200, { versao: 8, lote: { id: LOTE, tocados: ['x'] } }));
    const r = await api.enviar({ id: LOTE, versaoBase: 7, descricao: 'mover Título', operacoes: mover });

    expect(r).toEqual({ tipo: 'confirmado', versao: 8 });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/lotes`);
    expect(corpo(fetch)).toEqual({ id: LOTE, versaoBase: 7, descricao: 'mover Título', operacoes: mover });
  });

  it('lote que mede texto pede a árvore do servidor, e a resposta a traz', async () => {
    const arvore = documentoVazio();
    const { api, fetch } = montar(() => json(200, { versao: 8, lote: { id: LOTE, tocados: [] }, arvore }));
    const r = await api.enviar({ id: LOTE, versaoBase: 7, descricao: 'alinhar', operacoes: alinhar });

    expect(corpo(fetch).devolver).toBe('arvore');
    expect(r).toEqual({ tipo: 'confirmado', versao: 8, arvore });
  });

  it('descrição longa demais é cortada no limite do contrato', async () => {
    const { api, fetch } = montar(() => json(200, { versao: 8, lote: { id: LOTE, tocados: [] } }));
    await api.enviar({ id: LOTE, versaoBase: 7, descricao: 'x'.repeat(500), operacoes: mover });
    expect(String(corpo(fetch).descricao)).toHaveLength(200);
  });

  it('versão velha vira versao_desatualizada com a versão atual', async () => {
    const { api } = montar(() => json(409, { codigo: 'versao_desatualizada', detalhe: { versaoAtual: 12 } }));
    expect(await api.enviar({ id: LOTE, versaoBase: 7, descricao: 'm', operacoes: mover })).toEqual({ tipo: 'versao_desatualizada', versaoAtual: 12 });
  });

  it('lote inválido e catálogo velho são recusa, com o código e o detalhe', async () => {
    const detalhe = { indice: 0, op: 'mover', alvo: 'x', mensagem: 'texto para o agente' };
    expect(await montar(() => json(422, { codigo: 'lote_invalido', detalhe })).api.enviar({ id: LOTE, versaoBase: 7, descricao: 'm', operacoes: mover })).toEqual({
      tipo: 'recusado',
      codigo: 'lote_invalido',
      detalhe,
    });
    expect(
      await montar(() => json(409, { codigo: 'catalogo_desatualizado', detalhe: { catalogoDoServidor: 2 } })).api.enviar({ id: LOTE, versaoBase: 7, descricao: 'm', operacoes: mover }),
    ).toMatchObject({
      tipo: 'recusado',
      codigo: 'catalogo_desatualizado',
    });
  });

  it('rede fora do ar e erro do servidor são "sem conexão": o lote fica na fila e é reenviado com o mesmo id', async () => {
    const semRede = montar(() => Promise.reject(new TypeError('fetch failed')));
    expect(await semRede.api.enviar({ id: LOTE, versaoBase: 7, descricao: 'm', operacoes: mover })).toEqual({ tipo: 'sem_conexao' });
    expect(await montar(() => json(503)).api.enviar({ id: LOTE, versaoBase: 7, descricao: 'm', operacoes: mover })).toEqual({ tipo: 'sem_conexao' });
  });
});

describe('desfazer e refazer', () => {
  it('mandam a versão base e devolvem a árvore para o editor adotar', async () => {
    const arvore = documentoVazio();
    const { api, fetch } = montar(() => json(200, { versao: 9, arvore }));

    expect(await api.desfazer(8)).toEqual({ ok: true, versao: 9, doc: arvore });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/desfazer`);
    expect(corpo(fetch)).toEqual({ versaoBase: 8 });

    await api.refazer(9);
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/documentos/${PECA}/refazer`);
  });

  it('nada para desfazer devolve o código', async () => {
    const { api } = montar(() => json(409, { codigo: 'nada_para_desfazer' }));
    expect(await api.desfazer(8)).toEqual({ ok: false, codigo: 'nada_para_desfazer' });
  });
});
