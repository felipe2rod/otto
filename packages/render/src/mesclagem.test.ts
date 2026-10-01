import { MODOS_DE_MESCLAGEM, type ModoDeMesclagem } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { canvasKitDeTeste, diferencaMaxima, pixelsAleatorios } from './apoio-de-teste';
import { criarMesclador, type Mesclador, MODOS_POR_SHADER, referenciaDeMesclagem } from './mesclagem';
import { mesclarPremultiplicado } from './pixel';

const LADO = 64;
let ck: CanvasKit;
let mesclador: Mesclador;

beforeAll(async () => {
  ck = await canvasKitDeTeste();
  mesclador = criarMesclador(ck);
});

/** Compõe "cima" sobre "fundo" no CanvasKit (modo nativo ou shader) e devolve RGBA não premultiplicado. */
function mesclarNoMotor(fundo: Uint8Array, cima: Uint8Array, modo: ModoDeMesclagem, opacidade: number): Uint8Array {
  const info = { width: LADO, height: LADO, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
  const superficie = ck.MakeSurface(LADO, LADO);
  const imgFundo = ck.MakeImage(info, fundo, LADO * 4);
  const imgCima = ck.MakeImage(info, cima, LADO * 4);
  if (!superficie || !imgFundo || !imgCima) throw new Error('motor sem superfície');
  const canvas = superficie.getCanvas();
  canvas.clear(ck.TRANSPARENT);
  const copiar = new ck.Paint();
  copiar.setBlendMode(ck.BlendMode.Src);
  canvas.drawImage(imgFundo, 0, 0, copiar);
  const tinta = new ck.Paint();
  tinta.setAlphaf(opacidade);
  mesclador.aplicar(tinta, modo);
  canvas.drawImage(imgCima, 0, 0, tinta);
  const saida = canvas.readPixels(0, 0, info) as Uint8Array;
  for (const o of [copiar, tinta, imgFundo, imgCima, superficie]) o.delete();
  return saida;
}

const premultiplicar = (d: Uint8Array): Uint8Array => {
  const s = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = (d[i + 3] as number) / 255;
    for (let k = 0; k < 3; k++) s[i + k] = Math.round((d[i + k] as number) * a);
    s[i + 3] = d[i + 3] as number;
  }
  return s;
};

describe('fórmula de referência', () => {
  const um = (fundo: number[], cima: number[], modo: ModoDeMesclagem, opacidade = 1) => [...referenciaDeMesclagem(new Uint8Array(fundo), new Uint8Array(cima), modo, opacidade)];

  it('subexposição linear: fundo + cima − 1', () => {
    expect(um([200, 100, 50, 255], [100, 100, 100, 255], 'subexposicao-linear')).toEqual([45, 0, 0, 255]);
  });
  it('mistura sólida vira 0 ou 255 por canal, e o empate (soma 255) vira 255', () => {
    expect(um([200, 60, 128, 255], [100, 100, 127, 255], 'mistura-solida')).toEqual([255, 0, 255, 255]);
  });
  it('cor mais escura escolhe o pixel inteiro de menor luminância', () => {
    expect(um([250, 10, 10, 255], [20, 200, 20, 255], 'cor-mais-escura')).toEqual([250, 10, 10, 255]);
  });
  it('superexposição linear com opacidade parcial mistura o resultado, não soma os premultiplicados', () => {
    // fundo 204, camada 204 a 50%: B = min(1, soma) = 255; metade do caminho entre 204 e 255
    expect(um([204, 204, 204, 255], [204, 204, 204, 255], 'superexposicao-linear', 0.5)[0]).toBe(230);
  });
});

describe('os 26 modos do Photoshop: motor (GPU e nativo) e laço de pixel (CPU) contra a mesma fórmula', () => {
  it('são 26, e os que o Skia não tem saem por shader próprio', () => {
    expect(MODOS_DE_MESCLAGEM).toHaveLength(26);
    expect([...MODOS_POR_SHADER].sort()).toEqual([
      'cor-mais-clara',
      'cor-mais-escura',
      'dividir',
      'luz-do-ponto',
      'luz-intensa',
      'luz-linear',
      'mistura-solida',
      'subexposicao-linear',
      'subtrair',
      'superexposicao-linear',
    ]);
    for (const modo of MODOS_POR_SHADER) expect(mesclador.nativo(modo)).toBe(false);
  });

  const fundoOpaco = pixelsAleatorios(LADO * LADO, 11, 'opaco');
  const cimaOpaca = pixelsAleatorios(LADO * LADO, 23, 'opaco');
  const fundoComAlfa = pixelsAleatorios(LADO * LADO, 37, 'variado');
  const cimaComAlfa = pixelsAleatorios(LADO * LADO, 41, 'variado');

  for (const modo of MODOS_DE_MESCLAGEM) {
    it(`${modo}: opaco e com opacidade de 60%, no máximo 1 nível; com alfa nos dois, no máximo 2`, () => {
      expect(diferencaMaxima(mesclarNoMotor(fundoOpaco, cimaOpaca, modo, 1), referenciaDeMesclagem(fundoOpaco, cimaOpaca, modo, 1))).toBeLessThanOrEqual(1);
      expect(diferencaMaxima(mesclarNoMotor(fundoOpaco, cimaOpaca, modo, 0.6), referenciaDeMesclagem(fundoOpaco, cimaOpaca, modo, 0.6))).toBeLessThanOrEqual(1);
      expect(diferencaMaxima(mesclarNoMotor(fundoComAlfa, cimaComAlfa, modo, 0.8), referenciaDeMesclagem(fundoComAlfa, cimaComAlfa, modo, 0.8))).toBeLessThanOrEqual(2);
    });
  }

  for (const modo of MODOS_POR_SHADER) {
    it(`${modo}: o laço de pixel da CPU dá a fórmula, a 1 nível`, () => {
      for (const opacidade of [1, 0.6]) {
        const destino = premultiplicar(fundoOpaco);
        mesclarPremultiplicado(destino, LADO, 0, 0, premultiplicar(cimaOpaca), LADO, LADO, modo, opacidade);
        expect(diferencaMaxima(destino, referenciaDeMesclagem(fundoOpaco, cimaOpaca, modo, opacidade))).toBeLessThanOrEqual(1);
      }
    });
  }

  it('o laço mescla só a região da origem, no deslocamento pedido', () => {
    const destino = new Uint8Array(8 * 8 * 4).fill(255);
    mesclarPremultiplicado(destino, 8, 3, 4, new Uint8Array(2 * 2 * 4).fill(255), 2, 2, 'subtrair', 1);
    const em = (x: number, y: number): number => destino[(y * 8 + x) * 4] as number;
    expect([em(3, 4), em(4, 5), em(2, 4), em(5, 5)]).toEqual([0, 0, 255, 255]);
  });
});
