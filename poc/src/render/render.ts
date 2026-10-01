// Motor de render único da POC: o mesmo código desenha no editor (navegador),
// no servidor (render para o agente conferir) e no pixel de cada camada do PSD.
import { type Ajuste, type Documento, ehVisual, type Filtro, type Mascara, type ModoDeMesclagem, type ModoDoGrupo, type No, type NoImagem, type NoVetor, type NoVisual, type Prancheta, type Preenchimento, resolverCor } from '../documento/esquema';
import { type AjusteDeCor, aplicarAjusteDeCor, ajusteNeutro } from './ajustes';
import { adicionarRuido, type AjusteResolvido, aplicarCamadaDeAjuste, desfoqueDeMovimento, desfoqueGaussiano, MESCLAGEM_NATIVA, mascaraDeNitidez, mesclarPixels, sementeDe } from './pixel';
import { desenharTexto } from './texto';

export { diagramarTexto, fonteCss, textoExibido, type LinhaDiagramada, type TextoDiagramado, type Caixa } from './texto';

/** Recorte da API Canvas 2D usado aqui. Navegador e @napi-rs/canvas atendem. */
export type Ctx = CanvasRenderingContext2D;
/** Imagem já decodificada, por hash de conteúdo. */
export type FonteDeImagens = (hash: string) => CanvasImageSource | undefined;

export interface OpcoesDeRender {
  escala?: number;
  /** Desenha só estes nós (sem fundo). Usado para o pixel de cada camada do PSD. */
  apenas?: ReadonlySet<string>;
  /** Pula estes nós. Usado para medir o fundo atrás de um texto. */
  excluir?: ReadonlySet<string>;
  fundo?: boolean;
  /** Cria um canvas fora da tela. Sem ele, o render é simplificado (sem máscara, ajuste nem modo não nativo). */
  criarCanvas?: (largura: number, altura: number) => HTMLCanvasElement;
}

interface Superficie {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  /** pixels por unidade do documento */
  escala: number;
  w: number;
  h: number;
}

interface Contexto {
  doc: Documento;
  p: Prancheta;
  imagens: FonteDeImagens;
  criar: NonNullable<OpcoesDeRender['criarCanvas']>;
  apenas?: ReadonlySet<string> | undefined;
  excluir?: ReadonlySet<string> | undefined;
  escala: number;
}

function novaSuperficie(cx: Contexto): Superficie {
  const w = Math.max(1, Math.ceil(cx.p.largura * cx.escala));
  const h = Math.max(1, Math.ceil(cx.p.altura * cx.escala));
  const canvas = cx.criar(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(cx.escala, 0, 0, cx.escala, 0, 0);
  return { canvas, ctx, escala: cx.escala, w, h };
}

/** Desenha uma superfície sobre outra, em pixel de dispositivo. */
function pintar(destino: Superficie, origem: Superficie, gco: GlobalCompositeOperation = 'source-over', alfa = 1): void {
  destino.ctx.save();
  destino.ctx.setTransform(1, 0, 0, 1, 0, 0);
  destino.ctx.globalAlpha = alfa;
  destino.ctx.globalCompositeOperation = gco;
  destino.ctx.drawImage(origem.canvas as unknown as CanvasImageSource, 0, 0);
  destino.ctx.restore();
}

/** Mescla "cima" sobre "fundo" com o modo do Photoshop (nativo quando dá; em pixel quando não). */
function mesclar(fundo: Superficie, cima: Superficie, modo: ModoDeMesclagem | ModoDoGrupo, opacidade: number): void {
  const m: ModoDeMesclagem = modo === 'atravessar' ? 'normal' : modo;
  const nativo = MESCLAGEM_NATIVA[m];
  if (nativo) return pintar(fundo, cima, nativo, opacidade);
  const f = fundo.ctx.getImageData(0, 0, fundo.w, fundo.h);
  const c = cima.ctx.getImageData(0, 0, cima.w, cima.h);
  mesclarPixels(f.data, c.data, m, opacidade);
  fundo.ctx.putImageData(f, 0, 0);
}

export function renderizarPrancheta(ctx: Ctx, doc: Documento, prancheta: Prancheta, imagens: FonteDeImagens, opcoes: OpcoesDeRender = {}): void {
  const escala = opcoes.escala ?? 1;
  if (!opcoes.criarCanvas) return renderizarSimples(ctx, doc, prancheta, imagens, opcoes);
  // compõe numa superfície na resolução de saída (a escala corrente inclui zoom do editor e densidade da tela)
  const cx: Contexto = { doc, p: prancheta, imagens, criar: opcoes.criarCanvas, apenas: opcoes.apenas, excluir: opcoes.excluir, escala: Math.max(0.02, escalaCorrente(ctx) * escala) };
  const sup = novaSuperficie(cx);
  if (opcoes.fundo !== false && !opcoes.apenas) {
    sup.ctx.fillStyle = resolverCor(doc, prancheta.fundo);
    sup.ctx.fillRect(0, 0, prancheta.largura, prancheta.altura);
  }
  comporLista(sup, prancheta.filhos, cx);
  ctx.save();
  ctx.scale(escala, escala);
  ctx.drawImage(sup.canvas as unknown as CanvasImageSource, 0, 0, prancheta.largura, prancheta.altura);
  ctx.restore();
}

/** Sem canvas fora da tela: só camadas visuais, modos nativos, sem máscara nem ajuste. */
function renderizarSimples(ctx: Ctx, doc: Documento, p: Prancheta, imagens: FonteDeImagens, opcoes: OpcoesDeRender): void {
  const escala = opcoes.escala ?? 1;
  ctx.save();
  ctx.scale(escala, escala);
  if (opcoes.fundo !== false && !opcoes.apenas) {
    ctx.fillStyle = resolverCor(doc, p.fundo);
    ctx.fillRect(0, 0, p.largura, p.altura);
  }
  ctx.beginPath();
  ctx.rect(0, 0, p.largura, p.altura);
  ctx.clip();
  const percorrer = (lista: readonly No[]) => {
    for (const n of lista) {
      if (!n.visivel || opcoes.excluir?.has(n.id)) continue;
      if (n.tipo === 'grupo') {
        percorrer(n.filhos);
        continue;
      }
      if (!ehVisual(n) || (opcoes.apenas && !opcoes.apenas.has(n.id))) continue;
      ctx.save();
      ctx.globalAlpha = n.opacidade;
      ctx.globalCompositeOperation = MESCLAGEM_NATIVA[n.modoDeMesclagem] ?? 'source-over';
      if (n.sombra) aplicarSombra(ctx, doc, n.sombra);
      desenharVisual(ctx, doc, n, imagens);
      ctx.restore();
    }
  };
  percorrer(p.filhos);
  ctx.restore();
}

function contemAlgumDe(n: No, ids: ReadonlySet<string>): boolean {
  return ids.has(n.id) || (n.tipo === 'grupo' && n.filhos.some((f) => contemAlgumDe(f, ids)));
}

function entra(n: No, cx: Contexto): boolean {
  if (!n.visivel || cx.excluir?.has(n.id)) return false;
  if (cx.apenas) return n.tipo !== 'ajuste' && contemAlgumDe(n, cx.apenas);
  return true;
}

function comporLista(sup: Superficie, lista: readonly No[], cx: Contexto): void {
  for (let i = 0; i < lista.length; i++) {
    const base = lista[i]!;
    // camadas seguintes presas à base por máscara de recorte
    const presas: No[] = [];
    while (i + 1 < lista.length && lista[i + 1]!.recortadaNaDeBaixo && base.tipo !== 'ajuste') presas.push(lista[++i]!);
    if (!entra(base, cx)) continue;
    const visiveis = presas.filter((n) => entra(n, cx));
    if (visiveis.length === 0) {
      comporNo(sup, base, cx);
      continue;
    }
    // grupo de recorte: base e presas compõem juntas; o alfa da base corta tudo; o modo e a opacidade da base valem para o conjunto
    const conjunto = novaSuperficie(cx);
    comporNo(conjunto, { ...base, opacidade: 1, modoDeMesclagem: 'normal' } as No, cx);
    const alfaDaBase = novaSuperficie(cx);
    pintar(alfaDaBase, conjunto);
    for (const n of visiveis) {
      comporNo(conjunto, n, cx);
      pintar(conjunto, alfaDaBase, 'destination-in');
    }
    mesclar(sup, conjunto, base.modoDeMesclagem, base.opacidade);
  }
}

function comporNo(sup: Superficie, n: No, cx: Contexto): void {
  if (n.tipo === 'ajuste') {
    // getImageData já é uma cópia: o que está na superfície fica intacto até o putImageData
    const depois = sup.ctx.getImageData(0, 0, sup.w, sup.h);
    aplicarCamadaDeAjuste(depois.data, resolverAjusteDeCamada(cx.doc, n.ajuste));
    if (!n.mascara && n.modoDeMesclagem === 'normal' && n.opacidade >= 1) {
      sup.ctx.putImageData(depois, 0, 0);
      return;
    }
    const camada = novaSuperficie(cx);
    camada.ctx.putImageData(depois, 0, 0);
    aplicarMascara(camada, n, { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura }, cx);
    mesclar(sup, camada, n.modoDeMesclagem, n.opacidade);
    return;
  }
  if (n.tipo === 'grupo') {
    if (n.modoDeMesclagem === 'atravessar' && n.opacidade >= 1 && !n.mascara) return comporLista(sup, n.filhos, cx);
    const camada = novaSuperficie(cx);
    comporLista(camada, n.filhos, cx);
    aplicarMascara(camada, n, caixaDoGrupo(n) ?? { x: 0, y: 0, w: cx.p.largura, h: cx.p.altura }, cx);
    mesclar(sup, camada, n.modoDeMesclagem, n.opacidade);
    return;
  }
  const temFiltroNaCamada = n.tipo !== 'imagem' && (n.filtros?.length ?? 0) > 0;
  const temEfeitos = Boolean(n.efeitos && Object.values(n.efeitos).some(Boolean));
  const nativo = MESCLAGEM_NATIVA[n.modoDeMesclagem];
  if (!n.mascara && nativo && !temFiltroNaCamada && !temEfeitos) {
    sup.ctx.save();
    sup.ctx.globalAlpha = n.opacidade;
    sup.ctx.globalCompositeOperation = nativo;
    if (n.sombra) aplicarSombra(sup.ctx, cx.doc, n.sombra);
    desenharVisual(sup.ctx, cx.doc, n, cx.imagens, cx.criar);
    sup.ctx.restore();
    return;
  }
  const camada = novaSuperficie(cx);
  camada.ctx.save();
  if (n.sombra) aplicarSombra(camada.ctx, cx.doc, n.sombra);
  desenharVisual(camada.ctx, cx.doc, n, cx.imagens, cx.criar);
  camada.ctx.restore();
  if (temFiltroNaCamada) {
    const d = camada.ctx.getImageData(0, 0, camada.w, camada.h);
    aplicarFiltros(d.data, camada.w, camada.h, n.filtros!, camada.escala, sementeDe(n.id));
    camada.ctx.putImageData(d, 0, 0);
  }
  if (temEfeitos) aplicarEfeitos(camada, n, cx);
  aplicarMascara(camada, n, { x: n.x, y: n.y, w: n.largura, h: n.altura }, cx);
  mesclar(sup, camada, n.modoDeMesclagem, n.opacidade);
}

/** Pinta "cima" sobre a camada só onde a camada tem pixel, mantendo o alfa original (como os efeitos de preenchimento do Photoshop). */
function sobreOPixelDaCamada(camada: Superficie, cima: Superficie, modo: ModoDeMesclagem, opacidade: number, cx: Contexto): void {
  const original = camada.ctx.getImageData(0, 0, camada.w, camada.h);
  const alfa = new Uint8ClampedArray(original.data.length / 4);
  for (let i = 0; i < alfa.length; i++) {
    alfa[i] = original.data[i * 4 + 3]!;
    original.data[i * 4 + 3] = 255;
  }
  const opaca = novaSuperficie(cx);
  opaca.ctx.putImageData(original, 0, 0);
  mesclar(opaca, cima, modo, opacidade);
  const r = opaca.ctx.getImageData(0, 0, opaca.w, opaca.h);
  for (let i = 0; i < alfa.length; i++) r.data[i * 4 + 3] = alfa[i]!;
  camada.ctx.putImageData(r, 0, 0);
}

function rgbaDe(doc: Documento, cor: string, alfa: number): string {
  const n = Number.parseInt(resolverCor(doc, cor).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Efeitos de camada: brilho externo (atrás), sobreposições de degradê e de cor, brilho interno e sombra interna. */
function aplicarEfeitos(camada: Superficie, n: NoVisual, cx: Contexto): void {
  const e = n.efeitos!;
  const alfa = novaSuperficie(cx);
  pintar(alfa, camada);
  const tingir = (cor: string, desfoque: number, dx = 0, dy = 0, dentro = false) => {
    const s = novaSuperficie(cx);
    if (dentro) {
      // cor em tudo, menos na forma deslocada: é a borda que "entra" na camada
      s.ctx.save();
      s.ctx.setTransform(1, 0, 0, 1, 0, 0);
      s.ctx.fillStyle = rgbaDe(cx.doc, cor, 1);
      s.ctx.fillRect(0, 0, s.w, s.h);
      s.ctx.globalCompositeOperation = 'destination-out';
      s.ctx.drawImage(alfa.canvas as unknown as CanvasImageSource, dx * s.escala, dy * s.escala);
      s.ctx.restore();
    } else {
      pintar(s, alfa);
      s.ctx.save();
      s.ctx.setTransform(1, 0, 0, 1, 0, 0);
      s.ctx.globalCompositeOperation = 'source-in';
      s.ctx.fillStyle = rgbaDe(cx.doc, cor, 1);
      s.ctx.fillRect(0, 0, s.w, s.h);
      s.ctx.restore();
    }
    if (desfoque > 0) {
      const d = s.ctx.getImageData(0, 0, s.w, s.h);
      desfoqueGaussiano(d.data, s.w, s.h, (desfoque / 2) * s.escala);
      s.ctx.putImageData(d, 0, 0);
    }
    if (dentro) pintar(s, alfa, 'destination-in');
    return s;
  };
  if (e.brilhoExterno) pintar(camada, tingir(e.brilhoExterno.cor, e.brilhoExterno.tamanho), 'destination-over', e.brilhoExterno.opacidade);
  if (e.sobreposicaoDeDegrade) {
    const g = novaSuperficie(cx);
    g.ctx.fillStyle = estiloDoPreenchimento(g.ctx, cx.doc, e.sobreposicaoDeDegrade.degrade, n.x, n.y, n.largura, n.altura);
    g.ctx.fillRect(n.x, n.y, n.largura, n.altura);
    sobreOPixelDaCamada(camada, g, e.sobreposicaoDeDegrade.modoDeMesclagem, e.sobreposicaoDeDegrade.opacidade, cx);
  }
  if (e.sobreposicaoDeCor) {
    const c = novaSuperficie(cx);
    c.ctx.fillStyle = rgbaDe(cx.doc, e.sobreposicaoDeCor.cor, 1);
    c.ctx.fillRect(0, 0, cx.p.largura, cx.p.altura);
    sobreOPixelDaCamada(camada, c, e.sobreposicaoDeCor.modoDeMesclagem, e.sobreposicaoDeCor.opacidade, cx);
  }
  if (e.brilhoInterno) sobreOPixelDaCamada(camada, tingir(e.brilhoInterno.cor, e.brilhoInterno.tamanho, 0, 0, true), 'tela', e.brilhoInterno.opacidade, cx);
  if (e.sombraInterna) {
    const a = (e.sombraInterna.angulo * Math.PI) / 180;
    const s = tingir(e.sombraInterna.cor, e.sombraInterna.desfoque, -Math.cos(a) * e.sombraInterna.distancia, Math.sin(a) * e.sombraInterna.distancia, true);
    sobreOPixelDaCamada(camada, s, 'multiplicacao', e.sombraInterna.opacidade, cx);
  }
}

function caixaDoGrupo(g: No): { x: number; y: number; w: number; h: number } | undefined {
  if (ehVisual(g)) return { x: g.x, y: g.y, w: g.largura, h: g.altura };
  if (g.tipo !== 'grupo') return undefined;
  const cs = g.filhos.map(caixaDoGrupo).filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (cs.length === 0) return undefined;
  const x0 = Math.min(...cs.map((c) => c.x));
  const y0 = Math.min(...cs.map((c) => c.y));
  return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
}

/** Aplica a máscara de camada: o que for transparente na máscara some da camada. */
function aplicarMascara(camada: Superficie, n: No, caixa: { x: number; y: number; w: number; h: number }, cx: Contexto): void {
  const mascara = superficieDaMascara(n, caixa, cx);
  if (mascara) pintar(camada, mascara, 'destination-in');
}

/**
 * Máscara de uma camada em alfa, do tamanho da prancheta (escala 1). É a mesma que o compositor usa;
 * o PSD a grava como máscara de camada em tons de cinza.
 */
export function mascaraEmAlfa(doc: Documento, p: Prancheta, n: No, imagens: FonteDeImagens, criar: NonNullable<OpcoesDeRender['criarCanvas']>): HTMLCanvasElement | undefined {
  const cx: Contexto = { doc, p, imagens, criar, escala: 1 };
  const caixa = (ehVisual(n) ? { x: n.x, y: n.y, w: n.largura, h: n.altura } : caixaDoGrupo(n)) ?? { x: 0, y: 0, w: p.largura, h: p.altura };
  return superficieDaMascara(n, caixa, cx)?.canvas;
}

function superficieDaMascara(n: No, caixa: { x: number; y: number; w: number; h: number }, cx: Contexto): Superficie | undefined {
  const m = n.mascara;
  if (!m) return undefined;
  const mascara = novaSuperficie(cx);
  const c = mascara.ctx;
  if (m.tipo === 'degrade') {
    c.save();
    c.translate(caixa.x, caixa.y);
    c.fillStyle = degradeDaMascara(c, m, caixa.w, caixa.h);
    c.fillRect(-caixa.x, -caixa.y, cx.p.largura, cx.p.altura);
    c.restore();
  } else if (m.tipo === 'forma') {
    c.fillStyle = '#000000';
    c.beginPath();
    tracarForma(c, m.forma, m.x, m.y, m.largura, m.altura, m.raio);
    c.fill();
    if (m.suavizar > 0 || m.inverter) {
      const d = c.getImageData(0, 0, mascara.w, mascara.h);
      if (m.suavizar > 0) desfoqueGaussiano(d.data, mascara.w, mascara.h, m.suavizar * mascara.escala);
      if (m.inverter) for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255 - d.data[i]!;
      c.putImageData(d, 0, 0);
    }
  } else if (m.tipo === 'sujeito' && n.tipo === 'imagem') {
    const fonte = cx.imagens(m.arquivo);
    const foto = cx.imagens(n.arquivo);
    if (fonte && foto) {
      // a máscara tem o tamanho da foto original e acompanha o mesmo enquadramento
      const real = foto as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      const iw = real.naturalWidth || real.width || n.larguraOriginal;
      const ih = real.naturalHeight || real.height || n.alturaOriginal;
      const mr = fonte as { naturalWidth?: number; width?: number };
      const k = (mr.naturalWidth || mr.width || iw) / iw;
      const e = enquadrar(iw, ih, n.x, n.y, n.largura, n.altura, n.ajuste, n.foco, n.zoom);
      c.save();
      if (n.rotacao) girarEmTornoDoCentro(c, n);
      c.drawImage(fonte, e.sx * k, e.sy * k, e.sw * k, e.sh * k, e.dx, e.dy, e.dw, e.dh);
      c.restore();
    } else {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, cx.p.largura, cx.p.altura);
    }
    if (m.inverter) {
      const d = c.getImageData(0, 0, mascara.w, mascara.h);
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255 - d.data[i]!;
      c.putImageData(d, 0, 0);
    }
  }
  return mascara;
}

export function resolverAjusteDeCamada(doc: Documento, a: Ajuste): AjusteResolvido {
  if (a.tipo === 'filtro-de-foto') return { ...a, cor: resolverCor(doc, a.cor) };
  if (a.tipo === 'mapa-de-degrade') return { ...a, paradas: a.paradas.map((p) => ({ ...p, cor: resolverCor(doc, p.cor) })) };
  return a as AjusteResolvido;
}

/** Filtros em pixel; raios em unidade do documento convertidos pela escala da superfície. */
function aplicarFiltros(dados: Uint8ClampedArray, w: number, h: number, filtros: Filtro[], escala: number, semente: number): void {
  for (const f of filtros) {
    if (f.tipo === 'desfoque') desfoqueGaussiano(dados, w, h, f.raio * escala);
    else if (f.tipo === 'desfoque-de-movimento') desfoqueDeMovimento(dados, w, h, f.angulo, f.distancia * escala);
    else if (f.tipo === 'ruido') adicionarRuido(dados, f.quantidade, f.monocromatico, semente);
    else mascaraDeNitidez(dados, w, h, f.quantidade, f.raio * escala);
  }
}

function desenharVisual(ctx: Ctx, doc: Documento, no: NoVisual, imagens: FonteDeImagens, criarCanvas?: OpcoesDeRender['criarCanvas']): void {
  // quem chama salva e restaura o contexto
  if (no.rotacao) girarEmTornoDoCentro(ctx, no);
  if (no.tipo === 'vetor') return desenharVetor(ctx, doc, no);
  desenharNo(ctx, doc, no, imagens, criarCanvas);
}

function girarEmTornoDoCentro(ctx: Ctx, no: NoVisual): void {
  const cx = no.x + no.largura / 2;
  const cy = no.y + no.altura / 2;
  ctx.translate(cx, cy);
  ctx.rotate((no.rotacao * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/** Caminho só com M, C e Z absolutos (o formato normalizado da importação de SVG). */
export function tracarCaminho(ctx: Pick<Ctx, 'moveTo' | 'bezierCurveTo' | 'closePath'>, d: string): void {
  const partes = d.match(/[MCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  const num = () => Number(partes[i++]);
  while (i < partes.length) {
    const cmd = partes[i++]!.toUpperCase();
    if (cmd === 'M') ctx.moveTo(num(), num());
    else if (cmd === 'C') {
      // várias curvas podem vir depois de um só C
      do ctx.bezierCurveTo(num(), num(), num(), num(), num(), num());
      while (i < partes.length && !/[MCZ]/i.test(partes[i]!));
    } else if (cmd === 'Z') ctx.closePath();
  }
}

function desenharVetor(ctx: Ctx, doc: Documento, no: NoVetor): void {
  ctx.translate(no.x, no.y);
  ctx.scale(no.largura / no.moldura[0], no.altura / no.moldura[1]);
  for (const c of no.caminhos) {
    ctx.beginPath();
    tracarCaminho(ctx, c.d);
    if (c.preenchimento) {
      ctx.fillStyle = resolverCor(doc, c.preenchimento);
      ctx.fill(c.regra === 'par-impar' ? 'evenodd' : 'nonzero');
    }
    if (c.traco) {
      ctx.strokeStyle = resolverCor(doc, c.traco.cor);
      ctx.lineWidth = c.traco.espessura;
      ctx.lineCap = PONTA[c.traco.ponta];
      ctx.lineJoin = JUNCAO[c.traco.juncao];
      ctx.stroke();
    }
  }
}

const PONTA = { reta: 'butt', redonda: 'round', quadrada: 'square' } as const;
const JUNCAO = { angular: 'miter', redonda: 'round', chanfrada: 'bevel' } as const;

function desenharNo(ctx: Ctx, doc: Documento, no: Exclude<NoVisual, NoVetor>, imagens: FonteDeImagens, criarCanvas?: OpcoesDeRender['criarCanvas']): void {
  switch (no.tipo) {
    case 'forma': {
      ctx.fillStyle = estiloDoPreenchimento(ctx, doc, no.preenchimento, no.x, no.y, no.largura, no.altura);
      ctx.beginPath();
      tracarForma(ctx, no.forma, no.x, no.y, no.largura, no.altura, no.raio);
      ctx.fill();
      if (no.traco) {
        // contorno interno: recorta pela forma e traça com o dobro da espessura
        limparSombra(ctx);
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = resolverCor(doc, no.traco.cor);
        ctx.lineWidth = no.traco.espessura * 2;
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    case 'imagem': {
      const fonte = imagens(no.arquivo);
      if (!fonte) {
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(no.x, no.y, no.largura, no.altura);
        return;
      }
      // a dimensão real do arquivo manda; a declarada no nó pode estar errada
      const real = fonte as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      const iw = real.naturalWidth || real.width || no.larguraOriginal;
      const ih = real.naturalHeight || real.height || no.alturaOriginal;
      const { sx, sy, sw, sh, dx, dy, dw, dh } = enquadrar(iw, ih, no.x, no.y, no.largura, no.altura, no.ajuste, no.foco, no.zoom);
      if (no.recorte) {
        if (no.sombra) {
          // a sombra segue a forma da máscara: desenha a forma fora da prancheta e desloca só a sombra de volta
          const fora = 100000;
          const escala = escalaCorrente(ctx);
          ctx.save();
          ctx.shadowOffsetX += fora * escala;
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          tracarForma(ctx, no.recorte.forma, no.x - fora, no.y, no.largura, no.altura, no.recorte.raio);
          ctx.fill();
          ctx.restore();
          limparSombra(ctx);
        }
        ctx.beginPath();
        tracarForma(ctx, no.recorte.forma, no.x, no.y, no.largura, no.altura, no.recorte.raio);
        ctx.clip();
      }
      const origem = criarCanvas ? fotoProcessada(doc, no, fonte, iw, ih, criarCanvas) : fonte;
      ctx.drawImage(origem, sx, sy, sw, sh, dx, dy, dw, dh);
      return;
    }
    case 'texto': {
      desenharTexto(ctx, doc, no);
      return;
    }
  }
}

export function tracarForma(ctx: Ctx, forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number): void {
  if (forma === 'elipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else tracarRetangulo(ctx, x, y, w, h, raio);
}

function rgba(hex: string, alfa: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
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

export function estiloDoPreenchimento(ctx: Ctx, doc: Documento, p: Preenchimento, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (typeof p === 'string') return resolverCor(doc, p);
  let g: CanvasGradient;
  if (p.tipo === 'radial') {
    g = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
  } else {
    const e = extremosDoDegrade(p.angulo, x, y, w, h);
    g = ctx.createLinearGradient(e.x0, e.y0, e.x1, e.y1);
  }
  for (const parada of [...p.paradas].sort((a, b) => a.posicao - b.posicao)) g.addColorStop(parada.posicao, rgba(resolverCor(doc, parada.cor), parada.opacidade));
  return g;
}

/** Sombra do canvas é em pixel de tela: compensa a escala corrente (zoom do editor, render reduzido). */
function escalaCorrente(ctx: Ctx): number {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined;
  return m ? Math.hypot(m.a, m.b) : 1;
}

function aplicarSombra(ctx: Ctx, doc: Documento, s: NonNullable<NoVisual['sombra']>): void {
  const escala = escalaCorrente(ctx);
  const a = (s.angulo * Math.PI) / 180;
  ctx.shadowColor = rgba(resolverCor(doc, s.cor), s.opacidade);
  ctx.shadowBlur = s.desfoque * escala;
  ctx.shadowOffsetX = -Math.cos(a) * s.distancia * escala;
  ctx.shadowOffsetY = Math.sin(a) * s.distancia * escala;
}

function limparSombra(ctx: Ctx): void {
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function tracarRetangulo(ctx: Pick<Ctx, 'moveTo' | 'arcTo' | 'lineTo' | 'closePath'>, x: number, y: number, w: number, h: number, raio: number): void {
  const r = Math.max(0, Math.min(raio, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Onde a foto inteira cai no documento (para o objeto inteligente do PSD). */
export function cantosDaFoto(iw: number, ih: number, no: NoImagem): number[] {
  const e = enquadrar(iw, ih, no.x, no.y, no.largura, no.altura, no.ajuste, no.foco, no.zoom);
  const k = e.dw / e.sw;
  const x0 = e.dx - e.sx * k;
  const y0 = e.dy - e.sy * k;
  return [x0, y0, x0 + iw * k, y0, x0 + iw * k, y0 + ih * k, x0, y0 + ih * k];
}

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


// ---------- foto: ajuste de cor e máscara ----------

function resolverAjuste(doc: Documento, a: NonNullable<NoImagem['ajusteDeCor']>): AjusteDeCor {
  return { ...a, duotone: a.duotone ? { sombras: resolverCor(doc, a.duotone.sombras), luzes: resolverCor(doc, a.duotone.luzes) } : undefined };
}

const cacheDeFotos = new Map<string, CanvasImageSource>();

/**
 * Foto com ajuste de cor e filtros aplicados na resolução de origem, como um objeto inteligente
 * com filtros inteligentes. Raio do filtro em px do documento, convertido para px da foto.
 */
function fotoProcessada(doc: Documento, no: NoImagem, fonte: CanvasImageSource, iw: number, ih: number, criarCanvas: NonNullable<OpcoesDeRender['criarCanvas']>): CanvasImageSource {
  const ajuste = no.ajusteDeCor && !ajusteNeutro(no.ajusteDeCor) ? resolverAjuste(doc, no.ajusteDeCor) : undefined;
  const filtros = no.filtros ?? [];
  if (!ajuste && filtros.length === 0) return fonte;
  // px do documento por px da foto
  const exibicao = no.ajuste === 'cobrir' ? Math.max(no.largura / iw, no.altura / ih) * no.zoom : Math.min(no.largura / iw, no.altura / ih);
  const chave = `${no.arquivo}|${JSON.stringify(ajuste)}|${JSON.stringify(filtros)}|${exibicao.toFixed(4)}|${no.id}`;
  const pronto = cacheDeFotos.get(chave);
  if (pronto) return pronto;
  const canvas = criarCanvas(iw, ih);
  const c = canvas.getContext('2d')!;
  c.drawImage(fonte, 0, 0, iw, ih);
  const img = c.getImageData(0, 0, iw, ih);
  if (ajuste) aplicarAjusteDeCor(img.data, ajuste);
  aplicarFiltros(img.data, iw, ih, filtros, 1 / exibicao, sementeDe(no.id));
  c.putImageData(img, 0, 0);
  if (cacheDeFotos.size > 40) cacheDeFotos.delete(cacheDeFotos.keys().next().value!);
  cacheDeFotos.set(chave, canvas as unknown as CanvasImageSource);
  return canvas as unknown as CanvasImageSource;
}

export function degradeDaMascara(c: Ctx, m: Pick<Extract<Mascara, { tipo: 'degrade' }>, 'angulo' | 'inicio' | 'fim'>, w: number, h: number): CanvasGradient {
  const e = extremosDoDegrade(m.angulo, 0, 0, w, h);
  const g = c.createLinearGradient(e.x0, e.y0, e.x1, e.y1);
  const [a, b] = m.inicio <= m.fim ? [m.inicio, m.fim] : [m.fim, m.inicio];
  const opacoPrimeiro = m.inicio <= m.fim;
  g.addColorStop(0, `rgba(0,0,0,${opacoPrimeiro ? 1 : 0})`);
  g.addColorStop(a, `rgba(0,0,0,${opacoPrimeiro ? 1 : 0})`);
  g.addColorStop(Math.max(a + 0.0001, b), `rgba(0,0,0,${opacoPrimeiro ? 0 : 1})`);
  g.addColorStop(1, `rgba(0,0,0,${opacoPrimeiro ? 0 : 1})`);
  return g;
}
