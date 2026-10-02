// As chamadas de peça, contra o contrato de @otto/shared (docs/mvp/backend.md, seções 7.3 e 17.3).
import { documentoVazio } from '@otto/documento';
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDePecas } from './pecas';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ID = '0199a000-0000-7000-8000-000000000001';
const item = { id: ID, nome: 'Lançamento', pranchetas: 2, versao: 14, alteradoEm: '2026-09-29T10:00:00.000Z', miniatura: null };
const aberto = { id: ID, nome: 'Lançamento', versao: 14, arvore: documentoVazio() };

function montar(resposta: () => Response) {
  const fetch = vi.fn(async (_u: string, _i?: RequestInit) => resposta());
  return { api: criarApiDePecas(criarCliente({ fetch })), fetch };
}
const chamada = (fetch: ReturnType<typeof montar>['fetch']) => ({ url: fetch.mock.calls[0]?.[0], metodo: fetch.mock.calls[0]?.[1]?.method, corpo: fetch.mock.calls[0]?.[1]?.body });

describe('listar as peças', () => {
  it('lê os itens e o cursor da página seguinte', async () => {
    const { api, fetch } = montar(() => json(200, { itens: [item], proximoCursor: 'abc' }));
    expect(await api.listar()).toEqual({ estado: 'ok', pecas: [{ id: ID, nome: 'Lançamento', formatos: 2, alteradoEm: item.alteradoEm }], proximoCursor: 'abc' });
    expect(chamada(fetch).url).toBe('/api/documentos?limite=100');
  });

  it('pede a página seguinte pelo cursor', async () => {
    const { api, fetch } = montar(() => json(200, { itens: [], proximoCursor: null }));
    await api.listar('a b');
    expect(chamada(fetch).url).toBe('/api/documentos?limite=100&cursor=a%20b');
  });

  it('peça com tarefa viva traz o estado dela', async () => {
    const { api } = montar(() => json(200, { itens: [{ ...item, tarefa: { id: ID, estado: 'em_revisao' } }], proximoCursor: null }));
    const r = await api.listar();
    expect(r.estado === 'ok' && r.pecas[0]?.tarefa).toBe('em_revisao');
  });

  it('tarefa em revisão que parou no meio vem marcada: não é "pronto para revisar"', async () => {
    const lista = (tarefa: object) => montar(() => json(200, { itens: [{ ...item, tarefa: { id: ID, ...tarefa } }], proximoCursor: null })).api.listar();
    const parou = await lista({ estado: 'em_revisao', fim: 'interrompida' });
    expect(parou.estado === 'ok' && parou.pecas[0]?.tarefaParou).toBe(true);
    const entregue = await lista({ estado: 'em_revisao', fim: 'entregue' });
    expect(entregue.estado === 'ok' && entregue.pecas[0]?.tarefaParou).toBeUndefined();
    const rodando = await lista({ estado: 'rodando' });
    expect(rodando.estado === 'ok' && rodando.pecas[0]?.tarefaParou).toBeUndefined();
  });

  it('traz o endereço da miniatura (nulo vira ausente) e a marca da peça; com filtro, pede só as peças da marca', async () => {
    const MARCA = '0199a000-0000-7000-8000-00000000000a';
    const miniatura = `/api/documentos/${ID}/miniatura?v=14`;
    const { api, fetch } = montar(() => json(200, { itens: [{ ...item, miniatura, marcaId: MARCA }, item], proximoCursor: null }));
    const r = await api.listar(undefined, MARCA);
    expect(r.estado === 'ok' && r.pecas[0]).toMatchObject({ miniatura, marcaId: MARCA });
    expect(r.estado === 'ok' && r.pecas[1]).not.toHaveProperty('miniatura');
    expect(chamada(fetch).url).toBe(`/api/documentos?limite=100&marca=${MARCA}`);
  });

  it('lista vazia é ok; falha e resposta fora do contrato são erro, nunca lista vazia', async () => {
    expect(await montar(() => json(200, { itens: [], proximoCursor: null })).api.listar()).toEqual({ estado: 'ok', pecas: [], proximoCursor: null });
    expect(await montar(() => json(500)).api.listar()).toEqual({ estado: 'erro' });
    expect(await montar(() => json(200, { itens: [{ nome: 'sem id' }] })).api.listar()).toEqual({ estado: 'erro' });
  });
});

describe('criar, renomear, duplicar e arquivar', () => {
  it('criar com nome manda o nome aparado (a peça do briefing nasce com o nome dele)', async () => {
    const { api, fetch } = montar(() => json(201, aberto));
    await api.criar('  Novo horário ');
    expect(chamada(fetch).corpo).toBe('{"nome":"Novo horário"}');
  });

  it('criar manda POST sem nome e devolve o id da peça nova', async () => {
    const { api, fetch } = montar(() => json(201, aberto));
    expect(await api.criar()).toEqual({ ok: true, peca: { id: ID, nome: 'Lançamento', formatos: 0, alteradoEm: expect.any(String) } });
    expect(chamada(fetch)).toEqual({ url: '/api/documentos', metodo: 'POST', corpo: '{}' });
  });

  it('criar a peça com a tarefa é UMA chamada: devolve o id da peça; recusada, nenhuma peça fica para trás', async () => {
    const tarefa = { tipo: 'criar' as const, pedido: 'cartaz do novo horário' };
    const resposta = {
      documento: { id: ID, nome: 'Novo horário' },
      tarefa: { id: ID, documentoId: ID, tipo: 'criar', estado: 'na_fila', entrada: tarefa, versaoInicial: 0, lotes: 0, tocados: [], ultimoEvento: -1, criadaEm: '2026-10-02T12:00:00.000Z' },
    };
    const { api, fetch } = montar(() => json(202, resposta));
    expect(await api.criarComTarefa({ nome: 'Novo horário', tarefa })).toEqual({ ok: true, pecaId: ID });
    expect(chamada(fetch)).toEqual({ url: '/api/documentos/com-tarefa', metodo: 'POST', corpo: JSON.stringify({ nome: 'Novo horário', tarefa }) });
    expect(await montar(() => json(429, { codigo: 'limite_diario' })).api.criarComTarefa({ tarefa })).toEqual({ ok: false, codigo: 'limite_diario' });
  });

  it('renomear manda PATCH com o nome e devolve o nome que o servidor guardou', async () => {
    const { api, fetch } = montar(() => json(200, { id: ID, nome: 'Novo nome' }));
    expect(await api.renomear(ID, '  Novo nome ')).toEqual({ ok: true, nome: 'Novo nome' });
    expect(chamada(fetch)).toEqual({ url: `/api/documentos/${ID}`, metodo: 'PATCH', corpo: '{"nome":"Novo nome"}' });
  });

  it('duplicar devolve a cópia', async () => {
    const { api, fetch } = montar(() => json(201, { ...aberto, id: '0199a000-0000-7000-8000-000000000002', nome: 'Lançamento (cópia)' }));
    const r = await api.duplicar(ID);
    expect(r.ok && r.peca.nome).toBe('Lançamento (cópia)');
    expect(chamada(fetch)).toEqual({ url: `/api/documentos/${ID}/duplicar`, metodo: 'POST', corpo: '{}' });
  });

  it('arquivar manda DELETE', async () => {
    const { api, fetch } = montar(() => json(204));
    expect(await api.arquivar(ID)).toEqual({ ok: true });
    expect(chamada(fetch)).toMatchObject({ url: `/api/documentos/${ID}`, metodo: 'DELETE' });
  });

  it('falha devolve o código da API', async () => {
    const { api } = montar(() => json(400, { codigo: 'pedido_invalido', detalhe: { campos: ['nome'] } }));
    expect(await api.renomear(ID, 'x')).toEqual({ ok: false, codigo: 'pedido_invalido' });
  });
});

describe('abrir uma peça', () => {
  it('devolve nome, versão e a árvore já validada', async () => {
    const { api, fetch } = montar(() => json(200, aberto));
    expect(await api.abrir(ID)).toEqual({ estado: 'aberta', peca: { id: ID, nome: 'Lançamento', versao: 14, arvore: documentoVazio(), historico: { podeDesfazer: false, podeRefazer: false } } });
    const comHistorico = await montar(() => json(200, { ...aberto, podeDesfazer: true, podeRefazer: true })).api.abrir(ID);
    expect(comHistorico).toMatchObject({ peca: { historico: { podeDesfazer: true, podeRefazer: true } } });
    expect(chamada(fetch).url).toBe(`/api/documentos/${ID}`);
  });

  it('o id vai escapado no endereço', async () => {
    const { api, fetch } = montar(() => json(404, { codigo: 'nao_encontrado' }));
    await api.abrir('../x');
    expect(chamada(fetch).url).toBe('/api/documentos/..%2Fx');
  });

  it('404 é peça não encontrada; outro erro traz o código; árvore fora do esquema é erro', async () => {
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.abrir(ID)).toEqual({ estado: 'nao_encontrada' });
    expect(await montar(() => json(500, { codigo: 'erro_interno' })).api.abrir(ID)).toEqual({ estado: 'erro', codigo: 'erro_interno' });
    expect(await montar(() => json(200, { ...aberto, arvore: { nada: true } })).api.abrir(ID)).toEqual({ estado: 'erro', codigo: 'resposta_fora_do_contrato' });
  });
});
