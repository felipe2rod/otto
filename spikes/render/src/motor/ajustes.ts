// Camadas de ajuste como shader de mesclagem: o shader lê o que já está pintado (dst),
// calcula o ajuste e mistura pelo alfa do que é desenhado (opacidade × máscara).
// Não copia o fundo nem lê pixel em JavaScript, como a POC precisava fazer.
// As fórmulas são as da POC (poc/src/render/pixel.ts), que aproximam as do Photoshop.
import type { Blender, CanvasKit, RuntimeEffect } from 'canvaskit-wasm';
import type { Ajuste } from './tipos.ts';

// ---------- referência em TypeScript (oráculo dos testes) ----------

const lim = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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

export type FuncaoDeAjuste = (r: number, g: number, b: number) => [number, number, number];

/** O ajuste como função de cor, em 0..1 (sem limitar a saída). É a fórmula única: o laço de pixel usa esta. */
export function funcaoDoAjuste(a: Ajuste): FuncaoDeAjuste {
  switch (a.tipo) {
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
    case 'niveis': {
      const f = (v: number): number => {
        const n = lim((v * 255 - a.pretoDeEntrada) / Math.max(1, a.brancoDeEntrada - a.pretoDeEntrada));
        return (a.pretoDeSaida + (a.brancoDeSaida - a.pretoDeSaida) * n ** (1 / a.gama)) / 255;
      };
      return (r, g, b) => [f(r), f(g), f(b)];
    }
    case 'preto-e-branco':
      return (r, g, b) => {
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        return [l, l, l];
      };
  }
}

/** Ajustes que tratam cada canal sozinho: cabem numa tabela de 256 entradas. */
export function ajustePorCanal(a: Ajuste): boolean {
  return a.tipo === 'brilho-contraste' || a.tipo === 'niveis';
}

/** Aplica o ajuste a pixels RGBA de 8 bits e devolve o resultado (a entrada fica intacta). */
export function referenciaDeAjuste(dados: Uint8Array | Uint8ClampedArray, a: Ajuste): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(dados);
  const f = funcaoDoAjuste(a);
  for (let i = 0; i < saida.length; i += 4) {
    const cor = f(dados[i]! / 255, dados[i + 1]! / 255, dados[i + 2]! / 255);
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
${funcao}
vec4 main(vec4 src, vec4 dst) {
  if (dst.a <= 0.0) return dst;
  vec3 c = dst.rgb / dst.a;
  vec3 a = clamp(ajustar(c), 0.0, 1.0);
  return vec4(mix(c, a, src.a) * dst.a, dst.a);
}`;
}

const SKSL: Record<Ajuste['tipo'], string> = {
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
  'brilho-contraste': sksl('uniform vec2 u; // ganho do contraste e brilho em 0..1', `vec3 ajustar(vec3 c) { return (c - 128.0 / 255.0) * u.x + 128.0 / 255.0 + u.y; }`),
  niveis: sksl(
    'uniform vec4 u; // preto e branco de entrada, preto e branco de saída, em 0..1\nuniform float inversoDaGama;',
    `vec3 ajustar(vec3 c) {
  vec3 n = clamp((c - u.x) / max(1.0 / 255.0, u.y - u.x), 0.0, 1.0);
  return u.z + (u.w - u.z) * pow(n, vec3(inversoDaGama));
}`,
  ),
  'preto-e-branco': sksl('', `vec3 ajustar(vec3 c) { return vec3(dot(c, vec3(0.3, 0.59, 0.11))); }`),
};

function uniformes(a: Ajuste): number[] {
  switch (a.tipo) {
    case 'matiz-saturacao':
      return [a.matiz / 360, a.saturacao / 100, a.luminosidade / 100];
    case 'brilho-contraste':
      return [a.contraste >= 0 ? 1 + a.contraste / 50 : 1 + a.contraste / 100, a.brilho / 255];
    case 'niveis':
      return [a.pretoDeEntrada / 255, a.brancoDeEntrada / 255, a.pretoDeSaida / 255, a.brancoDeSaida / 255, 1 / a.gama];
    case 'preto-e-branco':
      return [];
  }
}

export interface Ajustador {
  /** Shader de mesclagem do ajuste. Quem chama apaga depois de desenhar. */
  mesclador(ajuste: Ajuste): Blender;
  destruir(): void;
}

export function criarAjustador(ck: CanvasKit): Ajustador {
  const efeitos = new Map<Ajuste['tipo'], RuntimeEffect>();
  return {
    mesclador(ajuste) {
      let efeito = efeitos.get(ajuste.tipo);
      if (!efeito) {
        const novo = ck.RuntimeEffect.MakeForBlender(SKSL[ajuste.tipo], (erro) => {
          throw new Error(`Shader do ajuste "${ajuste.tipo}" não compilou: ${erro}`);
        });
        if (!novo) throw new Error(`Shader do ajuste "${ajuste.tipo}" não compilou`);
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
