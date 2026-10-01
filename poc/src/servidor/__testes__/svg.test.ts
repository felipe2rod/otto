import { describe, expect, it } from 'vitest';
import { caminhoParaSubcaminhos, importarSvg } from '../svg';

describe('importarSvg', () => {
  it('normaliza formas, cores por classe e transformações em cúbicas com origem no zero', () => {
    const v = importarSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 10 200 100">
      <defs><style>.cls-1{fill:#1b1f4b}.cls-2{fill:#E9B44C}</style></defs>
      <rect class="cls-1" x="10" y="10" width="100" height="50" rx="10"/>
      <g transform="translate(100 0)"><circle class="cls-2" cx="60" cy="60" r="20"/></g>
      <path d="M20 90 l20 0 l0 10 z" fill="#f00"/>
    </svg>`);
    expect(v.caminhos.map((c) => c.preenchimento)).toEqual(['#1b1f4b', '#e9b44c', '#ff0000']);
    expect(v.moldura[0]).toBeCloseTo(170, 0);
    expect(v.caminhos.every((c) => /^[MCZ0-9 .\-e]+$/.test(c.d))).toBe(true);
    expect(v.caminhos[0]!.d.startsWith('M10 0')).toBe(true);
  });

  it('avisa o que não importa em vez de sumir calado', () => {
    const v = importarSvg(`<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/><text>Logo</text></svg>`);
    expect(v.avisos.some((a) => a.includes('texto'))).toBe(true);
  });

  it('importa ícone de contorno (stroke) como traço do caminho, com a moldura cobrindo a espessura', () => {
    const v = importarSvg(`<svg viewBox="0 0 100 100">
      <g fill="none" stroke="#0037A6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 10 L90 10"/>
      </g>
    </svg>`);
    expect(v.avisos).toEqual([]);
    expect(v.caminhos).toHaveLength(1);
    expect(v.caminhos[0]!.preenchimento).toBeUndefined();
    expect(v.caminhos[0]!.traco).toEqual({ cor: '#0037a6', espessura: 4, ponta: 'redonda', juncao: 'redonda' });
    expect(v.moldura).toEqual([84, 4]);
    expect(v.caminhos[0]!.d.startsWith('M2 2')).toBe(true);
  });

  it('forma com preenchimento e traço guarda os dois; a escala da transformação vale para a espessura', () => {
    const v = importarSvg(`<svg viewBox="0 0 100 100"><g transform="scale(2)"><rect x="5" y="5" width="20" height="20" fill="#fff" stroke="#000" stroke-width="3"/></g></svg>`);
    expect(v.caminhos[0]!.preenchimento).toBe('#ffffff');
    expect(v.caminhos[0]!.traco).toEqual({ cor: '#000000', espessura: 6, ponta: 'reta', juncao: 'angular' });
  });

  it('converte arco em cúbicas que terminam no ponto certo', () => {
    const [s] = caminhoParaSubcaminhos('M0 0 A50 50 0 0 1 100 0');
    const fim = s!.segmentos.at(-1)![2];
    expect(fim[0]).toBeCloseTo(100, 5);
    expect(fim[1]).toBeCloseTo(0, 5);
  });

  it('comandos relativos e H/V', () => {
    const [s] = caminhoParaSubcaminhos('m10 10 h20 v20 h-20 z');
    expect(s!.segmentos.map((g) => g[2])).toEqual([[30, 10], [30, 30], [10, 30]]);
    expect(s!.fechado).toBe(true);
  });
});
