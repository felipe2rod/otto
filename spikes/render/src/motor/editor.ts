// Estratégia de cache do editor (o "cache por camada" que o ADR 030 manda rever antes de trocar de motor).
//
// Parado ou movendo a câmera: uma imagem por prancheta. O quadro é um desenho de imagem por prancheta.
// Arrastando uma camada: a prancheta dela vira três partes, montadas uma vez no começo do gesto:
//   abaixo  — tudo o que está sob a camada, já composto numa imagem;
//   camada  — a camada sozinha, com sombra, desfoque e máscara, numa imagem do tamanho dela;
//   acima   — o que está sobre ela. Trechos que não dependem do fundo viram uma imagem cada;
//             camada com modo de mesclagem vira imagem desenhada com o modo; camada de ajuste é redesenhada.
// O quadro é: abaixo, camada deslocada, e os itens de acima em ordem. Nada é recomposto durante o gesto.
import type { Canvas, Image, Surface } from 'canvaskit-wasm';
import { criarSuperficieDeCpu, desenharNos, desenharNosEmCpu, limitesDoNo } from './compositor.ts';
import type { Sessao } from './sessao.ts';
import { type CaixaMedida, type Documento, ehVisual, type ModoDeMesclagem, type No, type NoAjuste, type Prancheta } from './tipos.ts';

export interface Camera {
  /** ponto do documento que fica no canto de cima à esquerda do canvas */
  x: number;
  y: number;
  /** pixels do canvas por unidade do documento (zoom × densidade da tela) */
  zoom: number;
}

/** Um nó do nível de cima, ou um conjunto de recorte (base e presas), com grupos em "atravessar" já achatados. */
export interface Unidade {
  nos: No[];
  /** Lê o que está abaixo: tem modo de mesclagem diferente de normal ou é camada de ajuste. */
  dependente: boolean;
}

function modoDe(n: No): ModoDeMesclagem {
  if (n.tipo === 'ajuste') return 'normal';
  if (n.tipo === 'grupo') return n.modoDeMesclagem === 'atravessar' ? 'normal' : n.modoDeMesclagem;
  return n.modoDeMesclagem ?? 'normal';
}

const atravessaSemEfeito = (n: No): boolean => n.tipo === 'grupo' && n.modoDeMesclagem === 'atravessar' && (n.opacidade ?? 1) >= 1 && !n.mascara && !n.recortadaNaDeBaixo;

function achatar(filhos: readonly No[]): No[] {
  const saida: No[] = [];
  filhos.forEach((n, i) => {
    // grupo em atravessar, sem opacidade nem máscara, equivale aos filhos soltos; não se achata a base de um recorte
    const ehBaseDeRecorte = filhos[i + 1]?.recortadaNaDeBaixo === true;
    if (n.tipo === 'grupo' && atravessaSemEfeito(n) && !ehBaseDeRecorte) saida.push(...achatar(n.filhos));
    else saida.push(n);
  });
  return saida;
}

export function unidadesDaPrancheta(p: Prancheta): Unidade[] {
  const nos = achatar(p.filhos);
  const unidades: Unidade[] = [];
  for (let i = 0; i < nos.length; i++) {
    const base = nos[i]!;
    const conjunto = [base];
    while (i + 1 < nos.length && nos[i + 1]!.recortadaNaDeBaixo && base.tipo !== 'ajuste') conjunto.push(nos[++i]!);
    if (base.visivel === false) continue;
    unidades.push({ nos: conjunto, dependente: base.tipo === 'ajuste' || modoDe(base) !== 'normal' });
  }
  return unidades;
}

/** Quem rasteriza as imagens do cache: a GPU (rápido, com as diferenças de borda medidas no spike) ou a CPU (igual ao servidor). */
export interface FabricaDeImagens {
  readonly nome: 'gpu' | 'cpu';
  /** Compõe os nós numa imagem. Sem região, a prancheta inteira, recortada por ela. Com região, só aquela caixa, sem recorte. */
  renderizar(p: Prancheta, nos: readonly No[], fundo: boolean, escala: number, regiao?: CaixaMedida): Image;
}

export function fabricaNaCpu(sessao: Sessao): FabricaDeImagens {
  return {
    nome: 'cpu',
    renderizar(p, nos, fundo, escala, regiao) {
      const r = regiao ?? { x: 0, y: 0, w: p.largura, h: p.altura };
      const cpu = criarSuperficieDeCpu(sessao, Math.max(1, Math.ceil(r.w * escala)), Math.max(1, Math.ceil(r.h * escala)));
      const canvas = cpu.superficie.getCanvas();
      canvas.scale(escala, escala);
      canvas.translate(-r.x, -r.y);
      desenharNosEmCpu(sessao, cpu, p, nos, { fundo, semRecorte: regiao !== undefined });
      const imagem = cpu.superficie.makeImageSnapshot();
      cpu.destruir();
      return imagem;
    },
  };
}

export function fabricaNaGpu(sessao: Sessao, tela: Surface): FabricaDeImagens {
  const { ck } = sessao;
  return {
    nome: 'gpu',
    renderizar(p, nos, fundo, escala, regiao) {
      const r = regiao ?? { x: 0, y: 0, w: p.largura, h: p.altura };
      const superficie = tela.makeSurface({ width: Math.max(1, Math.ceil(r.w * escala)), height: Math.max(1, Math.ceil(r.h * escala)), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Premul, colorSpace: ck.ColorSpace.SRGB });
      const canvas = superficie.getCanvas();
      canvas.clear(ck.TRANSPARENT);
      canvas.scale(escala, escala);
      canvas.translate(-r.x, -r.y);
      desenharNos(sessao, canvas, p, nos, { fundo, semRecorte: regiao !== undefined });
      const imagem = superficie.makeImageSnapshot();
      superficie.delete();
      return imagem;
    },
  };
}

type Item =
  | { tipo: 'imagem'; imagem: Image; x: number; y: number; modo: ModoDeMesclagem; opacidade: number; movel: boolean }
  | { tipo: 'ajuste'; no: NoAjuste };

interface Arraste {
  prancheta: Prancheta;
  id: string;
  itens: Item[];
  dx: number;
  dy: number;
  /** onde a camada foi desenhada no último quadro, em pixel do canvas, e com que câmera */
  ultimo: { retangulo: [number, number, number, number]; camera: Camera } | undefined;
}

export interface OpcoesDoQuadro {
  /** cor da área de trabalho, atrás das pranchetas */
  fundo?: Float32Array;
  /**
   * Durante o arraste, redesenha só o retângulo onde a camada estava e onde está agora.
   * Exige que o canvas guarde o quadro anterior (no WebGL, preserveDrawingBuffer).
   */
  regiaoSuja?: boolean;
}

interface EmCache {
  prancheta: Prancheta;
  composta: Image | undefined;
}

export interface ContadoresDoEditor {
  /** pranchetas compostas por inteiro */
  composicoes: number;
  /** imagens parciais montadas no começo de um arraste */
  partes: number;
  quadros: number;
}

export class CenaDoEditor {
  readonly contadores: ContadoresDoEditor = { composicoes: 0, partes: 0, quadros: 0 };
  private readonly sessao: Sessao;
  private readonly fabrica: FabricaDeImagens;
  private readonly escala: number;
  private doc: Documento;
  private cache = new Map<string, EmCache>();
  private arraste: Arraste | undefined;

  /** escalaDoCache: pixels da imagem em cache por unidade do documento (1 = resolução do documento). */
  constructor(sessao: Sessao, doc: Documento, fabrica: FabricaDeImagens, escalaDoCache = 1) {
    this.sessao = sessao;
    this.fabrica = fabrica;
    this.escala = escalaDoCache;
    this.doc = doc;
  }

  /** Troca o documento. Prancheta que continua sendo o mesmo objeto mantém o cache: por isso o lote precisa preservar o que não tocou. */
  definirDocumento(doc: Documento): void {
    this.doc = doc;
    const vivas = new Set(doc.pranchetas.map((p) => p.id));
    for (const [id, c] of this.cache) {
      const atual = doc.pranchetas.find((p) => p.id === id);
      if (!vivas.has(id) || atual !== c.prancheta) {
        c.composta?.delete();
        this.cache.delete(id);
      }
    }
    this.soltarArraste();
  }

  /** Compõe as pranchetas que não têm imagem em cache. Devolve quantas compôs. */
  comporTudo(): number {
    let feitas = 0;
    for (const p of this.doc.pranchetas) {
      const c = this.cache.get(p.id);
      if (c?.composta) continue;
      const composta = this.fabrica.renderizar(p, p.filhos, true, this.escala);
      this.cache.set(p.id, { prancheta: p, composta });
      this.contadores.composicoes++;
      feitas++;
    }
    return feitas;
  }

  /**
   * Prepara as três partes para arrastar o nó. Devolve false quando o nó não é uma unidade do nível de cima
   * (está dentro de grupo isolado ou de conjunto de recorte): aí o editor recompõe a prancheta a cada mudança.
   */
  iniciarArraste(id: string): boolean {
    this.soltarArraste();
    for (const p of this.doc.pranchetas) {
      const unidades = unidadesDaPrancheta(p);
      const k = unidades.findIndex((u) => u.nos.length === 1 && u.nos[0]!.id === id);
      if (k < 0) continue;
      const no = unidades[k]!.nos[0]!;
      if (!ehVisual(no)) return false;
      const parte = (nos: readonly No[], fundo: boolean, regiao?: CaixaMedida): Image => {
        this.contadores.partes++;
        return this.fabrica.renderizar(p, nos, fundo, this.escala, regiao);
      };
      const itens: Item[] = [];
      // abaixo: tudo o que está sob a camada, composto de uma vez (aqui as dependentes enxergam o fundo certo)
      itens.push({ tipo: 'imagem', imagem: parte(unidades.slice(0, k).flatMap((u) => u.nos), true), x: 0, y: 0, modo: 'normal', opacidade: 1, movel: false });
      // a camada: imagem do tamanho dela, sem o recorte da prancheta, para poder entrar e sair ao mover
      const limites = limitesDoNo(this.sessao, no);
      const caixa: CaixaMedida = { x: Math.floor(limites.x), y: Math.floor(limites.y), w: Math.ceil(limites.w) + 1, h: Math.ceil(limites.h) + 1 };
      itens.push({ tipo: 'imagem', imagem: parte([{ ...no, modoDeMesclagem: 'normal', opacidade: 1 }], false, caixa), x: caixa.x, y: caixa.y, modo: modoDe(no), opacidade: no.opacidade ?? 1, movel: true });
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
        const base = u.nos[0]!;
        if (base.tipo === 'ajuste') itens.push({ tipo: 'ajuste', no: base });
        else {
          const normalizada = { ...base, modoDeMesclagem: 'normal', opacidade: 1 } as No;
          itens.push({ tipo: 'imagem', imagem: parte([normalizada, ...u.nos.slice(1)], false), x: 0, y: 0, modo: modoDe(base), opacidade: base.opacidade ?? 1, movel: false });
        }
      }
      fecharTrecho();
      this.arraste = { prancheta: p, id, itens, dx: 0, dy: 0, ultimo: undefined };
      return true;
    }
    return false;
  }

  /** Gesto em andamento: só muda o deslocamento. Não cria documento nem recompõe nada. */
  definirPrevia(dx: number, dy: number): void {
    if (!this.arraste) return;
    this.arraste.dx = dx;
    this.arraste.dy = dy;
  }

  /** Fim do gesto. As partes continuam na tela até o documento novo chegar, para a camada não piscar na posição antiga. */
  encerrarArraste(): { id: string; dx: number; dy: number } | undefined {
    return this.arraste ? { id: this.arraste.id, dx: this.arraste.dx, dy: this.arraste.dy } : undefined;
  }

  get itensDoArraste(): number {
    return this.arraste?.itens.length ?? 0;
  }

  /** Retângulo da camada arrastada no canvas, com folga para o filtro de imagem. */
  private retanguloDaCamada(camera: Camera): [number, number, number, number] | undefined {
    const a = this.arraste;
    const movel = a?.itens.find((i) => i.tipo === 'imagem' && i.movel);
    if (!a || !movel || movel.tipo !== 'imagem') return undefined;
    const x = (a.prancheta.x + movel.x + a.dx - camera.x) * camera.zoom;
    const y = (a.prancheta.y + movel.y + a.dy - camera.y) * camera.zoom;
    const w = (movel.imagem.width() / this.escala) * camera.zoom;
    const h = (movel.imagem.height() / this.escala) * camera.zoom;
    return [Math.floor(x) - 2, Math.floor(y) - 2, Math.ceil(x + w) + 2, Math.ceil(y + h) + 2];
  }

  desenharQuadro(canvas: Canvas, camera: Camera, opcoes: OpcoesDoQuadro = {}): void {
    const { ck } = this.sessao;
    this.contadores.quadros++;
    canvas.save();
    const agora = this.retanguloDaCamada(camera);
    const antes = this.arraste?.ultimo;
    if (opcoes.regiaoSuja && agora && antes && antes.camera.x === camera.x && antes.camera.y === camera.y && antes.camera.zoom === camera.zoom) {
      const r = antes.retangulo;
      canvas.clipRect(ck.LTRBRect(Math.min(r[0], agora[0]), Math.min(r[1], agora[1]), Math.max(r[2], agora[2]), Math.max(r[3], agora[3])), ck.ClipOp.Intersect, false);
    }
    if (this.arraste && agora) this.arraste.ultimo = { retangulo: agora, camera: { ...camera } };
    if (opcoes.fundo) canvas.clear(opcoes.fundo);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.translate(-camera.x, -camera.y);
    const tinta = new ck.Paint();
    for (const p of this.doc.pranchetas) {
      canvas.save();
      canvas.translate(p.x, p.y);
      canvas.clipRect(ck.XYWHRect(0, 0, p.largura, p.altura), ck.ClipOp.Intersect, false);
      if (this.arraste?.prancheta === p) {
        for (const item of this.arraste.itens) {
          if (item.tipo === 'ajuste') {
            desenharNos(this.sessao, canvas, p, [item.no], { fundo: false });
            continue;
          }
          tinta.setAlphaf(item.opacidade);
          this.sessao.mesclador.aplicar(tinta, item.modo);
          this.desenharImagem(canvas, item.imagem, item.x + (item.movel ? this.arraste.dx : 0), item.y + (item.movel ? this.arraste.dy : 0), tinta);
        }
      } else {
        const c = this.cache.get(p.id);
        if (c?.composta) {
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

  private desenharImagem(canvas: Canvas, imagem: Image, x: number, y: number, tinta: import('canvaskit-wasm').Paint): void {
    const { ck } = this.sessao;
    if (this.escala === 1) {
      canvas.drawImageOptions(imagem, x, y, ck.FilterMode.Linear, ck.MipmapMode.None, tinta);
      return;
    }
    canvas.drawImageRectOptions(imagem, ck.XYWHRect(0, 0, imagem.width(), imagem.height()), ck.XYWHRect(x, y, imagem.width() / this.escala, imagem.height() / this.escala), ck.FilterMode.Linear, ck.MipmapMode.None, tinta);
  }

  private soltarArraste(): void {
    if (!this.arraste) return;
    for (const item of this.arraste.itens) if (item.tipo === 'imagem') item.imagem.delete();
    this.arraste = undefined;
  }

  destruir(): void {
    this.soltarArraste();
    for (const c of this.cache.values()) c.composta?.delete();
    this.cache.clear();
  }
}
