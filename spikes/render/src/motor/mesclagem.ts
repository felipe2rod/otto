// Modos de mesclagem do Photoshop sobre o CanvasKit.
// 16 saem pelo modo nativo do Skia; 10 saem por shader próprio (SkSL, como SkBlender).
// A fórmula de referência é a que a POC calcula em pixel (poc/src/render/pixel.ts), estendida aos 26 modos.
import type { Blender, CanvasKit, Paint } from 'canvaskit-wasm';
import type { ModoDeMesclagem } from './tipos.ts';

// ---------- referência em TypeScript (oráculo dos testes) ----------

const lim = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (c: readonly number[]): number => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
const sat = (c: readonly number[]): number => Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);
/** Nível de 8 bits de um valor em 0..1. As comparações de limiar do Photoshop são em inteiro. */
const nivel = (v: number): number => Math.round(v * 255);

function cortarCor(c: number[]): number[] {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let r = c;
  if (n < 0) r = r.map((v) => l + ((v - l) * l) / (l - n));
  if (x > 1) r = r.map((v) => l + ((v - l) * (1 - l)) / (x - l));
  return r;
}
const definirLum = (c: readonly number[], l: number): number[] => cortarCor(c.map((v) => v + (l - lum(c))));
function definirSat(c: readonly number[], s: number): number[] {
  const mx = Math.max(...c);
  const mn = Math.min(...c);
  if (mx === mn) return [0, 0, 0];
  return c.map((v) => ((v - mn) * s) / (mx - mn));
}

const D = (b: number): number => (b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b));

/** B(fundo, cima) por canal, em 0..1. */
export const POR_CANAL: Partial<Record<ModoDeMesclagem, (b: number, s: number) => number>> = {
  normal: (_b, s) => s,
  escurecer: (b, s) => Math.min(b, s),
  multiplicacao: (b, s) => b * s,
  'subexposicao-de-cores': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'subexposicao-linear': (b, s) => lim(b + s - 1),
  clarear: (b, s) => Math.max(b, s),
  tela: (b, s) => b + s - b * s,
  'superexposicao-de-cores': (b, s) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  'superexposicao-linear': (b, s) => lim(b + s),
  sobrepor: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  // fórmula do W3C, que é a do Skia. A do Photoshop usa sqrt(b) em toda a faixa (ver SKSL 'luz-suave-photoshop').
  'luz-suave': (b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (D(b) - b)),
  'luz-direta': (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  'luz-intensa': (b, s) => (s <= 0.5 ? (s <= 0 ? 0 : lim(1 - (1 - b) / (2 * s))) : s >= 1 ? 1 : lim(b / (2 * (1 - s)))),
  'luz-linear': (b, s) => lim(b + 2 * s - 1),
  'luz-do-ponto': (b, s) => (s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1)),
  // o limiar é em inteiro de 8 bits: em ponto flutuante, 100/255 + 155/255 pode dar 0,99999994 e errar o empate
  'mistura-solida': (b, s) => (nivel(b) + nivel(s) >= 255 ? 1 : 0),
  diferenca: (b, s) => Math.abs(b - s),
  exclusao: (b, s) => b + s - 2 * b * s,
  subtrair: (b, s) => lim(b - s),
  dividir: (b, s) => (s <= 0 ? (b <= 0 ? 0 : 1) : lim(b / s)),
};

export const POR_COR: Partial<Record<ModoDeMesclagem, (b: number[], s: number[]) => number[]>> = {
  'cor-mais-escura': (b, s) => (lum(s) < lum(b) ? s : b),
  'cor-mais-clara': (b, s) => (lum(s) > lum(b) ? s : b),
  matiz: (b, s) => definirLum(definirSat(s, sat(b)), lum(b)),
  saturacao: (b, s) => definirLum(definirSat(b, sat(s)), lum(b)),
  cor: (b, s) => definirLum(s, lum(b)),
  luminosidade: (b, s) => definirLum(b, lum(s)),
};

/**
 * Compõe "cima" sobre "fundo" (RGBA de 8 bits, não premultiplicado) e devolve o resultado.
 * Composição: cor = (1−αs)·αb·Cb + αs·(1−αb)·Cs + αs·αb·B(Cb, Cs); alfa = αs + αb − αs·αb.
 */
export function referenciaDeMesclagem(fundo: Uint8Array | Uint8ClampedArray, cima: Uint8Array | Uint8ClampedArray, modo: ModoDeMesclagem, opacidade: number): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(fundo.length);
  const canal = POR_CANAL[modo];
  const cor = POR_COR[modo];
  for (let i = 0; i < fundo.length; i += 4) {
    const as = (cima[i + 3]! / 255) * opacidade;
    const ab = fundo[i + 3]! / 255;
    const cb = [fundo[i]! / 255, fundo[i + 1]! / 255, fundo[i + 2]! / 255];
    const cs = [cima[i]! / 255, cima[i + 1]! / 255, cima[i + 2]! / 255];
    const mix = cor ? cor(cb, cs) : cb.map((b, k) => canal!(b, cs[k]!));
    const ao = as + ab - as * ab;
    for (let k = 0; k < 3; k++) {
      const c = (1 - as) * ab * cb[k]! + as * (1 - ab) * cs[k]! + as * ab * mix[k]!;
      saida[i + k] = ao > 0 ? (c / ao) * 255 : 0;
    }
    saida[i + 3] = ao * 255;
  }
  return saida;
}

// ---------- shaders (SkSL) ----------

/** Corpo comum: tira o premultiplicado, chama B(b, s) e compõe como o Photoshop. */
function sksl(funcaoB: string): string {
  return `
float nivel(float v) { return floor(v * 255.0 + 0.5); }
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
${funcaoB}
vec4 main(vec4 src, vec4 dst) {
  vec3 s = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
  vec3 b = dst.a > 0.0 ? dst.rgb / dst.a : vec3(0.0);
  vec3 m = clamp(B(b, s), 0.0, 1.0);
  vec3 cor = src.rgb * (1.0 - dst.a) + dst.rgb * (1.0 - src.a) + src.a * dst.a * m;
  return vec4(cor, src.a + dst.a - src.a * dst.a);
}`;
}

const porCanal = (expressao: string): string => `
float canal(float b, float s) { return ${expressao}; }
vec3 B(vec3 b, vec3 s) { return vec3(canal(b.r, s.r), canal(b.g, s.g), canal(b.b, s.b)); }`;

/** Modos que o Skia não tem (ou tem com outra composição, caso da superexposição linear). */
const SKSL = {
  'subexposicao-linear': sksl(`vec3 B(vec3 b, vec3 s) { return b + s - 1.0; }`),
  // o "Plus" do Skia soma os premultiplicados: com opacidade abaixo de 100% clareia mais que o Photoshop
  'superexposicao-linear': sksl(`vec3 B(vec3 b, vec3 s) { return b + s; }`),
  'luz-intensa': sksl(porCanal(`s <= 0.5 ? (s <= 0.0 ? 0.0 : 1.0 - (1.0 - b) / (2.0 * s)) : (s >= 1.0 ? 1.0 : b / (2.0 * (1.0 - s)))`)),
  'luz-linear': sksl(`vec3 B(vec3 b, vec3 s) { return b + 2.0 * s - 1.0; }`),
  'luz-do-ponto': sksl(porCanal(`s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * s - 1.0)`)),
  'mistura-solida': sksl(porCanal(`nivel(b) + nivel(s) >= 255.0 ? 1.0 : 0.0`)),
  'cor-mais-escura': sksl(`vec3 B(vec3 b, vec3 s) { return lum(s) < lum(b) ? s : b; }`),
  'cor-mais-clara': sksl(`vec3 B(vec3 b, vec3 s) { return lum(s) > lum(b) ? s : b; }`),
  subtrair: sksl(`vec3 B(vec3 b, vec3 s) { return b - s; }`),
  dividir: sksl(porCanal(`s <= 0.0 ? (b <= 0.0 ? 0.0 : 1.0) : b / s`)),
} as const satisfies Partial<Record<ModoDeMesclagem, string>>;

/** Luz suave com a fórmula atribuída ao Photoshop (sqrt em toda a faixa). Fica fora do documento até conferir no Photoshop. */
export const SKSL_LUZ_SUAVE_DO_PHOTOSHOP = sksl(porCanal(`s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (sqrt(b) - b)`));

export const MODOS_POR_SHADER = Object.keys(SKSL) as (keyof typeof SKSL)[];

type NomeNativo = 'SrcOver' | 'Darken' | 'Multiply' | 'ColorBurn' | 'Lighten' | 'Screen' | 'ColorDodge' | 'Overlay' | 'SoftLight' | 'HardLight' | 'Difference' | 'Exclusion' | 'Hue' | 'Saturation' | 'Color' | 'Luminosity';

const NATIVO: Partial<Record<ModoDeMesclagem, NomeNativo>> = {
  normal: 'SrcOver',
  escurecer: 'Darken',
  multiplicacao: 'Multiply',
  'subexposicao-de-cores': 'ColorBurn',
  clarear: 'Lighten',
  tela: 'Screen',
  'superexposicao-de-cores': 'ColorDodge',
  sobrepor: 'Overlay',
  'luz-suave': 'SoftLight',
  'luz-direta': 'HardLight',
  diferenca: 'Difference',
  exclusao: 'Exclusion',
  matiz: 'Hue',
  saturacao: 'Saturation',
  cor: 'Color',
  luminosidade: 'Luminosity',
};

export function ehModoNativo(modo: ModoDeMesclagem): boolean {
  return NATIVO[modo] !== undefined;
}

export interface Mesclador {
  /** Põe o modo na tinta: modo nativo do Skia ou shader próprio. */
  aplicar(tinta: Paint, modo: ModoDeMesclagem): void;
  nativo(modo: ModoDeMesclagem): boolean;
  /** Compila um shader de mesclagem avulso (usado para medir a luz suave do Photoshop). */
  compilar(fonte: string): Blender;
  destruir(): void;
}

/** Os shaders são compilados uma vez por instância do CanvasKit e morrem com a sessão: sem estado global. */
export function criarMesclador(ck: CanvasKit): Mesclador {
  const prontos = new Map<string, Blender>();
  const avulsos: Blender[] = [];

  const compilar = (fonte: string): Blender => {
    const efeito = ck.RuntimeEffect.MakeForBlender(fonte, (erro) => {
      throw new Error(`Shader de mesclagem não compilou: ${erro}`);
    });
    if (!efeito) throw new Error('Shader de mesclagem não compilou');
    const mesclador = efeito.makeBlender([]);
    efeito.delete();
    return mesclador;
  };

  return {
    nativo: (modo) => NATIVO[modo] !== undefined,
    aplicar(tinta, modo) {
      const nativo = NATIVO[modo];
      if (nativo) {
        tinta.setBlendMode(ck.BlendMode[nativo]);
        return;
      }
      let pronto = prontos.get(modo);
      if (!pronto) {
        pronto = compilar(SKSL[modo as keyof typeof SKSL]);
        prontos.set(modo, pronto);
      }
      tinta.setBlender(pronto);
    },
    compilar(fonte) {
      const m = compilar(fonte);
      avulsos.push(m);
      return m;
    },
    destruir() {
      for (const m of [...prontos.values(), ...avulsos]) m.delete();
      prontos.clear();
      avulsos.length = 0;
    },
  };
}
