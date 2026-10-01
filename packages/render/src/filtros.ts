// Filtros que mexem no pixel da camada já desenhada: ruído, nitidez e desfoque de movimento.
// Cada um tem a conta duas vezes: em laço de pixel, sobre memória premultiplicada (o render de referência, em CPU),
// e em shader (a prévia em GPU). Os testes prendem um ao outro.
// O desfoque gaussiano não está aqui: é o do próprio Skia, igual nos dois caminhos.
import type { CanvasKit, RuntimeEffect, Shader } from 'canvaskit-wasm';
import { RUIDO_SKSL, ruidoEm } from './ruido';

/** Como ir do pixel de um passe (superfície temporária da camada) à coordenada local da camada, sem a rotação dela. */
export interface GeometriaDoPasse {
  /** canto da superfície do passe, em pixel do alvo */
  x0: number;
  y0: number;
  /** pixel do alvo = documento × escala + (tx, ty) */
  escala: number;
  tx: number;
  ty: number;
  /** rotação da camada, em graus, em torno de (cx, cy), no documento */
  rotacao: number;
  cx: number;
  cy: number;
  /** canto da caixa da camada: o grão é ancorado nele e acompanha a camada quando ela se move */
  origemX: number;
  origemY: number;
}

const lim1 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------- laço de pixel ----------

export function ruidoNoPixel(pixels: Uint8Array, largura: number, altura: number, g: GeometriaDoPasse, quantidade: number, monocromatico: boolean, semente: number): void {
  const a = (g.rotacao * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const a8 = pixels[i + 3] as number;
      if (a8 === 0) continue;
      // centro do pixel → documento → desfaz a rotação da camada → relativo ao canto da caixa
      const dx = (x + 0.5 + g.x0 - g.tx) / g.escala - g.cx;
      const dy = (y + 0.5 + g.y0 - g.ty) / g.escala - g.cy;
      const ix = Math.floor(dx * cos + dy * sen + g.cx - g.origemX);
      const iy = Math.floor(-dx * sen + dy * cos + g.cy - g.origemY);
      const n0 = ruidoEm(ix, iy, 0, semente);
      for (let k = 0; k < 3; k++) {
        const n = monocromatico || k === 0 ? n0 : ruidoEm(ix, iy, k, semente);
        const cor = lim1((pixels[i + k] as number) / a8 + (n - 0.5) * 2 * quantidade);
        pixels[i + k] = Math.round(cor * a8);
      }
    }
  }
}

/** Máscara de nitidez: original + (original − borrada) × quantidade, na cor sem premultiplicar. O alfa é o do original. */
export function nitidezNoPixel(original: Uint8Array, borrada: Uint8Array, quantidade: number): void {
  for (let i = 0; i < original.length; i += 4) {
    const a8 = original[i + 3] as number;
    if (a8 === 0) continue;
    const b8 = borrada[i + 3] as number;
    for (let k = 0; k < 3; k++) {
      const o = lim1((original[i + k] as number) / a8);
      const b = b8 > 0 ? lim1((borrada[i + k] as number) / b8) : o;
      original[i + k] = Math.round(lim1(o + (o - b) * quantidade) * a8);
    }
  }
}

/** Quantas amostras o desfoque de movimento tira ao longo da distância (em unidades do documento). */
export const passosDoMovimento = (distancia: number): number => Math.max(2, Math.min(64, Math.round(distancia)));

/**
 * Desfoque de movimento: média de amostras ao longo de uma reta, em passos de pixel inteiro. Fora da superfície é transparente.
 * "distancia" já vem em pixels do alvo; o ângulo segue a convenção do documento (0 para a direita, 90 para cima).
 */
export function movimentoNoPixel(pixels: Uint8Array, largura: number, altura: number, angulo: number, distancia: number, passos: number): void {
  const a = (angulo * Math.PI) / 180;
  const dx = Math.fround(Math.cos(a));
  const dy = Math.fround(-Math.sin(a));
  const deslocamentos: [number, number][] = [];
  for (let k = 0; k < passos; k++) {
    // em precisão simples, como o shader: o arredondamento do passo cai no mesmo pixel
    const t = Math.fround(Math.fround(Math.fround(k / (passos - 1)) - 0.5) * Math.fround(distancia));
    deslocamentos.push([Math.floor(Math.fround(Math.fround(dx * t) + 0.5)), Math.floor(Math.fround(Math.fround(dy * t) + 0.5))]);
  }
  const origem = pixels.slice();
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (const [ox, oy] of deslocamentos) {
        const sx = x + ox;
        const sy = y + oy;
        if (sx < 0 || sy < 0 || sx >= largura || sy >= altura) continue;
        const j = (sy * largura + sx) * 4;
        r += origem[j] as number;
        g += origem[j + 1] as number;
        b += origem[j + 2] as number;
        al += origem[j + 3] as number;
      }
      const i = (y * largura + x) * 4;
      pixels[i] = Math.round(r / passos);
      pixels[i + 1] = Math.round(g / passos);
      pixels[i + 2] = Math.round(b / passos);
      pixels[i + 3] = Math.round(al / passos);
    }
  }
}

// ---------- shaders (SkSL) ----------

const SKSL = {
  ruido: `
uniform shader conteudo;
uniform vec2 canto;          // x0, y0
uniform vec3 transformacao;  // escala, tx, ty
uniform vec4 giro;           // cos, sen, cx, cy
uniform vec2 origem;
uniform vec3 parametros;     // quantidade, monocromático (0 ou 1), semente
${RUIDO_SKSL}
vec4 main(vec2 p) {
  vec4 c = conteudo.eval(p);
  if (c.a <= 0.0) return c;
  vec2 d = (p + canto - transformacao.yz) / transformacao.x - giro.zw;
  vec2 celula = floor(vec2(d.x * giro.x + d.y * giro.y, -d.x * giro.y + d.y * giro.x) + giro.zw - origem);
  float n0 = ruidoEm(celula, 0.0, parametros.z);
  vec3 n = parametros.y > 0.5 ? vec3(n0) : vec3(n0, ruidoEm(celula, 1.0, parametros.z), ruidoEm(celula, 2.0, parametros.z));
  vec3 cor = clamp(c.rgb / c.a + (n - 0.5) * 2.0 * parametros.x, 0.0, 1.0);
  return vec4(cor * c.a, c.a);
}`,
  nitidez: `
uniform shader original;
uniform shader borrada;
uniform float quantidade;
vec4 main(vec2 p) {
  vec4 o = original.eval(p);
  if (o.a <= 0.0) return o;
  vec4 b = borrada.eval(p);
  vec3 co = clamp(o.rgb / o.a, 0.0, 1.0);
  vec3 cb = b.a > 0.0 ? clamp(b.rgb / b.a, 0.0, 1.0) : co;
  return vec4(clamp(co + (co - cb) * quantidade, 0.0, 1.0) * o.a, o.a);
}`,
  movimento: `
uniform shader conteudo;
uniform vec2 direcao;
uniform vec2 parametros;  // passos, distância em pixels do alvo
vec4 main(vec2 p) {
  vec4 soma = vec4(0.0);
  for (int k = 0; k < 64; k++) {
    if (float(k) < parametros.x) {
      float t = (float(k) / (parametros.x - 1.0) - 0.5) * parametros.y;
      soma += conteudo.eval(p + floor(direcao * t + 0.5));
    }
  }
  return soma / parametros.x;
}`,
} as const;

export type FiltroPorShader = keyof typeof SKSL;

export interface Filtrador {
  /** Shader do filtro sobre as imagens de entrada (como shaders, amostradas no pixel exato). Quem chama apaga. */
  shader(filtro: FiltroPorShader, uniformes: number[], entradas: Shader[]): Shader;
  destruir(): void;
}

export function uniformesDoRuido(g: GeometriaDoPasse, quantidade: number, monocromatico: boolean, semente: number): number[] {
  const a = (g.rotacao * Math.PI) / 180;
  return [g.x0, g.y0, g.escala, g.tx, g.ty, Math.cos(a), Math.sin(a), g.cx, g.cy, g.origemX, g.origemY, quantidade, monocromatico ? 1 : 0, semente];
}

export function uniformesDoMovimento(angulo: number, distancia: number, passos: number): number[] {
  const a = (angulo * Math.PI) / 180;
  return [Math.cos(a), -Math.sin(a), passos, distancia];
}

export function criarFiltrador(ck: CanvasKit): Filtrador {
  const efeitos = new Map<FiltroPorShader, RuntimeEffect>();
  return {
    shader(filtro, uniformes, entradas) {
      let efeito = efeitos.get(filtro);
      if (!efeito) {
        let erroDeCompilacao = '';
        const novo = ck.RuntimeEffect.Make(SKSL[filtro], (erro) => {
          erroDeCompilacao = erro;
        });
        if (!novo) throw new Error(`O shader do filtro "${filtro}" não compilou: ${erroDeCompilacao}`);
        efeito = novo;
        efeitos.set(filtro, efeito);
      }
      return efeito.makeShaderWithChildren(uniformes, entradas);
    },
    destruir() {
      for (const e of efeitos.values()) e.delete();
      efeitos.clear();
    },
  };
}
