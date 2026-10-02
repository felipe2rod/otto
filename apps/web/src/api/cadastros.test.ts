// Marcas e briefings salvos (packages/shared/src/briefing.ts).
import { describe, expect, it, vi } from 'vitest';
import { criarApiDeCadastros } from './cadastros';
import { criarCliente } from './cliente';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ID = '0199a000-0000-7000-8000-000000000001';
const QUANDO = '2026-10-02T12:00:00.000Z';
const marca = { id: ID, nome: 'Café Aurora', cores: { primaria: '#0f3b2c' }, criadaEm: QUANDO, alteradaEm: QUANDO };
const briefing = { id: ID, nome: 'Avisos', dados: { versao: 1, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }] }, cuidado: 'cuidadoso', usos: 2, criadoEm: QUANDO, alteradoEm: QUANDO };

function montar(resposta: (url: string, init?: RequestInit) => Response) {
  const fetch = vi.fn(async (u: string, i?: RequestInit) => resposta(u, i));
  return { api: criarApiDeCadastros(criarCliente({ fetch })), fetch };
}
const pedido = (fetch: ReturnType<typeof montar>['fetch'], n = 0) => ({
  url: fetch.mock.calls[n]?.[0],
  metodo: fetch.mock.calls[n]?.[1]?.method,
  corpo: fetch.mock.calls[n]?.[1]?.body ? JSON.parse(String(fetch.mock.calls[n]?.[1]?.body)) : undefined,
});

describe('marcas', () => {
  it('lista as marcas da conta; se a leitura falhar, devolve indefinido (a tela diz o erro, não "nenhuma marca")', async () => {
    expect(await montar(() => json(200, { itens: [marca] })).api.marcas()).toEqual([marca]);
    expect(await montar(() => json(500, { codigo: 'erro_interno' })).api.marcas()).toBeUndefined();
  });

  it('criar manda os dados por POST; alterar substitui tudo por PUT; apagar é DELETE sem corpo de volta', async () => {
    const criar = montar(() => json(201, marca));
    expect(await criar.api.salvarMarca({ nome: 'Café Aurora', cores: { primaria: '#0f3b2c' } })).toEqual({ ok: true, marca });
    expect(pedido(criar.fetch)).toEqual({ url: '/api/marcas', metodo: 'POST', corpo: { nome: 'Café Aurora', cores: { primaria: '#0f3b2c' } } });

    const alterar = montar(() => json(200, marca));
    await alterar.api.salvarMarca({ nome: 'Café Aurora' }, ID);
    expect(pedido(alterar.fetch)).toEqual({ url: `/api/marcas/${ID}`, metodo: 'PUT', corpo: { nome: 'Café Aurora' } });

    const apagar = montar(() => json(204));
    expect(await apagar.api.apagarMarca(ID)).toEqual({ ok: true });
    expect(pedido(apagar.fetch)).toEqual({ url: `/api/marcas/${ID}`, metodo: 'DELETE', corpo: undefined });
  });

  it('a recusa chega como código, com o detalhe', async () => {
    expect(await montar(() => json(422, { codigo: 'arquivo_desconhecido', detalhe: { quantos: 1 } })).api.salvarMarca({ nome: 'x' })).toEqual({
      ok: false,
      codigo: 'arquivo_desconhecido',
      detalhe: { quantos: 1 },
    });
    expect(await montar(() => json(429, { codigo: 'limite_de_cadastros' })).api.salvarMarca({ nome: 'x' })).toEqual({ ok: false, codigo: 'limite_de_cadastros' });
  });
});

describe('briefings salvos', () => {
  it('a lista vem sem os dados; abrir um traz o formulário pela metade', async () => {
    const item = { id: ID, nome: 'Avisos', usos: 2, alteradoEm: QUANDO };
    expect(await montar(() => json(200, { itens: [item] })).api.briefings()).toEqual([item]);
    const abrir = montar(() => json(200, briefing));
    expect(await abrir.api.briefing(ID)).toEqual(briefing);
    expect(pedido(abrir.fetch).url).toBe(`/api/briefings/${ID}`);
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.briefing(ID)).toBeUndefined();
  });

  it('salvar cria ou substitui; apagar é DELETE', async () => {
    const dados = { nome: 'Avisos', dados: { versao: 1 as const }, cuidado: 'direto' as const };
    const criar = montar(() => json(201, briefing));
    expect(await criar.api.salvarBriefing(dados)).toEqual({ ok: true, briefing });
    expect(pedido(criar.fetch)).toEqual({ url: '/api/briefings', metodo: 'POST', corpo: dados });
    const alterar = montar(() => json(200, briefing));
    await alterar.api.salvarBriefing(dados, ID);
    expect(pedido(alterar.fetch)).toMatchObject({ url: `/api/briefings/${ID}`, metodo: 'PUT' });
    const apagar = montar(() => json(204));
    expect(await apagar.api.apagarBriefing(ID)).toEqual({ ok: true });
  });
});
