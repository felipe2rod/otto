// Diagramação de texto: quebra de linha, trechos com estilo próprio e medidas pela tinta.
// A caixa da fonte (ascendente/descendente) posiciona as linhas, como no Photoshop;
// a caixa da tinta é onde as letras de fato estão, e é por ela que se alinha e se mede espaço.
import { type Cor, type Documento, type NoTexto, resolverCor } from '../documento/esquema';
import { acharFonte } from './fontes';

type Ctx = CanvasRenderingContext2D;

export interface EstiloDeTrecho {
  fonte: string;
  peso: number;
  tamanho: number;
  cor: Cor;
  /** tracking em milésimos de eme */
  espacamento: number;
}

export interface Peca {
  texto: string;
  estilo: EstiloDeTrecho;
  /** deslocamento horizontal dentro da linha */
  x: number;
  largura: number;
}

export interface LinhaDiagramada {
  texto: string;
  pecas: Peca[];
  largura: number;
  /** x de início da linha já com o alinhamento aplicado */
  x: number;
  base: number;
  ascTinta: number;
  descTinta: number;
}

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextoDiagramado {
  linhas: LinhaDiagramada[];
  /** altura pela caixa da fonte: é o que precisa caber na caixa da camada */
  alturaUsada: number;
  larguraMaxima: number;
  /** onde as letras estão, em coordenadas da prancheta */
  tinta: Caixa;
  palavraEstourada: string | undefined;
  fonteEncontrada: boolean;
}

export function fonteCss(e: { fonte: string; peso: number; tamanho: number }): string {
  const arq = acharFonte(e.fonte, e.peso);
  return `${arq?.peso ?? e.peso} ${e.tamanho}px "${arq?.familia ?? e.fonte}"`;
}

export function textoExibido(no: NoTexto): string {
  return no.caixaAlta || no.versalete ? no.conteudo.toLocaleUpperCase('pt-BR') : no.conteudo;
}

/** Versalete sintético (como o do Photoshop): minúscula vira maiúscula a 75% do corpo. */
const FATOR_DO_VERSALETE = 0.75;

let opcoesTipograficas: { versalete: boolean; kerning: 'metrico' | 'nenhum' } = { versalete: false, kerning: 'metrico' };

function usarEstilo(ctx: Ctx, e: EstiloDeTrecho, _espacamentoDaCamada?: number): void {
  ctx.font = fonteCss(e);
  // tracking em milésimos de eme, como no Photoshop (por trecho: é o kerning manual entre letras)
  const c = ctx as Ctx & { letterSpacing?: string; fontVariantCaps?: string; fontKerning?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(e.espacamento / 1000) * e.tamanho}px`;
  if ('fontKerning' in c) c.fontKerning = opcoesTipograficas.kerning === 'nenhum' ? 'none' : 'normal';
}

export function limparEspacamento(ctx: Ctx): void {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}

/** Estilo de cada caractere: o estilo base da camada com os trechos por cima. */
function estilosPorCaractere(no: NoTexto, n: number): EstiloDeTrecho[] {
  const base: EstiloDeTrecho = { fonte: no.fonte, peso: no.peso, tamanho: no.tamanho, cor: no.cor, espacamento: no.espacamento };
  const estilos = Array.from({ length: n }, () => base);
  for (const t of no.trechos ?? []) {
    const e: EstiloDeTrecho = { fonte: t.fonte ?? base.fonte, peso: t.peso ?? base.peso, tamanho: t.tamanho ?? base.tamanho, cor: t.cor ?? base.cor, espacamento: t.espacamento ?? base.espacamento };
    for (let i = Math.max(0, t.inicio); i < Math.min(n, t.fim); i++) estilos[i] = e;
  }
  if (no.versalete && !no.caixaAlta) {
    // cada estilo ganha uma versão menor, usada nas letras que eram minúsculas
    const menores = new Map<EstiloDeTrecho, EstiloDeTrecho>();
    for (let i = 0; i < n; i++) {
      const ch = no.conteudo[i] ?? '';
      if (ch === ch.toLocaleUpperCase('pt-BR')) continue;
      const e = estilos[i]!;
      let m = menores.get(e);
      if (!m) {
        m = { ...e, tamanho: e.tamanho * FATOR_DO_VERSALETE };
        menores.set(e, m);
      }
      estilos[i] = m;
    }
  }
  return estilos;
}

interface Palavra {
  pecas: { texto: string; estilo: EstiloDeTrecho }[];
}

function medirPecas(ctx: Ctx, pecas: { texto: string; estilo: EstiloDeTrecho }[], espacamento: number): number {
  let w = 0;
  for (const p of pecas) {
    usarEstilo(ctx, p.estilo, espacamento);
    w += ctx.measureText(p.texto).width;
  }
  return w;
}

export function diagramarTexto(ctx: Ctx, no: NoTexto): TextoDiagramado {
  opcoesTipograficas = { versalete: no.versalete ?? false, kerning: no.kerning ?? 'metrico' };
  const texto = textoExibido(no);
  const estilos = estilosPorCaractere(no, texto.length);
  const limite = no.largura + 0.5;
  let palavraEstourada: string | undefined;

  // parágrafos → palavras → peças de mesmo estilo
  const linhasBrutas: { palavras: Palavra[]; espacos: EstiloDeTrecho[] }[] = [];
  let i = 0;
  for (const paragrafo of texto.split('\n')) {
    const palavras: Palavra[] = [];
    const espacos: EstiloDeTrecho[] = [];
    let atual: Palavra | undefined;
    for (let j = 0; j < paragrafo.length; j++, i++) {
      const ch = paragrafo[j]!;
      const est = estilos[i]!;
      if (/\s/.test(ch)) {
        if (atual) {
          palavras.push(atual);
          espacos.push(est);
          atual = undefined;
        }
        continue;
      }
      atual ??= { pecas: [] };
      const ultima = atual.pecas.at(-1);
      if (ultima && ultima.estilo === est) ultima.texto += ch;
      else atual.pecas.push({ texto: ch, estilo: est });
    }
    if (atual) palavras.push(atual);
    i++; // o \n
    // quebra gulosa por palavra
    let linha: Palavra[] = [];
    let esp: EstiloDeTrecho[] = [];
    let largura = 0;
    palavras.forEach((p, k) => {
      const wp = medirPecas(ctx, p.pecas, no.espacamento);
      if (wp > limite) palavraEstourada ??= p.pecas.map((q) => q.texto).join('');
      const estEspaco = espacos[k - 1] ?? p.pecas[0]!.estilo;
      const wEsp = linha.length ? medirPecas(ctx, [{ texto: ' ', estilo: estEspaco }], no.espacamento) : 0;
      if (linha.length && largura + wEsp + wp > limite) {
        linhasBrutas.push({ palavras: linha, espacos: esp });
        linha = [p];
        esp = [];
        largura = wp;
      } else {
        if (linha.length) esp.push(estEspaco);
        linha.push(p);
        largura += wEsp + wp;
      }
    });
    linhasBrutas.push({ palavras: linha, espacos: esp });
  }

  // monta as linhas com peças posicionadas e métricas
  const linhas: LinhaDiagramada[] = [];
  let base = no.y;
  let alturaUsada = 0;
  let descAnteriorFonte = 0;
  linhasBrutas.forEach((lb, k) => {
    const pecas: Peca[] = [];
    let x = 0;
    lb.palavras.forEach((p, n) => {
      const seq = n > 0 ? [{ texto: ' ', estilo: lb.espacos[n - 1]! }, ...p.pecas] : p.pecas;
      for (const q of seq) {
        usarEstilo(ctx, q.estilo, no.espacamento);
        const w = ctx.measureText(q.texto).width;
        const anterior = pecas.at(-1);
        if (anterior && anterior.estilo === q.estilo) {
          anterior.texto += q.texto;
          anterior.largura += w;
        } else pecas.push({ texto: q.texto, estilo: q.estilo, x, largura: w });
        x += w;
      }
    });
    if (pecas.length === 0) pecas.push({ texto: '', estilo: estilos[0] ?? { fonte: no.fonte, peso: no.peso, tamanho: no.tamanho, cor: no.cor, espacamento: no.espacamento }, x: 0, largura: 0 });
    let ascFonte = 0;
    let descFonte = 0;
    let ascTinta = 0;
    let descTinta = 0;
    let maior = 0;
    for (const p of pecas) {
      usarEstilo(ctx, p.estilo, no.espacamento);
      const m = ctx.measureText(p.texto || 'H');
      ascFonte = Math.max(ascFonte, m.fontBoundingBoxAscent || p.estilo.tamanho * 0.8);
      descFonte = Math.max(descFonte, m.fontBoundingBoxDescent || p.estilo.tamanho * 0.2);
      if (p.texto.trim()) {
        ascTinta = Math.max(ascTinta, m.actualBoundingBoxAscent);
        descTinta = Math.max(descTinta, m.actualBoundingBoxDescent);
      }
      maior = Math.max(maior, p.estilo.tamanho);
    }
    // primeira linha: ascendente encosta no topo da caixa; as seguintes descem pela entrelinha do maior corpo
    base = k === 0 ? no.y + ascFonte : base + maior * no.entrelinha;
    alturaUsada = k === 0 ? ascFonte + descFonte : alturaUsada + maior * no.entrelinha - descAnteriorFonte + descFonte;
    descAnteriorFonte = descFonte;
    const largura = x;
    const lx = no.alinhamento === 'esquerda' ? no.x : no.alinhamento === 'centro' ? no.x + (no.largura - largura) / 2 : no.x + no.largura - largura;
    linhas.push({ texto: pecas.map((p) => p.texto).join(''), pecas, largura, x: lx, base, ascTinta, descTinta });
  });
  limparEspacamento(ctx);

  const comTinta = linhas.filter((l) => l.texto.trim());
  const tinta: Caixa =
    comTinta.length === 0
      ? { x: no.x, y: no.y, w: 0, h: 0 }
      : (() => {
          const topo = comTinta[0]!.base - comTinta[0]!.ascTinta;
          const fundo = comTinta.at(-1)!.base + comTinta.at(-1)!.descTinta;
          const esq = Math.min(...comTinta.map((l) => l.x));
          const dir = Math.max(...comTinta.map((l) => l.x + l.largura));
          return { x: esq, y: topo, w: dir - esq, h: fundo - topo };
        })();
  const fonteEncontrada = acharFonte(no.fonte, no.peso) !== undefined && (no.trechos ?? []).every((t) => !t.fonte || acharFonte(t.fonte, t.peso ?? no.peso) !== undefined);
  return { linhas, alturaUsada, larguraMaxima: Math.max(0, ...linhas.map((l) => l.largura)), tinta, palavraEstourada, fonteEncontrada };
}

export function desenharTexto(ctx: Ctx, doc: Documento, no: NoTexto): void {
  const d = diagramarTexto(ctx, no);
  opcoesTipograficas = { versalete: no.versalete ?? false, kerning: no.kerning ?? 'metrico' };
  ctx.textBaseline = 'alphabetic';
  for (const linha of d.linhas) {
    for (const p of linha.pecas) {
      if (!p.texto.trim()) continue;
      usarEstilo(ctx, p.estilo, no.espacamento);
      ctx.fillStyle = resolverCor(doc, p.estilo.cor);
      ctx.fillText(p.texto, linha.x + p.x, linha.base);
    }
  }
  limparEspacamento(ctx);
  opcoesTipograficas = { versalete: false, kerning: 'metrico' };
  const c = ctx as Ctx & { fontVariantCaps?: string; fontKerning?: string };
  if ('fontVariantCaps' in c) c.fontVariantCaps = 'normal';
}
