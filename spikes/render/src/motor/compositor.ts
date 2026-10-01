// Compositor: transforma uma prancheta em desenho sobre um Canvas do Skia.
// O mesmo código roda no navegador e no Node. Não lê pixel em JavaScript: máscara, modo de mesclagem,
// efeito e ajuste são camadas (saveLayer), filtros de imagem e shaders do próprio Skia.
import type { Canvas, ImageFilter, Paint, Path, Shader, Surface } from 'canvaskit-wasm';
import { ehModoNativo } from './mesclagem.ts';
import { ajustarPremultiplicado, mesclarPremultiplicado } from './pixel.ts';
import type { Sessao } from './sessao.ts';
import { girarCaixa } from './texto.ts';
import { type CaixaMedida, type Degrade, ehVisual, type Mascara, type ModoDeMesclagem, type No, type NoImagem, type NoVisual, type Prancheta, type Preenchimento, rgbDe } from './tipos.ts';

export interface OpcoesDeDesenho {
  /** Desenha só estes nós, sem fundo. É o pixel de cada camada do PSD (R5). */
  apenas?: ReadonlySet<string>;
  /** Pula estes nós. O lint usa para medir o que está atrás de um texto (R6). */
  excluir?: ReadonlySet<string>;
  fundo?: boolean;
  /** Não recorta pela prancheta. O cache da camada arrastada usa: ela pode estar em parte fora e entrar ao mover. */
  semRecorte?: boolean;
}

export interface OpcoesDeRender extends OpcoesDeDesenho {
  escala?: number;
  /** Recorte em unidades da prancheta. Sem ele, a prancheta inteira (R4). */
  regiao?: CaixaMedida;
  /**
   * Como calcular modo de mesclagem não nativo e camada de ajuste no raster de CPU.
   * 'pixel' (padrão) é o laço em TypeScript; 'shader' é o SkSL, que em CPU é de 10 a 150 vezes mais lento
   * e existe aqui só para comparar com o que a GPU faz.
   */
  calculo?: 'pixel' | 'shader';
}

export interface RenderEmPixels {
  largura: number;
  altura: number;
  /** RGBA de 8 bits, não premultiplicado, sRGB */
  rgba: Uint8Array;
}

/**
 * Limite de área de uma superfície (R7). O WebAssembly é de 32 bits e cada superfície RGBA é um bloco
 * contíguo na memória dele. Acima disso se renderiza por região (ver renderizarEmLadrilhos).
 */
export const LIMITE_DE_PIXELS = 64_000_000;

export class ErroDeAreaDoRender extends Error {
  readonly largura: number;
  readonly altura: number;
  constructor(largura: number, altura: number) {
    super(
      `Render de ${largura} × ${altura} px (${Math.round((largura * altura) / 1e6)} megapixels) passa do limite de ${LIMITE_DE_PIXELS / 1e6} megapixels por superfície. Renderize por região ou reduza a escala.`,
    );
    this.name = 'ErroDeAreaDoRender';
    this.largura = largura;
    this.altura = altura;
  }
}

interface Contexto {
  sessao: Sessao;
  p: Prancheta;
  apenas: ReadonlySet<string> | undefined;
  excluir: ReadonlySet<string> | undefined;
  semRecorte: boolean;
}

// ---------- geometria ----------

export function enquadrar(iw: number, ih: number, x: number, y: number, w: number, h: number, ajuste: 'cobrir' | 'conter', foco = { x: 0.5, y: 0.5 }, zoom = 1) {
  if (ajuste === 'cobrir') {
    const s = Math.max(w / iw, h / ih) * zoom;
    const sw = w / s;
    const sh = h / s;
    return { sx: (iw - sw) * foco.x, sy: (ih - sh) * foco.y, sw, sh, dx: x, dy: y, dw: w, dh: h };
  }
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  return { sx: 0, sy: 0, sw: iw, sh: ih, dx: x + (w - dw) / 2, dy: y + (h - dh) / 2, dw, dh };
}

/** Pontos do degradê linear com a convenção do Photoshop: cobre a caixa inteira no ângulo pedido. */
export function extremosDoDegrade(angulo: number, x: number, y: number, w: number, h: number) {
  const a = (angulo * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const meio = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return { x0: cx - dx * meio, y0: cy - dy * meio, x1: cx + dx * meio, y1: cy + dy * meio };
}

function deslocamentoDaSombra(s: NonNullable<NoVisual['sombra']>): { dx: number; dy: number; sigma: number } {
  const a = (s.angulo * Math.PI) / 180;
  // "desfoque" é o tamanho da sombra do Canvas 2D e do Photoshop; o desvio padrão é a metade
  return { dx: -Math.cos(a) * s.distancia, dy: Math.sin(a) * s.distancia, sigma: s.desfoque / 2 };
}

/** Caixa que contém tudo o que o nó pinta, com rotação, sombra e desfoque. Limita o tamanho da camada temporária. */
export function limitesDoNo(sessao: Sessao, n: NoVisual): CaixaMedida {
  let c: CaixaMedida = { x: n.x, y: n.y, w: n.largura, h: n.altura };
  if (n.tipo === 'texto') {
    // texto pode transbordar a caixa da camada: os limites seguem a tinta e as linhas
    const d = sessao.texto.diagramar(n);
    const x0 = Math.min(c.x, d.tinta.x);
    const y0 = Math.min(c.y, d.tinta.y);
    const x1 = Math.max(c.x + c.w, d.tinta.x + d.tinta.w);
    const y1 = Math.max(c.y + c.h, d.tinta.y + d.tinta.h, n.y + d.alturaUsada);
    c = { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 4, h: y1 - y0 + 4 };
  }
  if (n.tipo === 'vetor') {
    const maior = Math.max(0, ...n.caminhos.map((k) => k.traco?.espessura ?? 0));
    const fx = n.largura / n.moldura[0];
    c = { x: c.x - maior * fx, y: c.y - maior * fx, w: c.w + 2 * maior * fx, h: c.h + 2 * maior * fx };
  }
  c = girarCaixa(c, n.x + n.largura / 2, n.y + n.altura / 2, n.rotacao ?? 0);
  let esq = 1;
  let topo = 1;
  let dir = 1;
  let base = 1;
  const borrao = (n.desfoque ?? 0) * 3;
  esq += borrao;
  topo += borrao;
  dir += borrao;
  base += borrao;
  if (n.sombra) {
    const s = deslocamentoDaSombra(n.sombra);
    const raio = s.sigma * 3 + borrao;
    esq = Math.max(esq, raio - s.dx);
    dir = Math.max(dir, raio + s.dx);
    topo = Math.max(topo, raio - s.dy);
    base = Math.max(base, raio + s.dy);
  }
  return { x: c.x - esq, y: c.y - topo, w: c.w + esq + dir, h: c.h + topo + base };
}

// ---------- tintas e formas ----------

function corDoSkia(sessao: Sessao, cor: string, alfa = 1): Float32Array {
  const [r, g, b] = rgbDe(cor);
  return sessao.ck.Color(r, g, b, alfa);
}

function shaderDoDegrade(sessao: Sessao, d: Degrade, x: number, y: number, w: number, h: number): Shader {
  const { ck } = sessao;
  const paradas = [...d.paradas].sort((a, b) => a.posicao - b.posicao);
  const cores = paradas.map((p) => corDoSkia(sessao, p.cor, p.opacidade ?? 1));
  const posicoes = paradas.map((p) => p.posicao);
  if (d.tipo === 'radial') return ck.Shader.MakeRadialGradient([x + w / 2, y + h / 2], Math.max(w, h) / 2, cores, posicoes, ck.TileMode.Clamp);
  const e = extremosDoDegrade(d.angulo, x, y, w, h);
  return ck.Shader.MakeLinearGradient([e.x0, e.y0], [e.x1, e.y1], cores, posicoes, ck.TileMode.Clamp);
}

/** Tinta de preenchimento. Devolve também o shader, para quem chama apagar. */
function tintaDoPreenchimento(sessao: Sessao, p: Preenchimento, x: number, y: number, w: number, h: number): { tinta: Paint; shader: Shader | undefined } {
  const tinta = new sessao.ck.Paint();
  tinta.setAntiAlias(true);
  if (typeof p === 'string') {
    tinta.setColor(corDoSkia(sessao, p));
    return { tinta, shader: undefined };
  }
  const shader = shaderDoDegrade(sessao, p, x, y, w, h);
  tinta.setShader(shader);
  return { tinta, shader };
}

/** Caminho da forma. Com "inverso", é tudo menos a forma: a forma dentro de um retângulo, com regra par-ímpar. */
function caminhoDaForma(sessao: Sessao, forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number, inverso?: CaixaMedida): Path {
  const { ck } = sessao;
  const construtor = new ck.PathBuilder();
  if (forma === 'elipse') construtor.addOval(ck.XYWHRect(x, y, w, h));
  else {
    const r = Math.max(0, Math.min(raio, w / 2, h / 2));
    if (r > 0) construtor.addRRect(ck.RRectXY(ck.XYWHRect(x, y, w, h), r, r));
    else construtor.addRect(ck.XYWHRect(x, y, w, h));
  }
  if (inverso) {
    construtor.addRect(ck.XYWHRect(inverso.x, inverso.y, inverso.w, inverso.h));
    construtor.setFillType(ck.FillType.EvenOdd);
  }
  return construtor.detachAndDelete();
}

// ---------- conteúdo de cada tipo de nó ----------

function desenharImagem(sessao: Sessao, canvas: Canvas, no: NoImagem): void {
  const { ck } = sessao;
  const img = sessao.imagem(no.arquivo);
  const tinta = new ck.Paint();
  tinta.setAntiAlias(true);
  if (!img) {
    // arquivo não entregue: retângulo cinza, como na POC. O lint é quem acusa.
    tinta.setColor(ck.Color(138, 138, 138, 1));
    canvas.drawRect(ck.XYWHRect(no.x, no.y, no.largura, no.altura), tinta);
    tinta.delete();
    return;
  }
  const e = enquadrar(img.width(), img.height(), no.x, no.y, no.largura, no.altura, no.ajuste, no.foco, no.zoom);
  canvas.save();
  if (no.recorte) {
    const caminho = caminhoDaForma(sessao, no.recorte.forma, no.x, no.y, no.largura, no.altura, no.recorte.raio);
    canvas.clipPath(caminho, ck.ClipOp.Intersect, true);
    caminho.delete();
  }
  canvas.drawImageRectOptions(img, ck.XYWHRect(e.sx, e.sy, e.sw, e.sh), ck.XYWHRect(e.dx, e.dy, e.dw, e.dh), ck.FilterMode.Linear, ck.MipmapMode.Nearest, tinta);
  canvas.restore();
  tinta.delete();
}


function desenharConteudo(sessao: Sessao, canvas: Canvas, no: NoVisual): void {
  const { ck } = sessao;
  canvas.save();
  if (no.rotacao) canvas.rotate(no.rotacao, no.x + no.largura / 2, no.y + no.altura / 2);
  switch (no.tipo) {
    case 'forma': {
      const caminho = caminhoDaForma(sessao, no.forma, no.x, no.y, no.largura, no.altura, no.raio ?? 0);
      const { tinta, shader } = tintaDoPreenchimento(sessao, no.preenchimento, no.x, no.y, no.largura, no.altura);
      canvas.drawPath(caminho, tinta);
      if (no.traco) {
        // contorno interno: recorta pela forma e traça com o dobro da espessura
        const traco = new ck.Paint();
        traco.setAntiAlias(true);
        traco.setStyle(ck.PaintStyle.Stroke);
        traco.setStrokeWidth(no.traco.espessura * 2);
        traco.setColor(corDoSkia(sessao, no.traco.cor));
        canvas.save();
        canvas.clipPath(caminho, ck.ClipOp.Intersect, true);
        canvas.drawPath(caminho, traco);
        canvas.restore();
        traco.delete();
      }
      tinta.delete();
      shader?.delete();
      caminho.delete();
      break;
    }
    case 'imagem':
      desenharImagem(sessao, canvas, no);
      break;
    case 'texto':
      sessao.texto.desenhar(canvas, no);
      break;
    case 'vetor': {
      canvas.translate(no.x, no.y);
      canvas.scale(no.largura / no.moldura[0], no.altura / no.moldura[1]);
      for (const c of no.caminhos) {
        const caminho = ck.Path.MakeFromSVGString(c.d);
        if (!caminho) continue;
        if (c.regra === 'par-impar') caminho.setFillType(ck.FillType.EvenOdd);
        const tinta = new ck.Paint();
        tinta.setAntiAlias(true);
        if (c.preenchimento) {
          tinta.setColor(corDoSkia(sessao, c.preenchimento));
          canvas.drawPath(caminho, tinta);
        }
        if (c.traco) {
          tinta.setStyle(ck.PaintStyle.Stroke);
          tinta.setStrokeWidth(c.traco.espessura);
          tinta.setStrokeCap(ck.StrokeCap.Round);
          tinta.setStrokeJoin(ck.StrokeJoin.Round);
          tinta.setColor(corDoSkia(sessao, c.traco.cor));
          canvas.drawPath(caminho, tinta);
        }
        tinta.delete();
        caminho.delete();
      }
      break;
    }
  }
  canvas.restore();
}

// ---------- máscara ----------

function shaderDaMascaraEmDegrade(sessao: Sessao, m: Extract<Mascara, { tipo: 'degrade' }>, caixa: CaixaMedida): Shader {
  const { ck } = sessao;
  const e = extremosDoDegrade(m.angulo, caixa.x, caixa.y, caixa.w, caixa.h);
  const [a, b] = m.inicio <= m.fim ? [m.inicio, m.fim] : [m.fim, m.inicio];
  const opacoPrimeiro = m.inicio <= m.fim;
  const cheio = ck.Color(0, 0, 0, 1);
  const vazio = ck.Color(0, 0, 0, 0);
  const cores = opacoPrimeiro ? [cheio, cheio, vazio, vazio] : [vazio, vazio, cheio, cheio];
  return ck.Shader.MakeLinearGradient([e.x0, e.y0], [e.x1, e.y1], cores, [0, a, Math.max(a + 0.0001, b), 1], ck.TileMode.Clamp);
}

/**
 * Pinta a cobertura da máscara com a tinta dada. A tinta decide o efeito: preto comum dentro de uma camada
 * "destino dentro" corta a camada; com o shader de um ajuste, limita o ajuste à máscara.
 */
function pintarCobertura(cx: Contexto, canvas: Canvas, m: Mascara | undefined, caixa: CaixaMedida, tinta: Paint, inverter: boolean): void {
  const { ck } = cx.sessao;
  if (!m) {
    canvas.drawPaint(tinta);
    return;
  }
  if (m.tipo === 'degrade') {
    const shader = shaderDaMascaraEmDegrade(cx.sessao, m, caixa);
    tinta.setShader(shader);
    canvas.drawPaint(tinta);
    tinta.setShader(null);
    shader.delete();
    return;
  }
  // invertida: retângulo bem maior que a prancheta, para a borda suave não aparecer na margem
  const folga = m.suavizar * 3 + 16;
  const fora = inverter ? { x: -folga, y: -folga, w: cx.p.largura + 2 * folga, h: cx.p.altura + 2 * folga } : undefined;
  const caminho = caminhoDaForma(cx.sessao, m.forma, m.x, m.y, m.largura, m.altura, m.raio, fora);
  const borrao = m.suavizar > 0 ? ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, m.suavizar, true) : null;
  if (borrao) tinta.setMaskFilter(borrao);
  canvas.drawPath(caminho, tinta);
  if (borrao) {
    tinta.setMaskFilter(null);
    borrao.delete();
  }
  caminho.delete();
}

/** Corta a camada corrente pela máscara. Chamar com a camada do nó aberta. */
function aplicarMascara(cx: Contexto, canvas: Canvas, m: Mascara, caixa: CaixaMedida): void {
  const { ck } = cx.sessao;
  const corte = new ck.Paint();
  const invertida = m.tipo === 'forma' && m.inverter;
  // invertida: apaga onde a forma está, em vez de manter só onde ela está
  corte.setBlendMode(invertida ? ck.BlendMode.DstOut : ck.BlendMode.DstIn);
  canvas.saveLayer(corte);
  const preto = new ck.Paint();
  preto.setAntiAlias(true);
  preto.setColor(ck.BLACK);
  pintarCobertura(cx, canvas, m, caixa, preto, false);
  canvas.restore();
  preto.delete();
  corte.delete();
}

// ---------- superfície de CPU com acesso direto ao pixel ----------

/** Superfície de raster cuja memória o motor enxerga: o laço de pixel lê e escreve nela sem copiar. */
export interface SuperficieDeCpu {
  readonly superficie: Surface;
  readonly largura: number;
  readonly altura: number;
  /** RGBA premultiplicado. Pedir de novo a cada uso: a vista muda quando a memória do WebAssembly cresce. */
  pixels(): Uint8Array;
  destruir(): void;
}

export function criarSuperficieDeCpu(sessao: Sessao, largura: number, altura: number): SuperficieDeCpu {
  const { ck } = sessao;
  if (largura * altura > LIMITE_DE_PIXELS) throw new ErroDeAreaDoRender(largura, altura);
  const memoria = ck.Malloc(Uint8Array, largura * altura * 4);
  const superficie = ck.MakeRasterDirectSurface({ width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Premul, colorSpace: ck.ColorSpace.SRGB }, memoria, largura * 4);
  if (!superficie) {
    ck.Free(memoria);
    throw new Error(`O motor não conseguiu alocar a superfície de ${largura} × ${altura} px`);
  }
  superficie.getCanvas().clear(ck.TRANSPARENT);
  return {
    superficie,
    largura,
    altura,
    pixels: () => memoria.toTypedArray() as Uint8Array,
    destruir() {
      superficie.delete();
      ck.Free(memoria);
    },
  };
}

/**
 * Onde se desenha. Com "cpu", o compositor calcula modo não nativo e ajuste por laço de pixel na memória
 * da superfície; sem, usa shader (é o caminho da GPU). "x" e "y" situam uma superfície temporária dentro da de quem a criou.
 */
interface Alvo {
  canvas: Canvas;
  cpu: SuperficieDeCpu | undefined;
  x: number;
  y: number;
}

/** Superfície temporária com a mesma transformação e o mesmo recorte do alvo, inteira ou limitada a uma região do documento. */
function alvoTemporario(cx: Contexto, alvo: Alvo, regiao?: CaixaMedida): Alvo | undefined {
  const { ck } = cx.sessao;
  const base = alvo.cpu!;
  const matriz = alvo.canvas.getTotalMatrix();
  let x0 = 0;
  let y0 = 0;
  let x1 = base.largura;
  let y1 = base.altura;
  if (regiao) {
    const cantos = ck.Matrix.mapPoints(matriz, [regiao.x, regiao.y, regiao.x + regiao.w, regiao.y, regiao.x + regiao.w, regiao.y + regiao.h, regiao.x, regiao.y + regiao.h]);
    const xs = [cantos[0]!, cantos[2]!, cantos[4]!, cantos[6]!];
    const ys = [cantos[1]!, cantos[3]!, cantos[5]!, cantos[7]!];
    x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
    y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
    x1 = Math.min(base.largura, Math.ceil(Math.max(...xs)) + 1);
    y1 = Math.min(base.altura, Math.ceil(Math.max(...ys)) + 1);
    if (x1 <= x0 || y1 <= y0) return undefined;
  }
  const cpu = criarSuperficieDeCpu(cx.sessao, x1 - x0, y1 - y0);
  const canvas = cpu.superficie.getCanvas();
  canvas.translate(-x0, -y0);
  canvas.concat(matriz);
  if (!cx.semRecorte) canvas.clipRect(ck.XYWHRect(0, 0, cx.p.largura, cx.p.altura), ck.ClipOp.Intersect, false);
  return { canvas, cpu, x: x0, y: y0 };
}

/** Junta a superfície temporária no alvo, com modo e opacidade. Nativo: o Skia desenha. Não nativo: laço de pixel. */
function fundir(cx: Contexto, alvo: Alvo, temporario: Alvo, modo: ModoDeMesclagem, opacidade: number): void {
  const { ck } = cx.sessao;
  const origem = temporario.cpu!;
  if (ehModoNativo(modo)) {
    const imagem = origem.superficie.makeImageSnapshot();
    const tinta = tintaDaCamada(cx, opacidade, modo);
    alvo.canvas.save();
    // a temporária já está em pixel do alvo: desfaz a transformação para desenhar 1:1
    alvo.canvas.concat(ck.Matrix.invert(alvo.canvas.getTotalMatrix()) ?? ck.Matrix.identity());
    alvo.canvas.drawImage(imagem, temporario.x, temporario.y, tinta);
    alvo.canvas.restore();
    tinta.delete();
    imagem.delete();
    return;
  }
  mesclarPremultiplicado(alvo.cpu!.pixels(), alvo.cpu!.largura, temporario.x, temporario.y, origem.pixels(), origem.largura, origem.altura, modo, opacidade);
}

// ---------- composição ----------

function contemAlgumDe(n: No, ids: ReadonlySet<string>): boolean {
  return ids.has(n.id) || (n.tipo === 'grupo' && n.filhos.some((f) => contemAlgumDe(f, ids)));
}

function entra(n: No, cx: Contexto): boolean {
  if (n.visivel === false || cx.excluir?.has(n.id)) return false;
  if (cx.apenas) return n.tipo !== 'ajuste' && contemAlgumDe(n, cx.apenas);
  return true;
}

function tintaDaCamada(cx: Contexto, opacidade: number, modo: ModoDeMesclagem, filtro?: ImageFilter | null): Paint {
  const tinta = new cx.sessao.ck.Paint();
  tinta.setAlphaf(opacidade);
  cx.sessao.mesclador.aplicar(tinta, modo);
  if (filtro) tinta.setImageFilter(filtro);
  return tinta;
}

/** Desfoque da camada e sombra projetada, como filtros de imagem do Skia. */
function filtroDoNo(cx: Contexto, n: NoVisual): ImageFilter | null {
  const { ck } = cx.sessao;
  let filtro: ImageFilter | null = null;
  if (n.desfoque && n.desfoque > 0) filtro = ck.ImageFilter.MakeBlur(n.desfoque, n.desfoque, ck.TileMode.Decal, null);
  if (n.sombra) {
    const s = deslocamentoDaSombra(n.sombra);
    const comSombra = ck.ImageFilter.MakeDropShadow(s.dx, s.dy, s.sigma, s.sigma, corDoSkia(cx.sessao, n.sombra.cor, n.sombra.opacidade), filtro);
    filtro?.delete();
    filtro = comSombra;
  }
  return filtro;
}

function caixaDoGrupo(g: No): CaixaMedida | undefined {
  if (ehVisual(g)) return { x: g.x, y: g.y, w: g.largura, h: g.altura };
  if (g.tipo !== 'grupo') return undefined;
  const cs = g.filhos.map(caixaDoGrupo).filter((c): c is CaixaMedida => Boolean(c));
  if (cs.length === 0) return undefined;
  const x0 = Math.min(...cs.map((c) => c.x));
  const y0 = Math.min(...cs.map((c) => c.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
}

/** Modo com que um nó (ou a base de um conjunto de recorte) entra no que está abaixo. */
function modoDe(n: No): ModoDeMesclagem {
  if (n.tipo === 'ajuste') return 'normal';
  if (n.tipo === 'grupo') return n.modoDeMesclagem === 'atravessar' ? 'normal' : n.modoDeMesclagem;
  return n.modoDeMesclagem ?? 'normal';
}

/**
 * No raster de CPU: este nó precisa ler o pixel do que está abaixo dele? Vale para camada de ajuste,
 * modo de mesclagem não nativo e grupo que contenha um dos dois. Quem precisa não pode ficar dentro de
 * uma camada temporária do Skia (saveLayer), que não dá acesso ao pixel.
 */
function precisaDoPixel(n: No): boolean {
  if (n.visivel === false) return false;
  if (n.tipo === 'ajuste') return true;
  if (!ehModoNativo(modoDe(n))) return true;
  return n.tipo === 'grupo' && n.filhos.some(precisaDoPixel);
}

function desenharAjuste(cx: Contexto, alvo: Alvo, n: Extract<No, { tipo: 'ajuste' }>, opacidade: number): void {
  const { ck } = cx.sessao;
  const pranchetaInteira: CaixaMedida = { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura };
  const invertida = n.mascara?.tipo === 'forma' && n.mascara.inverter;
  const tinta = new ck.Paint();
  tinta.setAntiAlias(true);
  if (alvo.cpu) {
    // CPU: a cobertura (máscara recortada pela prancheta) vai para uma superfície; o laço mistura por ela
    const cobertura = alvoTemporario(cx, alvo);
    if (cobertura) {
      tinta.setColor(ck.BLACK);
      pintarCobertura(cx, cobertura.canvas, n.mascara, pranchetaInteira, tinta, invertida);
      ajustarPremultiplicado(alvo.cpu.pixels(), cobertura.cpu!.pixels(), n.ajuste, opacidade);
      cobertura.cpu!.destruir();
    }
  } else {
    // GPU: o shader do ajuste lê o que já está pintado; o que se desenha com ele é só a cobertura
    const mesclador = cx.sessao.ajustador.mesclador(n.ajuste);
    tinta.setColor(ck.Color(0, 0, 0, opacidade));
    tinta.setBlender(mesclador);
    pintarCobertura(cx, alvo.canvas, n.mascara, pranchetaInteira, tinta, invertida);
    mesclador.delete();
  }
  tinta.delete();
}

function desenharNo(cx: Contexto, alvo: Alvo, n: No, forcarNormal = false): void {
  const { ck } = cx.sessao;
  const canvas = alvo.canvas;
  const opacidade = forcarNormal ? 1 : (n.opacidade ?? 1);
  const modo = forcarNormal ? 'normal' : modoDe(n);
  const porPixel = alvo.cpu !== undefined;

  if (n.tipo === 'ajuste') {
    desenharAjuste(cx, alvo, n, opacidade);
    return;
  }

  if (n.tipo === 'grupo') {
    // atravessar sem opacidade nem máscara: os filhos compõem direto sobre o que está fora do grupo
    if (!forcarNormal && n.modoDeMesclagem === 'atravessar' && opacidade >= 1 && !n.mascara) {
      desenharLista(cx, alvo, n.filhos);
      return;
    }
    const caixa = caixaDoGrupo(n) ?? { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura };
    if (porPixel && (!ehModoNativo(modo) || n.filhos.some(precisaDoPixel))) {
      const temporario = alvoTemporario(cx, alvo);
      if (!temporario) return;
      desenharLista(cx, temporario, n.filhos);
      if (n.mascara) aplicarMascara(cx, temporario.canvas, n.mascara, caixa);
      fundir(cx, alvo, temporario, modo, opacidade);
      temporario.cpu!.destruir();
      return;
    }
    const tinta = tintaDaCamada(cx, opacidade, modo);
    canvas.saveLayer(tinta);
    desenharLista(cx, { ...alvo, cpu: undefined }, n.filhos);
    if (n.mascara) aplicarMascara(cx, canvas, n.mascara, caixa);
    canvas.restore();
    tinta.delete();
    return;
  }

  const filtro = filtroDoNo(cx, n);
  if (!n.mascara && !filtro && opacidade >= 1 && modo === 'normal') {
    desenharConteudo(cx.sessao, canvas, n);
    return;
  }
  const c = limitesDoNo(cx.sessao, n);
  if (porPixel && !ehModoNativo(modo)) {
    // CPU e modo não nativo: a camada (com sombra, desfoque e máscara) vai para uma superfície do tamanho dela
    filtro?.delete();
    const temporario = alvoTemporario(cx, alvo, c);
    if (!temporario) return;
    desenharNo(cx, temporario, n, true);
    fundir(cx, alvo, temporario, modo, opacidade);
    temporario.cpu!.destruir();
    return;
  }
  const limites = ck.XYWHRect(Math.floor(c.x), Math.floor(c.y), Math.ceil(c.w) + 1, Math.ceil(c.h) + 1);
  if (n.mascara) {
    // a máscara corta o conteúdo já com sombra e desfoque, e o modo e a opacidade valem para o resultado
    const externa = tintaDaCamada(cx, opacidade, modo);
    canvas.saveLayer(externa, limites);
    if (filtro) {
      const interna = new ck.Paint();
      interna.setImageFilter(filtro);
      canvas.saveLayer(interna, limites);
      desenharConteudo(cx.sessao, canvas, n);
      canvas.restore();
      interna.delete();
    } else desenharConteudo(cx.sessao, canvas, n);
    aplicarMascara(cx, canvas, n.mascara, { x: n.x, y: n.y, w: n.largura, h: n.altura });
    canvas.restore();
    externa.delete();
  } else {
    const tinta = tintaDaCamada(cx, opacidade, modo, filtro);
    canvas.saveLayer(tinta, limites);
    desenharConteudo(cx.sessao, canvas, n);
    canvas.restore();
    tinta.delete();
  }
  filtro?.delete();
}

function desenharLista(cx: Contexto, alvo: Alvo, lista: readonly No[]): void {
  const { ck } = cx.sessao;
  const canvas = alvo.canvas;
  for (let i = 0; i < lista.length; i++) {
    const base = lista[i]!;
    // camadas seguintes presas à base por máscara de recorte
    const presas: No[] = [];
    while (i + 1 < lista.length && lista[i + 1]!.recortadaNaDeBaixo && base.tipo !== 'ajuste') presas.push(lista[++i]!);
    if (!entra(base, cx)) continue;
    const visiveis = presas.filter((n) => entra(n, cx));
    if (visiveis.length === 0) {
      desenharNo(cx, alvo, base);
      continue;
    }
    // conjunto de recorte: base e presas compõem juntas, o alfa da base corta tudo,
    // e o modo e a opacidade da base valem para o conjunto
    const corte = new ck.Paint();
    corte.setBlendMode(ck.BlendMode.DstIn);
    if (alvo.cpu && (precisaDoPixel(base) || visiveis.some(precisaDoPixel))) {
      const soABase = alvoTemporario(cx, alvo);
      const conjunto = alvoTemporario(cx, alvo);
      if (soABase && conjunto) {
        desenharNo(cx, soABase, base, true);
        const alfaDaBase = soABase.cpu!.superficie.makeImageSnapshot();
        const umParaUm = (tinta: Paint | null): void => {
          conjunto.canvas.save();
          conjunto.canvas.concat(ck.Matrix.invert(conjunto.canvas.getTotalMatrix()) ?? ck.Matrix.identity());
          conjunto.canvas.drawImage(alfaDaBase, 0, 0, tinta);
          conjunto.canvas.restore();
        };
        umParaUm(null);
        for (const n of visiveis) desenharNo(cx, conjunto, n);
        umParaUm(corte);
        alfaDaBase.delete();
        fundir(cx, alvo, conjunto, modoDe(base), base.opacidade ?? 1);
      }
      soABase?.cpu!.destruir();
      conjunto?.cpu!.destruir();
    } else {
      const semPixel: Alvo = { ...alvo, cpu: undefined };
      const conjunto = tintaDaCamada(cx, base.opacidade ?? 1, modoDe(base));
      canvas.saveLayer(conjunto);
      desenharNo(cx, semPixel, base, true);
      for (const n of visiveis) desenharNo(cx, semPixel, n);
      canvas.saveLayer(corte);
      desenharNo(cx, semPixel, base, true);
      canvas.restore();
      canvas.restore();
      conjunto.delete();
    }
    corte.delete();
  }
}

function desenharNoAlvo(sessao: Sessao, alvo: Alvo, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho): void {
  const { ck } = sessao;
  const cx: Contexto = { sessao, p, apenas: opcoes.apenas, excluir: opcoes.excluir, semRecorte: opcoes.semRecorte === true };
  alvo.canvas.save();
  if (!cx.semRecorte) alvo.canvas.clipRect(ck.XYWHRect(0, 0, p.largura, p.altura), ck.ClipOp.Intersect, false);
  if (opcoes.fundo !== false && !opcoes.apenas) {
    const fundo = new ck.Paint();
    fundo.setColor(corDoSkia(sessao, p.fundo));
    alvo.canvas.drawPaint(fundo);
    fundo.delete();
  }
  desenharLista(cx, alvo, nos);
  alvo.canvas.restore();
}

/**
 * Desenha a prancheta na origem do canvas, em unidades do documento, com modo não nativo e ajuste por shader.
 * Serve para qualquer canvas; é o caminho da GPU. Quem chama aplica escala e câmera.
 */
export function desenharPrancheta(sessao: Sessao, canvas: Canvas, p: Prancheta, opcoes: OpcoesDeDesenho = {}): void {
  desenharNos(sessao, canvas, p, p.filhos, opcoes);
}

/** Como desenharPrancheta, mas com uma lista de nós do nível de cima: é o que as fatias do editor usam. */
export function desenharNos(sessao: Sessao, canvas: Canvas, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho = {}): void {
  desenharNoAlvo(sessao, { canvas, cpu: undefined, x: 0, y: 0 }, p, nos, opcoes);
}

/** Desenha numa superfície de CPU com o cálculo por laço de pixel. A transformação já deve estar no canvas dela. */
export function desenharNosEmCpu(sessao: Sessao, cpu: SuperficieDeCpu, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho = {}): void {
  desenharNoAlvo(sessao, { canvas: cpu.superficie.getCanvas(), cpu, x: 0, y: 0 }, p, nos, opcoes);
}

/** Renderiza em raster de CPU e devolve os pixels. É o caminho do servidor e o que a paridade compara. */
export function renderizarPrancheta(sessao: Sessao, p: Prancheta, opcoes: OpcoesDeRender = {}): RenderEmPixels {
  const { ck } = sessao;
  const escala = opcoes.escala ?? 1;
  const regiao = opcoes.regiao ?? { x: 0, y: 0, w: p.largura, h: p.altura };
  const largura = Math.max(1, Math.round(regiao.w * escala));
  const altura = Math.max(1, Math.round(regiao.h * escala));
  const cpu = criarSuperficieDeCpu(sessao, largura, altura);
  try {
    const canvas = cpu.superficie.getCanvas();
    canvas.scale(escala, escala);
    canvas.translate(-regiao.x, -regiao.y);
    if ((opcoes.calculo ?? 'pixel') === 'pixel') desenharNosEmCpu(sessao, cpu, p, p.filhos, opcoes);
    else desenharNos(sessao, canvas, p, p.filhos, opcoes);
    const rgba = canvas.readPixels(0, 0, { width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array | null;
    if (!rgba) throw new Error('O motor não devolveu os pixels da superfície');
    return { largura, altura, rgba };
  } finally {
    cpu.destruir();
  }
}
