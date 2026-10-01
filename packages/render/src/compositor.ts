// Compositor: transforma uma prancheta em desenho sobre um Canvas do Skia. O mesmo código roda no navegador e no Node.
//
// Dois caminhos, uma fórmula:
// - render de referência (CPU): renderizarPrancheta. É o que o agente vê, o lint mede, a exportação grava e os goldens
//   comparam. Modo de mesclagem não nativo e camada de ajuste saem por laço de pixel (pixel.ts);
// - prévia do editor (GPU): desenharPrancheta sobre um canvas WebGL. Os mesmos dois recursos saem por shader.
// O resto (forma, texto, imagem, máscara, sombra, desfoque, modo nativo) é o mesmo desenho do Skia nos dois.
import {
  type Caixa,
  type Degrade,
  type Documento,
  ehVisual,
  girarCaixa,
  type Mascara,
  type ModoDeMesclagem,
  type No,
  type NoAjuste,
  type NoImagem,
  type NoVisual,
  type Prancheta,
  type Preenchimento,
  resolverCor,
  todasAsCamadas,
} from '@otto/documento';
import type { Canvas, ImageFilter, Paint, Path, Shader, Surface } from 'canvaskit-wasm';
import type { AjusteResolvido } from './ajustes';
import { filtroDeCorDaFoto } from './foto';
import { ehModoNativo } from './mesclagem';
import { ajustarPremultiplicado, mesclarPremultiplicado } from './pixel';
import type { Sessao } from './sessao';

export { referenciaDeAjusteDeCor } from './foto';

export interface OpcoesDeDesenho {
  /** Desenha só estes nós, sem fundo. É o pixel de cada camada do PSD. */
  apenas?: ReadonlySet<string>;
  /** Pula estes nós. O lint usa para medir o que está atrás de um texto. */
  excluir?: ReadonlySet<string>;
  fundo?: boolean;
  /** Não recorta pela prancheta. O cache da camada arrastada usa: ela pode estar em parte fora e entrar ao mover. */
  semRecorte?: boolean;
}

export interface OpcoesDeRender extends OpcoesDeDesenho {
  escala?: number;
  /** Recorte em unidades da prancheta. Sem ele, a prancheta inteira. */
  regiao?: Caixa;
  /**
   * Como calcular modo de mesclagem não nativo e camada de ajuste no raster de CPU.
   * 'pixel' (padrão) é o laço em TypeScript, e é o render de referência. 'shader' é o que a GPU faz, rodado em CPU:
   * de 10 a 150 vezes mais lento, e existe para os testes prenderem os dois à mesma fórmula.
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
 * Limite de área de uma superfície. O WebAssembly é de 32 bits e cada superfície RGBA é um bloco contíguo
 * na memória dele; o pico medido é de cerca de 16 bytes por pixel. Acima disso se renderiza por região.
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
  doc: Documento;
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
  // "desfoque" é o tamanho da sombra do Photoshop; o desvio padrão é a metade
  return { dx: -Math.cos(a) * s.distancia, dy: Math.sin(a) * s.distancia, sigma: s.desfoque / 2 };
}

/** Desvio padrão do desfoque gaussiano da camada: a soma dos filtros de desfoque dela. */
function desfoqueDoNo(n: NoVisual): number {
  const raios = (n.filtros ?? []).flatMap((f) => (f.tipo === 'desfoque' ? [f.raio] : []));
  return Math.sqrt(raios.reduce((soma, r) => soma + r * r, 0));
}

/** Caixa que contém tudo o que o nó pinta, com rotação, sombra e desfoque. Limita o tamanho da camada temporária. */
export function limitesDoNo(sessao: Sessao, n: NoVisual): Caixa {
  let c: Caixa = { x: n.x, y: n.y, w: n.largura, h: n.altura };
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
    const folga = maior * Math.max(n.largura / n.moldura[0], n.altura / n.moldura[1]);
    c = { x: c.x - folga, y: c.y - folga, w: c.w + 2 * folga, h: c.h + 2 * folga };
  }
  c = girarCaixa(c, n.x + n.largura / 2, n.y + n.altura / 2, n.rotacao);
  const borrao = desfoqueDoNo(n) * 3;
  let esq = 1 + borrao;
  let topo = 1 + borrao;
  let dir = 1 + borrao;
  let base = 1 + borrao;
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

function rgb(cor: string): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function corDoSkia(cx: Pick<Contexto, 'sessao' | 'doc'>, cor: string, alfa = 1): Float32Array {
  const [r, g, b] = rgb(resolverCor(cx.doc, cor));
  return cx.sessao.ck.Color(r, g, b, alfa);
}

function shaderDoDegrade(cx: Contexto, d: Degrade, x: number, y: number, w: number, h: number): Shader {
  const { ck } = cx.sessao;
  const paradas = [...d.paradas].sort((a, b) => a.posicao - b.posicao);
  const cores = paradas.map((p) => corDoSkia(cx, p.cor, p.opacidade));
  const posicoes = paradas.map((p) => p.posicao);
  if (d.tipo === 'radial') return ck.Shader.MakeRadialGradient([x + w / 2, y + h / 2], Math.max(w, h) / 2, cores, posicoes, ck.TileMode.Clamp);
  const e = extremosDoDegrade(d.angulo, x, y, w, h);
  return ck.Shader.MakeLinearGradient([e.x0, e.y0], [e.x1, e.y1], cores, posicoes, ck.TileMode.Clamp);
}

/** Tinta de preenchimento. Devolve também o shader, para quem chama apagar. */
function tintaDoPreenchimento(cx: Contexto, p: Preenchimento, x: number, y: number, w: number, h: number): { tinta: Paint; shader: Shader | undefined } {
  const tinta = new cx.sessao.ck.Paint();
  tinta.setAntiAlias(true);
  if (typeof p === 'string') {
    tinta.setColor(corDoSkia(cx, p));
    return { tinta, shader: undefined };
  }
  const shader = shaderDoDegrade(cx, p, x, y, w, h);
  tinta.setShader(shader);
  return { tinta, shader };
}

/** Caminho da forma. Com "inverso", é tudo menos a forma: a forma dentro de um retângulo, com regra par-ímpar. */
function caminhoDaForma(sessao: Sessao, forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number, inverso?: Caixa): Path {
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

function desenharImagem(cx: Contexto, canvas: Canvas, no: NoImagem): void {
  const { ck } = cx.sessao;
  const img = cx.sessao.imagem(no.arquivo);
  const tinta = new ck.Paint();
  tinta.setAntiAlias(true);
  if (!img) {
    // arquivo não entregue: retângulo cinza. Quem avisa é recursosEmFalta.
    tinta.setColor(ck.Color(138, 138, 138, 1));
    canvas.drawRect(ck.XYWHRect(no.x, no.y, no.largura, no.altura), tinta);
    tinta.delete();
    return;
  }
  // a dimensão real do arquivo manda; a declarada no nó pode estar errada
  const e = enquadrar(img.width(), img.height(), no.x, no.y, no.largura, no.altura, no.ajuste, no.foco, no.zoom);
  const a = no.ajusteDeCor;
  const filtroDeCor = filtroDeCorDaFoto(
    ck,
    a
      ? {
          brilho: a.brilho,
          contraste: a.contraste,
          saturacao: a.saturacao,
          ...(a.duotone ? { duotone: { sombras: resolverCor(cx.doc, a.duotone.sombras), luzes: resolverCor(cx.doc, a.duotone.luzes) } } : {}),
        }
      : undefined,
  );
  if (filtroDeCor) tinta.setColorFilter(filtroDeCor);
  canvas.save();
  if (no.recorte) {
    const caminho = caminhoDaForma(cx.sessao, no.recorte.forma, no.x, no.y, no.largura, no.altura, no.recorte.raio);
    canvas.clipPath(caminho, ck.ClipOp.Intersect, true);
    caminho.delete();
  }
  canvas.drawImageRectOptions(img, ck.XYWHRect(e.sx, e.sy, e.sw, e.sh), ck.XYWHRect(e.dx, e.dy, e.dw, e.dh), ck.FilterMode.Linear, ck.MipmapMode.Nearest, tinta);
  canvas.restore();
  filtroDeCor?.delete();
  tinta.delete();
}

function desenharConteudo(cx: Contexto, canvas: Canvas, no: NoVisual): void {
  const { ck } = cx.sessao;
  canvas.save();
  if (no.rotacao) canvas.rotate(no.rotacao, no.x + no.largura / 2, no.y + no.altura / 2);
  switch (no.tipo) {
    case 'forma': {
      const caminho = caminhoDaForma(cx.sessao, no.forma, no.x, no.y, no.largura, no.altura, no.raio);
      const { tinta, shader } = tintaDoPreenchimento(cx, no.preenchimento, no.x, no.y, no.largura, no.altura);
      canvas.drawPath(caminho, tinta);
      if (no.traco) {
        // contorno interno: recorta pela forma e traça com o dobro da espessura
        const traco = new ck.Paint();
        traco.setAntiAlias(true);
        traco.setStyle(ck.PaintStyle.Stroke);
        traco.setStrokeWidth(no.traco.espessura * 2);
        traco.setColor(corDoSkia(cx, no.traco.cor));
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
      desenharImagem(cx, canvas, no);
      break;
    case 'texto':
      cx.sessao.texto.desenhar(canvas, no, (c) => resolverCor(cx.doc, c));
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
          tinta.setColor(corDoSkia(cx, c.preenchimento));
          canvas.drawPath(caminho, tinta);
        }
        if (c.traco) {
          tinta.setStyle(ck.PaintStyle.Stroke);
          tinta.setStrokeWidth(c.traco.espessura);
          tinta.setStrokeCap({ reta: ck.StrokeCap.Butt, redonda: ck.StrokeCap.Round, quadrada: ck.StrokeCap.Square }[c.traco.ponta]);
          tinta.setStrokeJoin({ angular: ck.StrokeJoin.Miter, redonda: ck.StrokeJoin.Round, chanfrada: ck.StrokeJoin.Bevel }[c.traco.juncao]);
          tinta.setColor(corDoSkia(cx, c.traco.cor));
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

type MascaraDeDegrade = Extract<Mascara, { tipo: 'degrade' }>;

function shaderDaMascaraEmDegrade(sessao: Sessao, m: MascaraDeDegrade, caixa: Caixa): Shader {
  const { ck } = sessao;
  const e = extremosDoDegrade(m.angulo, caixa.x, caixa.y, caixa.w, caixa.h);
  const [a, b] = m.inicio <= m.fim ? [m.inicio, m.fim] : [m.fim, m.inicio];
  const opacoPrimeiro = m.inicio <= m.fim;
  const cheio = ck.Color(0, 0, 0, 1);
  const vazio = ck.Color(0, 0, 0, 0);
  const cores = opacoPrimeiro ? [cheio, cheio, vazio, vazio] : [vazio, vazio, cheio, cheio];
  return ck.Shader.MakeLinearGradient([e.x0, e.y0], [e.x1, e.y1], cores, [0, a, Math.max(a + 0.0001, b), 1], ck.TileMode.Clamp);
}

/** Máscaras que o motor desenha. A de sujeito (recorte da foto) ainda não: a camada sai sem máscara. */
const mascaraDesenhada = (m: Mascara | undefined): Exclude<Mascara, { tipo: 'sujeito' }> | undefined => (m && m.tipo !== 'sujeito' ? m : undefined);

/**
 * Pinta a cobertura da máscara com a tinta dada. A tinta decide o efeito: preto comum dentro de uma camada
 * "destino dentro" corta a camada; com o shader de um ajuste, limita o ajuste à máscara.
 */
function pintarCobertura(cx: Contexto, canvas: Canvas, m: Exclude<Mascara, { tipo: 'sujeito' }> | undefined, caixa: Caixa, tinta: Paint, inverter: boolean): void {
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
function aplicarMascara(cx: Contexto, canvas: Canvas, m: Exclude<Mascara, { tipo: 'sujeito' }>, caixa: Caixa): void {
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
  const superficie = ck.MakeRasterDirectSurface(
    { width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Premul, colorSpace: ck.ColorSpace.SRGB },
    memoria,
    largura * 4,
  );
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
function alvoTemporario(cx: Contexto, alvo: Alvo, regiao?: Caixa): (Alvo & { cpu: SuperficieDeCpu }) | undefined {
  const { ck } = cx.sessao;
  const base = alvo.cpu as SuperficieDeCpu;
  const matriz = alvo.canvas.getTotalMatrix();
  let x0 = 0;
  let y0 = 0;
  let x1 = base.largura;
  let y1 = base.altura;
  if (regiao) {
    const cantos = ck.Matrix.mapPoints(matriz, [regiao.x, regiao.y, regiao.x + regiao.w, regiao.y, regiao.x + regiao.w, regiao.y + regiao.h, regiao.x, regiao.y + regiao.h]);
    const xs = [0, 2, 4, 6].map((i) => cantos[i] as number);
    const ys = [1, 3, 5, 7].map((i) => cantos[i] as number);
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
function fundir(cx: Contexto, alvo: Alvo, temporario: Alvo & { cpu: SuperficieDeCpu }, modo: ModoDeMesclagem, opacidade: number): void {
  const { ck } = cx.sessao;
  const origem = temporario.cpu;
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
  const destino = alvo.cpu as SuperficieDeCpu;
  mesclarPremultiplicado(destino.pixels(), destino.largura, temporario.x, temporario.y, origem.pixels(), origem.largura, origem.altura, modo, opacidade);
}

// ---------- composição ----------

function contemAlgumDe(n: No, ids: ReadonlySet<string>): boolean {
  return ids.has(n.id) || (n.tipo === 'grupo' && n.filhos.some((f) => contemAlgumDe(f, ids)));
}

function entra(n: No, cx: Contexto): boolean {
  if (!n.visivel || cx.excluir?.has(n.id)) return false;
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
  const sigma = desfoqueDoNo(n);
  if (sigma > 0) filtro = ck.ImageFilter.MakeBlur(sigma, sigma, ck.TileMode.Decal, null);
  if (n.sombra) {
    const s = deslocamentoDaSombra(n.sombra);
    const comSombra = ck.ImageFilter.MakeDropShadow(s.dx, s.dy, s.sigma, s.sigma, corDoSkia(cx, n.sombra.cor, n.sombra.opacidade), filtro);
    filtro?.delete();
    filtro = comSombra;
  }
  return filtro;
}

function caixaDoGrupo(g: No): Caixa | undefined {
  if (ehVisual(g)) return { x: g.x, y: g.y, w: g.largura, h: g.altura };
  if (g.tipo !== 'grupo') return undefined;
  const cs = g.filhos.map(caixaDoGrupo).filter((c): c is Caixa => Boolean(c));
  if (cs.length === 0) return undefined;
  const x0 = Math.min(...cs.map((c) => c.x));
  const y0 = Math.min(...cs.map((c) => c.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
}

/** Modo com que um nó (ou a base de um conjunto de recorte) entra no que está abaixo. */
export function modoDe(n: No): ModoDeMesclagem {
  // camada de ajuste com modo próprio ainda não é desenhada com o modo: entra como normal (ver naoDesenhado)
  if (n.tipo === 'ajuste') return 'normal';
  if (n.tipo === 'grupo') return n.modoDeMesclagem === 'atravessar' ? 'normal' : n.modoDeMesclagem;
  return n.modoDeMesclagem;
}

/**
 * No raster de CPU: este nó precisa ler o pixel do que está abaixo dele? Vale para camada de ajuste,
 * modo de mesclagem não nativo e grupo que contenha um dos dois. Quem precisa não pode ficar dentro de
 * uma camada temporária do Skia (saveLayer), que não dá acesso ao pixel.
 */
function precisaDoPixel(n: No): boolean {
  if (!n.visivel) return false;
  if (n.tipo === 'ajuste') return true;
  if (!ehModoNativo(modoDe(n))) return true;
  return n.tipo === 'grupo' && n.filhos.some(precisaDoPixel);
}

/** O ajuste com as cores de token resolvidas. */
function ajusteResolvido(doc: Documento, n: NoAjuste): AjusteResolvido {
  const a = n.ajuste;
  if (a.tipo === 'filtro-de-foto') return { ...a, cor: resolverCor(doc, a.cor) };
  if (a.tipo === 'mapa-de-degrade') return { ...a, paradas: a.paradas.map((p) => ({ ...p, cor: resolverCor(doc, p.cor) })) };
  return a;
}

function desenharAjuste(cx: Contexto, alvo: Alvo, n: NoAjuste, opacidade: number): void {
  const { ck } = cx.sessao;
  const pranchetaInteira: Caixa = { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura };
  const mascara = mascaraDesenhada(n.mascara);
  const invertida = mascara?.tipo === 'forma' && mascara.inverter;
  const ajuste = ajusteResolvido(cx.doc, n);
  const tinta = new ck.Paint();
  tinta.setAntiAlias(true);
  if (alvo.cpu) {
    // CPU: a cobertura (máscara recortada pela prancheta) vai para uma superfície; o laço mistura por ela
    const cobertura = alvoTemporario(cx, alvo);
    if (cobertura) {
      tinta.setColor(ck.BLACK);
      pintarCobertura(cx, cobertura.canvas, mascara, pranchetaInteira, tinta, invertida);
      ajustarPremultiplicado(alvo.cpu.pixels(), cobertura.cpu.pixels(), ajuste, opacidade);
      cobertura.cpu.destruir();
    }
  } else {
    // GPU: o shader do ajuste lê o que já está pintado; o que se desenha com ele é só a cobertura
    const mesclador = cx.sessao.ajustador.mesclador(ajuste);
    tinta.setColor(ck.Color(0, 0, 0, opacidade));
    tinta.setBlender(mesclador);
    pintarCobertura(cx, alvo.canvas, mascara, pranchetaInteira, tinta, invertida);
    mesclador.delete();
  }
  tinta.delete();
}

function desenharNo(cx: Contexto, alvo: Alvo, n: No, forcarNormal = false): void {
  const { ck } = cx.sessao;
  const canvas = alvo.canvas;
  const opacidade = forcarNormal ? 1 : n.opacidade;
  const modo = forcarNormal ? 'normal' : modoDe(n);
  const porPixel = alvo.cpu !== undefined;
  const mascara = mascaraDesenhada(n.mascara);

  if (n.tipo === 'ajuste') {
    desenharAjuste(cx, alvo, n, opacidade);
    return;
  }

  if (n.tipo === 'grupo') {
    // atravessar sem opacidade nem máscara: os filhos compõem direto sobre o que está fora do grupo
    if (!forcarNormal && n.modoDeMesclagem === 'atravessar' && opacidade >= 1 && !mascara) {
      desenharLista(cx, alvo, n.filhos);
      return;
    }
    const caixa = caixaDoGrupo(n) ?? { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura };
    if (porPixel && (!ehModoNativo(modo) || n.filhos.some(precisaDoPixel))) {
      const temporario = alvoTemporario(cx, alvo);
      if (!temporario) return;
      desenharLista(cx, temporario, n.filhos);
      if (mascara) aplicarMascara(cx, temporario.canvas, mascara, caixa);
      fundir(cx, alvo, temporario, modo, opacidade);
      temporario.cpu.destruir();
      return;
    }
    const tinta = tintaDaCamada(cx, opacidade, modo);
    canvas.saveLayer(tinta);
    desenharLista(cx, { ...alvo, cpu: undefined }, n.filhos);
    if (mascara) aplicarMascara(cx, canvas, mascara, caixa);
    canvas.restore();
    tinta.delete();
    return;
  }

  const filtro = filtroDoNo(cx, n);
  if (!mascara && !filtro && opacidade >= 1 && modo === 'normal') {
    desenharConteudo(cx, canvas, n);
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
    temporario.cpu.destruir();
    return;
  }
  const limites = ck.XYWHRect(Math.floor(c.x), Math.floor(c.y), Math.ceil(c.w) + 1, Math.ceil(c.h) + 1);
  if (mascara) {
    // a máscara corta o conteúdo já com sombra e desfoque, e o modo e a opacidade valem para o resultado
    const externa = tintaDaCamada(cx, opacidade, modo);
    canvas.saveLayer(externa, limites);
    if (filtro) {
      const interna = new ck.Paint();
      interna.setImageFilter(filtro);
      canvas.saveLayer(interna, limites);
      desenharConteudo(cx, canvas, n);
      canvas.restore();
      interna.delete();
    } else desenharConteudo(cx, canvas, n);
    aplicarMascara(cx, canvas, mascara, { x: n.x, y: n.y, w: n.largura, h: n.altura });
    canvas.restore();
    externa.delete();
  } else {
    const tinta = tintaDaCamada(cx, opacidade, modo, filtro);
    canvas.saveLayer(tinta, limites);
    desenharConteudo(cx, canvas, n);
    canvas.restore();
    tinta.delete();
  }
  filtro?.delete();
}

function desenharLista(cx: Contexto, alvo: Alvo, lista: readonly No[]): void {
  const { ck } = cx.sessao;
  const canvas = alvo.canvas;
  for (let i = 0; i < lista.length; i++) {
    const base = lista[i] as No;
    // camadas seguintes presas à base por máscara de recorte
    const presas: No[] = [];
    while (i + 1 < lista.length && (lista[i + 1] as No).recortadaNaDeBaixo && base.tipo !== 'ajuste') presas.push(lista[++i] as No);
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
        const alfaDaBase = soABase.cpu.superficie.makeImageSnapshot();
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
        fundir(cx, alvo, conjunto, modoDe(base), base.opacidade);
      }
      soABase?.cpu.destruir();
      conjunto?.cpu.destruir();
    } else {
      const semPixel: Alvo = { ...alvo, cpu: undefined };
      const conjunto = tintaDaCamada(cx, base.opacidade, modoDe(base));
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

function desenharNoAlvo(sessao: Sessao, alvo: Alvo, doc: Documento, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho): void {
  const { ck } = sessao;
  const cx: Contexto = { sessao, doc, p, apenas: opcoes.apenas, excluir: opcoes.excluir, semRecorte: opcoes.semRecorte === true };
  alvo.canvas.save();
  if (!cx.semRecorte) alvo.canvas.clipRect(ck.XYWHRect(0, 0, p.largura, p.altura), ck.ClipOp.Intersect, false);
  if (opcoes.fundo !== false && !opcoes.apenas) {
    const fundo = new ck.Paint();
    fundo.setColor(corDoSkia(cx, p.fundo));
    alvo.canvas.drawPaint(fundo);
    fundo.delete();
  }
  desenharLista(cx, alvo, nos);
  alvo.canvas.restore();
}

/**
 * Desenha a prancheta na origem do canvas, em unidades do documento, com modo não nativo e ajuste por shader.
 * Serve para qualquer canvas; é o caminho da GPU (prévia do editor). Quem chama aplica escala e câmera.
 */
export function desenharPrancheta(sessao: Sessao, canvas: Canvas, doc: Documento, p: Prancheta, opcoes: OpcoesDeDesenho = {}): void {
  desenharNos(sessao, canvas, doc, p, p.filhos, opcoes);
}

/** Como desenharPrancheta, mas com uma lista de nós do nível de cima: é o que as partes do cache do editor usam. */
export function desenharNos(sessao: Sessao, canvas: Canvas, doc: Documento, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho = {}): void {
  desenharNoAlvo(sessao, { canvas, cpu: undefined, x: 0, y: 0 }, doc, p, nos, opcoes);
}

/** Desenha numa superfície de CPU com o cálculo por laço de pixel. A transformação já deve estar no canvas dela. */
export function desenharNosEmCpu(sessao: Sessao, cpu: SuperficieDeCpu, doc: Documento, p: Prancheta, nos: readonly No[], opcoes: OpcoesDeDesenho = {}): void {
  desenharNoAlvo(sessao, { canvas: cpu.superficie.getCanvas(), cpu, x: 0, y: 0 }, doc, p, nos, opcoes);
}

/** O render de referência: raster de CPU, com os pixels de volta. Mesmo documento, mesmas fontes, mesma versão do motor: mesmos bytes. */
export function renderizarPrancheta(sessao: Sessao, doc: Documento, p: Prancheta, opcoes: OpcoesDeRender = {}): RenderEmPixels {
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
    if ((opcoes.calculo ?? 'pixel') === 'pixel') desenharNosEmCpu(sessao, cpu, doc, p, p.filhos, opcoes);
    else desenharNos(sessao, canvas, doc, p, p.filhos, opcoes);
    const rgba = canvas.readPixels(0, 0, { width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array | null;
    if (!rgba) throw new Error('O motor não devolveu os pixels da superfície');
    return { largura, altura, rgba };
  } finally {
    cpu.destruir();
  }
}

// ---------- o que falta ao motor, dito pelo próprio motor ----------

export interface RecursosEmFalta {
  fontes: { familia: string; peso: number; camadas: string[] }[];
  imagens: { arquivo: string; camadas: string[] }[];
}

/**
 * Fontes e imagens que o documento usa e que não foram entregues à sessão. O motor não substitui fonte:
 * o texto com fonte em falta não é desenhado, e a imagem em falta vira um retângulo cinza. Quem chama avisa a pessoa.
 */
export function recursosEmFalta(sessao: Sessao, doc: Documento): RecursosEmFalta {
  const fontes = new Map<string, { familia: string; peso: number; camadas: string[] }>();
  const imagens = new Map<string, { arquivo: string; camadas: string[] }>();
  for (const p of doc.pranchetas) {
    for (const n of todasAsCamadas(p.filhos)) {
      const camada = `${p.nome}/${n.nome}`;
      if (n.tipo === 'texto') {
        for (const { fonte, peso } of [{ fonte: n.fonte, peso: n.peso }, ...(n.trechos ?? []).map((t) => ({ fonte: t.fonte ?? n.fonte, peso: t.peso ?? n.peso }))]) {
          if (sessao.texto.tem(fonte)) continue;
          const chave = `${fonte}#${peso}`;
          const item = fontes.get(chave) ?? { familia: fonte, peso, camadas: [] };
          if (!item.camadas.includes(camada)) item.camadas.push(camada);
          fontes.set(chave, item);
        }
      }
      const arquivos = [...(n.tipo === 'imagem' ? [n.arquivo] : []), ...(n.mascara?.tipo === 'sujeito' ? [n.mascara.arquivo] : [])];
      for (const arquivo of arquivos) {
        if (sessao.imagem(arquivo)) continue;
        const item = imagens.get(arquivo) ?? { arquivo, camadas: [] };
        if (!item.camadas.includes(camada)) item.camadas.push(camada);
        imagens.set(arquivo, item);
      }
    }
  }
  return { fontes: [...fontes.values()], imagens: [...imagens.values()] };
}

export interface RecursoNaoDesenhado {
  /** "Prancheta/Camada" */
  camada: string;
  no: string;
  /** o que o esquema aceita e este motor ainda não desenha */
  recurso: 'efeitos de camada' | 'desfoque de movimento' | 'ruído' | 'nitidez' | 'máscara de sujeito' | 'modo de mesclagem em camada de ajuste';
}

/**
 * O que o documento usa e este motor ainda não desenha (a camada sai sem o recurso). É a lista viva da distância
 * até o motor da POC: quando ela devolver vazio para todo documento válido, o porte acabou.
 */
export function naoDesenhado(doc: Documento): RecursoNaoDesenhado[] {
  const lista: RecursoNaoDesenhado[] = [];
  for (const p of doc.pranchetas) {
    for (const n of todasAsCamadas(p.filhos)) {
      const add = (recurso: RecursoNaoDesenhado['recurso']) => lista.push({ camada: `${p.nome}/${n.nome}`, no: n.id, recurso });
      if (n.mascara?.tipo === 'sujeito') add('máscara de sujeito');
      if (n.tipo === 'ajuste' && n.modoDeMesclagem !== 'normal') add('modo de mesclagem em camada de ajuste');
      if (!ehVisual(n)) continue;
      if (n.efeitos && Object.values(n.efeitos).some(Boolean)) add('efeitos de camada');
      for (const f of n.filtros ?? []) {
        if (f.tipo === 'desfoque-de-movimento') add('desfoque de movimento');
        if (f.tipo === 'ruido') add('ruído');
        if (f.tipo === 'nitidez') add('nitidez');
      }
    }
  }
  return lista;
}
