// O adaptador do Pixabay contra uma resposta gravada da API (gravacoes/, 2026-10-02). Sem rede.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BancoIndisponivel } from '../../../application/banco-de-imagens';
import { contratoDoBancoDeImagens } from '../../../application/banco-de-imagens.contrato';
import { BancoPixabay } from './banco-pixabay';

const GRAVACAO = readFileSync(path.join(import.meta.dirname, 'gravacoes/busca-cafe-coado-vertical.json'), 'utf8');
const CHAVE = 'CHAVE-DE-MENTIRA-0123456789';
const JPEG = new Uint8Array(4096).fill(9);

function redeGravada(extra: { status?: number; corpo?: string; falha?: Error } = {}) {
  const idas: string[] = [];
  const buscar = async (endereco: string, init: { signal: AbortSignal; redirect: 'error' }) => {
    idas.push(endereco);
    expect(init.redirect).toBe('error');
    if (extra.falha) throw extra.falha;
    if (endereco.startsWith('https://pixabay.com/api/')) return new Response(extra.corpo ?? GRAVACAO, { status: extra.status ?? 200, headers: { 'content-type': 'application/json' } });
    return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.byteLength) } });
  };
  return { idas, banco: new BancoPixabay({ chave: CHAVE, buscar }) };
}

contratoDoBancoDeImagens('Pixabay (resposta gravada)', () => {
  const { idas, banco } = redeGravada();
  return { banco, consulta: 'café coado', idas: () => idas.length };
});

describe('BancoPixabay', () => {
  it('pede fotos, em português, com busca segura, na orientação pedida, e manda a chave só na query da busca', async () => {
    const { idas, banco } = redeGravada();
    await banco.buscar('café coado', 'vertical');
    const url = new URL(idas[0] as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://pixabay.com/api/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ key: CHAVE, q: 'café coado', lang: 'pt', image_type: 'photo', orientation: 'vertical', safesearch: 'true', per_page: '12' });
    await banco.buscar('x', 'todas');
    expect(new URL(idas[1] as string).searchParams.get('orientation')).toBe('all');
  });

  it('lê a resposta gravada: medidas reduzidas ao que o acesso padrão entrega (1280 px), autor, página e endereços', async () => {
    const itens = await redeGravada().banco.buscar('café coado', 'vertical');
    expect(itens).toHaveLength(3);
    expect(itens[0]).toEqual({
      id: '9476692',
      descricao: 'café, grãos de café, copo, potenciômetro do café, aroma, assado, expresso, papel de parede para celular',
      largura: 853,
      altura: 1280,
      autor: 'Ralf1403',
      pagina: expect.stringMatching(/^https:\/\/pixabay\.com\/pt\/photos\//),
      urlDoArquivo: expect.stringMatching(/^https:\/\/pixabay\.com\/get\/.+_1280\.jpg$/),
      urlDaPrevia: expect.stringMatching(/^https:\/\/pixabay\.com\/get\/.+_640\.jpg$/),
    });
  });

  it('resultado com endereço fora do Pixabay é descartado', async () => {
    const adulterada = JSON.parse(GRAVACAO) as { hits: { largeImageURL: string }[] };
    (adulterada.hits[0] as { largeImageURL: string }).largeImageURL = 'https://atacante.exemplo.com/x.jpg';
    expect(await redeGravada({ corpo: JSON.stringify(adulterada) }).banco.buscar('x', 'todas')).toHaveLength(2);
  });

  it.each([
    [429, 'limite'],
    [400, 'credencial'],
    [403, 'credencial'],
    [500, 'rede'],
  ])('HTTP %i vira "indisponível: %s"', async (status, motivo) => {
    await expect(redeGravada({ status, corpo: '[ERROR 400] Invalid or missing API key' }).banco.buscar('x', 'todas')).rejects.toMatchObject({ motivo });
  });

  it('resposta que não é a esperada vira "indisponível: resposta"', async () => {
    await expect(redeGravada({ corpo: '<html>manutenção</html>' }).banco.buscar('x', 'todas')).rejects.toMatchObject({ motivo: 'resposta' });
    await expect(redeGravada({ corpo: '{"hits":[{"id":"x"}]}' }).banco.buscar('x', 'todas')).rejects.toMatchObject({ motivo: 'resposta' });
  });

  it('a chave nunca aparece no erro, nem quando a rede falha citando o endereço', async () => {
    const falha = new Error(`fetch failed: https://pixabay.com/api/?key=${CHAVE}&q=x`);
    const erro = await redeGravada({ falha })
      .banco.buscar('x', 'todas')
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BancoIndisponivel);
    expect(`${(erro as Error).message} ${(erro as Error).stack} ${JSON.stringify(erro)} ${String((erro as Error).cause)}`).not.toContain(CHAVE);
  });

  it('o tamanho declarado não é a prova: conta os bytes lidos e para ao passar do limite', async () => {
    const buscar = async () => new Response(new Uint8Array(50_000), { status: 200, headers: { 'content-length': '10' } });
    await expect(new BancoPixabay({ chave: CHAVE, buscar }).baixar('https://pixabay.com/get/x_1280.jpg', 1_000)).rejects.toMatchObject({ motivo: 'tamanho' });
  });

  it('baixa também do endereço de conteúdo do banco, e de nenhum outro subdomínio', async () => {
    const { banco } = redeGravada();
    expect((await banco.baixar('https://cdn.pixabay.com/photo/2025/03/17/x_640.jpg', 10_000)).byteLength).toBe(JPEG.byteLength);
    for (const endereco of ['https://outro.pixabay.com/x.jpg', 'https://pixabay.com.exemplo.com/get/x.jpg', 'https://exemplo.com@pixabay.com.atacante.net/x.jpg', 'http://pixabay.com/get/x.jpg'])
      await expect(banco.baixar(endereco, 10_000)).rejects.toMatchObject({ motivo: 'endereco' });
    await expect(banco.baixar('https://pixabay.com:8443/get/x.jpg', 10_000)).rejects.toMatchObject({ motivo: 'endereco' });
    await expect(banco.baixar('https://usuario:senha@pixabay.com/get/x.jpg', 10_000)).rejects.toMatchObject({ motivo: 'endereco' });
  });
});
