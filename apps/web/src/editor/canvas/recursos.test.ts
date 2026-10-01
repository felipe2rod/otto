import { describe, expect, it, vi } from 'vitest';
import { criarRecursosDoRender } from './recursos';

const bytes = (n: number) => new Response(new Uint8Array(n));

describe('recursos do render', () => {
  it('busca a imagem pelo hash, na mesma origem, e entrega os bytes sem decodificar', async () => {
    const fetch = vi.fn(async () => bytes(3));
    const recursos = criarRecursosDoRender(fetch);

    const imagem = await recursos.imagem('abc123');

    expect(fetch).toHaveBeenCalledWith('/api/arquivos/abc123');
    expect(imagem.byteLength).toBe(3);
  });

  it('busca a fonte por família e peso, com a família escapada', async () => {
    const fetch = vi.fn(async () => bytes(5));
    const recursos = criarRecursosDoRender(fetch);

    const fonte = await recursos.fonte('IBM Plex Sans', 600);

    expect(fetch).toHaveBeenCalledWith('/api/fontes/IBM%20Plex%20Sans/600/arquivo');
    expect(fonte.byteLength).toBe(5);
  });

  it('resposta que não é 200 vira erro: o motor nunca recebe corpo de erro como se fosse imagem', async () => {
    const recursos = criarRecursosDoRender(async () => new Response('{"codigo":"nao_encontrado"}', { status: 404 }));
    await expect(recursos.imagem('abc')).rejects.toThrow('404');
  });
});
