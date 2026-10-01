// Camadas de ajuste. Uma fórmula só (funcaoDoAjuste), dois jeitos de aplicar:
// - na GPU, shader que lê o que já está pintado e mistura pela cobertura do que é desenhado (opacidade × máscara);
// - no raster de CPU, laço de pixel na memória da superfície (pixel.ts), porque shader próprio em CPU custa
//   de 10 a 150 vezes mais (docs/tecnico/spike-render.md).
// As fórmulas vieram de poc/src/render/pixel.ts e aproximam as do Photoshop; o PSD guarda o ajuste editável
// e o Photoshop recalcula ao abrir.
import type { Ajuste } from '@otto/documento';
import type { Blender, CanvasKit, RuntimeEffect } from 'canvaskit-wasm';

/** Ajuste com as cores já resolvidas em #rrggbb (token resolvido por quem chama). */
export type AjusteResolvido = Ajuste;

export type FuncaoDeAjuste = (r: number, g: number, b: number) => [number, number, number];

const lim = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r: number, g: number, b: number): number => 0.3 * r + 0.59 * g + 0.11 * b;

function rgbDe(cor: string): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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
  const f = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

type Pontos = [number, number][];
const IDENTIDADE: Pontos = [
  [0, 0],
  [255, 255],
];

/** Pontos da curva em ordem de x. Sem curva, a identidade. */
function pontosDaCurva(pontos: Pontos | undefined): Pontos {
  return [...(pontos ?? IDENTIDADE)].sort((a, b) => a[0] - b[0]);
}

/** Curva suave (Hermite com tangentes de Catmull-Rom) → tabela de 256 níveis. */
export function tabelaDaCurva(pontos: Pontos | undefined): Uint8Array {
  const t = new Uint8Array(256);
  const p = pontosDaCurva(pontos);
  const ultimo = p.at(-1) as [number, number];
  const primeiro = p[0] as [number, number];
  for (let x = 0; x < 256; x++) {
    const k = p.findIndex((q) => q[0] >= x);
    let v: number;
    if (k === -1) v = ultimo[1];
    else if (k === 0) v = primeiro[1];
    else {
      const p0 = p[Math.max(0, k - 2)] as [number, number];
      const p1 = p[k - 1] as [number, number];
      const p2 = p[k] as [number, number];
      const p3 = p[Math.min(p.length - 1, k + 1)] as [number, number];
      const u = (x - p1[0]) / Math.max(1, p2[0] - p1[0]);
      const m1 = ((p2[1] - p0[1]) / Math.max(1, p2[0] - p0[0])) * (p2[0] - p1[0]);
      const m2 = ((p3[1] - p1[1]) / Math.max(1, p3[0] - p1[0])) * (p2[0] - p1[0]);
      const u2 = u * u;
      const u3 = u2 * u;
      v = (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
    }
    t[x] = Math.floor(Math.min(255, Math.max(0, v)) + 0.5);
  }
  return t;
}

const nivel = (v: number): number => Math.floor(lim(v) * 255 + 0.5);

/** O ajuste como função de cor, em 0..1 (a saída pode passar da faixa; quem usa limita). É a fórmula única. */
export function funcaoDoAjuste(a: AjusteResolvido): FuncaoDeAjuste {
  switch (a.tipo) {
    case 'curvas': {
      const mestre = tabelaDaCurva(a.rgb);
      const canais = [tabelaDaCurva(a.vermelho), tabelaDaCurva(a.verde), tabelaDaCurva(a.azul)] as const;
      const f = (v: number, k: 0 | 1 | 2): number => (canais[k][mestre[nivel(v)] as number] as number) / 255;
      return (r, g, b) => [f(r, 0), f(g, 1), f(b, 2)];
    }
    case 'niveis': {
      const f = (v: number): number => {
        const n = lim((v * 255 - a.pretoDeEntrada) / Math.max(1, a.brancoDeEntrada - a.pretoDeEntrada));
        return (a.pretoDeSaida + (a.brancoDeSaida - a.pretoDeSaida) * n ** (1 / a.gama)) / 255;
      };
      return (r, g, b) => [f(r), f(g), f(b)];
    }
    case 'matiz-saturacao':
      return (r, g, b) => {
        let [h, s, l] = rgbParaHsl(r, g, b);
        h = (h + a.matiz / 360 + 1) % 1;
        s = lim(a.saturacao >= 0 ? s + (1 - s) * (a.saturacao / 100) * s : s * (1 + a.saturacao / 100));
        l = a.luminosidade >= 0 ? l + (1 - l) * (a.luminosidade / 100) : l * (1 + a.luminosidade / 100);
        return hslParaRgb(h, s, l);
      };
    case 'brilho-contraste': {
      const c = a.contraste >= 0 ? 1 + a.contraste / 50 : 1 + a.contraste / 100;
      const f = (v: number): number => (v - 128 / 255) * c + 128 / 255 + a.brilho / 255;
      return (r, g, b) => [f(r), f(g), f(b)];
    }
    case 'vibracao':
      return (r, g, b) => {
        const media = (r + g + b) / 3;
        // a vibração age mais onde a cor ainda é pouco saturada
        const saturacaoAtual = Math.max(r, g, b) - Math.min(r, g, b);
        const fator = 1 + a.saturacao / 100 + (a.vibracao / 100) * (1 - saturacaoAtual);
        return [media + (r - media) * fator, media + (g - media) * fator, media + (b - media) * fator];
      };
    case 'equilibrio-de-cor':
      return (r, g, b) => {
        const l = luma(r, g, b);
        // pesos por faixa tonal (sombras, meios-tons, realces)
        const ws = lim(1 - l * 3);
        const wm = lim(1 - Math.abs(l - 0.5) * 3);
        const wr = lim(l * 3 - 2);
        const d = (k: 0 | 1 | 2): number => ((a.sombras[k] * ws + a.meiosTons[k] * wm + a.realces[k] * wr) * 0.5) / 255;
        return [r + d(0), g + d(1), b + d(2)];
      };
    case 'filtro-de-foto': {
      const [cr, cg, cb] = rgbDe(a.cor);
      const d = a.densidade / 100;
      return (r, g, b) => {
        // multiplica pelo filtro e preserva a luminosidade original
        const l0 = luma(r, g, b);
        const r1 = r * (1 - d + d * cr);
        const g1 = g * (1 - d + d * cg);
        const b1 = b * (1 - d + d * cb);
        const l1 = luma(r1, g1, b1);
        const k = l0 / (l1 > 0 ? l1 : 1 / 255);
        return [r1 * k, g1 * k, b1 * k];
      };
    }
    case 'preto-e-branco':
      return (r, g, b) => {
        const l = luma(r, g, b);
        return [l, l, l];
      };
    case 'mapa-de-degrade': {
      const paradas = [...a.paradas].sort((x, y) => x.posicao - y.posicao).map((p) => ({ c: rgbDe(p.cor), t: p.posicao }));
      const primeira = paradas[0] as (typeof paradas)[number];
      return (r, g, b) => {
        // a luminosidade vira posição no degradê. A POC passava por uma tabela de 256 passos; aqui é contínuo,
        // para o shader e o laço não divergirem no arredondamento do passo.
        const t = lim(luma(r, g, b));
        let cor = (paradas.at(-1) as (typeof paradas)[number]).c;
        for (let k = 0; k < paradas.length; k++) {
          const p1 = paradas[k] as (typeof paradas)[number];
          if (p1.t < t) continue;
          if (k === 0) cor = primeira.c;
          else {
            const p0 = paradas[k - 1] as (typeof paradas)[number];
            const u = (t - p0.t) / Math.max(1e-6, p1.t - p0.t);
            cor = [p0.c[0] + (p1.c[0] - p0.c[0]) * u, p0.c[1] + (p1.c[1] - p0.c[1]) * u, p0.c[2] + (p1.c[2] - p0.c[2]) * u];
          }
          break;
        }
        return cor;
      };
    }
  }
}

/** Ajustes que tratam cada canal sozinho: no laço de pixel viram três tabelas de 256 entradas. */
export function ajustePorCanal(a: AjusteResolvido): boolean {
  return a.tipo === 'brilho-contraste' || a.tipo === 'niveis' || a.tipo === 'curvas';
}

/** Aplica o ajuste a pixels RGBA de 8 bits não premultiplicados e devolve o resultado (a entrada fica intacta). Oráculo dos testes. */
export function referenciaDeAjuste(dados: Uint8Array | Uint8ClampedArray, a: AjusteResolvido): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(dados);
  const f = funcaoDoAjuste(a);
  for (let i = 0; i < saida.length; i += 4) {
    const cor = f((dados[i] as number) / 255, (dados[i + 1] as number) / 255, (dados[i + 2] as number) / 255);
    saida[i] = lim(cor[0]) * 255;
    saida[i + 1] = lim(cor[1]) * 255;
    saida[i + 2] = lim(cor[2]) * 255;
  }
  return saida;
}

// ---------- shaders (SkSL) ----------

/**
 * O que é desenhado com este shader só carrega cobertura: src.a = opacidade × máscara.
 * Saída = fundo + (ajustado − fundo) × cobertura, mantendo o alfa do fundo.
 */
function sksl(uniformes: string, funcao: string): string {
  return `
${uniformes}
float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
float nivel(float v) { return floor(clamp(v, 0.0, 1.0) * 255.0 + 0.5); }
${funcao}
vec4 main(vec4 src, vec4 dst) {
  if (dst.a <= 0.0) return dst;
  vec3 c = dst.rgb / dst.a;
  vec3 a = clamp(ajustar(c), 0.0, 1.0);
  return vec4(mix(c, a, src.a) * dst.a, dst.a);
}`;
}

const MAXIMO_DE_PONTOS = 16;
const MAXIMO_DE_PARADAS = 6;

/** A curva de um canal, avaliada no shader com a mesma conta de tabelaDaCurva. "x" e a saída são níveis de 0 a 255. */
const curvaEmSksl = (nome: string, indice: number): string => `
float curva_${nome}(float x) {
  float n = quantos[${indice}];
  vec2 a = ${nome}[0];
  vec2 b = ${nome}[0];
  vec2 q0 = a; vec2 q1 = a; vec2 q2 = a; vec2 q3 = a;
  float estado = 0.0;
  float k = -1.0;
  for (int i = 0; i < ${MAXIMO_DE_PONTOS}; i++) {
    if (float(i) < n) {
      vec2 c = ${nome}[i];
      if (estado == 1.0) { q3 = c; estado = 2.0; }
      if (estado == 0.0 && c.x >= x) { k = float(i); q0 = a; q1 = b; q2 = c; q3 = c; estado = 1.0; }
      a = b;
      b = c;
    }
  }
  float v;
  if (k < 0.0) { v = b.y; }
  else if (k == 0.0) { v = ${nome}[0].y; }
  else {
    float u = (x - q1.x) / max(1.0, q2.x - q1.x);
    float m1 = (q2.y - q0.y) / max(1.0, q2.x - q0.x) * (q2.x - q1.x);
    float m2 = (q3.y - q1.y) / max(1.0, q3.x - q1.x) * (q2.x - q1.x);
    float u2 = u * u;
    float u3 = u2 * u;
    v = (2.0 * u3 - 3.0 * u2 + 1.0) * q1.y + (u3 - 2.0 * u2 + u) * m1 + (-2.0 * u3 + 3.0 * u2) * q2.y + (u3 - u2) * m2;
  }
  return floor(clamp(v, 0.0, 255.0) + 0.5);
}`;

const SKSL: Record<Ajuste['tipo'], string> = {
  curvas: sksl(
    `uniform vec2 mestre[${MAXIMO_DE_PONTOS}];
uniform vec2 vermelho[${MAXIMO_DE_PONTOS}];
uniform vec2 verde[${MAXIMO_DE_PONTOS}];
uniform vec2 azul[${MAXIMO_DE_PONTOS}];
uniform vec4 quantos;`,
    `${curvaEmSksl('mestre', 0)}${curvaEmSksl('vermelho', 1)}${curvaEmSksl('verde', 2)}${curvaEmSksl('azul', 3)}
vec3 ajustar(vec3 c) {
  return vec3(curva_vermelho(curva_mestre(nivel(c.r))), curva_verde(curva_mestre(nivel(c.g))), curva_azul(curva_mestre(nivel(c.b)))) / 255.0;
}`,
  ),
  niveis: sksl(
    'uniform vec4 u; // preto e branco de entrada, preto e branco de saída, em 0..1\nuniform float inversoDaGama;',
    `vec3 ajustar(vec3 c) {
  vec3 n = clamp((c - u.x) / max(1.0 / 255.0, u.y - u.x), 0.0, 1.0);
  return u.z + (u.w - u.z) * pow(n, vec3(inversoDaGama));
}`,
  ),
  'matiz-saturacao': sksl(
    'uniform vec3 u; // matiz (fração de volta), saturação e luminosidade em -1..1',
    `
vec3 paraHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h = mx == c.r ? (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0) : (mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0);
  return vec3(h / 6.0, s, l);
}
float tom(float p, float q, float t) {
  float u = t < 0.0 ? t + 1.0 : (t > 1.0 ? t - 1.0 : t);
  return u < 1.0 / 6.0 ? p + (q - p) * 6.0 * u : (u < 0.5 ? q : (u < 2.0 / 3.0 ? p + (q - p) * (2.0 / 3.0 - u) * 6.0 : p));
}
vec3 paraRgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(tom(p, q, hsl.x + 1.0 / 3.0), tom(p, q, hsl.x), tom(p, q, hsl.x - 1.0 / 3.0));
}
vec3 ajustar(vec3 c) {
  vec3 hsl = paraHsl(c);
  float h = fract(hsl.x + u.x + 1.0);
  float s = clamp(u.y >= 0.0 ? hsl.y + (1.0 - hsl.y) * u.y * hsl.y : hsl.y * (1.0 + u.y), 0.0, 1.0);
  float l = u.z >= 0.0 ? hsl.z + (1.0 - hsl.z) * u.z : hsl.z * (1.0 + u.z);
  return paraRgb(vec3(h, s, l));
}`,
  ),
  'brilho-contraste': sksl('uniform vec2 u; // ganho do contraste e brilho em 0..1', 'vec3 ajustar(vec3 c) { return (c - 128.0 / 255.0) * u.x + 128.0 / 255.0 + u.y; }'),
  vibracao: sksl(
    'uniform vec2 u; // saturação e vibração em -1..1',
    `vec3 ajustar(vec3 c) {
  float media = (c.r + c.g + c.b) / 3.0;
  float saturacaoAtual = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return media + (c - media) * (1.0 + u.x + u.y * (1.0 - saturacaoAtual));
}`,
  ),
  'equilibrio-de-cor': sksl(
    'uniform vec3 sombras;\nuniform vec3 meiosTons;\nuniform vec3 realces; // já em fração de 255 e pela metade',
    `vec3 ajustar(vec3 c) {
  float l = luma(c);
  float ws = clamp(1.0 - l * 3.0, 0.0, 1.0);
  float wm = clamp(1.0 - abs(l - 0.5) * 3.0, 0.0, 1.0);
  float wr = clamp(l * 3.0 - 2.0, 0.0, 1.0);
  return c + sombras * ws + meiosTons * wm + realces * wr;
}`,
  ),
  'filtro-de-foto': sksl(
    'uniform vec3 cor;\nuniform float densidade;',
    `vec3 ajustar(vec3 c) {
  float l0 = luma(c);
  vec3 f = c * (1.0 - densidade + densidade * cor);
  float l1 = luma(f);
  return f * (l0 / (l1 > 0.0 ? l1 : 1.0 / 255.0));
}`,
  ),
  'preto-e-branco': sksl('', 'vec3 ajustar(vec3 c) { return vec3(luma(c)); }'),
  'mapa-de-degrade': sksl(
    `uniform vec3 cores[${MAXIMO_DE_PARADAS}];\nuniform float posicoes[${MAXIMO_DE_PARADAS}];\nuniform float quantas;`,
    `vec3 ajustar(vec3 c) {
  float t = clamp(luma(c), 0.0, 1.0);
  vec3 saida = cores[0];
  vec3 anterior = cores[0];
  float posicaoAnterior = posicoes[0];
  float achou = 0.0;
  for (int k = 0; k < ${MAXIMO_DE_PARADAS}; k++) {
    if (float(k) < quantas) {
      if (achou == 0.0) {
        if (posicoes[k] >= t) {
          saida = k == 0 ? cores[0] : mix(anterior, cores[k], (t - posicaoAnterior) / max(0.000001, posicoes[k] - posicaoAnterior));
          achou = 1.0;
        } else {
          saida = cores[k];
        }
      }
      anterior = cores[k];
      posicaoAnterior = posicoes[k];
    }
  }
  return saida;
}`,
  ),
};

function preencher(valores: number[], tamanho: number): number[] {
  return [...valores, ...new Array<number>(Math.max(0, tamanho - valores.length)).fill(0)];
}

function uniformes(a: AjusteResolvido): number[] {
  switch (a.tipo) {
    case 'curvas': {
      const curvas = [a.rgb, a.vermelho, a.verde, a.azul].map(pontosDaCurva);
      return [...curvas.flatMap((p) => preencher(p.flat(), MAXIMO_DE_PONTOS * 2)), ...curvas.map((p) => p.length)];
    }
    case 'niveis':
      return [a.pretoDeEntrada / 255, a.brancoDeEntrada / 255, a.pretoDeSaida / 255, a.brancoDeSaida / 255, 1 / a.gama];
    case 'matiz-saturacao':
      return [a.matiz / 360, a.saturacao / 100, a.luminosidade / 100];
    case 'brilho-contraste':
      return [a.contraste >= 0 ? 1 + a.contraste / 50 : 1 + a.contraste / 100, a.brilho / 255];
    case 'vibracao':
      return [a.saturacao / 100, a.vibracao / 100];
    case 'equilibrio-de-cor':
      return [...a.sombras, ...a.meiosTons, ...a.realces].map((v) => (v * 0.5) / 255);
    case 'filtro-de-foto':
      return [...rgbDe(a.cor), a.densidade / 100];
    case 'preto-e-branco':
      return [];
    case 'mapa-de-degrade': {
      const paradas = [...a.paradas].sort((x, y) => x.posicao - y.posicao);
      return [
        ...preencher(
          paradas.flatMap((p) => rgbDe(p.cor)),
          MAXIMO_DE_PARADAS * 3,
        ),
        ...preencher(
          paradas.map((p) => p.posicao),
          MAXIMO_DE_PARADAS,
        ),
        paradas.length,
      ];
    }
  }
}

export interface Ajustador {
  /** Shader de mesclagem do ajuste. Quem chama apaga depois de desenhar. */
  mesclador(ajuste: AjusteResolvido): Blender;
  destruir(): void;
}

export function criarAjustador(ck: CanvasKit): Ajustador {
  const efeitos = new Map<Ajuste['tipo'], RuntimeEffect>();
  return {
    mesclador(ajuste) {
      let efeito = efeitos.get(ajuste.tipo);
      if (!efeito) {
        let erroDeCompilacao = '';
        const novo = ck.RuntimeEffect.MakeForBlender(SKSL[ajuste.tipo], (erro) => {
          erroDeCompilacao = erro;
        });
        if (!novo) throw new Error(`O shader do ajuste "${ajuste.tipo}" não compilou: ${erroDeCompilacao}`);
        efeito = novo;
        efeitos.set(ajuste.tipo, efeito);
      }
      return efeito.makeBlender(uniformes(ajuste));
    },
    destruir() {
      for (const e of efeitos.values()) e.delete();
      efeitos.clear();
    },
  };
}
