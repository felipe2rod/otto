import { Documento } from '@otto/documento';
import { describe, expect, it, vi } from 'vitest';
import { criarFonteDeExemplo } from './fonteDeExemplo';

const imagem = { hash: 'b'.repeat(64), largura: 1200, altura: 800, bytes: new Uint8Array([1, 2, 3]).buffer };

function montar() {
  const buscarFonte = vi.fn(async (_arquivo: string) => new Uint8Array([9]).buffer);
  const gerarImagem = vi.fn(async () => imagem);
  return { fonte: criarFonteDeExemplo({ gerarImagem, buscarFonte, nomeDaPeca: 'Exemplo' }), buscarFonte, gerarImagem };
}

describe('fonte de exemplo da bancada', () => {
  it('abre uma peça com o documento de exemplo, sem tocar a API', async () => {
    const { fonte } = montar();
    const r = await fonte.abrirPeca('qualquer');

    expect(r.estado).toBe('aberta');
    if (r.estado !== 'aberta') return;
    expect(r.peca).toMatchObject({ nome: 'Exemplo', versao: 1 });
    expect(Documento.safeParse(r.peca.arvore).success).toBe(true);
  });

  it('a imagem é gerada uma vez só, e entregue ao motor pelo hash', async () => {
    const { fonte, gerarImagem } = montar();
    await fonte.abrirPeca('a');
    await fonte.abrirPeca('a');

    expect(gerarImagem).toHaveBeenCalledTimes(1);
    expect(await fonte.recursos.imagem(imagem.hash)).toBe(imagem.bytes);
    await expect(fonte.recursos.imagem('c'.repeat(64))).rejects.toThrow();
  });

  it('entrega as fontes do documento de exemplo, e só elas', async () => {
    const { fonte, buscarFonte } = montar();
    await fonte.recursos.fonte('Anton', 400);

    expect(buscarFonte).toHaveBeenCalledWith('Anton-Regular.ttf');
    await expect(fonte.recursos.fonte('Comic Sans', 400)).rejects.toThrow();
  });

  it('confirma cada lote aqui mesmo, com a versão seguinte, e guarda o que recebeu', async () => {
    const { fonte } = montar();
    const lote = { id: 'l1', versaoBase: 4, descricao: 'mover Título', operacoes: [{ op: 'mover' as const, alvo: 'x', x: 1, y: 2 }] };

    expect(await fonte.enviarLote(lote)).toEqual({ tipo: 'confirmado', versao: 5 });
    expect(fonte.lotes).toEqual([lote]);
  });
});
