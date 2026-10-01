// Relatório prévio, pedido e consulta de exportação (packages/shared/src/exportacao.ts).
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDeExportacoes } from './exportacoes';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const PECA = '0199a000-0000-7000-8000-000000000001';
const EXPORTACAO = '0199a000-0000-7000-8000-0000000000e1';

const relatorio = { arquivos: [], camadas: [], tokens: [], fontes: [], substituicoes: [], emFalta: { fontes: [], imagens: [] }, imagens: [], avisos: [] };
const naFila = {
  id: EXPORTACAO,
  documentoId: PECA,
  versao: 3,
  formato: 'psd',
  estado: 'na_fila',
  progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 },
  arquivos: [],
  falhas: [],
  criadaEm: '2026-10-01T12:00:00.000Z',
};

function montar(resposta: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (_u: string, _i?: RequestInit) => resposta());
  return { api: criarApiDeExportacoes(criarCliente({ fetch }), PECA), fetch };
}
const corpo = (fetch: ReturnType<typeof montar>['fetch']) => JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

describe('relatório antes de exportar', () => {
  it('manda o pedido e devolve o relatório, sem criar exportação', async () => {
    const { api, fetch } = montar(() => json(200, relatorio));
    const r = await api.relatorio({ formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p1'] });

    expect(r).toEqual({ ok: true, relatorio });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/exportacoes/relatorio`);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(corpo(fetch)).toEqual({ formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p1'] });
  });

  it('erro vira código, nunca frase', async () => {
    const { api } = montar(() => json(422, { codigo: 'nada_para_exportar' }));
    expect(await api.relatorio({ formato: 'png', escala: 1, semFundo: false })).toEqual({ ok: false, codigo: 'nada_para_exportar' });
  });
});

describe('pedir e consultar', () => {
  it('pedir devolve a exportação na fila (202)', async () => {
    const { api, fetch } = montar(() => json(202, naFila));
    const r = await api.pedir({ formato: 'png', escala: 2, semFundo: true });

    expect(r).toMatchObject({ ok: true, exportacao: { id: EXPORTACAO, estado: 'na_fila' } });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/documentos/${PECA}/exportacoes`);
    expect(corpo(fetch)).toEqual({ formato: 'png', escala: 2, semFundo: true });
  });

  it('fila cheia e fila fora do ar chegam como código', async () => {
    expect(await montar(() => json(429, { codigo: 'limite_de_exportacoes', detalhe: { naFila: 5, limite: 5 } })).api.pedir({ formato: 'psd', arquivos: 'juntas' })).toEqual({
      ok: false,
      codigo: 'limite_de_exportacoes',
      passageiro: false,
    });
    expect(await montar(() => json(503, { codigo: 'fila_indisponivel' })).api.pedir({ formato: 'psd', arquivos: 'juntas' })).toEqual({ ok: false, codigo: 'fila_indisponivel', passageiro: true });
  });

  it('consultar lê o estado pelo id da exportação', async () => {
    const pronta = {
      ...naFila,
      estado: 'pronta',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [{ indice: 0, nome: 'Peça - Feed.psd', tipo: 'image/vnd.adobe.photoshop', bytes: 10, pranchetaId: 'p1', baixar: `/api/exportacoes/${EXPORTACAO}/arquivos/0` }],
    };
    const { api, fetch } = montar(() => json(200, pronta));
    const r = await api.consultar(EXPORTACAO);

    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/exportacoes/${EXPORTACAO}`);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(r).toMatchObject({ ok: true, exportacao: { estado: 'pronta', arquivos: [{ baixar: `/api/exportacoes/${EXPORTACAO}/arquivos/0` }] } });
  });

  it('rede fora do ar e erro do servidor são passageiros: quem consulta tenta de novo', async () => {
    const semRede = criarApiDeExportacoes(criarCliente({ fetch: async () => Promise.reject(new Error('rede')) }), PECA);
    expect(await semRede.consultar(EXPORTACAO)).toEqual({ ok: false, codigo: 'sem_conexao', passageiro: true });
    expect(await montar(() => json(502)).api.consultar(EXPORTACAO)).toMatchObject({ ok: false, passageiro: true });
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.consultar(EXPORTACAO)).toEqual({ ok: false, codigo: 'nao_encontrado', passageiro: false });
  });
});
