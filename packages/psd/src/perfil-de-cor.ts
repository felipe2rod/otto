// O perfil de cor do arquivo importado. O Otto trabalha em sRGB (ADR 028, item 3), e um PSD pode vir em outro espaço
// RGB: Adobe RGB (1998) é o espaço de trabalho de muito Photoshop. Ler esses números como se fossem sRGB deixa a peça
// lavada. Aqui o perfil ICC embutido é lido e, quando é um perfil RGB de matriz e curva (os de espaço de trabalho são
// todos assim), as cores são convertidas para sRGB: curva do perfil, matriz dele até o espaço de conexão (XYZ D50),
// matriz do sRGB de volta, curva do sRGB. A cor que o sRGB não tem é cortada no limite dele, como faz a conversão
// colorimétrica relativa de qualquer programa.
import { sRgbParaLinear } from './perfil-srgb';
import type { Rgb } from './porta';

export interface ConversaoDeCor {
  /**
   * - srgb: o perfil é o sRGB, nada a converter;
   * - sem-perfil: o arquivo não traz perfil, e as cores são lidas como sRGB;
   * - convertido: perfil RGB de matriz e curva, convertido para sRGB;
   * - nao-reconhecido: perfil de outro tipo (tabela), e as cores são lidas como sRGB.
   */
  situacao: 'srgb' | 'sem-perfil' | 'convertido' | 'nao-reconhecido';
  /** a descrição que o perfil traz ("Adobe RGB (1998)") */
  nome?: string;
  /** converte os pixels RGBA no lugar. Só existe quando há o que converter. */
  pixels?(rgba: Uint8Array | Uint8ClampedArray): void;
  cor(c: Rgb): Rgb;
}

type Curva = (v: number) => number;
type Matriz3 = [number, number, number, number, number, number, number, number, number];

/** Primários do sRGB adaptados a D50, como em perfil-srgb.ts: colunas vermelho, verde, azul; linhas X, Y, Z. */
const SRGB: Matriz3 = [0x6fa2, 0x6299, 0x24a0, 0x38f5, 0xb785, 0x0f84, 0x0390, 0x18da, 0xb6cf].map((v) => v / 65536) as Matriz3;

function inversa(m: Matriz3): Matriz3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}
const vezes = (m: Matriz3, n: Matriz3): Matriz3 =>
  [0, 1, 2].flatMap((l) =>
    [0, 1, 2].map((c) => (m[l * 3] as number) * (n[c] as number) + (m[l * 3 + 1] as number) * (n[3 + c] as number) + (m[l * 3 + 2] as number) * (n[6 + c] as number)),
  ) as Matriz3;

/** O que interessa de um perfil ICC de matriz e curva. Qualquer coisa fora do esperado: undefined. */
function lerPerfil(b: Uint8Array): { nome?: string; matriz?: Matriz3; curvas?: [Curva, Curva, Curva] } | undefined {
  if (b.length < 132) return undefined;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sigla = (p: number): string => String.fromCharCode(b[p] as number, b[p + 1] as number, b[p + 2] as number, b[p + 3] as number);
  if (sigla(16) !== 'RGB ') return undefined;
  const fixo = (p: number): number => v.getInt32(p) / 65536;
  const etiquetas = new Map<string, [number, number]>();
  const quantas = v.getUint32(128);
  if (quantas > 200 || 132 + quantas * 12 > b.length) return undefined;
  for (let i = 0; i < quantas; i++) {
    const p = 132 + i * 12;
    const inicio = v.getUint32(p + 4);
    const tamanho = v.getUint32(p + 8);
    if (inicio + tamanho <= b.length) etiquetas.set(sigla(p), [inicio, tamanho]);
  }
  const saida: { nome?: string; matriz?: Matriz3; curvas?: [Curva, Curva, Curva] } = {};
  const desc = etiquetas.get('desc');
  if (desc && desc[1] >= 12) {
    const [p] = desc;
    if (sigla(p) === 'desc') {
      const n = Math.min(v.getUint32(p + 8), desc[1] - 12);
      saida.nome = String.fromCharCode(...b.subarray(p + 12, p + 12 + n)).replace(/\0+$/, '');
    } else if (sigla(p) === 'mluc' && desc[1] >= 28) {
      const n = v.getUint32(p + 20);
      const onde = p + v.getUint32(p + 24);
      if (onde + n <= b.length) {
        let t = '';
        for (let i = 0; i + 1 < n; i += 2) t += String.fromCharCode(v.getUint16(onde + i));
        saida.nome = t.replace(/\0+$/, '');
      }
    }
  }
  if (sigla(20) !== 'XYZ ') return saida;
  const xyz = (nome: string): [number, number, number] | undefined => {
    const e = etiquetas.get(nome);
    return e && e[1] >= 20 && sigla(e[0]) === 'XYZ ' ? [fixo(e[0] + 8), fixo(e[0] + 12), fixo(e[0] + 16)] : undefined;
  };
  const curva = (nome: string): Curva | undefined => {
    const e = etiquetas.get(nome);
    if (!e || e[1] < 12) return undefined;
    const [p, tamanho] = e;
    if (sigla(p) === 'curv') {
      const n = v.getUint32(p + 8);
      if (n === 0) return (x) => x;
      if (n === 1) {
        const gama = v.getUint16(p + 12) / 256;
        return (x) => x ** gama;
      }
      if (12 + n * 2 > tamanho) return undefined;
      // tabela: interpolação linear entre os pontos
      return (x) => {
        const t = x * (n - 1);
        const i = Math.min(n - 2, Math.floor(t));
        const a = v.getUint16(p + 12 + i * 2) / 65535;
        const c = v.getUint16(p + 14 + i * 2) / 65535;
        return a + (c - a) * (t - i);
      };
    }
    if (sigla(p) === 'para') {
      const tipo = v.getUint16(p + 8);
      const quantos = [1, 3, 4, 5, 7][tipo];
      if (quantos === undefined || 12 + quantos * 4 > tamanho) return undefined;
      const [g = 1, a = 1, bb = 0, c = 0, d = 0, e2 = 0, f = 0] = Array.from({ length: quantos }, (_, i) => fixo(p + 12 + i * 4));
      if (tipo === 0) return (x) => x ** g;
      if (tipo === 1) return (x) => (x >= -bb / a ? (a * x + bb) ** g : 0);
      if (tipo === 2) return (x) => (x >= -bb / a ? (a * x + bb) ** g + c : c);
      if (tipo === 3) return (x) => (x >= d ? (a * x + bb) ** g : c * x);
      return (x) => (x >= d ? (a * x + bb) ** g + e2 : c * x + f);
    }
    return undefined;
  };
  const r = xyz('rXYZ');
  const g = xyz('gXYZ');
  const bl = xyz('bXYZ');
  const cr = curva('rTRC');
  const cg = curva('gTRC');
  const cb = curva('bTRC');
  if (r && g && bl && cr && cg && cb) {
    saida.matriz = [r[0], g[0], bl[0], r[1], g[1], bl[1], r[2], g[2], bl[2]];
    saida.curvas = [cr, cg, cb];
  }
  return saida;
}

const identidade = (c: Rgb): Rgb => c;

/** Como levar as cores do arquivo para sRGB, pelo perfil ICC embutido nele. */
export function conversaoParaSrgb(perfil: Uint8Array | undefined): ConversaoDeCor {
  if (!perfil || perfil.length === 0) return { situacao: 'sem-perfil', cor: identidade };
  const lido = lerPerfil(perfil);
  const nome = lido?.nome ? { nome: lido.nome } : {};
  if (!lido?.matriz || !lido.curvas) return { situacao: 'nao-reconhecido', ...nome, cor: identidade };
  const { matriz, curvas } = lido;
  // é o próprio sRGB? Os primários e a curva batem (a 0,3%)
  const mesmosPrimarios = matriz.every((v, i) => Math.abs(v - (SRGB[i] as number)) < 0.003);
  const mesmaCurva = curvas.every((c) => [0.1, 0.2, 0.5, 0.8].every((x) => Math.abs(c(x) - sRgbParaLinear(x)) < 0.003));
  if (mesmosPrimarios && mesmaCurva) return { situacao: 'srgb', ...nome, cor: identidade };

  const m = vezes(inversa(SRGB), matriz);
  // do valor de 8 bits do arquivo para luz linear, por canal
  const linear = curvas.map((c) => Float64Array.from({ length: 256 }, (_, i) => Math.max(0, Math.min(1, c(i / 255))))) as [Float64Array, Float64Array, Float64Array];
  // de luz linear para o valor de 8 bits do sRGB, em 4096 degraus
  const DEGRAUS = 4096;
  const codificar = Uint8Array.from({ length: DEGRAUS + 1 }, (_, i) => {
    const x = i / DEGRAUS;
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  });
  const sair = (x: number): number => codificar[Math.round(Math.max(0, Math.min(1, x)) * DEGRAUS)] as number;
  const um = (r: number, g: number, b: number): [number, number, number] => {
    const lr = linear[0][r] as number;
    const lg = linear[1][g] as number;
    const lb = linear[2][b] as number;
    return [sair(m[0] * lr + m[1] * lg + m[2] * lb), sair(m[3] * lr + m[4] * lg + m[5] * lb), sair(m[6] * lr + m[7] * lg + m[8] * lb)];
  };
  return {
    situacao: 'convertido',
    ...nome,
    pixels(rgba) {
      for (let i = 0; i < rgba.length; i += 4) {
        // transparente por inteiro: a cor não aparece
        if (rgba[i + 3] === 0) continue;
        const [r, g, b] = um(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number);
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
      }
    },
    cor(c) {
      const [r, g, b] = um(c.r, c.g, c.b);
      return { r, g, b };
    },
  };
}
