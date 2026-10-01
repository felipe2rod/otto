import { describe, expect, it } from 'vitest';
import { mapearNos, nosDaForma, nosDoSubcaminho, subcaminhosDe } from './caminho';

describe('forma como caminho de Bézier', () => {
  it('retângulo sem raio: quatro cantos vivos, no sentido horário a partir do canto de cima à esquerda', () => {
    const nos = nosDaForma('retangulo', 10, 20, 100, 50, 0);
    expect(nos.map((n) => n.ancora)).toEqual([
      [10, 20],
      [110, 20],
      [110, 70],
      [10, 70],
    ]);
    for (const n of nos) {
      expect(n.chegada).toEqual(n.ancora);
      expect(n.saida).toEqual(n.ancora);
    }
  });

  it('retângulo com raio: oito nós, e o raio não passa da metade do menor lado', () => {
    const nos = nosDaForma('retangulo', 0, 0, 100, 40, 10);
    expect(nos).toHaveLength(8);
    expect(nos[0]?.ancora).toEqual([10, 0]);
    expect(nos[1]?.ancora).toEqual([90, 0]);
    // o controle de saída do fim da aresta de cima avança 55% do raio na direção do canto
    expect(nos[1]?.saida[0]).toBeCloseTo(95.52, 2);
    const exagerado = nosDaForma('retangulo', 0, 0, 100, 40, 500);
    expect(exagerado[0]?.ancora).toEqual([20, 0]);
    expect(exagerado[2]?.ancora).toEqual([100, 20]);
  });

  it('elipse: quatro nós suaves nos extremos', () => {
    const nos = nosDaForma('elipse', 0, 0, 200, 100, 0);
    expect(nos.map((n) => n.ancora)).toEqual([
      [100, 0],
      [200, 50],
      [100, 100],
      [0, 50],
    ]);
    expect(nos.every((n) => n.ligado)).toBe(true);
    expect(nos[0]?.saida[0]).toBeCloseTo(155.23, 2);
  });

  it('mapearNos leva os três pontos de cada nó', () => {
    const [n] = mapearNos(nosDaForma('retangulo', 0, 0, 10, 10, 0), (x, y) => [x + 5, y * 2]);
    expect(n?.ancora).toEqual([5, 0]);
  });
});

describe('caminho do documento (M, C, Z)', () => {
  it('lê subcaminhos, com vírgula, espaço ou nada entre os números', () => {
    const subs = subcaminhosDe('M0 0C10,0 20,0 30,0C30 10 30 20 30 30ZM50-5C60-5 70-5 80-5');
    expect(subs).toHaveLength(2);
    expect(subs?.[0]).toEqual({
      inicio: [0, 0],
      segmentos: [
        [
          [10, 0],
          [20, 0],
          [30, 0],
        ],
        [
          [30, 10],
          [30, 20],
          [30, 30],
        ],
      ],
      fechado: true,
    });
    expect(subs?.[1]?.inicio).toEqual([50, -5]);
    expect(subs?.[1]?.fechado).toBe(false);
  });

  it('aceita o C implícito (vários trios de pontos depois de um C só)', () => {
    expect(subcaminhosDe('M0 0C1 1 2 2 3 3 4 4 5 5 6 6')?.[0]?.segmentos).toHaveLength(2);
  });

  it('o que não é M, C e Z devolve undefined, para a exportação cair no pixel com aviso', () => {
    expect(subcaminhosDe('M0 0L10 10')).toBeUndefined();
    expect(subcaminhosDe('M0 0 10 10')).toBeUndefined();
    expect(subcaminhosDe('m0 0c1 1 2 2 3 3')).toBeUndefined();
    expect(subcaminhosDe('C1 1 2 2 3 3')).toBeUndefined();
    expect(subcaminhosDe('M0 0C1 1 2 2')).toBeUndefined();
    expect(subcaminhosDe('')).toBeUndefined();
    expect(subcaminhosDe('M0 0')).toBeUndefined();
  });

  it('vira nós com controle de chegada, âncora e controle de saída', () => {
    const [sub] = subcaminhosDe('M0 0C10 0 20 10 20 20C20 30 10 40 0 40') ?? [];
    if (!sub) throw new Error('sem subcaminho');
    const { nos, aberto } = nosDoSubcaminho(sub, (x, y) => [x, y]);
    expect(aberto).toBe(true);
    expect(nos).toEqual([
      { chegada: [0, 0], ancora: [0, 0], saida: [10, 0], ligado: false },
      { chegada: [20, 10], ancora: [20, 20], saida: [20, 30], ligado: false },
      { chegada: [10, 40], ancora: [0, 40], saida: [0, 40], ligado: false },
    ]);
  });

  it('caminho fechado cujo último segmento volta ao início não repete o primeiro nó', () => {
    const [sub] = subcaminhosDe('M0 0C10 0 20 10 20 20C20 30 5 5 0 0Z') ?? [];
    if (!sub) throw new Error('sem subcaminho');
    const { nos, aberto } = nosDoSubcaminho(sub, (x, y) => [x + 100, y]);
    expect(aberto).toBe(false);
    expect(nos).toHaveLength(2);
    // o controle de chegada do primeiro nó é o segundo controle do último segmento
    expect(nos[0]).toEqual({ chegada: [105, 5], ancora: [100, 0], saida: [110, 0], ligado: false });
  });
});
