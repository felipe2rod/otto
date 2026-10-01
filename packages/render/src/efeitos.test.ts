// Efeitos de camada do Photoshop que o esquema aceita: brilho externo, sobreposição de cor e de degradê,
// brilho interno e sombra interna. São montados só com operações do próprio Skia (desfoque, filtro de cor,
// modos nativos), o mesmo código na CPU e na GPU.
import { beforeAll, describe, expect, it } from 'vitest';
import { FOTO, forma, imagem, novaSessao, peca, pixel, texto } from './apoio-de-teste';
import { naoDesenhado, type OpcoesDeRender, renderizarPrancheta } from './compositor';
import { comparar } from './diferenca';
import type { Sessao } from './sessao';

let sessao: Sessao;
beforeAll(async () => {
  ({ sessao } = await novaSessao());
});

function render(nos: Parameters<typeof peca>[0], opcoes: OpcoesDeRender = {}, fundo = '#ffffff') {
  const { doc, p } = peca(nos, { fundo });
  const r = renderizarPrancheta(sessao, doc, p, opcoes);
  return { ...r, doc, em: (x: number, y: number) => pixel(r.rgba, r.largura, x, y) };
}
const quadrado = (efeitos: object, extra: object = {}) => forma('q', 60, 60, 80, 80, '#808080', { efeitos, ...extra });

describe('efeitos de camada', () => {
  it('brilho externo: halo da cor pedida em volta da camada, que some com a distância, e nada por cima dela', () => {
    const r = render([quadrado({ brilhoExterno: { cor: '#ff0000', opacidade: 1, tamanho: 20 } })], {}, '#000000');
    expect(r.em(100, 100)).toEqual([128, 128, 128, 255]);
    expect(r.em(50, 100)[0]).toBeGreaterThan(40);
    expect(r.em(50, 100)[1]).toBe(0);
    expect(r.em(50, 100)[0]).toBeGreaterThan(r.em(35, 100)[0]);
    expect(r.em(5, 5)).toEqual([0, 0, 0, 255]);
  });

  it('sobreposição de cor: troca a cor da camada e mantém o alfa dela', () => {
    const r = render([forma('q', 60, 60, 80, 80, '#808080', { forma: 'elipse', efeitos: { sobreposicaoDeCor: { cor: '#0000ff', opacidade: 1 } } })], { fundo: false });
    expect(r.em(100, 100)).toEqual([0, 0, 255, 255]);
    expect(r.em(62, 62)).toEqual([0, 0, 0, 0]);
    const meia = render([quadrado({ sobreposicaoDeCor: { cor: '#ffffff', opacidade: 0.5 } })]);
    expect(meia.em(100, 100)[0]).toBeGreaterThanOrEqual(190);
    expect(meia.em(100, 100)[0]).toBeLessThanOrEqual(192);
  });

  it('sobreposição de cor com modo de mesclagem age sobre a cor da camada, não sobre o fundo', () => {
    const r = render([quadrado({ sobreposicaoDeCor: { cor: '#ff8000', opacidade: 1, modoDeMesclagem: 'multiplicacao' } })]);
    expect(r.em(100, 100)).toEqual([128, 64, 0, 255]);
    expect(r.em(20, 20)).toEqual([255, 255, 255, 255]);
    const subtrair = render([quadrado({ sobreposicaoDeCor: { cor: '#404040', opacidade: 1, modoDeMesclagem: 'subtrair' } })]);
    expect(subtrair.em(100, 100)).toEqual([64, 64, 64, 255]);
  });

  it('sobreposição de degradê: o degradê cobre a caixa da camada, dentro do alfa dela', () => {
    const degrade = {
      tipo: 'linear',
      angulo: 0,
      paradas: [
        { cor: '#ff0000', posicao: 0 },
        { cor: '#0000ff', posicao: 1 },
      ],
    };
    const r = render([texto('t', 'OTTO', { x: 20, y: 40, largura: 170, altura: 90, fonte: 'Anton', tamanho: 80, cor: '#000000', efeitos: { sobreposicaoDeDegrade: { degrade, opacidade: 1 } } })], {
      fundo: false,
    });
    const esquerda = r.em(32, 90);
    const direita = r.em(150, 90);
    expect(esquerda[3]).toBe(255);
    expect(esquerda[0]).toBeGreaterThan(esquerda[2]);
    expect(direita[2]).toBeGreaterThan(direita[0]);
    expect(r.em(5, 5)).toEqual([0, 0, 0, 0]);
  });

  it('brilho interno: clareia por dentro da borda, e o centro e o lado de fora ficam como estavam', () => {
    const r = render([quadrado({ brilhoInterno: { cor: '#ffffff', opacidade: 1, tamanho: 16 } })], {}, '#000000');
    expect(r.em(63, 100)[0]).toBeGreaterThan(160);
    expect(r.em(100, 100)[0]).toBeLessThanOrEqual(132);
    expect(r.em(55, 100)).toEqual([0, 0, 0, 255]);
  });

  it('sombra interna: escurece por dentro, do lado de onde vem a luz', () => {
    const r = render([quadrado({ sombraInterna: { cor: '#000000', opacidade: 1, angulo: 180, distancia: 12, desfoque: 4 } })]);
    // luz da esquerda (180 graus): a sombra entra pela borda esquerda
    expect(r.em(64, 100)[0]).toBeLessThan(40);
    expect(r.em(136, 100)[0]).toBe(128);
    expect(r.em(100, 100)[0]).toBe(128);
    expect(r.em(50, 100)).toEqual([255, 255, 255, 255]);
  });

  it('valem junto com filtro, sombra projetada, máscara, opacidade, rotação e modo de mesclagem, iguais nos dois cálculos', () => {
    const todos = {
      brilhoExterno: { cor: '#fde047', opacidade: 0.8, tamanho: 14 },
      sobreposicaoDeDegrade: {
        degrade: {
          tipo: 'linear',
          angulo: 90,
          paradas: [
            { cor: '#1d4ed8', posicao: 0 },
            { cor: '#be123c', posicao: 1 },
          ],
        },
        opacidade: 0.7,
      },
      brilhoInterno: { cor: '#ffffff', opacidade: 0.6, tamanho: 8 },
      sombraInterna: { cor: '#000000', opacidade: 0.7, angulo: 120, distancia: 6, desfoque: 6 },
    };
    const cena = [
      imagem('foto', FOTO, 0, 0, 200, 200),
      forma('q', 50, 50, 100, 90, '#808080', {
        raio: 16,
        rotacao: 12,
        efeitos: todos,
        sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 8, desfoque: 10 },
        opacidade: 0.9,
        modoDeMesclagem: 'luz-direta',
        mascara: { tipo: 'degrade', angulo: 0, inicio: 0.4, fim: 1 },
        filtros: [{ tipo: 'ruido', quantidade: 0.1 }],
      }),
      texto('t', 'fx', {
        x: 20,
        y: 120,
        largura: 160,
        altura: 70,
        fonte: 'Anton',
        tamanho: 60,
        cor: '#ffffff',
        modoDeMesclagem: 'luz-linear',
        efeitos: { brilhoExterno: { cor: '#000000', opacidade: 0.9, tamanho: 10 }, sobreposicaoDeCor: { cor: '#22c55e', opacidade: 0.5, modoDeMesclagem: 'luz-intensa' } },
      }),
    ];
    const { doc, p } = peca(cena);
    expect(naoDesenhado(doc)).toEqual([]);
    const a = renderizarPrancheta(sessao, doc, p, { calculo: 'pixel' });
    const b = renderizarPrancheta(sessao, doc, p, { calculo: 'shader' });
    expect(comparar(a.rgba, b.rgba, 200, 200).d.maxima).toBeLessThanOrEqual(3);
    expect(Buffer.compare(a.rgba, renderizarPrancheta(sessao, doc, p).rgba)).toBe(0);
  }, 30_000);

  it('em escala reduzida o efeito encolhe junto', () => {
    const { doc, p } = peca([quadrado({ brilhoExterno: { cor: '#ff0000', opacidade: 1, tamanho: 20 } })], { fundo: '#000000' });
    const r = renderizarPrancheta(sessao, doc, p, { escala: 0.5 });
    expect(pixel(r.rgba, r.largura, 25, 50)[0]).toBeGreaterThan(40);
    expect(pixel(r.rgba, r.largura, 10, 50)[0]).toBeLessThan(40);
  });

  describe('máscara e efeitos, na ordem do Photoshop: a máscara corta a camada, e os efeitos contornam o que sobrou', () => {
    // máscara que deixa só a metade esquerda do quadrado (x de 60 a 100)
    const metade = { tipo: 'forma', forma: 'retangulo', x: 60, y: 60, largura: 40, altura: 80 };

    it('a sombra projetada sai da camada já mascarada', () => {
      const r = render([forma('q', 60, 60, 80, 80, '#808080', { mascara: metade, sombra: { cor: '#ff0000', opacidade: 1, angulo: 180, distancia: 10, desfoque: 0 } })]);
      // ângulo de 180: a luz vem da esquerda, a sombra cai 10 px à direita do que a máscara deixou
      expect(r.em(105, 100)).toEqual([255, 0, 0, 255]);
      expect(r.em(80, 100)).toEqual([128, 128, 128, 255]);
      // e não da camada inteira: depois da sombra, o que foi mascarado não aparece
      expect(r.em(125, 100)).toEqual([255, 255, 255, 255]);
      expect(r.em(145, 100)).toEqual([255, 255, 255, 255]);
    });

    it('o brilho externo contorna a borda que a máscara criou', () => {
      const r = render([quadrado({ brilhoExterno: { cor: '#ff0000', opacidade: 1, tamanho: 20 } }, { mascara: metade })], {}, '#000000');
      expect(r.em(80, 100)).toEqual([128, 128, 128, 255]);
      expect(r.em(104, 100)[0]).toBeGreaterThan(60);
      expect(r.em(104, 100)[1]).toBe(0);
      expect(r.em(135, 100)).toEqual([0, 0, 0, 255]);
    });

    it('o desfoque continua antes da máscara: a borda da máscara fica nítida', () => {
      const r = render([forma('q', 60, 60, 80, 80, '#000000', { mascara: metade, filtros: [{ tipo: 'desfoque', raio: 6 }] })]);
      expect(r.em(98, 100)[0]).toBeLessThan(10);
      expect(r.em(102, 100)).toEqual([255, 255, 255, 255]);
    });

    it('os dois cálculos concordam com máscara, filtro de pixel, efeito e sombra juntos', () => {
      const nos = [
        quadrado(
          { brilhoExterno: { cor: '#ff0000', opacidade: 1, tamanho: 12 } },
          { mascara: metade, filtros: [{ tipo: 'ruido', quantidade: 0.2 }], sombra: { cor: '#0000ff', opacidade: 0.8, angulo: 180, distancia: 8, desfoque: 4 } },
        ),
      ];
      const { doc, p } = peca(nos);
      const a = renderizarPrancheta(sessao, doc, p);
      const b = renderizarPrancheta(sessao, doc, p, { calculo: 'shader' });
      expect(comparar(a.rgba, b.rgba, p.largura, p.altura).d.maxima).toBeLessThanOrEqual(2);
    }, 120_000);
  });
});
