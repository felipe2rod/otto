import { describe, expect, it } from 'vitest';
import { congelar, novoDocumento } from './apoio-de-teste';
import type { NoGrupo, NoVisual } from './esquema';
import { caixaDasPranchetas, deslocarNo, deslocarNos, disporPranchetas, VAO_ENTRE_PRANCHETAS } from './geometria';

const doc = () =>
  novoDocumento([
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'A', x: 10, y: 20, largura: 100, altura: 100, preenchimento: '#000000' } },
    {
      op: 'criarNo',
      prancheta: 'Feed',
      no: {
        tipo: 'forma',
        forma: 'retangulo',
        nome: 'B',
        x: 300,
        y: 20,
        largura: 100,
        altura: 100,
        preenchimento: '#000000',
        mascara: { tipo: 'forma', forma: 'elipse', x: 300, y: 20, largura: 100, altura: 100 },
      },
    },
    { op: 'agrupar', alvos: ['Feed/B'], nome: 'G' },
  ]);

describe('disposição das pranchetas no plano do editor', () => {
  it('ficam lado a lado, da esquerda para a direita, com o vão entre elas, alinhadas pelo topo', () => {
    const d = doc();
    const posicoes = disporPranchetas(d.pranchetas);
    expect(posicoes.get(d.pranchetas[0]?.id ?? '')).toEqual({ x: 0, y: 0 });
    expect(posicoes.get(d.pranchetas[1]?.id ?? '')).toEqual({ x: 1080 + VAO_ENTRE_PRANCHETAS, y: 0 });
    expect(caixaDasPranchetas(d.pranchetas)).toEqual({ x: 0, y: 0, w: 1080 * 2 + VAO_ENTRE_PRANCHETAS, h: 1920 });
    expect(caixaDasPranchetas([])).toBeUndefined();
  });
});

describe('deslocar sem mutar (prévia de gesto)', () => {
  it('desloca o nó, e a máscara de forma vai junto', () => {
    const d = congelar(doc());
    const g = d.pranchetas[0]?.filhos[1] as NoGrupo;
    const movido = deslocarNo(g, 5, -5) as NoGrupo;
    expect((movido.filhos[0] as NoVisual).x).toBe(305);
    expect(movido.filhos[0]?.mascara).toMatchObject({ x: 305, y: 15 });
    expect((g.filhos[0] as NoVisual).x).toBe(300);
  });

  it('desloca os nós pedidos na prancheta e preserva a referência dos outros', () => {
    const d = congelar(doc());
    const p = d.pranchetas[0];
    if (!p) throw new Error('sem prancheta');
    const a = p.filhos[0] as NoVisual;
    const movida = deslocarNos(p, new Set([a.id]), 7, 9);
    expect((movida.filhos[0] as NoVisual).x).toBe(17);
    expect(movida.filhos[1]).toBe(p.filhos[1]);
    expect(deslocarNos(p, new Set(['nenhum']), 7, 9)).toBe(p);
  });
});
