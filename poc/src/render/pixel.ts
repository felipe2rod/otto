// Operações de pixel do compositor: modos de mesclagem que o Canvas 2D não tem,
// camadas de ajuste e filtros. Fórmulas do Photoshop onde são públicas; aproximações declaradas onde não são.
import type { ModoDeMesclagem } from '../documento/esquema';

// ---------- modos de mesclagem ----------

/** Modos que o Canvas 2D faz nativamente (mesma fórmula do W3C, que segue a do Photoshop nesses casos). */
export const MESCLAGEM_NATIVA: Partial<Record<ModoDeMesclagem, GlobalCompositeOperation>> = {
  normal: 'source-over',
  escurecer: 'darken',
  multiplicacao: 'multiply',
  'subexposicao-de-cores': 'color-burn',
  clarear: 'lighten',
  tela: 'screen',
  'superexposicao-de-cores': 'color-dodge',
  'superexposicao-linear': 'lighter',
  sobrepor: 'overlay',
  // o luz suave do W3C difere levemente do Photoshop (psd.md: "a verificar")
  'luz-suave': 'soft-light',
  'luz-direta': 'hard-light',
  diferenca: 'difference',
  exclusao: 'exclusion',
  matiz: 'hue',
  saturacao: 'saturation',
  cor: 'color',
  luminosidade: 'luminosity',
};

const lim = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** B(fundo, cima) por canal, em 0..1, para os modos sem equivalente nativo. */
const CANAL: Partial<Record<ModoDeMesclagem, (b: number, s: number) => number>> = {
  'subexposicao-linear': (b, s) => lim(b + s - 1),
  'luz-intensa': (b, s) => (s <= 0.5 ? (s === 0 ? 0 : lim(1 - (1 - b) / (2 * s))) : s === 1 ? 1 : lim(b / (2 * (1 - s)))),
  'luz-linear': (b, s) => lim(b + 2 * s - 1),
  'luz-do-ponto': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  'mistura-solida': (b, s) => (b + s >= 1 ? 1 : 0),
  subtrair: (b, s) => lim(b - s),
  dividir: (b, s) => (s === 0 ? (b === 0 ? 0 : 1) : lim(b / s)),
};

const luma = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/**
 * Compõe "cima" sobre "fundo" com um modo não nativo, em pixel (ambos do mesmo tamanho, não premultiplicados).
 * Composição W3C: cor = (1-αs)·Cb + αs·[(1-αb)·Cs + αb·B(Cb,Cs)].
 */
export function mesclarPixels(fundo: Uint8ClampedArray, cima: Uint8ClampedArray, modo: ModoDeMesclagem, opacidade: number): void {
  const canal = CANAL[modo];
  const porCor = modo === 'cor-mais-escura' || modo === 'cor-mais-clara';
  for (let i = 0; i < fundo.length; i += 4) {
    const as = (cima[i + 3]! / 255) * opacidade;
    if (as <= 0) continue;
    const ab = fundo[i + 3]! / 255;
    const cb = [fundo[i]! / 255, fundo[i + 1]! / 255, fundo[i + 2]! / 255];
    const cs = [cima[i]! / 255, cima[i + 1]! / 255, cima[i + 2]! / 255];
    let mix: number[];
    if (porCor) {
      const escolheCima = modo === 'cor-mais-escura' ? luma(cs[0]!, cs[1]!, cs[2]!) < luma(cb[0]!, cb[1]!, cb[2]!) : luma(cs[0]!, cs[1]!, cs[2]!) > luma(cb[0]!, cb[1]!, cb[2]!);
      mix = escolheCima ? cs : cb;
    } else mix = cb.map((b, k) => canal!(b, cs[k]!));
    const ao = as + ab * (1 - as);
    for (let k = 0; k < 3; k++) {
      const c = (1 - as) * cb[k]! * ab + as * ((1 - ab) * cs[k]! + ab * mix[k]!);
      fundo[i + k] = ao > 0 ? (c / ao) * 255 : 0;
    }
    fundo[i + 3] = ao * 255;
  }
}

// ---------- camadas de ajuste ----------

/** Ajuste já com as cores resolvidas em hex. */
export type AjusteResolvido =
  | { tipo: 'curvas'; rgb?: [number, number][] | undefined; vermelho?: [number, number][] | undefined; verde?: [number, number][] | undefined; azul?: [number, number][] | undefined }
  | { tipo: 'niveis'; pretoDeEntrada: number; brancoDeEntrada: number; gama: number; pretoDeSaida: number; brancoDeSaida: number }
  | { tipo: 'matiz-saturacao'; matiz: number; saturacao: number; luminosidade: number }
  | { tipo: 'brilho-contraste'; brilho: number; contraste: number }
  | { tipo: 'vibracao'; vibracao: number; saturacao: number }
  | { tipo: 'equilibrio-de-cor'; sombras: [number, number, number]; meiosTons: [number, number, number]; realces: [number, number, number] }
  | { tipo: 'filtro-de-foto'; cor: string; densidade: number }
  | { tipo: 'preto-e-branco' }
  | { tipo: 'mapa-de-degrade'; paradas: { cor: string; posicao: number }[] };

function hexRgb(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Curva suave (Catmull-Rom monótona o bastante para curvas de tom) → tabela de 256 valores. */
export function tabelaDaCurva(pontos: [number, number][] | undefined): Uint8ClampedArray {
  const t = new Uint8ClampedArray(256);
  const p = [...(pontos ?? [[0, 0], [255, 255]])].sort((a, b) => a[0] - b[0]);
  for (let x = 0; x < 256; x++) {
    let k = p.findIndex((q) => q[0] >= x);
    if (k === -1) {
      t[x] = p.at(-1)![1];
      continue;
    }
    if (k === 0) {
      t[x] = p[0]![1];
      continue;
    }
    const p0 = p[Math.max(0, k - 2)]!;
    const p1 = p[k - 1]!;
    const p2 = p[k]!;
    const p3 = p[Math.min(p.length - 1, k + 1)]!;
    const u = (x - p1[0]) / Math.max(1, p2[0] - p1[0]);
    const m1 = (p2[1] - p0[1]) / Math.max(1, p2[0] - p0[0]) * (p2[0] - p1[0]);
    const m2 = (p3[1] - p1[1]) / Math.max(1, p3[0] - p1[0]) * (p2[0] - p1[0]);
    const u2 = u * u;
    const u3 = u2 * u;
    t[x] = (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  }
  return t;
}

function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function aplicarCamadaDeAjuste(dados: Uint8ClampedArray, a: AjusteResolvido): void {
  switch (a.tipo) {
    case 'curvas': {
      const tg = tabelaDaCurva(a.rgb);
      const tr = tabelaDaCurva(a.vermelho);
      const tv = tabelaDaCurva(a.verde);
      const ta = tabelaDaCurva(a.azul);
      for (let i = 0; i < dados.length; i += 4) {
        dados[i] = tr[tg[dados[i]!]!]!;
        dados[i + 1] = tv[tg[dados[i + 1]!]!]!;
        dados[i + 2] = ta[tg[dados[i + 2]!]!]!;
      }
      return;
    }
    case 'niveis': {
      const t = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        const n = lim((v - a.pretoDeEntrada) / Math.max(1, a.brancoDeEntrada - a.pretoDeEntrada));
        t[v] = a.pretoDeSaida + (a.brancoDeSaida - a.pretoDeSaida) * n ** (1 / a.gama);
      }
      for (let i = 0; i < dados.length; i += 4) for (let k = 0; k < 3; k++) dados[i + k] = t[dados[i + k]!]!;
      return;
    }
    case 'brilho-contraste': {
      const c = a.contraste >= 0 ? 1 + a.contraste / 50 : 1 + a.contraste / 100;
      for (let i = 0; i < dados.length; i += 4) for (let k = 0; k < 3; k++) dados[i + k] = (dados[i + k]! - 128) * c + 128 + a.brilho;
      return;
    }
    case 'matiz-saturacao': {
      for (let i = 0; i < dados.length; i += 4) {
        let [h, s, l] = rgbParaHsl(dados[i]! / 255, dados[i + 1]! / 255, dados[i + 2]! / 255);
        h = (h + a.matiz / 360 + 1) % 1;
        s = lim(a.saturacao >= 0 ? s + (1 - s) * (a.saturacao / 100) * s : s * (1 + a.saturacao / 100));
        l = a.luminosidade >= 0 ? l + (1 - l) * (a.luminosidade / 100) : l * (1 + a.luminosidade / 100);
        const [r, g, b] = hslParaRgb(h, s, l);
        dados[i] = r * 255;
        dados[i + 1] = g * 255;
        dados[i + 2] = b * 255;
      }
      return;
    }
    case 'vibracao': {
      for (let i = 0; i < dados.length; i += 4) {
        const r = dados[i]!;
        const g = dados[i + 1]!;
        const b = dados[i + 2]!;
        const mx = Math.max(r, g, b);
        const media = (r + g + b) / 3;
        // vibração age mais onde a cor ainda é pouco saturada
        const satAtual = (mx - Math.min(r, g, b)) / 255;
        const fator = 1 + (a.saturacao / 100) + (a.vibracao / 100) * (1 - satAtual);
        dados[i] = media + (r - media) * fator;
        dados[i + 1] = media + (g - media) * fator;
        dados[i + 2] = media + (b - media) * fator;
      }
      return;
    }
    case 'equilibrio-de-cor': {
      for (let i = 0; i < dados.length; i += 4) {
        const l = luma(dados[i]!, dados[i + 1]!, dados[i + 2]!) / 255;
        // pesos por faixa tonal (sombras, meios-tons, realces)
        const ws = lim(1 - l * 3);
        const wm = lim(1 - Math.abs(l - 0.5) * 3);
        const wr = lim(l * 3 - 2);
        for (let k = 0; k < 3; k++) {
          const d = (a.sombras[k]! * ws + a.meiosTons[k]! * wm + a.realces[k]! * wr) * 0.5;
          dados[i + k] = dados[i + k]! + d;
        }
      }
      return;
    }
    case 'filtro-de-foto': {
      const [cr, cg, cb] = hexRgb(a.cor);
      const d = a.densidade / 100;
      for (let i = 0; i < dados.length; i += 4) {
        const l0 = luma(dados[i]!, dados[i + 1]!, dados[i + 2]!);
        // multiplica pelo filtro e preserva a luminosidade original
        let r = dados[i]! * (1 - d + (d * cr) / 255);
        let g = dados[i + 1]! * (1 - d + (d * cg) / 255);
        let b = dados[i + 2]! * (1 - d + (d * cb) / 255);
        const l1 = luma(r, g, b) || 1;
        r *= l0 / l1;
        g *= l0 / l1;
        b *= l0 / l1;
        dados[i] = r;
        dados[i + 1] = g;
        dados[i + 2] = b;
      }
      return;
    }
    case 'preto-e-branco': {
      for (let i = 0; i < dados.length; i += 4) {
        const l = luma(dados[i]!, dados[i + 1]!, dados[i + 2]!);
        dados[i] = l;
        dados[i + 1] = l;
        dados[i + 2] = l;
      }
      return;
    }
    case 'mapa-de-degrade': {
      const paradas = [...a.paradas].sort((x, y) => x.posicao - y.posicao).map((p) => ({ c: hexRgb(p.cor), t: p.posicao }));
      const tabela: [number, number, number][] = [];
      for (let v = 0; v < 256; v++) {
        const t = v / 255;
        const k = paradas.findIndex((p) => p.t >= t);
        if (k <= 0) tabela.push(paradas[Math.max(0, k)]!.c);
        else if (k === -1) tabela.push(paradas.at(-1)!.c);
        else {
          const p0 = paradas[k - 1]!;
          const p1 = paradas[k]!;
          const u = (t - p0.t) / Math.max(1e-6, p1.t - p0.t);
          tabela.push([p0.c[0] + (p1.c[0] - p0.c[0]) * u, p0.c[1] + (p1.c[1] - p0.c[1]) * u, p0.c[2] + (p1.c[2] - p0.c[2]) * u]);
        }
      }
      for (let i = 0; i < dados.length; i += 4) {
        const c = tabela[Math.round(luma(dados[i]!, dados[i + 1]!, dados[i + 2]!))]!;
        dados[i] = c[0];
        dados[i + 1] = c[1];
        dados[i + 2] = c[2];
      }
      return;
    }
  }
}

// ---------- filtros ----------

/** Desfoque gaussiano aproximado por três passadas de caixa, com alfa premultiplicado (sem halo na borda). */
export function desfoqueGaussiano(dados: Uint8ClampedArray, w: number, h: number, raio: number): void {
  if (raio < 0.5) return;
  const f = new Float32Array(dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const a = dados[i + 3]! / 255;
    f[i] = dados[i]! * a;
    f[i + 1] = dados[i + 1]! * a;
    f[i + 2] = dados[i + 2]! * a;
    f[i + 3] = dados[i + 3]!;
  }
  // três caixas com largura derivada do sigma equivalem a um gaussiano
  const sigma = raio;
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const tmp = new Float32Array(f.length);
  for (let k = 0; k < n; k++) {
    const r = ((k < m ? wl : wl + 2) - 1) / 2;
    caixa(f, tmp, w, h, r, true);
    caixa(tmp, f, w, h, r, false);
  }
  for (let i = 0; i < dados.length; i += 4) {
    const a = f[i + 3]!;
    dados[i + 3] = a;
    const inv = a > 0 ? 255 / a : 0;
    dados[i] = f[i]! * inv;
    dados[i + 1] = f[i + 1]! * inv;
    dados[i + 2] = f[i + 2]! * inv;
  }
}

function caixa(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const ri = Math.max(0, Math.round(r));
  const fator = 1 / (2 * ri + 1);
  const linhas = horizontal ? h : w;
  const comprimento = horizontal ? w : h;
  for (let l = 0; l < linhas; l++) {
    const idx = (p: number) => {
      const q = p < 0 ? 0 : p >= comprimento ? comprimento - 1 : p;
      return (horizontal ? l * w + q : q * w + l) * 4;
    };
    for (let c = 0; c < 4; c++) {
      let soma = 0;
      for (let p = -ri; p <= ri; p++) soma += src[idx(p) + c]!;
      for (let p = 0; p < comprimento; p++) {
        dst[idx(p) + c] = soma * fator;
        soma += src[idx(p + ri + 1) + c]! - src[idx(p - ri) + c]!;
      }
    }
  }
}

export function desfoqueDeMovimento(dados: Uint8ClampedArray, w: number, h: number, anguloGraus: number, distancia: number): void {
  if (distancia < 1) return;
  const orig = new Uint8ClampedArray(dados);
  const a = (anguloGraus * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const passos = Math.max(2, Math.min(64, Math.round(distancia)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (let k = 0; k < passos; k++) {
        const t = (k / (passos - 1) - 0.5) * distancia;
        const sx = Math.min(w - 1, Math.max(0, Math.round(x + dx * t)));
        const sy = Math.min(h - 1, Math.max(0, Math.round(y + dy * t)));
        const j = (sy * w + sx) * 4;
        const aa = orig[j + 3]! / 255;
        r += orig[j]! * aa;
        g += orig[j + 1]! * aa;
        b += orig[j + 2]! * aa;
        al += aa;
      }
      const i = (y * w + x) * 4;
      dados[i + 3] = (al / passos) * 255;
      if (al > 0) {
        dados[i] = r / al;
        dados[i + 1] = g / al;
        dados[i + 2] = b / al;
      }
    }
  }
}

/** Ruído com semente: o mesmo documento gera o mesmo grão (render determinístico, ADR 027). */
export function adicionarRuido(dados: Uint8ClampedArray, quantidade: number, monocromatico: boolean, semente: number): void {
  let s = semente >>> 0 || 1;
  const aleatorio = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const forca = quantidade * 255;
  for (let i = 0; i < dados.length; i += 4) {
    if (monocromatico) {
      const n = (aleatorio() - 0.5) * 2 * forca;
      dados[i] = dados[i]! + n;
      dados[i + 1] = dados[i + 1]! + n;
      dados[i + 2] = dados[i + 2]! + n;
    } else for (let k = 0; k < 3; k++) dados[i + k] = dados[i + k]! + (aleatorio() - 0.5) * 2 * forca;
  }
}

export function mascaraDeNitidez(dados: Uint8ClampedArray, w: number, h: number, quantidade: number, raio: number): void {
  const borrada = new Uint8ClampedArray(dados);
  desfoqueGaussiano(borrada, w, h, raio);
  for (let i = 0; i < dados.length; i += 4) for (let k = 0; k < 3; k++) dados[i + k] = dados[i + k]! + (dados[i + k]! - borrada[i + k]!) * quantidade;
}

export function sementeDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}
