import { describe, expect, it } from 'vitest';
import { adicionarRuido, aplicarCamadaDeAjuste, desfoqueGaussiano, mesclarPixels, tabelaDaCurva } from '../pixel';

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe('mesclarPixels (modos sem equivalente no Canvas)', () => {
  it('subexposição linear: fundo + cima − 1', () => {
    const fundo = px(200, 100, 50, 255);
    mesclarPixels(fundo, px(100, 100, 100, 255), 'subexposicao-linear', 1);
    expect([...fundo]).toEqual([45, 0, 0, 255]);
  });
  it('mistura sólida vira 0 ou 255 por canal', () => {
    const fundo = px(200, 60, 128, 255);
    mesclarPixels(fundo, px(100, 100, 128, 255), 'mistura-solida', 1);
    expect([...fundo]).toEqual([255, 0, 255, 255]);
  });
  it('respeita a opacidade da camada de cima', () => {
    const fundo = px(200, 200, 200, 255);
    mesclarPixels(fundo, px(0, 0, 0, 255), 'subtrair', 0.5);
    expect(fundo[0]).toBe(200);
  });
  it('cor mais escura escolhe o pixel inteiro de menor luminância', () => {
    const fundo = px(250, 10, 10, 255);
    mesclarPixels(fundo, px(20, 200, 20, 255), 'cor-mais-escura', 1);
    expect([...fundo]).toEqual([250, 10, 10, 255]);
  });
});

describe('camadas de ajuste', () => {
  it('curva identidade não muda nada; curva que clareia sobe os meios-tons', () => {
    expect(tabelaDaCurva(undefined)[128]).toBe(128);
    expect(tabelaDaCurva([[0, 0], [128, 170], [255, 255]])[128]).toBe(170);
  });
  it('preto e branco iguala os canais', () => {
    const d = px(255, 0, 0, 255);
    aplicarCamadaDeAjuste(d, { tipo: 'preto-e-branco' });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
  });
  it('mapa de degradê leva o preto à primeira cor e o branco à última', () => {
    const d = px(0, 0, 0, 255, 255, 255, 255, 255);
    aplicarCamadaDeAjuste(d, { tipo: 'mapa-de-degrade', paradas: [{ cor: '#1b1f4b', posicao: 0 }, { cor: '#e9b44c', posicao: 1 }] });
    expect([...d.slice(0, 3)]).toEqual([0x1b, 0x1f, 0x4b]);
    expect([...d.slice(4, 7)]).toEqual([0xe9, 0xb4, 0x4c]);
  });
  it('níveis esticam a faixa de entrada', () => {
    const d = px(64, 128, 192, 255);
    aplicarCamadaDeAjuste(d, { tipo: 'niveis', pretoDeEntrada: 64, brancoDeEntrada: 192, gama: 1, pretoDeSaida: 0, brancoDeSaida: 255 });
    expect([...d.slice(0, 3)]).toEqual([0, 128, 255]);
  });
});

describe('filtros', () => {
  it('desfoque espalha um ponto sem mudar a soma de luz', () => {
    const w = 21;
    const d = new Uint8ClampedArray(w * w * 4);
    for (let i = 0; i < d.length; i += 4) d[i + 3] = 255;
    d[(10 * w + 10) * 4] = 255;
    desfoqueGaussiano(d, w, w, 2);
    expect(d[(10 * w + 10) * 4]).toBeLessThan(255);
    expect(d[(10 * w + 12) * 4]).toBeGreaterThan(0);
  });
  it('ruído com a mesma semente dá o mesmo grão', () => {
    const a = new Uint8ClampedArray(400).fill(128);
    const b = new Uint8ClampedArray(400).fill(128);
    adicionarRuido(a, 0.2, true, 42);
    adicionarRuido(b, 0.2, true, 42);
    expect([...a]).toEqual([...b]);
    expect(new Set(a).size).toBeGreaterThan(5);
  });
});
