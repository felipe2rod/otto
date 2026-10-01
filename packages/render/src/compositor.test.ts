import type { Ajuste, Documento, Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenciaDeAjuste } from './ajustes';
import { ajuste, chaveDeTeste, diferencaMaxima, FOTO, fontesDeTeste, forma, grupo, idDe, imagem, novaSessao, peca, pixel, pixelsAleatorios, pngDe, texto } from './apoio-de-teste';
import { ErroDeAreaDoRender, naoDesenhado, type OpcoesDeRender, recursosEmFalta, referenciaDeAjusteDeCor, renderizarPrancheta } from './compositor';
import { MODOS_POR_SHADER, referenciaDeMesclagem } from './mesclagem';
import { carregarCanvasKit } from './node';
import { criarSessao, type Sessao } from './sessao';

let ck: CanvasKit;
let sessao: Sessao;

const LADO = 64;
const ruido = pixelsAleatorios(LADO * LADO, 5, 'opaco');
const QUADRANTES = chaveDeTeste(1);
const RUIDO = chaveDeTeste(2);

beforeAll(async () => {
  const quadrantes = new Uint8Array(200 * 100 * 4);
  const cores: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) quadrantes.set([...(cores[(y < 50 ? 0 : 2) + (x < 100 ? 0 : 1)] as number[]), 255], (y * 200 + x) * 4);
  const base = await novaSessao();
  ck = base.ck;
  base.sessao.destruir();
  ({ sessao } = await novaSessao([
    { arquivo: QUADRANTES, bytes: pngDe(ck, quadrantes, 200, 100) },
    { arquivo: RUIDO, bytes: pngDe(ck, ruido, LADO, LADO) },
  ]));
});

const SOMBRA = { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 8, desfoque: 12 };

describe.each(['pixel', 'shader'] as const)('compositor, cálculo por %s', (calculo) => {
  function render(nos: Parameters<typeof peca>[0], opcoes: OpcoesDeRender = {}, tamanho: Parameters<typeof peca>[1] = {}) {
    const { doc, p } = peca(nos, tamanho);
    const r = renderizarPrancheta(sessao, doc, p, { calculo, ...opcoes });
    return { ...r, doc, p, em: (x: number, y: number) => pixel(r.rgba, r.largura, x, y) };
  }

  describe('determinismo', () => {
    const cena = [
      forma('a', 20, 20, 120, 120, '#c2410c', { sombra: SOMBRA, raio: 16 }),
      texto('t', 'Otto', { x: 30, y: 60, largura: 160, altura: 60, fonte: 'Anton', tamanho: 48, cor: '#ffffff', modoDeMesclagem: 'luz-linear', opacidade: 0.8 }),
    ];

    it('a mesma cena duas vezes dá os mesmos bytes', () => {
      expect(Buffer.compare(render(cena).rgba, render(cena).rgba)).toBe(0);
    });

    it('duas instâncias do WebAssembly, com sessões separadas, dão os mesmos bytes', async () => {
      const outro = await carregarCanvasKit();
      expect(outro).not.toBe(ck);
      const outra = criarSessao(outro, { fontes: fontesDeTeste(), imagens: [] });
      const { doc, p } = peca(cena);
      const a = renderizarPrancheta(outra, doc, p, { calculo });
      outra.destruir();
      expect(Buffer.compare(a.rgba, renderizarPrancheta(sessao, doc, p, { calculo }).rgba)).toBe(0);
    });
  });

  it('fundo da prancheta, forma chapada e cor por token', () => {
    const r = render([forma('a', 50, 50, 100, 100, 'token:marca')], {}, { fundo: 'token:papel', tokens: { marca: '#ff0000', papel: '#00ff00' } });
    expect(r.em(10, 10)).toEqual([0, 255, 0, 255]);
    expect(r.em(100, 100)).toEqual([255, 0, 0, 255]);
  });

  it('camada invisível não desenha', () => {
    expect(render([forma('a', 50, 50, 100, 100, '#ff0000', { visivel: false })]).em(100, 100)).toEqual([255, 255, 255, 255]);
  });

  it('grupo com opacidade compõe os filhos antes de aplicar a opacidade', () => {
    const r = render([grupo('g', [forma('a', 20, 20, 100, 100, '#ff0000'), forma('b', 60, 60, 100, 100, '#0000ff')], { modoDeMesclagem: 'normal', opacidade: 0.5 })]);
    // na sobreposição só o azul aparece, a 50% sobre o branco (127,5 no ideal; o Skia arredonda em inteiro)
    expect(r.em(90, 90)[0]).toBeGreaterThanOrEqual(126);
    expect(r.em(90, 90)[0]).toBeLessThanOrEqual(128);
    expect(r.em(90, 90)[2]).toBe(255);
  });

  it('grupo em atravessar deixa o modo do filho agir sobre o que está fora do grupo; grupo isolado não', () => {
    const filho = forma('b', 50, 50, 100, 100, '#808080', { modoDeMesclagem: 'multiplicacao' });
    expect(render([forma('a', 0, 0, 200, 200, '#ff8000'), grupo('g', [filho])]).em(100, 100)).toEqual([128, 64, 0, 255]);
    expect(render([forma('a', 0, 0, 200, 200, '#ff8000'), grupo('g', [filho], { modoDeMesclagem: 'normal' })]).em(100, 100)).toEqual([128, 128, 128, 255]);
  });

  it('grupo com modo de mesclagem por cálculo próprio mescla o conjunto', () => {
    expect(render([forma('a', 0, 0, 200, 200, '#c86432'), grupo('g', [forma('b', 50, 50, 100, 100, '#646464')], { modoDeMesclagem: 'subtrair' })]).em(100, 100)).toEqual([100, 0, 0, 255]);
  });

  it('máscara de forma corta a camada, e invertida corta o contrário', () => {
    const mascara = { tipo: 'forma', forma: 'retangulo', x: 50, y: 50, largura: 50, altura: 50 };
    const r = render([forma('a', 0, 0, 200, 200, '#ff0000', { mascara })]);
    expect([r.em(75, 75), r.em(150, 150)]).toEqual([
      [255, 0, 0, 255],
      [255, 255, 255, 255],
    ]);
    const inv = render([forma('a', 0, 0, 200, 200, '#ff0000', { mascara: { ...mascara, inverter: true } })]);
    expect([inv.em(75, 75), inv.em(150, 150)]).toEqual([
      [255, 255, 255, 255],
      [255, 0, 0, 255],
    ]);
  });

  it('máscara em degradê apaga a camada aos poucos', () => {
    const r = render([forma('a', 0, 0, 200, 200, '#000000', { mascara: { tipo: 'degrade', angulo: 0, inicio: 0, fim: 1 } })]);
    expect(r.em(2, 100)[0]).toBeLessThan(10);
    expect(r.em(100, 100)[0]).toBeGreaterThan(110);
    expect(r.em(100, 100)[0]).toBeLessThan(145);
    expect(r.em(197, 100)[0]).toBeGreaterThan(245);
  });

  it('máscara de recorte: a camada de cima só aparece onde a de baixo tem pixel', () => {
    const r = render([forma('base', 50, 50, 60, 60, '#00ff00'), forma('presa', 0, 0, 200, 200, '#0000ff', { recortadaNaDeBaixo: true })]);
    expect([r.em(80, 80), r.em(150, 150)]).toEqual([
      [0, 0, 255, 255],
      [255, 255, 255, 255],
    ]);
  });

  it('sombra projetada escurece fora da forma, no lado oposto ao ângulo da luz', () => {
    const r = render([forma('a', 60, 60, 80, 80, '#ffffff', { sombra: { cor: '#000000', opacidade: 0.6, angulo: 135, distancia: 12, desfoque: 6 } })]);
    expect(r.em(146, 146)[0]).toBeLessThan(200);
    expect(r.em(52, 52)[0]).toBeGreaterThan(250);
  });

  it('degradê linear cobre a caixa inteira no ângulo pedido, com a convenção do Photoshop', () => {
    const d = (angulo: number) => ({
      tipo: 'linear',
      angulo,
      paradas: [
        { cor: '#000000', posicao: 0 },
        { cor: '#ffffff', posicao: 1 },
      ],
    });
    const r = render([forma('a', 0, 0, 200, 200, d(0))]);
    expect(r.em(1, 100)[0]).toBeLessThan(5);
    expect(r.em(198, 100)[0]).toBeGreaterThan(250);
    // 90 graus aponta para cima: o branco fica no topo
    expect(render([forma('a', 0, 0, 200, 200, d(90))]).em(100, 1)[0]).toBeGreaterThan(250);
  });

  it('traço interno da forma fica dentro da caixa', () => {
    const r = render([forma('a', 50, 50, 100, 100, '#ffffff', { traco: { cor: '#ff0000', espessura: 10 } })]);
    expect(r.em(55, 100)).toEqual([255, 0, 0, 255]);
    expect(r.em(100, 100)).toEqual([255, 255, 255, 255]);
    expect(r.em(45, 100)).toEqual([255, 255, 255, 255]);
  });

  it('imagem em "cobrir" preenche a caixa; em "conter" deixa o fundo aparecer; o foco escolhe a parte', () => {
    const img = (extra: object) => imagem('i', QUADRANTES, 0, 0, 200, 200, { larguraOriginal: 200, alturaOriginal: 100, ...extra });
    const cobrir = render([img({})]);
    expect([cobrir.em(5, 5), cobrir.em(195, 195)]).toEqual([
      [255, 0, 0, 255],
      [255, 255, 0, 255],
    ]);
    const conter = render([img({ ajuste: 'conter' })]);
    expect([conter.em(5, 5), conter.em(5, 60)]).toEqual([
      [255, 255, 255, 255],
      [255, 0, 0, 255],
    ]);
    expect(render([img({ foco: { x: 0, y: 0.5 } })]).em(195, 5)).toEqual([255, 0, 0, 255]);
  });

  it('imagem que não foi entregue vira cinza, e o motor avisa qual falta', () => {
    const r = render([imagem('Foto', chaveDeTeste(999), 0, 0, 200, 200)]);
    expect(r.em(100, 100)).toEqual([138, 138, 138, 255]);
    expect(recursosEmFalta(sessao, r.doc).imagens).toEqual([{ arquivo: chaveDeTeste(999), camadas: ['P/Foto'] }]);
  });

  it('vetor: caminho aberto só com traço, na espessura escalada pela caixa', () => {
    const r = render(
      [{ tipo: 'vetor', nome: 'Fio', x: 0, y: 40, largura: 100, altura: 20, moldura: [50, 10], caminhos: [{ d: 'M0 5C0 5 50 5 50 5', traco: { cor: '#ffffff', espessura: 5 } }] }],
      {},
      { largura: 100, altura: 100, fundo: '#000000' },
    );
    // espessura 5 × escala 2 = 10 px (de 45 a 55)
    expect([r.em(50, 50), r.em(50, 46), r.em(50, 30)]).toEqual([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
  });

  it('"apenas" devolve só o pixel daquela camada, sem fundo', () => {
    const { doc, p } = peca([forma('a', 0, 0, 200, 200, '#ff0000'), forma('b', 50, 50, 50, 50, '#0000ff')]);
    const r = renderizarPrancheta(sessao, doc, p, { calculo, apenas: new Set([idDe(doc, 'b')]) });
    expect([pixel(r.rgba, 200, 10, 10), pixel(r.rgba, 200, 75, 75)]).toEqual([
      [0, 0, 0, 0],
      [0, 0, 255, 255],
    ]);
  });

  it('"excluir" pula a camada', () => {
    const { doc, p } = peca([forma('a', 0, 0, 200, 200, '#ff0000'), forma('b', 50, 50, 50, 50, '#0000ff')]);
    expect(pixel(renderizarPrancheta(sessao, doc, p, { calculo, excluir: new Set([idDe(doc, 'b')]) }).rgba, 200, 75, 75)).toEqual([255, 0, 0, 255]);
  });

  it('escala muda o tamanho da saída; região renderiza só o recorte pedido', () => {
    const r = render([forma('a', 50, 50, 100, 100, '#ff0000')], { escala: 0.5 });
    expect([r.largura, r.altura, r.em(50, 50), r.em(10, 10)]).toEqual([100, 100, [255, 0, 0, 255], [255, 255, 255, 255]]);
    const recorte = render([forma('a', 50, 50, 100, 100, '#ff0000')], { regiao: { x: 100, y: 100, w: 80, h: 60 } });
    expect([recorte.largura, recorte.altura, recorte.em(10, 10), recorte.em(70, 55)]).toEqual([80, 60, [255, 0, 0, 255], [255, 255, 255, 255]]);
  });

  it('recusa área acima do limite com erro legível, antes de alocar', () => {
    const { doc, p } = peca([], { largura: 30000, altura: 30000 });
    expect(() => renderizarPrancheta(sessao, doc, p, { calculo })).toThrow(ErroDeAreaDoRender);
    expect(() => renderizarPrancheta(sessao, doc, p, { calculo })).toThrow(/30000 × 30000.*limite/);
  });

  describe('camada de ajuste contra a fórmula', () => {
    const ajustes: Ajuste[] = [
      {
        tipo: 'curvas',
        rgb: [
          [0, 0],
          [128, 170],
          [255, 255],
        ],
        vermelho: [
          [0, 20],
          [255, 235],
        ],
      },
      { tipo: 'niveis', pretoDeEntrada: 30, brancoDeEntrada: 220, gama: 1.4, pretoDeSaida: 10, brancoDeSaida: 245 },
      { tipo: 'matiz-saturacao', matiz: 40, saturacao: 30, luminosidade: -10 },
      { tipo: 'matiz-saturacao', matiz: -120, saturacao: -60, luminosidade: 20 },
      { tipo: 'brilho-contraste', brilho: 20, contraste: 40 },
      { tipo: 'vibracao', vibracao: 60, saturacao: -20 },
      { tipo: 'equilibrio-de-cor', sombras: [30, 0, -20], meiosTons: [-10, 20, 0], realces: [0, -15, 40] },
      { tipo: 'filtro-de-foto', cor: '#ec8a00', densidade: 40 },
      { tipo: 'preto-e-branco' },
      {
        tipo: 'mapa-de-degrade',
        paradas: [
          { cor: '#1b1f4b', posicao: 0 },
          { cor: '#c2410c', posicao: 0.6 },
          { cor: '#e9b44c', posicao: 1 },
        ],
      },
    ];
    for (const a of ajustes) {
      it(`${a.tipo}: no máximo 1 nível`, () => {
        const r = render([imagem('i', RUIDO, 0, 0, LADO, LADO, { larguraOriginal: LADO, alturaOriginal: LADO }), ajuste('aj', a)], {}, { largura: LADO, altura: LADO });
        expect(diferencaMaxima(r.rgba, referenciaDeAjuste(ruido, a))).toBeLessThanOrEqual(1);
      });
    }

    it('cor de ajuste por token é resolvida', () => {
      const r = render(
        [
          forma('a', 0, 0, 200, 200, '#808080'),
          ajuste('aj', {
            tipo: 'mapa-de-degrade',
            paradas: [
              { cor: 'token:escuro', posicao: 0 },
              { cor: 'token:claro', posicao: 1 },
            ],
          }),
        ],
        {},
        { tokens: { escuro: '#000000', claro: '#ff0000' } },
      );
      expect(r.em(100, 100)[0]).toBeGreaterThan(120);
      expect(r.em(100, 100)[1]).toBe(0);
    });

    it('com máscara só muda a região da máscara, e com opacidade mistura com o original', () => {
      const mascara = { tipo: 'forma', forma: 'retangulo', x: 0, y: 0, largura: 32, altura: LADO };
      const r = render(
        [imagem('i', RUIDO, 0, 0, LADO, LADO, { larguraOriginal: LADO, alturaOriginal: LADO }), ajuste('aj', { tipo: 'preto-e-branco' }, { mascara, opacidade: 0.5 })],
        {},
        { largura: LADO, altura: LADO },
      );
      const meio = referenciaDeMesclagem(ruido, referenciaDeAjuste(ruido, { tipo: 'preto-e-branco' }), 'normal', 0.5);
      for (const [x, y] of [
        [5, 5],
        [20, 40],
        [31, 63],
      ] as const)
        expect(diferencaMaxima(new Uint8Array(r.em(x, y)), meio.slice((y * LADO + x) * 4, (y * LADO + x) * 4 + 4))).toBeLessThanOrEqual(1);
      for (const [x, y] of [
        [33, 5],
        [50, 40],
      ] as const)
        expect(r.em(x, y)).toEqual([...ruido.slice((y * LADO + x) * 4, (y * LADO + x) * 4 + 4)]);
    });

    it('recortado na camada de baixo, só muda aquela camada', () => {
      const r = render([forma('fundo', 0, 0, 200, 200, '#ff0000'), forma('base', 50, 50, 100, 100, '#00ff00'), ajuste('aj', { tipo: 'preto-e-branco' }, { recortadaNaDeBaixo: true })]);
      expect(r.em(10, 10)).toEqual([255, 0, 0, 255]);
      expect(r.em(100, 100)[0]).toBe(r.em(100, 100)[1]);
      expect(r.em(100, 100)[0]).toBeGreaterThan(140);
    });

    it('só age sobre o que está abaixo', () => {
      const r = render([forma('a', 0, 0, 200, 200, '#ff0000'), ajuste('aj', { tipo: 'preto-e-branco' }), forma('b', 50, 50, 50, 50, '#00ff00')]);
      expect(r.em(75, 75)).toEqual([0, 255, 0, 255]);
      expect(r.em(10, 10)[0]).toBe(r.em(10, 10)[1]);
    });
  });

  describe('ajuste de cor da foto contra a fórmula', () => {
    const casos = [
      { brilho: 20, contraste: 30, saturacao: 0 },
      { brilho: -30, contraste: -40, saturacao: 60 },
      { brilho: 0, contraste: 0, saturacao: -100 },
      { brilho: 10, contraste: 20, saturacao: -20, duotone: { sombras: '#1b1f4b', luzes: '#e9b44c' } },
    ];
    for (const a of casos) {
      it(`${JSON.stringify(a)}: no máximo 2 níveis`, () => {
        const r = render([imagem('i', RUIDO, 0, 0, LADO, LADO, { larguraOriginal: LADO, alturaOriginal: LADO, ajusteDeCor: a })], {}, { largura: LADO, altura: LADO });
        expect(
          diferencaMaxima(r.rgba, referenciaDeAjusteDeCor(ruido, { brilho: a.brilho, contraste: a.contraste, saturacao: a.saturacao, ...(a.duotone ? { duotone: a.duotone } : {}) })),
        ).toBeLessThanOrEqual(2);
      });
    }
  });
});

describe('fórmula do ajuste de cor da foto', () => {
  const um = (rgb: number[], a: Parameters<typeof referenciaDeAjusteDeCor>[1]) => [...referenciaDeAjusteDeCor(new Uint8Array([...rgb, 255]), a)].slice(0, 3);
  it('brilho soma 1,5 nível por ponto; contraste abre em torno do cinza médio', () => {
    expect(um([100, 100, 100], { brilho: 20, contraste: 0, saturacao: 0 })).toEqual([130, 130, 130]);
    expect(um([178, 78, 128], { brilho: 0, contraste: 50, saturacao: 0 })).toEqual([228, 28, 128]);
  });
  it('saturação -100 dá cinza; duotone leva o preto à cor das sombras e o branco à das luzes', () => {
    const cinza = um([200, 40, 40], { brilho: 0, contraste: 0, saturacao: -100 });
    expect(new Set(cinza).size).toBe(1);
    expect(um([0, 0, 0], { brilho: 0, contraste: 0, saturacao: 0, duotone: { sombras: '#1b1f4b', luzes: '#e9b44c' } })).toEqual([0x1b, 0x1f, 0x4b]);
    expect(um([255, 255, 255], { brilho: 0, contraste: 0, saturacao: 0, duotone: { sombras: '#1b1f4b', luzes: '#e9b44c' } })).toEqual([0xe9, 0xb4, 0x4c]);
  });
});

describe('o motor diz o que ainda não desenha', () => {
  it('lista, por camada, o recurso do documento que sai sem efeito', () => {
    const { doc } = peca([
      forma('Selo', 0, 0, 50, 50, '#000000', {
        efeitos: { brilhoExterno: { cor: '#ffffff' } },
        filtros: [
          { tipo: 'ruido', quantidade: 0.2 },
          { tipo: 'desfoque', raio: 4 },
        ],
      }),
      ajuste('Curvas', { tipo: 'curvas' }, { modoDeMesclagem: 'luminosidade' }),
      forma('Limpa', 60, 0, 50, 50, '#000000', { sombra: SOMBRA }),
    ]);
    expect(naoDesenhado(doc).map((x) => `${x.camada}: ${x.recurso}`)).toEqual(['P/Selo: efeitos de camada', 'P/Selo: ruído', 'P/Curvas: modo de mesclagem em camada de ajuste']);
  });
});

describe('os dois cálculos (laço de pixel da CPU e shader da GPU) dão o mesmo render', () => {
  // o shader em raster de CPU é lento: as cenas de ajuste usam uma prancheta menor
  const comparar = (nos: Parameters<typeof peca>[0], lado = 300): number => {
    const { doc, p } = peca(nos, { largura: lado, altura: lado, fundo: '#3b6ea5' });
    return diferencaMaxima(renderizarPrancheta(sessao, doc, p, { calculo: 'pixel' }).rgba, renderizarPrancheta(sessao, doc, p, { calculo: 'shader' }).rgba);
  };
  const foto = imagem('f', FOTO, 0, 0, 300, 300);
  const disco = (nome: string, extra: object = {}) =>
    forma(
      nome,
      40,
      40,
      200,
      180,
      {
        tipo: 'radial',
        paradas: [
          { cor: '#ffd166', posicao: 0 },
          { cor: '#118ab2', posicao: 1, opacidade: 0.6 },
        ],
      },
      { forma: 'elipse', ...extra },
    );

  for (const modo of MODOS_POR_SHADER) {
    it(`${modo} com opacidade, borda antisserrilhada e sombra: no máximo 2 níveis`, () => {
      expect(comparar([foto, disco('d', { modoDeMesclagem: modo, opacidade: 0.8, sombra: { ...SOMBRA, desfoque: 10 } })])).toBeLessThanOrEqual(2);
    });
  }

  it('grupo com modo por cálculo próprio, com filho que também usa: no máximo 2 níveis', () => {
    expect(comparar([foto, grupo('g', [disco('d'), disco('d2', { x: 120, modoDeMesclagem: 'subtrair' })], { modoDeMesclagem: 'luz-linear', opacidade: 0.7 })])).toBeLessThanOrEqual(2);
  });

  it('ajuste dentro de grupo isolado só enxerga o grupo: no máximo 2 níveis', () => {
    expect(comparar([foto, grupo('g', [disco('d'), ajuste('aj', { tipo: 'matiz-saturacao', matiz: 90, saturacao: 20 })], { modoDeMesclagem: 'normal', opacidade: 0.9 })])).toBeLessThanOrEqual(2);
  });

  it('máscara de recorte com modo por cálculo próprio na camada presa: no máximo 2 níveis', () => {
    expect(comparar([foto, disco('d'), forma('r', 0, 100, 300, 100, '#ff3366', { recortadaNaDeBaixo: true, modoDeMesclagem: 'luz-intensa' })])).toBeLessThanOrEqual(2);
  });

  const mascaras = {
    'sem máscara': undefined,
    'em degradê': { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.8 },
    'de forma suave': { tipo: 'forma', forma: 'elipse', x: 60, y: 60, largura: 180, altura: 180, suavizar: 12 },
    'de forma invertida': { tipo: 'forma', forma: 'elipse', x: 60, y: 60, largura: 180, altura: 180, suavizar: 12, inverter: true },
  };
  for (const [nome, mascara] of Object.entries(mascaras)) {
    it(`um ajuste ${nome}, com opacidade: no máximo 1 nível`, () => {
      const extra = { opacidade: 0.8, ...(mascara ? { mascara } : {}) };
      expect(comparar([foto, ajuste('a1', { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30 }, extra)], 240)).toBeLessThanOrEqual(1);
      expect(
        comparar(
          [
            foto,
            ajuste(
              'a2',
              {
                tipo: 'curvas',
                rgb: [
                  [0, 0],
                  [100, 140],
                  [255, 255],
                ],
              },
              extra,
            ),
          ],
          240,
        ),
      ).toBeLessThanOrEqual(1);
    }, 60_000);
  }

  it('ajustes empilhados somam o arredondamento: 1 nível por operação vira até 4 com dois que aumentam contraste', () => {
    expect(
      comparar([
        foto,
        ajuste('a1', { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30 }, { mascara: mascaras['em degradê'] }),
        ajuste('a2', { tipo: 'niveis', pretoDeEntrada: 20, brancoDeEntrada: 200, gama: 1.3 }, { opacidade: 0.7, mascara: mascaras['de forma invertida'] }),
      ]),
    ).toBeLessThanOrEqual(4);
  }, 60_000);
});

/** O documento do teste de área não pode ser criado se o esquema recusar: confere que o limite do esquema continua em 30.000. */
describe('limite do esquema', () => {
  it('a prancheta aceita até 30.000 px de lado; o motor é quem recusa a área', () => {
    const { p }: { doc: Documento; p: Prancheta } = peca([], { largura: 30000, altura: 30000 });
    expect(p.largura).toBe(30000);
  });
});
