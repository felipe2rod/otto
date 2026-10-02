// O gerador de verdade: o CanvasKit desenha as seis texturas. É lento para teste de unidade (segundos), e é
// a única prova de que as receitas rodam neste motor.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspecionarImagem } from '../../../arquivo/domain/inspecionar-imagem';
import { TEXTURAS } from '../../application/texturas';
import { GeradorComCanvasKit } from './gerador-com-canvaskit';

const gerador = new GeradorComCanvasKit();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('GeradorComCanvasKit', () => {
  it.each(TEXTURAS.map((t) => t.nome))(
    '%s: sai um JPEG de 1600 × 1600 com conteúdo (não é chapado)',
    async (nome) => {
      const bytes = await gerador.gerar(nome);
      expect(inspecionarImagem(bytes)).toEqual({ ok: true, tipo: 'image/jpeg', largura: 1600, altura: 1600 });
      // um quadro chapado de 1600² em JPEG tem poucos KB; textura tem centenas
      expect(bytes.byteLength).toBeGreaterThan(60_000);
      expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
    },
    60_000,
  );

  it('é determinístico: o mesmo nome dá os mesmos bytes, e nomes diferentes dão texturas diferentes', async () => {
    const [um, dois, outro] = [await gerador.gerar('papel'), await gerador.gerar('papel'), await gerador.gerar('concreto')];
    expect(sha(um)).toBe(sha(dois));
    expect(sha(um)).not.toBe(sha(outro));
  }, 60_000);

  it('nome fora do catálogo é erro', async () => {
    await expect(gerador.gerar('inventada')).rejects.toThrow('textura desconhecida');
    await expect(gerador.gerar('constructor')).rejects.toThrow('textura desconhecida');
  });
});
