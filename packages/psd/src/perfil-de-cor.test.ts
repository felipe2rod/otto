// A conversão do perfil de cor do arquivo importado para sRGB. Os valores esperados vêm do LittleCMS 2.14 (pelo Pillow),
// convertendo do perfil Adobe RGB (1998) compatível e do ProPhoto RGB para sRGB, colorimétrico relativo: foram
// calculados uma vez, à mão, e estão aqui como números. Os perfis do teste são montados aqui, com os primários daqueles.
import { describe, expect, it } from 'vitest';
import { ADOBE_RGB as ADOBE, perfilDeTeste as perfil } from './apoio-de-psd';
import { conversaoParaSrgb } from './perfil-de-cor';
import { perfilSrgb } from './perfil-srgb';

const PROPHOTO = perfil(
  'ProPhoto RGB',
  [
    [0.79767, 0.28804, 0],
    [0.13519, 0.71188, 0],
    [0.03134, 0.00009, 0.82491],
  ],
  { gama: 1.8, parametrica: true },
);

const CORES: [number, number, number][] = [
  [0, 0, 0],
  [255, 255, 255],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [200, 100, 50],
  [30, 60, 90],
  [244, 239, 230],
  [12, 200, 180],
  [64, 64, 64],
  [250, 10, 130],
];
// o que o LittleCMS dá para as cores acima
const DO_ADOBE: [number, number, number][] = [
  [0, 0, 0],
  [255, 255, 255],
  [129, 129, 129],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [227, 100, 42],
  [0, 57, 91],
  [246, 239, 230],
  [0, 201, 181],
  [62, 62, 62],
  [255, 3, 134],
];
const DO_PROPHOTO: [number, number, number][] = [
  [0, 0, 0],
  [255, 255, 255],
  [146, 146, 146],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 80, 47],
  [0, 83, 114],
  [252, 241, 234],
  [0, 230, 191],
  [81, 81, 81],
  [255, 0, 157],
];

describe('conversão do perfil de cor do arquivo para sRGB', () => {
  it('sem perfil: as cores são lidas como sRGB, e isso fica dito', () => {
    const c = conversaoParaSrgb(undefined);
    expect(c.situacao).toBe('sem-perfil');
    expect(c.pixels).toBeUndefined();
    expect(c.cor({ r: 200, g: 100, b: 50 })).toEqual({ r: 200, g: 100, b: 50 });
  });

  it('o perfil sRGB que o próprio Otto embute: nada a converter', () => {
    const c = conversaoParaSrgb(perfilSrgb());
    expect(c).toMatchObject({ situacao: 'srgb', nome: 'sRGB IEC61966-2.1' });
    expect(c.pixels).toBeUndefined();
  });

  it('Adobe RGB (1998): cada cor dá o que o LittleCMS dá, a um nível', () => {
    const c = conversaoParaSrgb(ADOBE);
    expect(c).toMatchObject({ situacao: 'convertido', nome: 'Adobe RGB (1998)' });
    CORES.forEach(([r, g, b], i) => {
      const lida = c.cor({ r, g, b });
      const esperada = DO_ADOBE[i] as [number, number, number];
      expect(Math.max(Math.abs(lida.r - esperada[0]), Math.abs(lida.g - esperada[1]), Math.abs(lida.b - esperada[2])), `${r},${g},${b} deu ${lida.r},${lida.g},${lida.b}`).toBeLessThanOrEqual(1);
    });
  });

  it('ProPhoto RGB, com curva paramétrica: idem', () => {
    const c = conversaoParaSrgb(PROPHOTO);
    expect(c.situacao).toBe('convertido');
    CORES.forEach(([r, g, b], i) => {
      const lida = c.cor({ r, g, b });
      const esperada = DO_PROPHOTO[i] as [number, number, number];
      expect(Math.max(Math.abs(lida.r - esperada[0]), Math.abs(lida.g - esperada[1]), Math.abs(lida.b - esperada[2])), `${r},${g},${b} deu ${lida.r},${lida.g},${lida.b}`).toBeLessThanOrEqual(1);
    });
  });

  it('os pixels são convertidos no lugar, o alfa não muda, e o pixel transparente fica como está', () => {
    const c = conversaoParaSrgb(ADOBE);
    const rgba = new Uint8Array([200, 100, 50, 255, 200, 100, 50, 128, 200, 100, 50, 0]);
    c.pixels?.(rgba);
    expect([...rgba]).toEqual([227, 100, 42, 255, 227, 100, 42, 128, 200, 100, 50, 0]);
  });

  it('perfil que não é de matriz e curva, ou não é RGB, ou está quebrado: as cores são lidas como sRGB, e isso fica dito', () => {
    expect(
      conversaoParaSrgb(
        perfil(
          'Perfil CMYK',
          [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          { gama: 2.2 },
          'CMYK',
        ),
      ).situacao,
    ).toBe('nao-reconhecido');
    expect(conversaoParaSrgb(ADOBE.subarray(0, 200)).situacao).toBe('nao-reconhecido');
    expect(conversaoParaSrgb(new Uint8Array(50)).situacao).toBe('nao-reconhecido');
    const lixo = new Uint8Array(400).fill(0xff);
    expect(conversaoParaSrgb(lixo).situacao).toBe('nao-reconhecido');
  });
});
