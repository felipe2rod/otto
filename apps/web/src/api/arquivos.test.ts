// Envio de imagem e importação de SVG (docs/mvp/backend.md, seções 7.4 e 17.3).
import { CABECALHOS } from '@otto/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarApiDeArquivos, enderecoDaMiniatura } from './arquivos';
import { criarCliente } from './cliente';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const SHA = 'a'.repeat(64);
const enviado = { sha256: SHA, tipo: 'image/png', largura: 800, altura: 600, bytes: 1234 };
const vetor = {
  no: { tipo: 'vetor', moldura: [200, 100], caminhos: [{ d: 'M0 0C1 1 2 2 3 3Z', preenchimento: '#000000', regra: 'nao-zero' }], origem: { arquivo: SHA, nome: 'logo.svg' } },
  avisos: ['texto não convertido em curva (1)'],
};

function montar(resposta: () => Response) {
  const fetch = vi.fn(async (_u: string, _i?: RequestInit) => resposta());
  return { api: criarApiDeArquivos(criarCliente({ fetch })), fetch };
}
const arquivo = (nome: string, tipo: string, tamanho = 10) => new File([new Uint8Array(tamanho)], nome, { type: tipo });

describe('enviar imagem', () => {
  it('manda os bytes no corpo, com o tipo do arquivo e os cabeçalhos de escrita', async () => {
    const { api, fetch } = montar(() => json(201, enviado));
    const foto = arquivo('foto.png', 'image/png');
    const r = await api.enviarImagem(foto);

    expect(r).toEqual({ ok: true, arquivo: { sha256: SHA, largura: 800, altura: 600 } });
    const [url, init] = fetch.mock.calls[0] ?? [];
    const cabecalhos = new Headers(init?.headers);
    expect(url).toBe('/api/arquivos');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(foto);
    expect(cabecalhos.get('Content-Type')).toBe('image/png');
    expect(cabecalhos.get(CABECALHOS.cliente.nome)).toBe(CABECALHOS.cliente.valor);
  });

  it('recusa da API vem com o código e o detalhe, para a tela dizer o limite', async () => {
    const { api } = montar(() => json(413, { codigo: 'arquivo_grande_demais', detalhe: { limiteEmBytes: 26214400 } }));
    expect(await api.enviarImagem(arquivo('f.png', 'image/png'))).toEqual({ ok: false, codigo: 'arquivo_grande_demais', detalhe: { limiteEmBytes: 26214400 } });
  });
});

describe('importar SVG', () => {
  it('manda o texto do SVG com o nome do arquivo no endereço, e devolve o nó pronto e os avisos', async () => {
    const { api, fetch } = montar(() => json(201, vetor));
    const r = await api.importarSvg(arquivo('logo da marca.svg', 'image/svg+xml'));

    expect(r.ok && r.avisos).toEqual(['texto não convertido em curva (1)']);
    expect(r.ok && r.no).toMatchObject({ tipo: 'vetor', moldura: [200, 100] });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/vetores?nome=logo%20da%20marca.svg');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('image/svg+xml');
  });

  it('SVG inválido devolve o código', async () => {
    const { api } = montar(() => json(422, { codigo: 'svg_invalido', detalhe: { motivo: 'sem_formas' } }));
    expect(await api.importarSvg(arquivo('x.svg', 'image/svg+xml'))).toMatchObject({ ok: false, codigo: 'svg_invalido' });
  });
});

describe('o que já foi enviado', () => {
  it('a miniatura do vetor vem junto da importação, e vira endereço de <img> sem ir à rede', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="M0 0Z" fill="#000"/></svg>';
    const { api } = montar(() => json(201, { ...vetor, miniatura: svg }));
    const r = await api.importarSvg(arquivo('logo.svg', 'image/svg+xml'));
    expect(r.ok && r.miniatura).toBe(svg);
    expect(enderecoDaMiniatura(svg)).toBe(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  });

  it('lê as medidas, o nome e a origem de um arquivo da conta; relê um vetor pelo hash', async () => {
    const dados = {
      sha256: SHA,
      especie: 'imagem',
      tipo: 'image/jpeg',
      bytes: 1000,
      largura: 853,
      altura: 1280,
      origem: { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', pagina: 'https://exemplo.test/42' },
    };
    const ler = montar(() => json(200, dados));
    expect(await ler.api.dados(SHA)).toEqual(dados);
    expect(ler.fetch.mock.calls[0]?.[0]).toBe(`/api/arquivos/${SHA}/dados`);
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.dados(SHA)).toBeUndefined();

    const reler = montar(() => json(200, { ...vetor, miniatura: '<svg/>' }));
    expect(await reler.api.vetor(SHA)).toMatchObject({ miniatura: '<svg/>', avisos: vetor.avisos });
    expect(reler.fetch.mock.calls[0]?.[0]).toBe(`/api/vetores/${SHA}`);
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).api.vetor(SHA)).toBeUndefined();
  });
});
