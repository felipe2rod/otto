import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarMesclador, type Mesclador, MODOS_POR_SHADER, referenciaDeMesclagem } from '../src/motor/mesclagem.ts';
import { canvasKit } from '../src/node/carregar.ts';
import { MODOS_DE_MESCLAGEM, type ModoDeMesclagem } from '../src/motor/tipos.ts';
import { diferencaMaxima, pixelsAleatorios } from './apoio.ts';

const LADO = 64;
let ck: CanvasKit;
let mesclador: Mesclador;

beforeAll(async () => {
  ck = await canvasKit();
  mesclador = criarMesclador(ck);
});

/** Compõe "cima" sobre "fundo" no CanvasKit, em raster de CPU, e devolve RGBA não premultiplicado. */
function mesclarNoMotor(fundo: Uint8Array, cima: Uint8Array, modo: ModoDeMesclagem, opacidade: number): Uint8Array {
  const info = { width: LADO, height: LADO, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
  const superficie = ck.MakeSurface(LADO, LADO)!;
  const canvas = superficie.getCanvas();
  canvas.clear(ck.TRANSPARENT);
  const imgFundo = ck.MakeImage(info, fundo, LADO * 4)!;
  const imgCima = ck.MakeImage(info, cima, LADO * 4)!;
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

describe('fórmula de referência (a que a POC calcula em pixel)', () => {
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
  it('respeita a opacidade da camada de cima', () => {
    expect(um([200, 200, 200, 255], [0, 0, 0, 255], 'subtrair', 0.5)[0]).toBe(200);
    expect(um([200, 200, 200, 255], [255, 255, 255, 255], 'subtrair', 0.5)[0]).toBe(100);
  });
});

describe('modos de mesclagem do Photoshop no CanvasKit contra a fórmula de referência', () => {
  it('cobre os 26 modos do documento', () => {
    expect(MODOS_DE_MESCLAGEM).toHaveLength(26);
    for (const modo of MODOS_POR_SHADER) expect(mesclador.nativo(modo)).toBe(false);
  });

  it('os modos que o Skia não tem saem por shader próprio', () => {
    expect([...MODOS_POR_SHADER].sort()).toEqual(
      ['cor-mais-clara', 'cor-mais-escura', 'dividir', 'luz-do-ponto', 'luz-intensa', 'luz-linear', 'mistura-solida', 'subexposicao-linear', 'subtrair', 'superexposicao-linear'].sort(),
    );
  });

  const fundoOpaco = pixelsAleatorios(LADO * LADO, 11, 'opaco');
  const cimaOpaca = pixelsAleatorios(LADO * LADO, 23, 'opaco');
  const fundoComAlfa = pixelsAleatorios(LADO * LADO, 37, 'variado');
  const cimaComAlfa = pixelsAleatorios(LADO * LADO, 41, 'variado');

  for (const modo of MODOS_DE_MESCLAGEM) {
    it(`${modo}: opaco sobre opaco, diferença de no máximo 1 nível`, () => {
      const motor = mesclarNoMotor(fundoOpaco, cimaOpaca, modo, 1);
      expect(diferencaMaxima(motor, referenciaDeMesclagem(fundoOpaco, cimaOpaca, modo, 1))).toBeLessThanOrEqual(1);
    });
    it(`${modo}: opacidade 60% sobre opaco, diferença de no máximo 1 nível`, () => {
      const motor = mesclarNoMotor(fundoOpaco, cimaOpaca, modo, 0.6);
      expect(diferencaMaxima(motor, referenciaDeMesclagem(fundoOpaco, cimaOpaca, modo, 0.6))).toBeLessThanOrEqual(1);
    });
    it(`${modo}: fundo e cima com alfa, diferença de no máximo 2 níveis`, () => {
      const motor = mesclarNoMotor(fundoComAlfa, cimaComAlfa, modo, 0.8);
      expect(diferencaMaxima(motor, referenciaDeMesclagem(fundoComAlfa, cimaComAlfa, modo, 0.8))).toBeLessThanOrEqual(2);
    });
  }
});
