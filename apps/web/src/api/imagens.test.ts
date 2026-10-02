// Banco de imagens e catálogo de fontes (packages/shared/src/briefing.ts e contrato.ts).
import { describe, expect, it, vi } from 'vitest';
import { criarCliente } from './cliente';
import { criarApiDeFontes, criarApiDeImagens } from './imagens';

const json = (status: number, corpo?: unknown) => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const SHA = 'a'.repeat(64);
const banco = { id: 'banco-de-teste', nome: 'Banco de Teste', licenca: 'Licença livre', ladoMaximo: 1280 };
const item = {
  banco: 'banco-de-teste',
  id: '42',
  descricao: 'pão, padaria',
  largura: 853,
  altura: 1280,
  autor: 'Fulana',
  pagina: 'https://exemplo.test/foto/42',
  previa: '/api/imagens/banco-de-teste/42/previa',
};

function montar(resposta: (url: string, init?: RequestInit) => Response) {
  const fetch = vi.fn(async (u: string, i?: RequestInit) => resposta(u, i));
  const cliente = criarCliente({ fetch });
  return { imagens: criarApiDeImagens(cliente), fontes: criarApiDeFontes(cliente), fetch };
}

describe('banco de imagens', () => {
  it('busca com o texto e a orientação na consulta, e devolve os resultados com a origem', async () => {
    const { imagens, fetch } = montar(() => json(200, { banco, itens: [item] }));
    expect(await imagens.buscar('pão quente', 'vertical')).toEqual({ ok: true, resultado: { banco, itens: [item] } });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/imagens/busca?q=p%C3%A3o%20quente&orientacao=vertical');
  });

  it('banco fora do ar e limite de buscas chegam como código', async () => {
    expect(await montar(() => json(503, { codigo: 'banco_de_imagens_indisponivel' })).imagens.buscar('x', 'todas')).toEqual({ ok: false, codigo: 'banco_de_imagens_indisponivel' });
    expect(await montar(() => json(429, { codigo: 'limite_de_imagens' })).imagens.buscar('x', 'todas')).toEqual({ ok: false, codigo: 'limite_de_imagens' });
  });

  it('trazer manda só o banco e o id do resultado, e devolve o arquivo da conta com a origem e o nó pronto', async () => {
    const trazida = {
      sha256: SHA,
      tipo: 'image/jpeg',
      largura: 853,
      altura: 1280,
      bytes: 1000,
      origem: { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', pagina: 'https://exemplo.test/foto/42' },
      no: { tipo: 'imagem', arquivo: SHA, larguraOriginal: 853, alturaOriginal: 1280, origem: { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', url: '' } },
    };
    const { imagens, fetch } = montar(() => json(201, trazida));
    expect(await imagens.trazer({ banco: 'banco-de-teste', id: '42' })).toEqual({ ok: true, imagem: trazida });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ banco: 'banco-de-teste', id: '42' });
    expect(await montar(() => json(422, { codigo: 'imagem_nao_buscada' })).imagens.trazer({ banco: 'banco-de-teste', id: '42' })).toEqual({ ok: false, codigo: 'imagem_nao_buscada' });
  });
});

describe('catálogo de fontes', () => {
  it('lista o catálogo, com o que ainda não foi baixado; se falhar, lista vazia', async () => {
    const itens = [
      { familia: 'Oswald', pesos: [300, 400], categoria: 'sem serifa', naBiblioteca: true },
      { familia: 'Bitter', pesos: [400, 700], categoria: 'serifada', naBiblioteca: false },
    ];
    const { fontes, fetch } = montar(() => json(200, { itens }));
    expect(await fontes.catalogo()).toEqual(itens);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/fontes?catalogo=1');
    expect(await montar(() => json(500, { codigo: 'erro_interno' })).fontes.catalogo()).toEqual([]);
  });

  it('trazer pede a família pelo peso (é o que a baixa na primeira vez) e diz se chegou', async () => {
    const { fontes, fetch } = montar(() => json(200, { familia: 'Bitter', peso: 700, nomePostScript: 'Bitter-Bold', arquivo: '/api/fontes/Bitter/700/arquivo' }));
    expect(await fontes.trazer('Bitter', 700)).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/fontes/Bitter/700');
    expect(await montar(() => json(404, { codigo: 'nao_encontrado' })).fontes.trazer('Nenhuma', 400)).toBe(false);
  });
});
