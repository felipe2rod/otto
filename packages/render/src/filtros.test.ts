// Filtros que mexem no pixel da camada: ruído, nitidez e desfoque de movimento.
// Cada um tem a conta em laço de pixel (CPU, o render de referência) e em shader (GPU). Os dois têm de dar o mesmo.
import { aplicarLote, type Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { diferencaMaxima, FOTO, forma, imagem, novaSessao, peca, pixel, texto } from './apoio-de-teste';
import { naoDesenhado, type OpcoesDeRender, renderizarPrancheta } from './compositor';
import { comparar } from './diferenca';
import { ruidoEm } from './ruido';
import type { Sessao } from './sessao';

let ck: CanvasKit;
let sessao: Sessao;
beforeAll(async () => {
  ({ ck, sessao } = await novaSessao());
});

function render(nos: Parameters<typeof peca>[0], opcoes: OpcoesDeRender = {}, tamanho: Parameters<typeof peca>[1] = {}) {
  const { doc, p } = peca(nos, tamanho);
  const r = renderizarPrancheta(sessao, doc, p, opcoes);
  return { ...r, doc, p, em: (x: number, y: number) => pixel(r.rgba, r.largura, x, y) };
}

/** Diferença entre o laço de pixel (referência) e o shader (GPU, rodado em CPU), na mesma cena. */
function entreOsDoisCalculos(nos: Parameters<typeof peca>[0], opcoes: OpcoesDeRender = {}) {
  const { doc, p } = peca(nos, { largura: 240, altura: 200, fundo: '#3b6ea5' });
  const a = renderizarPrancheta(sessao, doc, p, { ...opcoes, calculo: 'pixel' });
  const b = renderizarPrancheta(sessao, doc, p, { ...opcoes, calculo: 'shader' });
  return comparar(a.rgba, b.rgba, a.largura, a.altura).d;
}

describe('ruído por posição', () => {
  it('é uma função da posição, do canal e da semente: sempre o mesmo valor, em [0, 1)', () => {
    expect(ruidoEm(10, 20, 0, 7)).toBe(ruidoEm(10, 20, 0, 7));
    expect(ruidoEm(10, 20, 0, 7)).not.toBe(ruidoEm(11, 20, 0, 7));
    expect(ruidoEm(10, 20, 0, 7)).not.toBe(ruidoEm(10, 21, 0, 7));
    expect(ruidoEm(10, 20, 0, 7)).not.toBe(ruidoEm(10, 20, 1, 7));
    expect(ruidoEm(10, 20, 0, 7)).not.toBe(ruidoEm(10, 20, 0, 8));
    for (const [x, y] of [
      [-5, -900],
      [0, 0],
      [4096, 30000],
      [-1, 1],
    ] as const) {
      expect(ruidoEm(x, y, 0, 1)).toBeGreaterThanOrEqual(0);
      expect(ruidoEm(x, y, 0, 1)).toBeLessThan(1);
    }
  });

  it('é uniforme o bastante: média perto de 0,5 e sem repetir numa faixa de 600 px', () => {
    let soma = 0;
    const linha: number[] = [];
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) soma += ruidoEm(x, y, 0, 3);
    for (let x = 0; x < 600; x++) linha.push(ruidoEm(x, 5, 0, 3));
    expect(soma / 40000).toBeGreaterThan(0.48);
    expect(soma / 40000).toBeLessThan(0.52);
    // o padrão não se repete com período de 289 nem de 361 (os dois módulos da conta)
    expect(linha.slice(0, 40)).not.toEqual(linha.slice(289, 329));
    expect(linha.slice(0, 40)).not.toEqual(linha.slice(361, 401));
  });

  it('só usa inteiros abaixo de 2^24: a mesma conta é exata em ponto flutuante de 32 bits (a da GPU)', () => {
    const f = Math.fround;
    const m = (x: number, y: number): number => f(x - f(y * Math.floor(f(f(x + 0.5) / y))));
    const p = (x: number, k: number, mod: number): number => m(f(f(f(k * x) + 1) * x), mod);
    for (const [x, y, c, s] of [
      [0, 0, 0, 0],
      [123, 4567, 2, 99991],
      [-77, 29999, 1, 5],
      [288, 360, 0, 104728],
    ] as const) {
      const a = p(m(p(m(p(m(x, 289), 34, 289) + m(y, 289), 289), 34, 289) + m(s + c * 71, 289), 289), 34, 289);
      const b = p(m(p(m(p(m(x, 361), 38, 361) + m(y, 361), 361), 38, 361) + m(s + c * 71, 361), 361), 38, 361);
      expect(m(a * 361 + b * 289, 104329) / 104329).toBeCloseTo(ruidoEm(x, y, c, s), 6);
    }
  });
});

describe('filtro de ruído', () => {
  const grao = (extra: object = {}) => forma('grao', 20, 20, 160, 120, '#808080', { filtros: [{ tipo: 'ruido', quantidade: 0.2, monocromatico: true }], ...extra });

  it('mexe na cor dentro da camada, sem mudar o alfa nem o que está fora dela', () => {
    const r = render([grao()], { fundo: false });
    const cores = new Set<number>();
    for (let x = 30; x < 170; x++) cores.add(r.em(x, 80)[0]);
    expect(cores.size).toBeGreaterThan(20);
    expect(Math.min(...cores)).toBeGreaterThanOrEqual(128 - 52);
    expect(Math.max(...cores)).toBeLessThanOrEqual(128 + 52);
    expect(r.em(100, 80)[3]).toBe(255);
    expect(r.em(5, 5)).toEqual([0, 0, 0, 0]);
  });

  it('monocromático mexe nos três canais igual; colorido, cada um por si', () => {
    const mono = render([grao()]);
    const cor = render([grao({ filtros: [{ tipo: 'ruido', quantidade: 0.2, monocromatico: false }] })]);
    let iguais = 0;
    let diferentes = 0;
    for (let x = 30; x < 170; x++) {
      const [r, g, b] = mono.em(x, 80);
      if (r === g && g === b) iguais++;
      const [r2, g2, b2] = cor.em(x, 80);
      if (r2 !== g2 || g2 !== b2) diferentes++;
    }
    expect(iguais).toBe(140);
    expect(diferentes).toBeGreaterThan(130);
  });

  it('é determinístico, e o grão acompanha a camada: mover a camada leva o mesmo grão junto', () => {
    // a semente sai do id da camada: o mesmo documento dá sempre o mesmo grão
    const { doc, p } = peca([grao()]);
    const a = renderizarPrancheta(sessao, doc, p);
    expect(Buffer.compare(a.rgba, renderizarPrancheta(sessao, doc, p).rgba)).toBe(0);
    const r = aplicarLote(doc, [{ op: 'mover', alvo: 'P/grao', x: 33, y: 41 }], { autoria: { tipo: 'designer' }, idDoLote: 'mover-o-grao' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const movida = renderizarPrancheta(sessao, r.doc, r.doc.pranchetas[0] as Prancheta);
    for (const [x, y] of [
      [40, 50],
      [100, 80],
      [170, 130],
    ] as const)
      expect(pixel(movida.rgba, 200, x + 13, y + 21)).toEqual(pixel(a.rgba, 200, x, y));
    // outra camada, outro grão
    const outra = peca([grao()]);
    expect(Buffer.compare(a.rgba, renderizarPrancheta(sessao, outra.doc, outra.p).rgba)).not.toBe(0);
  });

  it('o shader da GPU dá o mesmo grão que o laço de pixel: no máximo 1 nível, com escala, rotação e alfa', () => {
    expect(entreOsDoisCalculos([grao()]).maxima).toBeLessThanOrEqual(1);
    expect(entreOsDoisCalculos([grao({ filtros: [{ tipo: 'ruido', quantidade: 0.5, monocromatico: false }] })]).maxima).toBeLessThanOrEqual(1);
    expect(entreOsDoisCalculos([grao({ forma: 'elipse', opacidade: 0.7 })]).maxima).toBeLessThanOrEqual(2);
    expect(entreOsDoisCalculos([imagem('foto', FOTO, 20, 20, 180, 140, { filtros: [{ tipo: 'ruido', quantidade: 0.15 }] })], { escala: 2 }).maxima).toBeLessThanOrEqual(1);
    // girada, a borda entre duas células de grão cai em posição qualquer: poucos pixels podem trocar de célula
    const girada = entreOsDoisCalculos([grao({ rotacao: 17 })]);
    expect(girada.acimaDe2 / (240 * 200)).toBeLessThan(0.002);
  }, 120_000);
});

describe('filtro de nitidez', () => {
  const borda = (filtros: object[]) => [
    forma('escuro', 0, 0, 120, 200, '#606060'),
    forma('claro', 120, 0, 120, 200, '#a0a0a0'),
    forma(
      'cartao',
      60,
      40,
      120,
      120,
      {
        tipo: 'linear',
        angulo: 0,
        paradas: [
          { cor: '#606060', posicao: 0.49 },
          { cor: '#a0a0a0', posicao: 0.51 },
        ],
      },
      { filtros },
    ),
  ];

  it('aumenta o contraste dos dois lados de uma borda e não mexe em área lisa', () => {
    const r = render(borda([{ tipo: 'nitidez', quantidade: 1.5, raio: 4 }]), {}, { largura: 240, altura: 200 });
    expect(r.em(116, 100)[0]).toBeLessThan(0x60 - 8);
    expect(r.em(124, 100)[0]).toBeGreaterThan(0xa0 + 8);
    expect(r.em(75, 100)[0]).toBe(0x60);
    expect(r.em(165, 100)[0]).toBe(0xa0);
  });

  it('o shader da GPU dá o mesmo que o laço de pixel: no máximo 2 níveis', () => {
    expect(entreOsDoisCalculos([imagem('foto', FOTO, 20, 20, 200, 160, { filtros: [{ tipo: 'nitidez', quantidade: 1.2, raio: 3 }] })]).maxima).toBeLessThanOrEqual(2);
    expect(
      entreOsDoisCalculos([texto('t', 'Nítido', { x: 20, y: 40, largura: 200, altura: 90, fonte: 'Anton', tamanho: 70, cor: '#ffffff', filtros: [{ tipo: 'nitidez', quantidade: 2, raio: 2 }] })])
        .maxima,
    ).toBeLessThanOrEqual(2);
  }, 120_000);
});

describe('filtro de desfoque de movimento', () => {
  const ponto = (angulo: number) => [forma('ponto', 110, 90, 20, 20, '#ffffff', { filtros: [{ tipo: 'desfoque-de-movimento', angulo, distancia: 60 }] })];

  it('espalha a camada ao longo do ângulo, e só nele', () => {
    const h = render(ponto(0), { fundo: false }, { largura: 240, altura: 200 });
    // na horizontal: o quadrado de 20 px vira um rastro de 80 px (30 para cada lado), e não sobe nem desce.
    // No miolo, perto de 20 das 60 amostras caem no quadrado (19 ou 20, pelo arredondamento do passo): alfa de 81 a 85
    expect(h.em(120, 100)[3]).toBeGreaterThanOrEqual(80);
    expect(h.em(120, 100)[3]).toBeLessThanOrEqual(87);
    expect(h.em(85, 100)[3]).toBeGreaterThan(15);
    expect(h.em(155, 100)[3]).toBeGreaterThan(15);
    expect(h.em(70, 100)[3]).toBe(0);
    expect(h.em(120, 70)[3]).toBe(0);
    const v = render(ponto(90), { fundo: false }, { largura: 240, altura: 200 });
    expect(v.em(120, 65)[3]).toBeGreaterThan(15);
    expect(v.em(85, 100)[3]).toBe(0);
  });

  it('conserva a quantidade de tinta (a soma do alfa)', () => {
    const soma = (rgba: Uint8Array): number => {
      let s = 0;
      for (let i = 3; i < rgba.length; i += 4) s += rgba[i] as number;
      return s;
    };
    const com = render(ponto(30), { fundo: false }, { largura: 240, altura: 200 });
    const sem = render([forma('ponto', 110, 90, 20, 20, '#ffffff')], { fundo: false }, { largura: 240, altura: 200 });
    expect(Math.abs(soma(com.rgba) - soma(sem.rgba)) / soma(sem.rgba)).toBeLessThan(0.03);
  });

  it('o shader da GPU dá o mesmo que o laço de pixel: no máximo 2 níveis, fora poucos pixels de arredondamento', () => {
    for (const angulo of [0, 90, 30]) {
      const d = entreOsDoisCalculos([imagem('foto', FOTO, 30, 30, 180, 140, { filtros: [{ tipo: 'desfoque-de-movimento', angulo, distancia: 24 }] })]);
      expect(d.acimaDe2 / (240 * 200)).toBeLessThan(0.002);
      expect(d.maxima).toBeLessThanOrEqual(12);
    }
  }, 120_000);
});

describe('filtros em sequência', () => {
  it('valem na ordem em que estão na camada, junto com sombra, máscara e opacidade', () => {
    const base = { sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 8, desfoque: 10 }, opacidade: 0.9, mascara: { tipo: 'degrade', angulo: 0, inicio: 0.3, fim: 0.9 } };
    const ab = render([
      forma('f', 40, 40, 160, 120, '#c2410c', {
        ...base,
        filtros: [
          { tipo: 'desfoque', raio: 6 },
          { tipo: 'ruido', quantidade: 0.3 },
        ],
      }),
    ]);
    const ba = render([
      forma('f', 40, 40, 160, 120, '#c2410c', {
        ...base,
        filtros: [
          { tipo: 'ruido', quantidade: 0.3 },
          { tipo: 'desfoque', raio: 6 },
        ],
      }),
    ]);
    // ruído depois do desfoque fica granulado; desfoque depois do ruído alisa o grão
    const variacao = (r: typeof ab): number => {
      let v = 0;
      for (let x = 60; x < 120; x++) v += Math.abs(r.em(x, 100)[0] - r.em(x + 1, 100)[0]);
      return v;
    };
    expect(variacao(ab)).toBeGreaterThan(variacao(ba) * 3);
    expect(
      entreOsDoisCalculos([
        forma('f', 40, 40, 160, 120, '#c2410c', {
          ...base,
          filtros: [
            { tipo: 'desfoque', raio: 6 },
            { tipo: 'ruido', quantidade: 0.3 },
            { tipo: 'nitidez', quantidade: 1, raio: 2 },
          ],
        }),
      ]).maxima,
    ).toBeLessThanOrEqual(3);
  }, 120_000);

  it('nenhum dos três filtros aparece mais em naoDesenhado', () => {
    const { doc } = peca([
      forma('f', 0, 0, 50, 50, '#000000', {
        filtros: [
          { tipo: 'ruido', quantidade: 0.2 },
          { tipo: 'nitidez', quantidade: 1, raio: 2 },
          { tipo: 'desfoque-de-movimento', angulo: 0, distancia: 10 },
        ],
      }),
    ]);
    expect(naoDesenhado(doc)).toEqual([]);
  });

  it('a camada com filtro, dentro de grupo isolado ou presa por recorte, sai igual nos dois cálculos', () => {
    const d = entreOsDoisCalculos([
      { tipo: 'grupo', nome: 'g', modoDeMesclagem: 'normal', opacidade: 0.8, filhos: [forma('a', 20, 20, 120, 100, '#808080', { filtros: [{ tipo: 'ruido', quantidade: 0.3 }] })] },
      forma('base', 120, 60, 100, 100, '#ffffff', { forma: 'elipse' }),
      imagem('presa', FOTO, 100, 40, 140, 140, { recortadaNaDeBaixo: true, filtros: [{ tipo: 'nitidez', quantidade: 1, raio: 3 }] }),
    ]);
    expect(d.maxima).toBeLessThanOrEqual(2);
  }, 120_000);

  it('sanidade: o motor de teste existe', () => {
    expect(ck).toBeDefined();
    expect(diferencaMaxima(new Uint8Array([1]), new Uint8Array([1]))).toBe(0);
  });
});
