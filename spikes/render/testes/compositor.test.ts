import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenciaDeAjuste } from '../src/motor/ajustes.ts';
import { renderizarPrancheta } from '../src/motor/compositor.ts';
import { referenciaDeMesclagem } from '../src/motor/mesclagem.ts';
import { criarSessao, type Sessao } from '../src/motor/sessao.ts';
import type { Ajuste, No, NoForma } from '../src/motor/tipos.ts';
import { carregarCanvasKit, carregarFontes } from '../src/node/carregar.ts';
import { diferencaMaxima, novaSessao, pixel, pixelsAleatorios, prancheta } from './apoio.ts';

let ck: CanvasKit;
let sessao: Sessao;

/** PNG de 4 quadrantes (vermelho, verde, azul, amarelo), 200 × 100, gerado no próprio motor. */
function pngDeQuadrantes(k: CanvasKit): Uint8Array {
  const s = k.MakeSurface(200, 100)!;
  const c = s.getCanvas();
  const p = new k.Paint();
  const cores: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
  cores.forEach(([r, g, b], i) => {
    p.setColor(k.Color(r, g, b, 1));
    c.drawRect(k.XYWHRect((i % 2) * 100, Math.floor(i / 2) * 50, 100, 50), p);
  });
  const img = s.makeImageSnapshot();
  const bytes = img.encodeToBytes(k.ImageFormat.PNG, 100)!;
  for (const o of [p, img, s]) o.delete();
  return bytes;
}

function pngDePixels(k: CanvasKit, rgba: Uint8Array, lado: number): Uint8Array {
  const img = k.MakeImage({ width: lado, height: lado, colorType: k.ColorType.RGBA_8888, alphaType: k.AlphaType.Unpremul, colorSpace: k.ColorSpace.SRGB }, rgba, lado * 4)!;
  const bytes = img.encodeToBytes(k.ImageFormat.PNG, 100)!;
  img.delete();
  return bytes;
}

const LADO = 64;
const ruido = pixelsAleatorios(LADO * LADO, 5, 'opaco');

beforeAll(async () => {
  const base = await novaSessao();
  ck = base.ck;
  base.sessao.destruir();
  sessao = criarSessao(ck, {
    fontes: await carregarFontes(),
    imagens: [
      { arquivo: 'quadrantes', bytes: pngDeQuadrantes(ck) },
      { arquivo: 'ruido', bytes: pngDePixels(ck, ruido, LADO) },
    ],
  });
});

const forma = (id: string, x: number, y: number, largura: number, altura: number, cor: string, extra: Partial<NoForma> = {}): NoForma => ({ id, nome: id, tipo: 'forma', forma: 'retangulo', x, y, largura, altura, preenchimento: cor, ...extra });

let calculo: 'pixel' | 'shader' = 'pixel';

function render(filhos: No[], opcoes: Parameters<typeof renderizarPrancheta>[2] = {}, largura = 200, altura = 200) {
  const r = renderizarPrancheta(sessao, prancheta(largura, altura, filhos), { calculo, ...opcoes });
  return { ...r, em: (x: number, y: number) => pixel(r.rgba, r.largura, x, y) };
}

describe.each(['pixel', 'shader'] as const)('cálculo por %s', (qual) => {
beforeAll(() => {
  calculo = qual;
});

describe('determinismo', () => {
  const cena: No[] = [
    forma('a', 20, 20, 120, 120, '#c2410c', { sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 8, desfoque: 12 }, raio: 16 }),
    { id: 't', nome: 't', tipo: 'texto', conteudo: 'Otto', x: 30, y: 60, largura: 160, altura: 60, fonte: 'Anton', peso: 400, tamanho: 48, cor: '#ffffff', entrelinha: 1, espacamento: 0, alinhamento: 'esquerda', modoDeMesclagem: 'luz-linear', opacidade: 0.8 },
  ];

  it('a mesma cena duas vezes dá os mesmos bytes', () => {
    expect(Buffer.compare(render(cena).rgba, render(cena).rgba)).toBe(0);
  });

  it('duas instâncias do WebAssembly, com sessões separadas, dão os mesmos bytes (R2)', async () => {
    const outro = await carregarCanvasKit();
    expect(outro).not.toBe(ck);
    const outra = criarSessao(outro, { fontes: await carregarFontes(), imagens: [] });
    const a = renderizarPrancheta(outra, prancheta(200, 200, cena), { calculo });
    outra.destruir();
    expect(Buffer.compare(a.rgba, render(cena).rgba)).toBe(0);
  });
});

describe('compositor', () => {
  it('fundo da prancheta e forma chapada', () => {
    const r = render([forma('a', 50, 50, 100, 100, '#ff0000')]);
    expect(r.em(10, 10)).toEqual([255, 255, 255, 255]);
    expect(r.em(100, 100)).toEqual([255, 0, 0, 255]);
  });

  it('camada invisível não desenha', () => {
    expect(render([forma('a', 50, 50, 100, 100, '#ff0000', { visivel: false })]).em(100, 100)).toEqual([255, 255, 255, 255]);
  });

  it('grupo com opacidade compõe os filhos antes de aplicar a opacidade', () => {
    const grupo: No = { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.5, filhos: [forma('a', 20, 20, 100, 100, '#ff0000'), forma('b', 60, 60, 100, 100, '#0000ff')] };
    const r = render([grupo]);
    // na sobreposição só o azul aparece, a 50% sobre o branco: o vermelho de baixo não vaza
    // 127,5 no ideal. O Skia arredonda em inteiro e chega a 126 na superfície premultiplicada.
    expect(r.em(90, 90)[0]).toBeGreaterThanOrEqual(126);
    expect(r.em(90, 90)[0]).toBeLessThanOrEqual(128);
    expect(r.em(90, 90)[2]).toBe(255);
  });

  it('grupo em modo atravessar deixa o modo do filho agir sobre o que está fora do grupo', () => {
    const filho = forma('b', 50, 50, 100, 100, '#808080', { modoDeMesclagem: 'multiplicacao' });
    const atravessar = render([forma('a', 0, 0, 200, 200, '#ff8000'), { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'atravessar', filhos: [filho] }]);
    const isolado = render([forma('a', 0, 0, 200, 200, '#ff8000'), { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'normal', filhos: [filho] }]);
    expect(atravessar.em(100, 100)).toEqual([128, 64, 0, 255]);
    expect(isolado.em(100, 100)).toEqual([128, 128, 128, 255]);
  });

  it('grupo com modo de mesclagem por shader mescla o conjunto', () => {
    const r = render([forma('a', 0, 0, 200, 200, '#c86432'), { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'subtrair', filhos: [forma('b', 50, 50, 100, 100, '#646464')] }]);
    expect(r.em(100, 100)).toEqual([100, 0, 0, 255]);
  });

  it('máscara de forma corta a camada, e invertida corta o contrário', () => {
    const mascara = { tipo: 'forma', forma: 'retangulo', x: 50, y: 50, largura: 50, altura: 50, raio: 0, suavizar: 0, inverter: false } as const;
    const r = render([forma('a', 0, 0, 200, 200, '#ff0000', { mascara })]);
    expect(r.em(75, 75)).toEqual([255, 0, 0, 255]);
    expect(r.em(150, 150)).toEqual([255, 255, 255, 255]);
    const inv = render([forma('a', 0, 0, 200, 200, '#ff0000', { mascara: { ...mascara, inverter: true } })]);
    expect(inv.em(75, 75)).toEqual([255, 255, 255, 255]);
    expect(inv.em(150, 150)).toEqual([255, 0, 0, 255]);
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
    expect(r.em(80, 80)).toEqual([0, 0, 255, 255]);
    expect(r.em(150, 150)).toEqual([255, 255, 255, 255]);
  });

  it('sombra projetada escurece fora da forma, no lado oposto ao ângulo da luz', () => {
    const r = render([forma('a', 60, 60, 80, 80, '#ffffff', { sombra: { cor: '#000000', opacidade: 0.6, angulo: 135, distancia: 12, desfoque: 6 } })]);
    // luz de cima à esquerda: a sombra cai para baixo e para a direita
    expect(r.em(146, 146)[0]).toBeLessThan(200);
    expect(r.em(52, 52)[0]).toBeGreaterThan(250);
  });

  it('degradê linear cobre a caixa inteira no ângulo pedido', () => {
    const r = render([forma('a', 0, 0, 200, 200, { tipo: 'linear', angulo: 0, paradas: [{ cor: '#000000', posicao: 0 }, { cor: '#ffffff', posicao: 1 }] } as never)]);
    expect(r.em(1, 100)[0]).toBeLessThan(5);
    expect(r.em(198, 100)[0]).toBeGreaterThan(250);
    const vertical = render([forma('a', 0, 0, 200, 200, { tipo: 'linear', angulo: 90, paradas: [{ cor: '#000000', posicao: 0 }, { cor: '#ffffff', posicao: 1 }] } as never)]);
    // 90 graus aponta para cima: o branco fica no topo
    expect(vertical.em(100, 1)[0]).toBeGreaterThan(250);
  });

  it('imagem em "cobrir" preenche a caixa; em "conter" deixa o fundo aparecer', () => {
    const cobrir = render([{ id: 'i', nome: 'i', tipo: 'imagem', arquivo: 'quadrantes', x: 0, y: 0, largura: 200, altura: 200, ajuste: 'cobrir' }]);
    // a foto 2:1 é cortada dos lados: sobram as metades internas dos quadrantes
    expect(cobrir.em(5, 5)).toEqual([255, 0, 0, 255]);
    expect(cobrir.em(195, 195)).toEqual([255, 255, 0, 255]);
    const conter = render([{ id: 'i', nome: 'i', tipo: 'imagem', arquivo: 'quadrantes', x: 0, y: 0, largura: 200, altura: 200, ajuste: 'conter' }]);
    expect(conter.em(5, 5)).toEqual([255, 255, 255, 255]);
    expect(conter.em(5, 60)).toEqual([255, 0, 0, 255]);
  });

  it('foco da imagem escolhe a parte que fica na caixa', () => {
    const r = render([{ id: 'i', nome: 'i', tipo: 'imagem', arquivo: 'quadrantes', x: 0, y: 0, largura: 200, altura: 200, ajuste: 'cobrir', foco: { x: 0, y: 0.5 } }]);
    expect(r.em(195, 5)).toEqual([255, 0, 0, 255]);
  });

  it('"apenas" devolve só o pixel daquela camada, sem fundo (pixel de camada do PSD, R5)', () => {
    const r = render([forma('a', 0, 0, 200, 200, '#ff0000'), forma('b', 50, 50, 50, 50, '#0000ff')], { apenas: new Set(['b']) });
    expect(r.em(10, 10)).toEqual([0, 0, 0, 0]);
    expect(r.em(75, 75)).toEqual([0, 0, 255, 255]);
  });

  it('escala muda o tamanho da saída e mantém o desenho', () => {
    const r = render([forma('a', 50, 50, 100, 100, '#ff0000')], { escala: 0.5 });
    expect([r.largura, r.altura]).toEqual([100, 100]);
    expect(r.em(50, 50)).toEqual([255, 0, 0, 255]);
    expect(r.em(10, 10)).toEqual([255, 255, 255, 255]);
  });

  it('região renderiza só o recorte pedido (R4)', () => {
    const r = render([forma('a', 50, 50, 100, 100, '#ff0000')], { regiao: { x: 100, y: 100, w: 80, h: 60 } });
    expect([r.largura, r.altura]).toEqual([80, 60]);
    expect(r.em(10, 10)).toEqual([255, 0, 0, 255]);
    expect(r.em(70, 55)).toEqual([255, 255, 255, 255]);
  });

  it('recusa área acima do limite com erro legível, antes de alocar (R7)', () => {
    expect(() => renderizarPrancheta(sessao, prancheta(30000, 30000, []))).toThrow(/30000 × 30000.*limite/);
  });
});

describe('camada de ajuste por shader contra a fórmula que a POC calcula em pixel', () => {
  const ajustes: Ajuste[] = [
    { tipo: 'matiz-saturacao', matiz: 40, saturacao: 30, luminosidade: -10 },
    { tipo: 'matiz-saturacao', matiz: -120, saturacao: -60, luminosidade: 20 },
    { tipo: 'brilho-contraste', brilho: 20, contraste: 40 },
    { tipo: 'brilho-contraste', brilho: -30, contraste: -25 },
    { tipo: 'niveis', pretoDeEntrada: 30, brancoDeEntrada: 220, gama: 1.4, pretoDeSaida: 10, brancoDeSaida: 245 },
    { tipo: 'preto-e-branco' },
  ];
  for (const ajuste of ajustes) {
    it(`${ajuste.tipo} ${JSON.stringify(ajuste)}: diferença de no máximo 1 nível`, () => {
      const r = render([{ id: 'i', nome: 'i', tipo: 'imagem', arquivo: 'ruido', x: 0, y: 0, largura: LADO, altura: LADO, ajuste: 'cobrir' }, { id: 'aj', nome: 'aj', tipo: 'ajuste', ajuste }], {}, LADO, LADO);
      expect(diferencaMaxima(r.rgba, referenciaDeAjuste(ruido, ajuste))).toBeLessThanOrEqual(1);
    });
  }

  it('ajuste com máscara só muda a região da máscara, e com opacidade mistura com o original', () => {
    const base: No = { id: 'i', nome: 'i', tipo: 'imagem', arquivo: 'ruido', x: 0, y: 0, largura: LADO, altura: LADO, ajuste: 'cobrir' };
    const mascara = { tipo: 'forma', forma: 'retangulo', x: 0, y: 0, largura: 32, altura: LADO, raio: 0, suavizar: 0, inverter: false } as const;
    const r = render([base, { id: 'aj', nome: 'aj', tipo: 'ajuste', ajuste: { tipo: 'preto-e-branco' }, mascara, opacidade: 0.5 }], {}, LADO, LADO);
    const pb = referenciaDeAjuste(ruido, { tipo: 'preto-e-branco' });
    const meio = referenciaDeMesclagem(ruido, pb, 'normal', 0.5);
    for (const [x, y] of [[5, 5], [20, 40], [31, 63]] as const) expect(diferencaMaxima(new Uint8Array(r.em(x, y)), meio.slice((y * LADO + x) * 4, (y * LADO + x) * 4 + 4))).toBeLessThanOrEqual(1);
    for (const [x, y] of [[33, 5], [50, 40]] as const) expect(r.em(x, y)).toEqual([...ruido.slice((y * LADO + x) * 4, (y * LADO + x) * 4 + 4)]);
  });

  it('ajuste só age sobre o que está abaixo dele', () => {
    const r = render([forma('a', 0, 0, 200, 200, '#ff0000'), { id: 'aj', nome: 'aj', tipo: 'ajuste', ajuste: { tipo: 'preto-e-branco' } }, forma('b', 50, 50, 50, 50, '#00ff00')]);
    expect(r.em(75, 75)).toEqual([0, 255, 0, 255]);
    expect(r.em(10, 10)[0]).toBe(r.em(10, 10)[1]);
  });
});
});
