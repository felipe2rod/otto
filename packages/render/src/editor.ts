// Cache do editor (o "cache por camada" que o ADR 030 manda rever antes de trocar de motor).
//
// Parado ou movendo a câmera: uma imagem por prancheta. O quadro é um desenho de imagem por prancheta.
// Arrastando uma camada: a prancheta dela vira três partes, montadas uma vez no começo do gesto:
//   abaixo  — tudo o que está sob a camada, já composto numa imagem;
//   camada  — a camada sozinha, com sombra, desfoque e máscara, numa imagem do tamanho dela;
//   acima   — o que está sobre ela. Trechos que não dependem do fundo viram uma imagem cada;
//             camada com modo de mesclagem vira imagem desenhada com o modo; camada de ajuste é redesenhada.
// O quadro é: abaixo, camada deslocada, e os itens de acima em ordem. Nada é recomposto durante o gesto.
// Quando o gesto não cabe nas três partes (camada dentro de grupo isolado, várias camadas), a prancheta é
// redesenhada ao vivo a cada quadro: mais lento, e certo.
import { type Caixa, type Documento, deslocarNos, disporPranchetas, ehVisual, type ModoDeMesclagem, type No, type NoAjuste, type NoVisual, type Prancheta } from '@otto/documento';
import type { Canvas, Image, Paint, Surface } from 'canvaskit-wasm';
import { criarSuperficieDeCpu, desenharNos, desenharNosEmCpu, limitesDoNo, modoDe } from './compositor';
import type { Sessao } from './sessao';

/** A câmera do editor, já em pixels do canvas (o motor multiplica pela densidade da tela antes de chegar aqui). */
export interface CameraEmPixels {
  /** posição, no canvas, da origem do plano do editor */
  x: number;
  y: number;
  /** pixels do canvas por unidade do documento */
  zoom: number;
}

/** Gesto em andamento: desloca nós sem criar documento novo. */
export interface PreviaDeGesto {
  ids: readonly string[];
  dx: number;
  dy: number;
}

/** Um nó do nível de cima, ou um conjunto de recorte (base e presas), com grupos em "atravessar" já achatados. */
export interface Unidade {
  nos: No[];
  /** Lê o que está abaixo: tem modo de mesclagem diferente de normal ou é camada de ajuste. */
  dependente: boolean;
}

const atravessaSemEfeito = (n: No): boolean => n.tipo === 'grupo' && n.modoDeMesclagem === 'atravessar' && n.opacidade >= 1 && !n.mascara && !n.recortadaNaDeBaixo;

function achatar(filhos: readonly No[]): No[] {
  const saida: No[] = [];
  filhos.forEach((n, i) => {
    // grupo em atravessar, sem opacidade nem máscara, equivale aos filhos soltos; não se achata a base de um recorte
    const ehBaseDeRecorte = filhos[i + 1]?.recortadaNaDeBaixo === true;
    if (n.tipo === 'grupo' && n.visivel && atravessaSemEfeito(n) && !ehBaseDeRecorte) saida.push(...achatar(n.filhos));
    else saida.push(n);
  });
  return saida;
}

export function unidadesDaPrancheta(p: Prancheta): Unidade[] {
  const nos = achatar(p.filhos);
  const unidades: Unidade[] = [];
  for (let i = 0; i < nos.length; i++) {
    const base = nos[i] as No;
    const conjunto = [base];
    while (i + 1 < nos.length && (nos[i + 1] as No).recortadaNaDeBaixo && base.tipo !== 'ajuste') conjunto.push(nos[++i] as No);
    if (!base.visivel) continue;
    unidades.push({ nos: conjunto, dependente: base.tipo === 'ajuste' || modoDe(base) !== 'normal' });
  }
  return unidades;
}

/** Quem rasteriza as imagens do cache: a GPU (prévia) ou a CPU (igual ao render de referência). */
export interface FabricaDeImagens {
  readonly nome: 'gpu' | 'cpu';
  /** Compõe os nós numa imagem. Sem região, a prancheta inteira, recortada por ela. Com região, só aquela caixa, sem recorte. */
  renderizar(doc: Documento, p: Prancheta, nos: readonly No[], fundo: boolean, escala: number, regiao?: Caixa): Image;
}

export function fabricaNaCpu(sessao: Sessao): FabricaDeImagens {
  return {
    nome: 'cpu',
    renderizar(doc, p, nos, fundo, escala, regiao) {
      const r = regiao ?? { x: 0, y: 0, w: p.largura, h: p.altura };
      const cpu = criarSuperficieDeCpu(sessao, Math.max(1, Math.ceil(r.w * escala)), Math.max(1, Math.ceil(r.h * escala)));
      const canvas = cpu.superficie.getCanvas();
      canvas.scale(escala, escala);
      canvas.translate(-r.x, -r.y);
      desenharNosEmCpu(sessao, cpu, doc, p, nos, { fundo, semRecorte: regiao !== undefined });
      const imagem = cpu.imagem();
      cpu.destruir();
      return imagem;
    },
  };
}

/** "tela" devolve a superfície WebGL corrente: ela é recriada quando o canvas muda de tamanho. */
export function fabricaNaGpu(sessao: Sessao, tela: () => Surface): FabricaDeImagens {
  const { ck } = sessao;
  return {
    nome: 'gpu',
    renderizar(doc, p, nos, fundo, escala, regiao) {
      const r = regiao ?? { x: 0, y: 0, w: p.largura, h: p.altura };
      const superficie = tela().makeSurface({
        width: Math.max(1, Math.ceil(r.w * escala)),
        height: Math.max(1, Math.ceil(r.h * escala)),
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Premul,
        colorSpace: ck.ColorSpace.SRGB,
      });
      const canvas = superficie.getCanvas();
      canvas.clear(ck.TRANSPARENT);
      canvas.scale(escala, escala);
      canvas.translate(-r.x, -r.y);
      desenharNos(sessao, canvas, doc, p, nos, { fundo, semRecorte: regiao !== undefined });
      const imagem = superficie.makeImageSnapshot();
      superficie.delete();
      return imagem;
    },
  };
}

type Item = { tipo: 'imagem'; imagem: Image; x: number; y: number; modo: ModoDeMesclagem; opacidade: number; movel: boolean } | { tipo: 'ajuste'; no: NoAjuste };

interface Arraste {
  prancheta: Prancheta;
  ids: readonly string[];
  dx: number;
  dy: number;
  /** três partes em cache; sem elas, a prancheta é redesenhada ao vivo */
  itens: Item[] | undefined;
  /** a prancheta com os nós deslocados, para o desenho ao vivo; refeita quando o deslocamento muda */
  movida: { dx: number; dy: number; prancheta: Prancheta } | undefined;
  /** onde a camada foi desenhada no último quadro, em pixel do canvas, e com que câmera */
  ultimo: { retangulo: [number, number, number, number]; camera: CameraEmPixels } | undefined;
}

export interface OpcoesDoQuadro {
  /** cor da área de trabalho, atrás das pranchetas */
  fundo?: Float32Array;
  /**
   * Durante o arraste em três partes, redesenha só o retângulo onde a camada estava e onde está agora.
   * Exige que o canvas guarde o quadro anterior (no WebGL, preserveDrawingBuffer).
   */
  regiaoSuja?: boolean;
}

export interface ContadoresDoCache {
  /** pranchetas compostas por inteiro */
  composicoesDePrancheta: number;
  /** imagens parciais montadas no começo de um arraste */
  partes: number;
  quadros: number;
}

function contem(filhos: readonly No[], id: string): boolean {
  return filhos.some((n) => n.id === id || (n.tipo === 'grupo' && contem(n.filhos, id)));
}

export class CenaDoEditor {
  readonly contadores: ContadoresDoCache = { composicoesDePrancheta: 0, partes: 0, quadros: 0 };
  private readonly sessao: Sessao;
  private readonly fabrica: FabricaDeImagens;
  private readonly escala: number;
  private doc: Documento | undefined;
  private posicoes = new Map<string, { x: number; y: number }>();
  private cache = new Map<string, { prancheta: Prancheta; composta: Image }>();
  private arraste: Arraste | undefined;

  /** escalaDoCache: pixels da imagem em cache por unidade do documento (1 = resolução do documento). */
  constructor(sessao: Sessao, fabrica: FabricaDeImagens, escalaDoCache = 1) {
    this.sessao = sessao;
    this.fabrica = fabrica;
    this.escala = escalaDoCache;
  }

  /**
   * Troca o documento. Prancheta que continua sendo o mesmo objeto mantém a imagem em cache: por isso o lote
   * preserva o que não tocou. Cor de token não mora na prancheta, então trocar um token refaz tudo.
   */
  definirDocumento(doc: Documento): void {
    const tokensMudaram = this.doc !== undefined && this.doc.tokens.cores !== doc.tokens.cores;
    this.doc = doc;
    this.posicoes = disporPranchetas(doc.pranchetas);
    for (const [id, c] of this.cache) {
      const atual = doc.pranchetas.find((p) => p.id === id);
      if (tokensMudaram || atual !== c.prancheta) {
        c.composta.delete();
        this.cache.delete(id);
      }
    }
    // a prévia vale para o documento em que começou; se a prancheta dela mudou, as partes não servem mais
    if (this.arraste && !doc.pranchetas.includes(this.arraste.prancheta)) this.soltarArraste();
  }

  /** Joga fora todo o cache (por exemplo, quando chega uma fonte ou imagem que faltava). */
  invalidarTudo(): void {
    for (const c of this.cache.values()) c.composta.delete();
    this.cache.clear();
    this.soltarArraste();
  }

  /** Compõe as pranchetas que não têm imagem em cache. Devolve quantas compôs. */
  comporTudo(): number {
    if (!this.doc) return 0;
    let feitas = 0;
    for (const p of this.doc.pranchetas) {
      if (this.cache.has(p.id)) continue;
      this.cache.set(p.id, { prancheta: p, composta: this.fabrica.renderizar(this.doc, p, p.filhos, true, this.escala) });
      this.contadores.composicoesDePrancheta++;
      feitas++;
    }
    return feitas;
  }

  /** Como a prévia corrente é desenhada. */
  get modoDaPrevia(): 'partes' | 'ao-vivo' | undefined {
    return this.arraste ? (this.arraste.itens ? 'partes' : 'ao-vivo') : undefined;
  }

  /** Gesto em andamento. Não cria documento nem recompõe prancheta: só muda o deslocamento. null encerra. */
  definirPrevia(previa: PreviaDeGesto | null): void {
    if (!previa || previa.ids.length === 0 || !this.doc) {
      this.soltarArraste();
      return;
    }
    const mesma = this.arraste && this.arraste.ids.length === previa.ids.length && this.arraste.ids.every((id, i) => id === previa.ids[i]);
    if (!mesma) this.iniciarArraste(this.doc, previa.ids);
    if (this.arraste) {
      this.arraste.dx = previa.dx;
      this.arraste.dy = previa.dy;
    }
  }

  private iniciarArraste(doc: Documento, ids: readonly string[]): void {
    this.soltarArraste();
    const p = doc.pranchetas.find((x) => ids.some((id) => contem(x.filhos, id)));
    if (!p) return;
    this.arraste = { prancheta: p, ids, dx: 0, dy: 0, itens: ids.length === 1 ? this.montarPartes(doc, p, ids[0] as string) : undefined, movida: undefined, ultimo: undefined };
  }

  /** As três partes para arrastar o nó. Devolve undefined quando o nó não é uma unidade do nível de cima. */
  private montarPartes(doc: Documento, p: Prancheta, id: string): Item[] | undefined {
    const unidades = unidadesDaPrancheta(p);
    const k = unidades.findIndex((u) => u.nos.length === 1 && u.nos[0]?.id === id);
    const no = unidades[k]?.nos[0];
    if (k < 0 || !no || !ehVisual(no)) return undefined;
    const parte = (nos: readonly No[], fundo: boolean, regiao?: Caixa): Image => {
      this.contadores.partes++;
      return this.fabrica.renderizar(doc, p, nos, fundo, this.escala, regiao);
    };
    const itens: Item[] = [];
    // abaixo: tudo o que está sob a camada, composto de uma vez (aqui as dependentes enxergam o fundo certo)
    itens.push({
      tipo: 'imagem',
      imagem: parte(
        unidades.slice(0, k).flatMap((u) => u.nos),
        true,
      ),
      x: 0,
      y: 0,
      modo: 'normal',
      opacidade: 1,
      movel: false,
    });
    // a camada: imagem do tamanho dela, sem o recorte da prancheta, para poder entrar e sair ao mover
    const limites = limitesDoNo(this.sessao, no);
    const caixa: Caixa = { x: Math.floor(limites.x), y: Math.floor(limites.y), w: Math.ceil(limites.w) + 1, h: Math.ceil(limites.h) + 1 };
    const normal: NoVisual = { ...no, modoDeMesclagem: 'normal', opacidade: 1 };
    itens.push({ tipo: 'imagem', imagem: parte([normal], false, caixa), x: caixa.x, y: caixa.y, modo: modoDe(no), opacidade: no.opacidade, movel: true });
    // acima: trechos independentes viram uma imagem; dependentes ficam separados
    let trecho: No[] = [];
    const fecharTrecho = (): void => {
      if (trecho.length === 0) return;
      itens.push({ tipo: 'imagem', imagem: parte(trecho, false), x: 0, y: 0, modo: 'normal', opacidade: 1, movel: false });
      trecho = [];
    };
    for (const u of unidades.slice(k + 1)) {
      if (!u.dependente) {
        trecho.push(...u.nos);
        continue;
      }
      fecharTrecho();
      const base = u.nos[0] as No;
      if (base.tipo === 'ajuste') itens.push({ tipo: 'ajuste', no: base });
      else {
        const semModo = { ...base, modoDeMesclagem: 'normal', opacidade: 1 } as No;
        itens.push({ tipo: 'imagem', imagem: parte([semModo, ...u.nos.slice(1)], false), x: 0, y: 0, modo: modoDe(base), opacidade: base.opacidade, movel: false });
      }
    }
    fecharTrecho();
    return itens;
  }

  /** Retângulo da camada arrastada no canvas, com folga para o filtro de imagem. */
  private retanguloDaCamada(camera: CameraEmPixels): [number, number, number, number] | undefined {
    const a = this.arraste;
    const movel = a?.itens?.find((i) => i.tipo === 'imagem' && i.movel);
    if (!a || !movel || movel.tipo !== 'imagem') return undefined;
    const posicao = this.posicoes.get(a.prancheta.id) ?? { x: 0, y: 0 };
    const x = camera.x + (posicao.x + movel.x + a.dx) * camera.zoom;
    const y = camera.y + (posicao.y + movel.y + a.dy) * camera.zoom;
    const w = (movel.imagem.width() / this.escala) * camera.zoom;
    const h = (movel.imagem.height() / this.escala) * camera.zoom;
    return [Math.floor(x) - 2, Math.floor(y) - 2, Math.ceil(x + w) + 2, Math.ceil(y + h) + 2];
  }

  desenharQuadro(canvas: Canvas, camera: CameraEmPixels, opcoes: OpcoesDoQuadro = {}): void {
    const { ck } = this.sessao;
    const doc = this.doc;
    this.contadores.quadros++;
    canvas.save();
    const agora = this.retanguloDaCamada(camera);
    const antes = this.arraste?.ultimo;
    if (opcoes.regiaoSuja && agora && antes && antes.camera.x === camera.x && antes.camera.y === camera.y && antes.camera.zoom === camera.zoom) {
      const r = antes.retangulo;
      canvas.clipRect(ck.LTRBRect(Math.min(r[0], agora[0]), Math.min(r[1], agora[1]), Math.max(r[2], agora[2]), Math.max(r[3], agora[3])), ck.ClipOp.Intersect, false);
    }
    if (this.arraste) this.arraste.ultimo = agora ? { retangulo: agora, camera: { ...camera } } : undefined;
    if (opcoes.fundo) canvas.clear(opcoes.fundo);
    canvas.translate(camera.x, camera.y);
    canvas.scale(camera.zoom, camera.zoom);
    const tinta = new ck.Paint();
    for (const p of doc?.pranchetas ?? []) {
      const posicao = this.posicoes.get(p.id) ?? { x: 0, y: 0 };
      canvas.save();
      canvas.translate(posicao.x, posicao.y);
      canvas.clipRect(ck.XYWHRect(0, 0, p.largura, p.altura), ck.ClipOp.Intersect, false);
      const a = this.arraste?.prancheta === p ? this.arraste : undefined;
      if (a?.itens && doc) {
        for (const item of a.itens) {
          if (item.tipo === 'ajuste') {
            desenharNos(this.sessao, canvas, doc, p, [item.no], { fundo: false });
            continue;
          }
          tinta.setAlphaf(item.opacidade);
          this.sessao.mesclador.aplicar(tinta, item.modo);
          this.desenharImagem(canvas, item.imagem, item.x + (item.movel ? a.dx : 0), item.y + (item.movel ? a.dy : 0), tinta);
        }
      } else if (a && doc) {
        // gesto fora das três partes: a prancheta, com os nós deslocados, é desenhada ao vivo
        if (!a.movida || a.movida.dx !== a.dx || a.movida.dy !== a.dy) a.movida = { dx: a.dx, dy: a.dy, prancheta: deslocarNos(p, new Set(a.ids), a.dx, a.dy) };
        desenharNos(this.sessao, canvas, doc, a.movida.prancheta, a.movida.prancheta.filhos);
      } else {
        const c = this.cache.get(p.id);
        if (c) {
          tinta.setAlphaf(1);
          tinta.setBlendMode(ck.BlendMode.SrcOver);
          this.desenharImagem(canvas, c.composta, 0, 0, tinta);
        }
      }
      canvas.restore();
    }
    tinta.delete();
    canvas.restore();
  }

  private desenharImagem(canvas: Canvas, imagem: Image, x: number, y: number, tinta: Paint): void {
    const { ck } = this.sessao;
    if (this.escala === 1) {
      canvas.drawImageOptions(imagem, x, y, ck.FilterMode.Linear, ck.MipmapMode.None, tinta);
      return;
    }
    canvas.drawImageRectOptions(
      imagem,
      ck.XYWHRect(0, 0, imagem.width(), imagem.height()),
      ck.XYWHRect(x, y, imagem.width() / this.escala, imagem.height() / this.escala),
      ck.FilterMode.Linear,
      ck.MipmapMode.None,
      tinta,
    );
  }

  private soltarArraste(): void {
    for (const item of this.arraste?.itens ?? []) if (item.tipo === 'imagem') item.imagem.delete();
    this.arraste = undefined;
  }

  destruir(): void {
    this.invalidarTudo();
    this.doc = undefined;
  }
}
