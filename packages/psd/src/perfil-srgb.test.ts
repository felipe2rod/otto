import { describe, expect, it } from 'vitest';
import { perfilSrgb, sRgbParaLinear } from './perfil-srgb';

const p = perfilSrgb();
const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
const texto = (inicio: number, tamanho: number): string => String.fromCharCode(...p.slice(inicio, inicio + tamanho));
/** As etiquetas do perfil: sigla → [posição, tamanho]. */
const etiquetas = new Map(Array.from({ length: v.getUint32(128) }, (_, i) => [texto(132 + i * 12, 4), [v.getUint32(136 + i * 12), v.getUint32(140 + i * 12)] as const]));
const fixo = (inicio: number): number => v.getInt32(inicio) / 65536;

describe('perfil sRGB embutido', () => {
  it('é um perfil ICC de monitor, RGB, versão 2, com o tamanho declarado igual ao real', () => {
    expect(v.getUint32(0)).toBe(p.length);
    expect(p.length % 4).toBe(0);
    expect(v.getUint8(8)).toBe(2);
    expect(texto(12, 4)).toBe('mntr');
    expect(texto(16, 4)).toBe('RGB ');
    expect(texto(20, 4)).toBe('XYZ ');
    expect(texto(36, 4)).toBe('acsp');
    // iluminante do espaço de conexão: D50
    expect([fixo(68), fixo(72), fixo(76)].map((x) => Math.round(x * 10000) / 10000)).toEqual([0.9642, 1, 0.8249]);
  });

  it('tem as nove etiquetas de um perfil de matriz e curva, todas dentro do arquivo e alinhadas', () => {
    expect([...etiquetas.keys()].sort()).toEqual(['bTRC', 'bXYZ', 'cprt', 'desc', 'gTRC', 'gXYZ', 'rTRC', 'rXYZ', 'wtpt']);
    for (const [posicao, tamanho] of etiquetas.values()) {
      expect(posicao % 4).toBe(0);
      expect(posicao + tamanho).toBeLessThanOrEqual(p.length);
    }
    const desc = etiquetas.get('desc') as readonly [number, number];
    expect(texto(desc[0], 4)).toBe('desc');
    expect(texto(desc[0] + 12, v.getUint32(desc[0] + 8) - 1)).toBe('sRGB IEC61966-2.1');
  });

  it('os três primários somam o branco D50, e o Y deles é a luminância do sRGB', () => {
    const xyz = (sigla: string): number[] => {
      const [posicao] = etiquetas.get(sigla) as readonly [number, number];
      expect(texto(posicao, 4)).toBe('XYZ ');
      return [fixo(posicao + 8), fixo(posicao + 12), fixo(posicao + 16)];
    };
    const [r, g, b] = [xyz('rXYZ'), xyz('gXYZ'), xyz('bXYZ')] as [number[], number[], number[]];
    for (const [i, d50] of [0.9642, 1, 0.8249].entries()) expect((r[i] as number) + (g[i] as number) + (b[i] as number)).toBeCloseTo(d50, 3);
    expect(r[1]).toBeCloseTo(0.2225, 3);
    expect(g[1]).toBeCloseTo(0.7169, 3);
    expect(b[1]).toBeCloseTo(0.0606, 3);
    // ponto branco do monitor: D65
    expect(xyz('wtpt').map((x) => Math.round(x * 1000) / 1000)).toEqual([0.95, 1, 1.089]);
  });

  it('a curva é a do sRGB, a mesma tabela para os três canais', () => {
    const [posicao, tamanho] = etiquetas.get('rTRC') as readonly [number, number];
    expect(etiquetas.get('gTRC')).toEqual([posicao, tamanho]);
    expect(etiquetas.get('bTRC')).toEqual([posicao, tamanho]);
    expect(texto(posicao, 4)).toBe('curv');
    const pontos = v.getUint32(posicao + 8);
    expect(pontos).toBe(1024);
    const em = (i: number): number => v.getUint16(posicao + 12 + i * 2) / 65535;
    expect(em(0)).toBe(0);
    expect(em(1023)).toBe(1);
    // cinza médio do sRGB (0,5 codificado) vale 21,4% de luz
    expect(em(512)).toBeCloseTo(sRgbParaLinear(512 / 1023), 4);
    expect(sRgbParaLinear(0.5)).toBeCloseTo(0.214, 3);
    for (let i = 1; i < pontos; i++) expect(em(i)).toBeGreaterThanOrEqual(em(i - 1));
  });

  it('sempre os mesmos bytes', () => {
    expect(perfilSrgb()).toBe(p);
    expect(p.length).toBeLessThan(4096);
  });
});
