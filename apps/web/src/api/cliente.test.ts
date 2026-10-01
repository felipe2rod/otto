import { VERSAO_DO_CATALOGO, VERSAO_DO_FORMATO } from '@otto/documento';
import { CABECALHOS, DocumentoRenomeado as Coisa } from '@otto/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ID = '0199a000-0000-7000-8000-000000000001';
const COISA = { id: ID, nome: 'a' };

describe('cliente da API', () => {
  it('leitura: valida a resposta pelo esquema e devolve os dados', async () => {
    const fetch = vi.fn(async () => json(200, COISA));
    const r = await criarCliente({ fetch }).ler(Coisa, '/api/coisas/a');

    expect(r).toEqual({ ok: true, status: 200, dados: COISA });
    expect(fetch).toHaveBeenCalledWith('/api/coisas/a', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  });

  it('leitura não manda o cabeçalho de escrita', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => json(200, COISA));
    await criarCliente({ fetch }).ler(Coisa, '/x');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has(CABECALHOS.cliente.nome)).toBe(false);
  });

  it('toda escrita se identifica como editor e diz a versão do catálogo que fala', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => json(200, COISA));
    await criarCliente({ fetch }).escrever(Coisa, 'POST', '/api/coisas', { nome: 'x' });

    const init = fetch.mock.calls[0]?.[1];
    const cabecalhos = new Headers(init?.headers);
    expect(init?.method).toBe('POST');
    expect(cabecalhos.get(CABECALHOS.cliente.nome)).toBe(CABECALHOS.cliente.valor);
    // a versão do CATÁLOGO de operações, não a do formato do documento salvo
    expect(cabecalhos.get(CABECALHOS.catalogo)).toBe(String(VERSAO_DO_CATALOGO));
    expect(VERSAO_DO_CATALOGO).not.toBe(VERSAO_DO_FORMATO);
    expect(cabecalhos.get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"nome":"x"}');
  });

  it('escrita sem corpo de resposta (204) é ok', async () => {
    const r = await criarCliente({ fetch: async () => json(204) }).escrever(null, 'DELETE', '/api/coisas/a');
    expect(r).toEqual({ ok: true, status: 204, dados: undefined });
  });

  it('erro da API vem com o código e o detalhe; sem corpo de erro, vira erro interno', async () => {
    const comCodigo = await criarCliente({ fetch: async () => json(409, { codigo: 'versao_desatualizada', detalhe: { versaoAtual: 9 } }) }).ler(Coisa, '/x');
    expect(comCodigo).toEqual({ ok: false, status: 409, codigo: 'versao_desatualizada', detalhe: { versaoAtual: 9 } });

    const semCorpo = await criarCliente({ fetch: async () => json(502) }).ler(Coisa, '/x');
    expect(semCorpo).toEqual({ ok: false, status: 502, codigo: 'erro_interno' });
  });

  it('rede fora do ar vira sem_conexao, com status 0', async () => {
    const r = await criarCliente({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    }).ler(Coisa, '/x');
    expect(r).toEqual({ ok: false, status: 0, codigo: 'sem_conexao' });
  });

  it('resposta 200 fora do contrato não passa como dado', async () => {
    const r = await criarCliente({ fetch: async () => json(200, { outra: 1 }) }).ler(Coisa, '/x');
    expect(r).toEqual({ ok: false, status: 200, codigo: 'resposta_fora_do_contrato' });
  });

  it('no servidor, usa o endereço interno e repassa os cabeçalhos que recebeu', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => json(200, COISA));
    await criarCliente({ fetch, base: 'http://api:3000', cabecalhos: { cookie: 's=1' } }).ler(Coisa, '/api/x');
    expect(fetch.mock.calls[0]?.[0]).toBe('http://api:3000/api/x');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('cookie')).toBe('s=1');
  });
});
