// As chamadas da tarefa do Otto (packages/shared/src/tarefa.ts).
import { documentoVazio } from '@otto/documento';
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDeTarefas } from './tarefas';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const PECA = '0199a000-0000-7000-8000-000000000001';
const TAREFA = '0199a000-0000-7000-8000-0000000000a1';
const tarefa = {
  id: TAREFA,
  documentoId: PECA,
  tipo: 'ajuste',
  estado: 'na_fila',
  entrada: { tipo: 'ajuste', pedido: 'título maior' },
  versaoInicial: 3,
  lotes: 0,
  tocados: [],
  ultimoEvento: -1,
  criadaEm: '2026-10-02T12:00:00.000Z',
};

function montar(resposta: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn(async (u: string, i?: RequestInit) => resposta(u, i));
  return { api: criarApiDeTarefas(criarCliente({ fetch }), PECA, { buscar: fetch }), fetch };
}
const corpo = (fetch: ReturnType<typeof montar>['fetch'], n = 0) => JSON.parse(String(fetch.mock.calls[n]?.[1]?.body)) as Record<string, unknown>;

describe('antes de enviar', () => {
  it('lê os limites em tarefas; se a consulta falhar, devolve indefinido (não impede de tentar)', async () => {
    const limites = { podeEnviar: false, motivo: 'fila_cheia', tarefasHoje: 4, tarefasPorDia: 30, naFila: 3, naFilaNoMaximo: 3 };
    const { api, fetch } = montar(() => json(200, limites));
    expect(await api.limites()).toEqual(limites);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/tarefas/limites');
    expect(await montar(() => json(500, { codigo: 'erro_interno' })).api.limites()).toBeUndefined();
  });
});

describe('pedir', () => {
  it('manda a entrada como dado e devolve a tarefa na fila', async () => {
    const { api, fetch } = montar(() => json(202, tarefa));
    const r = await api.pedir({ tipo: 'ajuste', pedido: 'título maior', selecao: ['n1'] });
    expect(r).toMatchObject({ ok: true, tarefa: { id: TAREFA, estado: 'na_fila', etapas: [], pendencias: [] } });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/tarefas`);
    expect(corpo(fetch)).toEqual({ tipo: 'ajuste', pedido: 'título maior', selecao: ['n1'] });
  });

  it('recusa chega como código, com o detalhe: tarefa já em andamento, limite da conta, limite do dia', async () => {
    expect(await montar(() => json(409, { codigo: 'tarefa_em_andamento', detalhe: { tarefaId: TAREFA, estado: 'rodando' } })).api.pedir({ tipo: 'ajuste', pedido: 'x' })).toEqual({
      ok: false,
      codigo: 'tarefa_em_andamento',
      detalhe: { tarefaId: TAREFA, estado: 'rodando' },
    });
    expect(await montar(() => json(429, { codigo: 'limite_diario' })).api.pedir({ tipo: 'ajuste', pedido: 'x' })).toEqual({ ok: false, codigo: 'limite_diario' });
  });
});

describe('acompanhar', () => {
  it('lista as tarefas da peça e diz qual está viva', async () => {
    const { api, fetch } = montar(() => json(200, { itens: [tarefa], viva: TAREFA }));
    expect(await api.daPeca()).toMatchObject({ viva: TAREFA, itens: [{ id: TAREFA }] });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/tarefas`);
  });

  it('o fluxo abre com Last-Event-ID e entrega cada evento; devolve se terminou com "fim"', async () => {
    const texto = 'id: 5\nevent: etapa\ndata: {"tipo":"etapa","etapa":"producao"}\n\nevent: fim\ndata: {"estado":"em_revisao"}\n\n';
    const { api, fetch } = montar(() => new Response(texto, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const recebidos: unknown[] = [];
    const fim = await api.fluxo(TAREFA, 4, (e) => recebidos.push(e), new AbortController().signal);

    expect(fim).toBe('fim');
    expect(recebidos).toEqual([
      { id: 5, evento: 'etapa', dados: { tipo: 'etapa', etapa: 'producao' } },
      { evento: 'fim', dados: { estado: 'em_revisao' } },
    ]);
    const init = fetch.mock.calls[0]?.[1];
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/tarefas/${TAREFA}/eventos`);
    expect(new Headers(init?.headers).get('Accept')).toBe('text/event-stream');
    expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('4');
  });

  it('sem evento recebido ainda (-1), o fluxo abre sem Last-Event-ID; rede fora ou resposta ruim é "caiu"', async () => {
    const { api, fetch } = montar(() => json(502));
    expect(await api.fluxo(TAREFA, -1, () => undefined, new AbortController().signal)).toBe('caiu');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('Last-Event-ID')).toBe(false);
    const semRede = criarApiDeTarefas(criarCliente({ fetch: async () => Promise.reject(new Error('rede')) }), PECA, { buscar: async () => Promise.reject(new Error('rede')) });
    expect(await semRede.fluxo(TAREFA, 2, () => undefined, new AbortController().signal)).toBe('caiu');
  });

  it('a reserva sem fluxo: os eventos depois de uma sequência, em JSON', async () => {
    const { api, fetch } = montar(() => json(200, { eventos: [{ sequencia: 7, quando: '2026-10-02T12:00:01.000Z', evento: { tipo: 'mensagem', texto: 'oi' } }], tarefa }));
    const r = await api.eventosDesde(TAREFA, 6);
    expect(r?.eventos).toEqual([{ sequencia: 7, quando: '2026-10-02T12:00:01.000Z', evento: { tipo: 'mensagem', texto: 'oi' } }]);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/tarefas/${TAREFA}/eventos?depoisDe=6`);
  });
});

describe('agir sobre a tarefa', () => {
  it('aprovar, cancelar, aceitar e tentar de novo são POST na rota de mesmo nome', async () => {
    for (const [acao, rota] of [
      ['aprovar', 'aprovar'],
      ['cancelar', 'cancelar'],
      ['aceitar', 'aceitar'],
      ['tentarDeNovo', 'tentar-de-novo'],
    ] as const) {
      const { api, fetch } = montar(() => json(200, tarefa));
      expect(await api[acao](TAREFA)).toMatchObject({ ok: true, tarefa: { id: TAREFA } });
      expect(fetch.mock.calls[0]?.[0]).toBe(`/api/tarefas/${TAREFA}/${rota}`);
      expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST');
    }
  });

  it('ajustar manda o texto do que muda', async () => {
    const { api, fetch } = montar(() => json(200, tarefa));
    await api.ajustar(TAREFA, 'paleta mais quente');
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/tarefas/${TAREFA}/ajustar`);
    expect(corpo(fetch)).toEqual({ texto: 'paleta mais quente' });
  });

  it('desfazer e descartar devolvem a tarefa e a peça como ficou; editado depois vem com quantas edições', async () => {
    const arvore = documentoVazio();
    const { api, fetch } = montar(() => json(200, { tarefa: { ...tarefa, estado: 'desfeita' }, versao: 9, arvore }));
    expect(await api.desfazer(TAREFA, true)).toMatchObject({ ok: true, versao: 9, arvore, tarefa: { estado: 'desfeita' } });
    expect(corpo(fetch)).toEqual({ incluirEdicoesPosteriores: true });
    await api.descartar(TAREFA, 'p2');
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/tarefas/${TAREFA}/descartar`);
    expect(corpo(fetch, 1)).toEqual({ pranchetaId: 'p2' });

    expect(await montar(() => json(409, { codigo: 'editado_depois', detalhe: { edicoes: 3 } })).api.desfazer(TAREFA, false)).toEqual({ ok: false, codigo: 'editado_depois', detalhe: { edicoes: 3 } });
  });

  it('a peça de antes da tarefa, para "segure para ver o antes"', async () => {
    const arvore = documentoVazio();
    const { api, fetch } = montar(() => json(200, { versao: 3, arvore }));
    expect(await api.antes(TAREFA)).toEqual({ versao: 3, arvore });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/tarefas/${TAREFA}/antes`);
  });
});

describe('pendências da peça', () => {
  const pendencia = {
    id: '0199a000-0000-7000-8000-0000000000b1',
    tarefaId: TAREFA,
    tipo: 'outro',
    texto: 'x',
    camadas: ['n1'],
    origem: 'otto',
    estado: 'aberta',
    criadaEm: '2026-10-02T12:00:00.000Z',
  };

  it('lista as abertas; se falhar, lista vazia', async () => {
    const { api, fetch } = montar(() => json(200, { itens: [pendencia] }));
    expect(await api.pendencias()).toEqual([pendencia]);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/pendencias`);
    expect(await montar(() => json(500)).api.pendencias()).toEqual([]);
  });

  it('dispensar é POST na pendência', async () => {
    const { api, fetch } = montar(() => json(200, { ...pendencia, estado: 'dispensada' }));
    expect(await api.dispensar(pendencia.id)).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/pendencias/${pendencia.id}/dispensar`);
  });
});
