// Cache do editor (o "cache por camada" que o ADR 030 manda rever antes de trocar de motor).
//
// Parado ou movendo a câmera: uma imagem por prancheta. O quadro é um desenho de imagem por prancheta.
// Arrastando uma camada: a prancheta dela vira três partes, montadas uma vez no começo do gesto:
//   abaixo  — tudo o que está sob a camada, já composto numa imagem;
//   camada  — a camada sozinha, com sombra, desfoque e máscara, numa imagem do tamanho dela;
//   acima   — o que está sobre ela. Trechos que não dependem do fundo viram uma imagem cada;
//             camada com modo de mesclagem vira imagem desenhada com o modo; camada de ajuste é redesenhada.
// O quadro é: abaixo, camada deslocada, e os itens de acima em ordem. Nada é recomposto durante o gesto.
// Várias camadas arrastadas: a mesma coisa, com uma imagem para cada uma e o que fica entre elas em cache.
//
// Redimensionar e girar (prévia com caixa nova), ou mexer em camada que não é uma unidade sozinha (dentro de grupo
// isolado, base de um recorte): a UNIDADE tocada é redesenhada ao vivo a cada quadro, já com a caixa nova, e todo
// o resto continua em cache. A prévia é exata, não aproximada: o texto requebra, a foto reenquadra, o canto
// arredondado mantém o raio e o efeito é recalculado, porque é o mesmo desenho que a prancheta terá ao soltar.
import { type Caixa, type Documento, deslocarNo, disporPranchetas, ehVisual, type ModoDeMesclagem, type No, type NoAjuste, type NoVisual, type Prancheta } from '@otto/documento';
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

/** A caixa de uma camada durante o gesto de redimensionar ou girar: os mesmos campos que a operação "alterar" vai gravar ao soltar. */
export interface CaixaDePrevia {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** graus; sem ela, a rotação da camada não muda */
  rotacao?: number;
}

/**
 * Gesto em andamento: mostra as camadas deslocadas, ou com outra caixa, sem criar documento novo.
 * Camada de `ids` com entrada em `caixas` aparece com aquela caixa (redimensionar, girar); as outras, deslocadas por dx e dy (mover).
 */
export interface PreviaDeGesto {
  ids: readonly string[];
  dx: number;
  dy: number;
  /** caixa nova por id de camada visual */
  caixas?: Readonly<Record<string, CaixaDePrevia>>;
}

/** O nó como a prévia o mostra. O que não muda continua sendo o mesmo objeto. */
export function aplicarPrevia(no: No, previa: PreviaDeGesto, ids: ReadonlySet<string> = new Set(previa.ids)): No {
  const caixa = previa.caixas?.[no.id];
  if (caixa && ehVisual(no)) {
    if (!ids.has(no.id)) return no;
    // troca de propriedade, como a operação "alterar": a máscara de forma fica onde está
    return { ...no, x: caixa.x, y: caixa.y, largura: caixa.largura, altura: caixa.altura, ...(caixa.rotacao !== undefined ? { rotacao: caixa.rotacao } : {}) };
  }
  // deslocamento, como a operação "mover": grupo leva tudo dentro, e a máscara de forma vai junto
  if (ids.has(no.id)) return deslocarNo(no, previa.dx, previa.dy);
  if (no.tipo !== 'grupo') return no;
  let mudou = false;
  const filhos = no.filhos.map((f) => {
    const novo = aplicarPrevia(f, previa, ids);
    if (novo !== f) mudou = true;
    return novo;
  });
  return mudou ? { ...no, filhos } : no;
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

type Item =
  | { tipo: 'imagem'; imagem: Image; x: number; y: number; modo: ModoDeMesclagem; opacidade: number; movel: boolean }
  | { tipo: 'ajuste'; no: NoAjuste }
  /** unidade tocada pelo gesto, redesenhada a cada quadro com a prévia aplicada */
  | { tipo: 'ao-vivo'; nos: readonly No[]; desenhados: { previa: PreviaDeGesto; nos: readonly No[] } | undefined };

interface Arraste {
  prancheta: Prancheta;
  previa: PreviaDeGesto;
  /** o que é fixo e o que se mexe, de baixo para cima, montado uma vez no começo do gesto */
  itens: Item[];
  /** onde as camadas foram desenhadas no último quadro, em pixel do canvas, e com que câmera */
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
  /** imagens parciais montadas no começo de um gesto */
  partes: number;
  quadros: number;
  /** unidades redesenhadas ao vivo durante gestos (uma por unidade tocada, por quadro) */
  desenhosAoVivo: number;
}

function contem(filhos: readonly No[], id: string): boolean {
  return filhos.some((n) => n.id === id || (n.tipo === 'grupo' && contem(n.filhos, id)));
}

export class CenaDoEditor {
  readonly contadores: ContadoresDoCache = { composicoesDePrancheta: 0, partes: 0, quadros: 0, desenhosAoVivo: 0 };
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

  /**
   * Como a prévia corrente é desenhada: 'partes' quando tudo o que se mexe é imagem em cache (nada é redesenhado),
   * 'ao-vivo' quando alguma unidade é redesenhada a cada quadro. Nos dois casos o resto da prancheta fica em cache.
   */
  get modoDaPrevia(): 'partes' | 'ao-vivo' | undefined {
    if (!this.arraste) return undefined;
    return this.arraste.itens.some((i) => i.tipo === 'ao-vivo') ? 'ao-vivo' : 'partes';
  }

  /** Gesto em andamento. Não cria documento nem recompõe prancheta. null encerra. */
  definirPrevia(previa: PreviaDeGesto | null): void {
    if (!previa || previa.ids.length === 0 || !this.doc) {
      this.soltarArraste();
      return;
    }
    const antes = this.arraste?.previa;
    const comCaixa = (p: PreviaDeGesto): string => p.ids.filter((id) => p.caixas?.[id]).join(' ');
    // as partes valem enquanto forem as mesmas camadas, cada uma no mesmo tipo de gesto (mover ou caixa nova)
    const mesma = antes && antes.ids.length === previa.ids.length && antes.ids.every((id, i) => id === previa.ids[i]) && comCaixa(antes) === comCaixa(previa);
    if (!mesma) this.iniciarArraste(this.doc, previa);
    if (this.arraste) this.arraste.previa = previa;
  }

  private iniciarArraste(doc: Documento, previa: PreviaDeGesto): void {
    this.soltarArraste();
    const p = doc.pranchetas.find((x) => previa.ids.some((id) => contem(x.filhos, id)));
    if (!p) return;
    this.arraste = { prancheta: p, previa, itens: this.montarPartes(doc, p, previa), ultimo: undefined };
  }

  /**
   * As partes do gesto, de baixo para cima: o que está abaixo da primeira unidade tocada numa imagem só; cada unidade
   * tocada como imagem que se desloca (camada sozinha, só movendo) ou como desenho ao vivo; e o que fica entre elas e
   * acima em imagens, separando o que depende do que está abaixo (modo de mesclagem, camada de ajuste).
   */
  private montarPartes(doc: Documento, p: Prancheta, previa: PreviaDeGesto): Item[] {
    const ids = new Set(previa.ids);
    const unidades = unidadesDaPrancheta(p);
    const tocada = (u: Unidade): boolean => u.nos.some((n) => ids.has(n.id) || (n.tipo === 'grupo' && [...ids].some((id) => contem(n.filhos, id))));
    const primeira = unidades.findIndex(tocada);
    const parte = (nos: readonly No[], fundo: boolean, regiao?: Caixa): Image => {
      this.contadores.partes++;
      return this.fabrica.renderizar(doc, p, nos, fundo, this.escala, regiao);
    };
    const itens: Item[] = [];
    /**
     * Imagem fixa do que está acima. Quando são só camadas visuais, a imagem tem o tamanho do que elas ocupam dentro da
     * prancheta, e não o da prancheta: uma dúzia de imagens do tamanho da prancheta por quadro pesa em placa fraca.
     */
    const fixa = (nos: readonly No[], modo: ModoDeMesclagem = 'normal', opacidade = 1): void => {
      const caixa = this.areaDe(p, nos);
      if (caixa && (caixa.w <= 0 || caixa.h <= 0)) return;
      itens.push({ tipo: 'imagem', imagem: parte(nos, false, caixa), x: caixa?.x ?? 0, y: caixa?.y ?? 0, modo, opacidade, movel: false });
    };
    // abaixo: tudo o que está sob a primeira unidade tocada, composto de uma vez (aqui as dependentes enxergam o fundo certo)
    const ate = primeira < 0 ? unidades.length : primeira;
    itens.push({
      tipo: 'imagem',
      imagem: parte(
        unidades.slice(0, ate).flatMap((u) => u.nos),
        true,
      ),
      x: 0,
      y: 0,
      modo: 'normal',
      opacidade: 1,
      movel: false,
    });
    // daí para cima: trechos independentes viram uma imagem; dependentes ficam separados
    let trecho: No[] = [];
    const fecharTrecho = (): void => {
      if (trecho.length === 0) return;
      fixa(trecho);
      trecho = [];
    };
    for (const u of unidades.slice(ate)) {
      const base = u.nos[0] as No;
      if (tocada(u)) {
        fecharTrecho();
        if (u.nos.length === 1 && ehVisual(base) && ids.has(base.id) && !previa.caixas?.[base.id]) {
          // a camada sozinha, só movendo: imagem do tamanho dela, sem o recorte da prancheta, para poder entrar e sair
          const limites = limitesDoNo(this.sessao, base);
          const caixa: Caixa = { x: Math.floor(limites.x), y: Math.floor(limites.y), w: Math.ceil(limites.w) + 1, h: Math.ceil(limites.h) + 1 };
          const normal: NoVisual = { ...base, modoDeMesclagem: 'normal', opacidade: 1 };
          itens.push({ tipo: 'imagem', imagem: parte([normal], false, caixa), x: caixa.x, y: caixa.y, modo: modoDe(base), opacidade: base.opacidade, movel: true });
        } else if (base.tipo === 'ajuste' && u.nos.length === 1) itens.push({ tipo: 'ajuste', no: base });
        else itens.push({ tipo: 'ao-vivo', nos: u.nos, desenhados: undefined });
        continue;
      }
      if (!u.dependente) {
        trecho.push(...u.nos);
        continue;
      }
      fecharTrecho();
      if (base.tipo === 'ajuste') itens.push({ tipo: 'ajuste', no: base });
      else {
        const semModo = { ...base, modoDeMesclagem: 'normal', opacidade: 1 } as No;
        fixa([semModo, ...u.nos.slice(1)], modoDe(base), base.opacidade);
      }
    }
    fecharTrecho();
    return itens;
  }

  /** A área que camadas visuais ocupam dentro da prancheta, em unidade inteira. Com grupo ou ajuste no meio, undefined (a prancheta inteira). */
  private areaDe(p: Prancheta, nos: readonly No[]): Caixa | undefined {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const n of nos) {
      if (!ehVisual(n)) return undefined;
      if (!n.visivel) continue;
      const l = limitesDoNo(this.sessao, n);
      x0 = Math.min(x0, l.x);
      y0 = Math.min(y0, l.y);
      x1 = Math.max(x1, l.x + l.w);
      y1 = Math.max(y1, l.y + l.h);
    }
    const x = Math.max(0, Math.floor(x0));
    const y = Math.max(0, Math.floor(y0));
    return { x, y, w: Math.min(p.largura, Math.ceil(x1) + 1) - x, h: Math.min(p.altura, Math.ceil(y1) + 1) - y };
  }

  /**
   * Retângulo, no canvas, que contém as camadas arrastadas, com folga para o filtro de imagem.
   * Só existe quando tudo o que se mexe é imagem em cache: com unidade ao vivo o quadro é redesenhado inteiro.
   */
  private retanguloDaCamada(camera: CameraEmPixels): [number, number, number, number] | undefined {
    const a = this.arraste;
    if (!a || a.itens.some((i) => i.tipo === 'ao-vivo')) return undefined;
    const posicao = this.posicoes.get(a.prancheta.id) ?? { x: 0, y: 0 };
    let r: [number, number, number, number] | undefined;
    for (const movel of a.itens) {
      if (movel.tipo !== 'imagem' || !movel.movel) continue;
      const x = camera.x + (posicao.x + movel.x + a.previa.dx) * camera.zoom;
      const y = camera.y + (posicao.y + movel.y + a.previa.dy) * camera.zoom;
      const w = (movel.imagem.width() / this.escala) * camera.zoom;
      const h = (movel.imagem.height() / this.escala) * camera.zoom;
      const este: [number, number, number, number] = [Math.floor(x) - 2, Math.floor(y) - 2, Math.ceil(x + w) + 2, Math.ceil(y + h) + 2];
      r = r ? [Math.min(r[0], este[0]), Math.min(r[1], este[1]), Math.max(r[2], este[2]), Math.max(r[3], este[3])] : este;
    }
    return r;
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
      if (a && doc) {
        for (const item of a.itens) {
          if (item.tipo === 'ajuste') {
            desenharNos(this.sessao, canvas, doc, p, [item.no], { fundo: false });
            continue;
          }
          if (item.tipo === 'ao-vivo') {
            // a unidade com a prévia aplicada; só é refeita quando a prévia muda
            if (item.desenhados?.previa !== a.previa) {
              const ids = new Set(a.previa.ids);
              item.desenhados = { previa: a.previa, nos: item.nos.map((n) => aplicarPrevia(n, a.previa, ids)) };
            }
            desenharNos(this.sessao, canvas, doc, p, item.desenhados.nos, { fundo: false });
            this.contadores.desenhosAoVivo++;
            continue;
          }
          tinta.setAlphaf(item.opacidade);
          this.sessao.mesclador.aplicar(tinta, item.modo);
          this.desenharImagem(canvas, item.imagem, item.x + (item.movel ? a.previa.dx : 0), item.y + (item.movel ? a.previa.dy : 0), tinta);
        }
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
