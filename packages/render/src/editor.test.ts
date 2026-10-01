// A estratégia de cache do editor: uma imagem por prancheta e, ao arrastar, três partes (abaixo, a camada, acima).
// O que o cache mostra precisa ser o que o render direto mostraria.
import { aplicarLote, type Documento, deslocarNos, disporPranchetas, type Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ajuste, diferencaMaxima, FOTO, forma, grupo, idDe, imagem, novaSessao, peca, texto } from './apoio-de-teste';
import { renderizarPrancheta } from './compositor';
import { comparar } from './diferenca';
import { CenaDoEditor, fabricaNaCpu, unidadesDaPrancheta } from './editor';
import type { Sessao } from './sessao';

let ck: CanvasKit;
let sessao: Sessao;
beforeAll(async () => {
  ({ ck, sessao } = await novaSessao());
});

const bola = (nome: string, x: number, y: number, cor: string, extra: object = {}) => forma(nome, x, y, 120, 100, cor, { forma: 'elipse', ...extra });

/** Peça pequena com a estrutura de uma real: foto, modo, sombra, grupo em atravessar, recorte, ajuste e logo por cima. Duas pranchetas. */
function documento(): Documento {
  const { doc } = peca(
    [
      imagem('foto', FOTO, 0, 0, 320, 300),
      bola('disco', 20, 30, '#f59e0b', { modoDeMesclagem: 'multiplicacao', opacidade: 0.8 }),
      forma('cartao', 150, 40, 120, 100, '#fafaf9', { raio: 12, sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 6, desfoque: 10 } }),
      texto('titulo', 'JAZZ', {
        x: 20,
        y: 150,
        largura: 280,
        altura: 80,
        fonte: 'Anton',
        tamanho: 72,
        cor: '#fff7ed',
        entrelinha: 1,
        sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 3, desfoque: 8 },
      }),
      grupo('grupo', [bola('luz', 180, 150, '#fde047', { modoDeMesclagem: 'luz-linear', opacidade: 0.5 }), bola('ponto', 250, 230, '#0ea5e9')]),
      bola('base', 30, 220, '#22c55e'),
      forma('presa', 0, 240, 320, 40, '#be123c', { recortadaNaDeBaixo: true }),
      ajuste('niveis', { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 238, gama: 1.1 }, { opacidade: 0.7 }),
      bola('logo', 260, 10, '#ffffff', { largura: 40, altura: 40 }),
    ],
    { largura: 320, altura: 300, fundo: 'token:fundo', tokens: { fundo: '#0c0a09' } },
  );
  const r = aplicarLote(doc, [{ op: 'duplicarPrancheta', prancheta: 'P', nome: 'Outra', largura: 320, altura: 300 }], { autoria: { tipo: 'designer' }, idDoLote: 'duplica' });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

/** Desenha um quadro do editor numa superfície de CPU do tamanho da prancheta, com ela na origem do canvas, e devolve os pixels. */
function quadro(cena: CenaDoEditor, doc: Documento, p: Prancheta): Uint8Array {
  const s = ck.MakeSurface(p.largura, p.altura);
  if (!s) throw new Error('sem superfície');
  const posicao = disporPranchetas(doc.pranchetas).get(p.id) ?? { x: 0, y: 0 };
  cena.desenharQuadro(s.getCanvas(), { x: -posicao.x, y: -posicao.y, zoom: 1 });
  const rgba = s
    .getCanvas()
    .readPixels(0, 0, { width: p.largura, height: p.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  s.delete();
  return rgba;
}

const nova = (doc: Documento): CenaDoEditor => {
  const cena = new CenaDoEditor(sessao, fabricaNaCpu(sessao));
  cena.definirDocumento(doc);
  cena.comporTudo();
  return cena;
};

describe('unidades de composição', () => {
  it('achata grupo em atravessar, junta o conjunto de recorte e marca quem depende do que está abaixo', () => {
    const u = unidadesDaPrancheta(documento().pranchetas[0] as Prancheta);
    expect(u.map((x) => x.nos.map((n) => n.nome).join('+'))).toEqual(['foto', 'disco', 'cartao', 'titulo', 'luz', 'ponto', 'base+presa', 'niveis', 'logo']);
    expect(u.filter((x) => x.dependente).map((x) => x.nos[0]?.nome)).toEqual(['disco', 'luz', 'niveis']);
  });
});

describe('cache do editor', () => {
  it('a imagem em cache da prancheta é idêntica ao render de referência, nas duas pranchetas', () => {
    const doc = documento();
    const cena = nova(doc);
    for (const p of doc.pranchetas) expect(diferencaMaxima(quadro(cena, doc, p), renderizarPrancheta(sessao, doc, p).rgba)).toBe(0);
    expect(cena.contadores.composicoesDePrancheta).toBe(2);
    cena.destruir();
  });

  // O quadro do arraste é uma prévia: junta imagens intermediárias de 8 bits, então não é idêntico ao render direto.
  // Medido no spike: 1 nível por imagem intermediária, ampliado por ajuste acima (até 3), e até 8 níveis em meia dúzia
  // de pixels de borda quando a camada cruza a margem da prancheta. Ao soltar, a prancheta é recomposta direto.
  for (const [nome, descricao] of [
    ['logo', 'a camada do topo'],
    ['titulo', 'uma camada do meio, com modo e ajuste acima'],
    ['disco', 'uma camada com modo de mesclagem, perto do fundo'],
    ['ponto', 'uma camada dentro de grupo em atravessar, cruzando a margem'],
  ] as const) {
    it(`arrastar ${descricao}: três partes, e a prévia difere do render direto em no máximo 8 níveis, só em borda`, () => {
      const doc = documento();
      const p = doc.pranchetas[0] as Prancheta;
      const cena = nova(doc);
      const id = idDe(doc, nome);
      cena.definirPrevia({ ids: [id], dx: -13, dy: 9 });
      expect(cena.modoDaPrevia).toBe('partes');
      const direto = renderizarPrancheta(sessao, doc, deslocarNos(p, new Set([id]), -13, 9)).rgba;
      const { d } = comparar(quadro(cena, doc, p), direto, p.largura, p.altura);
      expect(d.maxima).toBeLessThanOrEqual(8);
      expect(d.acimaDe2 / (p.largura * p.altura)).toBeLessThan(0.001);
      cena.destruir();
    }, 30_000);
  }

  it('durante o arraste nada é recomposto: só muda a posição da camada', () => {
    const doc = documento();
    const cena = nova(doc);
    cena.definirPrevia({ ids: [idDe(doc, 'titulo')], dx: 0, dy: 0 });
    const antes = { ...cena.contadores };
    for (let i = 1; i <= 5; i++) {
      cena.definirPrevia({ ids: [idDe(doc, 'titulo')], dx: i, dy: i / 2 });
      quadro(cena, doc, doc.pranchetas[0] as Prancheta);
    }
    expect(cena.contadores.composicoesDePrancheta).toBe(antes.composicoesDePrancheta);
    expect(cena.contadores.partes).toBe(antes.partes);
    cena.destruir();
  }, 30_000);

  it('camada dentro de grupo isolado, ou mais de uma camada: a prévia redesenha a prancheta ao vivo, e continua certa', () => {
    const doc = peca([
      forma('fundo', 0, 0, 200, 200, '#ff8000'),
      grupo('isolado', [bola('dentro', 20, 20, '#ffffff')], { modoDeMesclagem: 'normal', opacidade: 0.8 }),
      bola('fora', 60, 90, '#0000ff'),
    ]).doc;
    const p = doc.pranchetas[0] as Prancheta;
    const cena = nova(doc);
    cena.definirPrevia({ ids: [idDe(doc, 'dentro')], dx: 15, dy: 10 });
    expect(cena.modoDaPrevia).toBe('ao-vivo');
    // até 2 níveis: a opacidade do grupo arredonda diferente conforme o tipo da superfície (medido: 126 contra 127)
    expect(diferencaMaxima(quadro(cena, doc, p), renderizarPrancheta(sessao, doc, deslocarNos(p, new Set([idDe(doc, 'dentro')]), 15, 10)).rgba)).toBeLessThanOrEqual(2);
    const dois = new Set([idDe(doc, 'dentro'), idDe(doc, 'fora')]);
    cena.definirPrevia({ ids: [...dois], dx: -5, dy: 30 });
    expect(cena.modoDaPrevia).toBe('ao-vivo');
    expect(diferencaMaxima(quadro(cena, doc, p), renderizarPrancheta(sessao, doc, deslocarNos(p, dois, -5, 30)).rgba)).toBeLessThanOrEqual(2);
    cena.destruir();
  });

  it('ao soltar, só a prancheta tocada é recomposta, e o resultado é idêntico ao render de referência', () => {
    const doc = documento();
    const cena = nova(doc);
    const id = idDe(doc, 'titulo');
    cena.definirPrevia({ ids: [id], dx: 10, dy: 20 });
    const r = aplicarLote(doc, [{ op: 'mover', alvo: id, x: 30, y: 170 }], { autoria: { tipo: 'designer' }, idDoLote: 'soltar' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const antes = cena.contadores.composicoesDePrancheta;
    cena.definirDocumento(r.doc);
    cena.definirPrevia(null);
    cena.comporTudo();
    // a segunda prancheta é o mesmo objeto: fica em cache
    expect(cena.contadores.composicoesDePrancheta).toBe(antes + 1);
    expect(diferencaMaxima(quadro(cena, r.doc, r.doc.pranchetas[0] as Prancheta), renderizarPrancheta(sessao, r.doc, r.doc.pranchetas[0] as Prancheta).rgba)).toBe(0);
    cena.destruir();
  });

  it('trocar um token não troca o objeto da prancheta, mas muda a cor: o cache é refeito', () => {
    const doc = documento();
    const cena = nova(doc);
    const r = aplicarLote(doc, [{ op: 'definirToken', nome: 'fundo', valor: '#ff00ff' }], { autoria: { tipo: 'designer' }, idDoLote: 'token' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(r.doc.pranchetas[0]).toBe(doc.pranchetas[0]);
    cena.definirDocumento(r.doc);
    expect(cena.comporTudo()).toBe(2);
    cena.destruir();
  });

  for (const nome of ['logo', 'titulo']) {
    it(`região suja ao arrastar ${nome}: redesenhar só onde a camada estava e onde está dá o mesmo quadro que redesenhar tudo`, () => {
      const doc = documento();
      const p = doc.pranchetas[0] as Prancheta;
      const info = { width: p.largura, height: p.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
      const camera = { x: 8, y: 5, zoom: 0.8 };
      const fundo = ck.Color(38, 36, 34, 1);
      const quadros = (regiaoSuja: boolean): Uint8Array => {
        const cena = nova(doc);
        // a mesma superfície recebe os três quadros: é o que acontece com o canvas do editor
        const s = ck.MakeSurface(p.largura, p.altura);
        if (!s) throw new Error('sem superfície');
        for (const [dx, dy] of [
          [0, 0],
          [30, 10],
          [-25, 40],
        ] as const) {
          cena.definirPrevia({ ids: [idDe(doc, nome)], dx, dy });
          cena.desenharQuadro(s.getCanvas(), camera, { fundo, regiaoSuja });
        }
        const rgba = s.getCanvas().readPixels(0, 0, info) as Uint8Array;
        s.delete();
        cena.destruir();
        return rgba;
      };
      expect(diferencaMaxima(quadros(true), quadros(false))).toBe(0);
    }, 60_000);
  }

  it('região suja não toca no resto do canvas: uma marca longe da camada sobrevive ao quadro', () => {
    const doc = documento();
    const p = doc.pranchetas[0] as Prancheta;
    const sobrevive = (regiaoSuja: boolean): boolean => {
      const cena = nova(doc);
      const s = ck.MakeSurface(p.largura, p.altura);
      if (!s) throw new Error('sem superfície');
      const c = s.getCanvas();
      const camera = { x: 0, y: 0, zoom: 1 };
      cena.definirPrevia({ ids: [idDe(doc, 'logo')], dx: 0, dy: 0 });
      cena.desenharQuadro(c, camera, { regiaoSuja });
      const marca = new ck.Paint();
      marca.setColor(ck.Color(255, 0, 255, 1));
      c.drawRect(ck.XYWHRect(4, 280, 6, 6), marca);
      marca.delete();
      cena.definirPrevia({ ids: [idDe(doc, 'logo')], dx: -20, dy: 15 });
      cena.desenharQuadro(c, camera, { regiaoSuja });
      const px = c.readPixels(6, 282, { width: 1, height: 1, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
      s.delete();
      cena.destruir();
      return px[0] === 255 && px[1] === 0 && px[2] === 255;
    };
    expect(sobrevive(true)).toBe(true);
    expect(sobrevive(false)).toBe(false);
  });
});
