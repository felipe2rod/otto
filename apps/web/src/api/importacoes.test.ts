// Importar um PSD (packages/shared/src/importacao.ts).
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDeImportacoes } from './importacoes';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ID = '0199a000-0000-7000-8000-000000000001';
const QUANDO = '2026-10-02T12:00:00.000Z';
const enviada = {
  id: ID,
  estado: 'enviada',
  arquivo: { nome: 'peça de verão.psd', bytes: 1000, formato: 'psd', largura: 1080, altura: 1350, camadas: 4 },
  fontes: [{ postScript: 'ArialMT', situacao: 'em_falta' }],
  criadaEm: QUANDO,
  expiraEm: QUANDO,
};

function montar(resposta: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn(async (u: string, i?: RequestInit) => resposta(u, i));
  return { api: criarApiDeImportacoes(criarCliente({ fetch })), fetch };
}
const arquivo = (nome = 'peça de verão.psd') => new File([new Uint8Array(10)], nome, { type: '' });

describe('importações', () => {
  it('envia os bytes com o tipo do PSD e o nome do arquivo no cabeçalho, codificado (o nome pode ter acento)', async () => {
    const { api, fetch } = montar(() => json(201, enviada));
    const psd = arquivo();
    expect(await api.enviar(psd)).toEqual({ ok: true, importacao: enviada });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/importacoes');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(psd);
    const cabecalhos = init?.headers as Record<string, string>;
    expect(cabecalhos['Content-Type']).toBe('image/vnd.adobe.photoshop');
    expect(cabecalhos['X-Otto-Nome-Do-Arquivo']).toBe('pe%C3%A7a%20de%20ver%C3%A3o.psd');
    expect(cabecalhos['X-Otto-Cliente']).toBe('editor');
  });

  it('a recusa do arquivo chega com o motivo; limite e rede caída chegam como código', async () => {
    const recusa = { codigo: 'psd_recusado', detalhe: { motivo: 'modo-de-cor', mensagem: 'frase do servidor' } };
    expect(await montar(() => json(422, recusa)).api.enviar(arquivo())).toEqual({ ok: false, ...recusa });
    expect(await montar(() => json(429, { codigo: 'limite_de_importacoes' })).api.enviar(arquivo())).toEqual({ ok: false, codigo: 'limite_de_importacoes' });
    // arquivo muito acima do teto: o servidor fecha a conexão sem ler, e o navegador só vê a rede cair
    expect(
      await montar(() => {
        throw new TypeError('Failed to fetch');
      }).api.enviar(arquivo()),
    ).toEqual({ ok: false, codigo: 'sem_conexao' });
  });

  it('pedir manda o nome, a marca e a escolha de cada fonte; consultar, listar e a da peça leem', async () => {
    const naFila = { ...enviada, estado: 'na_fila', expiraEm: undefined };
    const pedir = montar(() => json(202, naFila));
    const pedido = { nome: 'Verão', fontes: [{ postScript: 'ArialMT', fazer: 'substituir' as const, por: { familia: 'Anton', peso: 400 } }] };
    expect(await pedir.api.pedir(ID, pedido)).toMatchObject({ ok: true, importacao: { estado: 'na_fila' } });
    expect(pedir.fetch.mock.calls[0]?.[0]).toBe(`/api/importacoes/${ID}/importar`);
    expect(JSON.parse(String(pedir.fetch.mock.calls[0]?.[1]?.body))).toEqual(pedido);

    const consultar = montar(() => json(200, enviada));
    expect(await consultar.api.consultar(ID)).toEqual({ ok: true, importacao: enviada });
    expect(consultar.fetch.mock.calls[0]?.[0]).toBe(`/api/importacoes/${ID}`);

    expect(await montar(() => json(200, { itens: [enviada] })).api.listar()).toEqual([enviada]);
    expect(await montar(() => json(500, { codigo: 'erro_interno' })).api.listar()).toBeUndefined();

    const daPeca = montar(() => json(200, enviada));
    expect(await daPeca.api.daPeca('peca-1')).toEqual(enviada);
    expect(daPeca.fetch.mock.calls[0]?.[0]).toBe('/api/documentos/peca-1/importacao');
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.daPeca('peca-1')).toBeUndefined();
  });

  it('desistir apaga o arquivo enviado; fora do estado, a recusa volta como código', async () => {
    const { api, fetch } = montar(() => json(204));
    expect(await api.desistir(ID)).toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(await montar(() => json(409, { codigo: 'importacao_fora_do_estado' })).api.desistir(ID)).toEqual({ ok: false, codigo: 'importacao_fora_do_estado' });
  });
});
