// A estratégia de cache do editor: uma imagem por prancheta para a câmera e, ao arrastar,
// três partes (abaixo, a camada arrastada, acima). O que o cache mostra precisa ser o que o render direto mostraria.
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderizarPrancheta } from '../src/motor/compositor.ts';
import { comparar } from '../src/motor/diferenca.ts';
import { CenaDoEditor, fabricaNaCpu, unidadesDaPrancheta } from '../src/motor/editor.ts';
import { criarSessao, type Sessao } from '../src/motor/sessao.ts';
import type { Documento, No, Prancheta } from '../src/motor/tipos.ts';
import { canvasKit, carregarFontes, carregarImagens } from '../src/node/carregar.ts';
import { diferencaMaxima } from './apoio.ts';

let ck: CanvasKit;
let sessao: Sessao;
beforeAll(async () => {
  ck = await canvasKit();
  sessao = criarSessao(ck, { fontes: await carregarFontes(), imagens: await carregarImagens() });
});

const forma = (id: string, x: number, y: number, cor: string, extra: object = {}): No => ({ id, nome: id, tipo: 'forma', forma: 'elipse', x, y, largura: 120, altura: 100, preenchimento: cor, ...extra }) as No;

/** Peça pequena com a estrutura da de 200 camadas: foto, modo, texto com sombra, recorte, grupo, ajustes e logo por cima. */
function peca(): Prancheta {
  return {
    id: 'p1', nome: 'Peça', x: 0, y: 0, largura: 320, altura: 300, fundo: '#0c0a09',
    filhos: [
      { id: 'foto', nome: 'Foto', tipo: 'imagem', arquivo: 'foto-paisagem', x: 0, y: 0, largura: 320, altura: 300, ajuste: 'cobrir' },
      forma('disco', 20, 30, '#f59e0b', { modoDeMesclagem: 'multiplicacao', opacidade: 0.8 }),
      forma('cartao', 150, 40, '#fafaf9', { forma: 'retangulo', raio: 12, sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 6, desfoque: 10 } }),
      { id: 'titulo', nome: 'Título', tipo: 'texto', conteudo: 'JAZZ', x: 20, y: 150, largura: 280, altura: 80, fonte: 'Anton', peso: 400, tamanho: 72, cor: '#fff7ed', entrelinha: 1, espacamento: 0, alinhamento: 'esquerda', sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 3, desfoque: 8 } },
      { id: 'grupo', nome: 'Grupo', tipo: 'grupo', modoDeMesclagem: 'atravessar', filhos: [forma('luz', 180, 150, '#fde047', { modoDeMesclagem: 'luz-linear', opacidade: 0.5 }), forma('ponto', 250, 230, '#0ea5e9')] },
      forma('base', 30, 220, '#22c55e'),
      forma('presa', 0, 240, '#be123c', { forma: 'retangulo', largura: 320, altura: 40, recortadaNaDeBaixo: true }),
      { id: 'niveis', nome: 'Níveis', tipo: 'ajuste', opacidade: 0.7, ajuste: { tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 238, gama: 1.1, pretoDeSaida: 0, brancoDeSaida: 255 } },
      forma('logo', 260, 10, '#ffffff', { largura: 40, altura: 40 }),
    ],
  };
}

const documento = (): Documento => ({ nome: 'teste', pranchetas: [peca(), { ...peca(), id: 'p2', nome: 'Outra', x: 400 }] });

function mover(p: Prancheta, id: string, dx: number, dy: number): Prancheta {
  const em = (nos: No[]): No[] => nos.map((n) => (n.id === id && 'x' in n ? { ...n, x: n.x + dx, y: n.y + dy } : n.tipo === 'grupo' ? { ...n, filhos: em(n.filhos) } : n));
  return { ...p, filhos: em(p.filhos) };
}

/** Desenha um quadro do editor numa superfície de CPU, com a câmera em 100% na origem, e devolve a região da prancheta. */
function quadro(cena: CenaDoEditor, p: Prancheta): Uint8Array {
  const s = ck.MakeSurface(p.largura, p.altura)!;
  cena.desenharQuadro(s.getCanvas(), { x: p.x, y: p.y, zoom: 1 });
  const rgba = s.getCanvas().readPixels(0, 0, { width: p.largura, height: p.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  s.delete();
  return rgba;
}

describe('unidades de composição', () => {
  it('achata grupo em atravessar, junta o conjunto de recorte e marca quem depende do que está abaixo', () => {
    const u = unidadesDaPrancheta(peca());
    expect(u.map((x) => x.nos.map((n) => n.id).join('+'))).toEqual(['foto', 'disco', 'cartao', 'titulo', 'luz', 'ponto', 'base+presa', 'niveis', 'logo']);
    expect(u.filter((x) => x.dependente).map((x) => x.nos[0]!.id)).toEqual(['disco', 'luz', 'niveis']);
  });
});

describe('cache do editor', () => {
  it('a imagem em cache da prancheta é idêntica ao render direto', () => {
    const doc = documento();
    const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
    cena.comporTudo();
    const p = doc.pranchetas[0]!;
    expect(diferencaMaxima(quadro(cena, p), renderizarPrancheta(sessao, p).rgba)).toBe(0);
    cena.destruir();
  });

  // O quadro do arraste é uma prévia: junta imagens intermediárias de 8 bits, então não é idêntico ao render direto.
  // Medido no spike: 1 nível por imagem intermediária, ampliado por ajuste acima (até 3), e até 8 níveis em meia dúzia
  // de pixels de borda quando a camada cruza a margem da prancheta (o Skia antisserrilha diferente um caminho recortado).
  // Ao soltar, a prancheta é recomposta direto e volta a ser idêntica (teste abaixo).
  for (const [id, nome] of [['logo', 'a camada do topo'], ['titulo', 'uma camada do meio, com modo e ajuste acima'], ['disco', 'uma camada com modo de mesclagem, perto do fundo'], ['ponto', 'uma camada dentro de grupo em atravessar, cruzando a margem']] as const) {
    it(`arrastar ${nome}: a prévia difere do render direto em no máximo 8 níveis, e em mais de 3 só em pixels de borda`, () => {
      const doc = documento();
      const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
      cena.comporTudo();
      expect(cena.iniciarArraste(id)).toBe(true);
      cena.definirPrevia(-13, 9);
      const p = doc.pranchetas[0]!;
      const direto = renderizarPrancheta(sessao, mover(p, id, -13, 9)).rgba;
      const previa = quadro(cena, p);
      const { d } = comparar(previa, direto, p.largura, p.altura);
      expect(d.maxima).toBeLessThanOrEqual(8);
      expect(d.acimaDe2 / (p.largura * p.altura)).toBeLessThan(0.001);
      cena.destruir();
    }, 30_000);
  }

  for (const id of ['logo', 'titulo']) {
    it(`região suja ao arrastar ${id}: redesenhar só onde a camada estava e onde está dá o mesmo quadro que redesenhar tudo`, () => {
      const doc = documento();
      const p = doc.pranchetas[0]!;
      const info = { width: p.largura, height: p.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
      const camera = { x: -10, y: -6, zoom: 0.8 };
      const fundo = ck.Color(38, 36, 34, 1);
      const quadros = (regiaoSuja: boolean): Uint8Array => {
        const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
        cena.comporTudo();
        cena.iniciarArraste(id);
        // a mesma superfície recebe os três quadros: é o que acontece com o canvas do editor
        const s = ck.MakeSurface(p.largura, p.altura)!;
        for (const [dx, dy] of [[0, 0], [30, 10], [-25, 40]] as const) {
          cena.definirPrevia(dx, dy);
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
    const p = doc.pranchetas[0]!;
    const sobrevive = (regiaoSuja: boolean): boolean => {
      const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
      cena.comporTudo();
      cena.iniciarArraste('logo');
      const s = ck.MakeSurface(p.largura, p.altura)!;
      const c = s.getCanvas();
      const camera = { x: 0, y: 0, zoom: 1 };
      cena.desenharQuadro(c, camera, { regiaoSuja });
      const marca = new ck.Paint();
      marca.setColor(ck.Color(255, 0, 255, 1));
      c.drawRect(ck.XYWHRect(4, 280, 6, 6), marca);
      marca.delete();
      cena.definirPrevia(-20, 15);
      cena.desenharQuadro(c, camera, { regiaoSuja });
      const px = c.readPixels(6, 282, { width: 1, height: 1, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
      s.delete();
      cena.destruir();
      return px[0] === 255 && px[1] === 0 && px[2] === 255;
    };
    expect(sobrevive(true)).toBe(true);
    expect(sobrevive(false)).toBe(false);
  });

  it('durante o arraste nenhuma prancheta é recomposta: só muda a posição da camada arrastada', () => {
    const doc = documento();
    const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
    cena.comporTudo();
    cena.iniciarArraste('titulo');
    const antes = cena.contadores.composicoes;
    const partes = cena.contadores.partes;
    // poucos quadros: neste teste o quadro sai em raster de CPU com o ajuste por shader, que é lento (o editor usa GPU)
    for (let i = 0; i < 6; i++) {
      cena.definirPrevia(i, i / 2);
      quadro(cena, doc.pranchetas[0]!);
    }
    expect(cena.contadores.composicoes).toBe(antes);
    expect(cena.contadores.partes).toBe(partes);
    expect(cena.contadores.quadros).toBe(6);
    cena.destruir();
  }, 30_000);

  it('ao soltar, só a prancheta tocada é recomposta, e o resultado é idêntico ao render direto do documento novo', () => {
    const doc = documento();
    const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
    cena.comporTudo();
    cena.iniciarArraste('titulo');
    cena.definirPrevia(10, 20);
    cena.encerrarArraste();
    const novo: Documento = { ...doc, pranchetas: [mover(doc.pranchetas[0]!, 'titulo', 10, 20), doc.pranchetas[1]!] };
    const antes = cena.contadores.composicoes;
    cena.definirDocumento(novo);
    cena.comporTudo();
    // a segunda prancheta é o mesmo objeto: fica em cache
    expect(cena.contadores.composicoes).toBe(antes + 1);
    expect(diferencaMaxima(quadro(cena, novo.pranchetas[0]!), renderizarPrancheta(sessao, novo.pranchetas[0]!).rgba)).toBe(0);
    cena.destruir();
  });

  it('camada dentro de grupo isolado não entra na estratégia de três partes (o editor recompõe a prancheta)', () => {
    const p = peca();
    const doc: Documento = { nome: 't', pranchetas: [{ ...p, filhos: [...p.filhos, { id: 'isolado', nome: 'isolado', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.8, filhos: [forma('dentro', 100, 100, '#ffffff')] }] }] };
    const cena = new CenaDoEditor(sessao, doc, fabricaNaCpu(sessao));
    expect(cena.iniciarArraste('dentro')).toBe(false);
    cena.destruir();
  });
});
