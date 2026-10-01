// Geometria de redimensionar e girar pela alça: onde ficam as pegas, qual está sob o ponteiro, e o
// quadro novo para cada arraste, com a camada reta ou girada, sozinha ou em conjunto.
import { describe, expect, it } from 'vitest';
import {
  cantosDe,
  deltaDoGiro,
  girarVarias,
  normalizarRotacao,
  pegaEm,
  pontoDeGirar,
  pontosDasAlcas,
  quadroDaSelecao,
  redimensionarQuadro,
  redimensionarVarias,
  transformar,
  travarEmPassos,
} from './transformacao';

const reto = { x: 100, y: 200, w: 300, h: 150, rotacao: 0 };
const perto = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('pegas', () => {
  it('são oito alças: quatro cantos e quatro lados', () => {
    const alcas = pontosDasAlcas(reto);
    expect(Object.keys(alcas).sort()).toEqual(['l', 'n', 'ne', 'no', 'o', 's', 'se', 'so']);
    expect(alcas.no).toEqual({ x: 100, y: 200 });
    expect(alcas.se).toEqual({ x: 400, y: 350 });
    expect(alcas.n).toEqual({ x: 250, y: 200 });
    expect(alcas.l).toEqual({ x: 400, y: 275 });
  });

  it('em camada girada, as alças giram junto, em torno do centro', () => {
    // 90° no sentido horário: o canto noroeste vai para onde era o nordeste (no quadro do centro)
    const girado = { ...reto, rotacao: 90 };
    const alcas = pontosDasAlcas(girado);
    // centro (250, 275); noroeste local (-150, -75) → girado (75, -150)
    perto(alcas.no, { x: 325, y: 125 });
    perto(alcas.se, { x: 175, y: 425 });
    expect(cantosDe(girado)).toHaveLength(4);
  });

  it('a pega de girar fica para fora do lado de cima, e acompanha a rotação', () => {
    perto(pontoDeGirar(reto, 30), { x: 250, y: 170 });
    perto(pontoDeGirar({ ...reto, rotacao: 90 }, 30), { x: 355, y: 275 });
  });

  it('acha a pega sob o ponto, com folga; longe de todas, nenhuma', () => {
    expect(pegaEm(reto, { x: 402, y: 348 }, 4, 30)).toBe('se');
    expect(pegaEm(reto, { x: 250, y: 203 }, 4, 30)).toBe('n');
    expect(pegaEm(reto, { x: 251, y: 171 }, 4, 30)).toBe('girar');
    expect(pegaEm(reto, { x: 250, y: 275 }, 4, 30)).toBeUndefined();
    expect(pegaEm({ ...reto, rotacao: 90 }, { x: 325, y: 126 }, 4, 30)).toBe('no');
  });
});

describe('redimensionar um quadro reto', () => {
  it('o canto sudeste cresce para a direita e para baixo; a origem não muda', () => {
    expect(redimensionarQuadro(reto, 'se', 50, 20)).toEqual({ x: 100, y: 200, w: 350, h: 170, rotacao: 0 });
  });

  it('o canto noroeste move a origem e mantém o canto oposto parado', () => {
    expect(redimensionarQuadro(reto, 'no', 30, 10)).toEqual({ x: 130, y: 210, w: 270, h: 140, rotacao: 0 });
  });

  it('alça de lado mexe só numa dimensão', () => {
    expect(redimensionarQuadro(reto, 'l', 40, 999)).toEqual({ x: 100, y: 200, w: 340, h: 150, rotacao: 0 });
    expect(redimensionarQuadro(reto, 'n', 999, -50)).toEqual({ x: 100, y: 150, w: 300, h: 200, rotacao: 0 });
  });

  it('não vira do avesso: o mínimo é 1, com o lado oposto parado', () => {
    expect(redimensionarQuadro(reto, 'l', -1000, 0)).toEqual({ x: 100, y: 200, w: 1, h: 150, rotacao: 0 });
    expect(redimensionarQuadro(reto, 'o', 1000, 0)).toEqual({ x: 399, y: 200, w: 1, h: 150, rotacao: 0 });
  });

  it('proporcional: o canto mantém a proporção pelo eixo que mais andou; o lado leva a outra dimensão junto, pelo meio', () => {
    // 300×150 é 2:1. Largura +100 → 400×200
    expect(redimensionarQuadro(reto, 'se', 100, 0, { proporcional: true })).toEqual({ x: 100, y: 200, w: 400, h: 200, rotacao: 0 });
    expect(redimensionarQuadro(reto, 'no', -100, 0, { proporcional: true })).toEqual({ x: 0, y: 150, w: 400, h: 200, rotacao: 0 });
    // lado leste +300: dobra a largura, e a altura dobra em torno do meio
    expect(redimensionarQuadro(reto, 'l', 300, 0, { proporcional: true })).toEqual({ x: 100, y: 125, w: 600, h: 300, rotacao: 0 });
  });

  it('valores inteiros: o documento não ganha meia unidade por causa do zoom', () => {
    expect(redimensionarQuadro(reto, 'se', 10.4, 7.6)).toEqual({ x: 100, y: 200, w: 310, h: 158, rotacao: 0 });
  });
});

describe('redimensionar um quadro girado', () => {
  const girado = { ...reto, rotacao: 90 };

  it('o arraste vale no sistema da camada: puxar a alça leste "para baixo" na tela alarga a camada girada 90°', () => {
    const r = redimensionarQuadro(girado, 'l', 0, 40);
    expect(r.w).toBe(340);
    expect(r.h).toBe(150);
    expect(r.rotacao).toBe(90);
    // o lado oposto (oeste) não saiu do lugar
    perto(pontosDasAlcas(r).o, pontosDasAlcas(girado).o);
  });

  it('pelo canto, o canto oposto fica parado na tela', () => {
    const inclinado = { ...reto, rotacao: 30 };
    const r = redimensionarQuadro(inclinado, 'se', 37, 21);
    const antes = pontosDasAlcas(inclinado).no;
    const depois = pontosDasAlcas(r).no;
    // x e y saem com duas casas: o canto fica a menos de um centésimo
    expect(Math.hypot(depois.x - antes.x, depois.y - antes.y)).toBeLessThan(0.02);
  });
});

describe('girar', () => {
  it('o giro é o ângulo que o ponteiro andou em torno do centro, no sentido horário da tela', () => {
    const centro = { x: 0, y: 0 };
    expect(deltaDoGiro(centro, { x: 0, y: -10 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(deltaDoGiro(centro, { x: 0, y: -10 }, { x: -10, y: 0 })).toBeCloseTo(-90);
  });

  it('a rotação fica entre -180 e 180, com uma casa', () => {
    expect(normalizarRotacao(190)).toBe(-170);
    expect(normalizarRotacao(-181)).toBe(179);
    expect(normalizarRotacao(360)).toBe(0);
    expect(normalizarRotacao(12.3456)).toBe(12.3);
  });

  it('com Shift, trava em passos de 15°', () => {
    expect(travarEmPassos(22)).toBe(15);
    expect(travarEmPassos(23)).toBe(30);
    expect(travarEmPassos(-8)).toBe(-15);
    expect(travarEmPassos(7)).toBe(0);
  });

  it('uma camada gira em torno do próprio centro: posição e tamanho não mudam', () => {
    const [r] = girarVarias([reto], { x: 250, y: 275 }, 45);
    expect(r).toEqual({ ...reto, rotacao: 45 });
  });

  it('várias giram em torno do centro do conjunto: cada uma muda de lugar e soma o giro', () => {
    const a = { x: 0, y: 0, w: 100, h: 100, rotacao: 0 };
    const b = { x: 200, y: 0, w: 100, h: 100, rotacao: 10 };
    const [ra, rb] = girarVarias([a, b], { x: 150, y: 50 }, 90);
    // o centro de `a` (50, 50) vai para (150, -50); o de `b` (250, 50) vai para (150, 150)
    expect(ra).toEqual({ x: 100, y: -100, w: 100, h: 100, rotacao: 90 });
    expect(rb).toEqual({ x: 100, y: 100, w: 100, h: 100, rotacao: 100 });
  });
});

describe('várias camadas', () => {
  const a = { x: 0, y: 0, w: 100, h: 50, rotacao: 0 };
  const b = { x: 200, y: 100, w: 100, h: 100, rotacao: 0 };

  it('o quadro de uma camada é ela mesma; o de várias é a caixa reta que cobre todas, com a girada pelo que ocupa', () => {
    expect(quadroDaSelecao([{ ...a, rotacao: 30 }])).toEqual({ ...a, rotacao: 30 });
    expect(quadroDaSelecao([a, b])).toEqual({ x: 0, y: 0, w: 300, h: 200, rotacao: 0 });
    // 100×50 girado 90° ocupa 50×100 em torno do mesmo centro (50, 25)
    const q = quadroDaSelecao([{ ...a, rotacao: 90 }, b]);
    expect(q.x).toBeCloseTo(25);
    expect(q.y).toBeCloseTo(-25);
    expect(q.w).toBeCloseTo(275);
  });

  it('redimensionar o conjunto leva cada camada na mesma proporção, em posição e tamanho', () => {
    const antes = quadroDaSelecao([a, b]);
    const depois = { x: 0, y: 0, w: 600, h: 200, rotacao: 0 };
    expect(redimensionarVarias([a, b], antes, depois)).toEqual([
      { x: 0, y: 0, w: 200, h: 50, rotacao: 0 },
      { x: 400, y: 100, w: 200, h: 100, rotacao: 0 },
    ]);
  });

  it('camada girada no conjunto cresce igual nos dois lados: não dá para esticar só um sem entortá-la', () => {
    const girada = { x: 200, y: 100, w: 100, h: 60, rotacao: 45 };
    const antes = { x: 0, y: 0, w: 300, h: 200, rotacao: 0 };
    const depois = { x: 0, y: 0, w: 600, h: 400, rotacao: 0 };
    const [, r] = redimensionarVarias([a, girada], antes, depois);
    expect(r).toMatchObject({ w: 200, h: 120, rotacao: 45 });
    // o centro (250, 130) vai para (500, 260)
    expect(r && r.x + r.w / 2).toBeCloseTo(500);
    expect(r && r.y + r.h / 2).toBeCloseTo(260);
  });
});

describe('o gesto inteiro: da pega ao quadro de cada camada', () => {
  const a = { x: 0, y: 0, w: 100, h: 50, rotacao: 0 };
  const b = { x: 200, y: 100, w: 100, h: 100, rotacao: 0 };

  it('uma camada pela alça: é o redimensionar dela', () => {
    expect(transformar([a], 'se', { de: { x: 100, y: 50 }, ate: { x: 150, y: 60 }, shift: false })).toEqual([{ x: 0, y: 0, w: 150, h: 60, rotacao: 0 }]);
  });

  it('várias pela alça: o conjunto cresce e cada uma acompanha', () => {
    expect(transformar([a, b], 'l', { de: { x: 300, y: 100 }, ate: { x: 600, y: 100 }, shift: false })).toEqual([
      { x: 0, y: 0, w: 200, h: 50, rotacao: 0 },
      { x: 400, y: 100, w: 200, h: 100, rotacao: 0 },
    ]);
  });

  it('várias com uma girada: redimensiona sempre em proporção, mesmo sem Shift', () => {
    const girada = { ...b, rotacao: 45 };
    const [ra] = transformar([a, girada], 'se', { de: { x: 0, y: 0 }, ate: { x: 500, y: 0 }, shift: false });
    // a largura e a altura de `a` cresceram na mesma proporção
    expect((ra?.w ?? 0) / 100).toBeCloseTo((ra?.h ?? 0) / 50, 1);
  });

  it('girar uma camada: soma o giro à rotação; com Shift, a rotação final cai num múltiplo de 15°', () => {
    const inclinada = { ...a, rotacao: 10 };
    const centro = { x: 50, y: 25 };
    const de = { x: centro.x, y: centro.y - 100 };
    // o ponteiro anda 40° em torno do centro
    const ate = { x: centro.x + 100 * Math.sin((40 * Math.PI) / 180), y: centro.y - 100 * Math.cos((40 * Math.PI) / 180) };
    expect(transformar([inclinada], 'girar', { de, ate, shift: false })[0]?.rotacao).toBe(50);
    expect(transformar([inclinada], 'girar', { de, ate, shift: true })[0]?.rotacao).toBe(45);
  });

  it('girar várias: em torno do centro do conjunto; com Shift, o giro é que cai em passos de 15°', () => {
    const de = { x: 150, y: -100 };
    const ate = { x: 350, y: 100 };
    // centro do conjunto (150, 100): de "acima" para "à direita" são 90°
    const r = transformar([a, { ...b, rotacao: 10 }], 'girar', { de, ate, shift: true });
    expect(r.map((q) => q.rotacao)).toEqual([90, 100]);
  });
});
