// Importação de SVG (logo, ícone) para uma camada vetorial do Otto.
// Tudo é normalizado para curvas cúbicas absolutas (M, C, Z): é o que o render desenha
// e o que vira camada de forma no PSD. O que não tem equivalente vira aviso, não some calado.
//
// ORIGEM: veio de poc/src/servidor/svg.ts quase como estava (ADR 035). O mapeamento SVG → vetor é
// território do especialista-grafico: este arquivo deve ir para um pacote do núcleo quando ele
// decidir onde. O que mudou aqui é só a borda: entrada hostil (seção 10 de docs/mvp/backend.md)
// e erro com código em vez de frase.
//
// Os AVISOS são frases que a pessoa lê: texto público, ainda sem revisão do guardião da marca.
import { XMLParser } from 'fast-xml-parser';

/** Por que um SVG foi recusado. É código, não frase: a frase é do editor. */
export type MotivoDaRecusaDoSvg = 'sem_svg' | 'sem_formas' | 'entidades' | 'malformado' | 'grande_demais';

export class SvgRecusado extends Error {
  constructor(readonly motivo: MotivoDaRecusaDoSvg) {
    super(`svg recusado: ${motivo}`);
    this.name = 'SvgRecusado';
  }
}

/** Tetos de entrada. Um logo de verdade fica muito abaixo disto. */
const ELEMENTOS_NO_MAXIMO = 20_000;
const CAMINHOS_NO_MAXIMO = 400;

type Ponto = [number, number];
type Matriz = [number, number, number, number, number, number];
/** Subcaminho: ponto inicial e segmentos cúbicos [c1, c2, fim]; fechado ou não. */
interface Subcaminho {
  inicio: Ponto;
  segmentos: [Ponto, Ponto, Ponto][];
  fechado: boolean;
}

export interface TracoImportado {
  cor: string;
  espessura: number;
  ponta: 'reta' | 'redonda' | 'quadrada';
  juncao: 'angular' | 'redonda' | 'chanfrada';
}

export interface CaminhoImportado {
  d: string;
  preenchimento?: string;
  traco?: TracoImportado;
  regra: 'nao-zero' | 'par-impar';
}

type Herdado = { fill?: string; regra?: string; stroke?: string; largura?: string; ponta?: string; juncao?: string };
const PONTAS: Record<string, TracoImportado['ponta']> = { butt: 'reta', round: 'redonda', square: 'quadrada' };
const JUNCOES: Record<string, TracoImportado['juncao']> = { miter: 'angular', 'miter-clip': 'angular', arcs: 'angular', round: 'redonda', bevel: 'chanfrada' };

export interface VetorImportado {
  moldura: [number, number];
  caminhos: CaminhoImportado[];
  avisos: string[];
}

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];
const mult = (a: Matriz, b: Matriz): Matriz => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const aplicar = (m: Matriz, [x, y]: Ponto): Ponto => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function lerTransformacao(t: string | undefined): Matriz {
  if (!t) return IDENTIDADE;
  let m = IDENTIDADE;
  for (const [, nome, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = (args ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let k: Matriz = IDENTIDADE;
    if (nome === 'matrix') k = v.slice(0, 6) as Matriz;
    else if (nome === 'translate') k = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (nome === 'scale') k = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (nome === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180;
      const r: Matriz = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
      k = v.length >= 3 ? mult(mult([1, 0, 0, 1, v[1]!, v[2]!], r), [1, 0, 0, 1, -v[1]!, -v[2]!]) : r;
    } else if (nome === 'skewX') k = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (nome === 'skewY') k = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mult(m, k);
  }
  return m;
}

// ---------- caminho SVG → cúbicas ----------

function arcoParaCubicas(p0: Ponto, rx: number, ry: number, rotGraus: number, grande: boolean, horario: boolean, p1: Ponto): [Ponto, Ponto, Ponto][] {
  // conversão padrão (SVG 1.1, apêndice F.6) de arco elíptico em cúbicas de até 90°
  if (rx === 0 || ry === 0) return [[p0, p1, p1]];
  const phi = (rotGraus * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sinal = grande === horario ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const co = sinal * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cxp = (co * rx * y1) / ry;
  const cyp = (-co * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!horario && dt > 0) dt -= 2 * Math.PI;
  if (horario && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const passo = dt / n;
  const k = (4 / 3) * Math.tan(passo / 4);
  const ponto = (t: number): Ponto => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): Ponto => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segs: [Ponto, Ponto, Ponto][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * passo;
    const b = a + passo;
    const pa = ponto(a);
    const pb = ponto(b);
    const da = deriv(a);
    const db = deriv(b);
    segs.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb]);
  }
  return segs;
}

export function caminhoParaSubcaminhos(d: string): Subcaminho[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Subcaminho[] = [];
  let atual: Subcaminho | undefined;
  let p: Ponto = [0, 0];
  let inicio: Ponto = [0, 0];
  let ultimoC2: Ponto | undefined;
  let ultimoQ: Ponto | undefined;
  let cmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  const temNumero = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  const linha = (q: Ponto) => {
    atual!.segmentos.push([p, q, q]);
    p = q;
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const base = (x: number, y: number): Ponto => (rel ? [p[0] + x, p[1] + y] : [x, y]);
    switch (cmd.toUpperCase()) {
      case 'M': {
        p = base(num(), num());
        inicio = p;
        atual = { inicio: p, segmentos: [], fechado: false };
        subs.push(atual);
        cmd = rel ? 'l' : 'L'; // pares seguintes do M são linhas
        ultimoC2 = ultimoQ = undefined;
        break;
      }
      case 'L':
        linha(base(num(), num()));
        ultimoC2 = ultimoQ = undefined;
        break;
      case 'H': {
        const x = num();
        linha([rel ? p[0] + x : x, p[1]]);
        ultimoC2 = ultimoQ = undefined;
        break;
      }
      case 'V': {
        const y = num();
        linha([p[0], rel ? p[1] + y : y]);
        ultimoC2 = ultimoQ = undefined;
        break;
      }
      case 'C': {
        const c1 = base(num(), num());
        const c2 = base(num(), num());
        const f = base(num(), num());
        atual!.segmentos.push([c1, c2, f]);
        ultimoC2 = c2;
        ultimoQ = undefined;
        p = f;
        break;
      }
      case 'S': {
        const c1: Ponto = ultimoC2 ? [2 * p[0] - ultimoC2[0], 2 * p[1] - ultimoC2[1]] : p;
        const c2 = base(num(), num());
        const f = base(num(), num());
        atual!.segmentos.push([c1, c2, f]);
        ultimoC2 = c2;
        ultimoQ = undefined;
        p = f;
        break;
      }
      case 'Q':
      case 'T': {
        const q: Ponto = cmd.toUpperCase() === 'Q' ? base(num(), num()) : ultimoQ ? [2 * p[0] - ultimoQ[0], 2 * p[1] - ultimoQ[1]] : p;
        const f = base(num(), num());
        atual!.segmentos.push([[p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], [f[0] + (2 / 3) * (q[0] - f[0]), f[1] + (2 / 3) * (q[1] - f[1])], f]);
        ultimoQ = q;
        ultimoC2 = undefined;
        p = f;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const grande = num() !== 0;
        const horario = num() !== 0;
        const f = base(num(), num());
        atual!.segmentos.push(...arcoParaCubicas(p, rx, ry, rot, grande, horario, f));
        ultimoC2 = ultimoQ = undefined;
        p = f;
        break;
      }
      case 'Z':
        if (atual) atual.fechado = true;
        p = inicio;
        ultimoC2 = ultimoQ = undefined;
        // um M implícito recomeça no mesmo ponto se vier desenho depois do Z
        if (temNumero()) {
          atual = { inicio: p, segmentos: [], fechado: false };
          subs.push(atual);
        }
        break;
      default:
        i++;
    }
    if (!temNumero() && i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!)) i++;
  }
  return subs.filter((s) => s.segmentos.length > 0);
}

/** Medida do SVG: número, px ou porcentagem da largura/altura do viewBox. */
function medida(v: string | undefined, total: number): number {
  if (v === undefined) return 0;
  const t = v.trim();
  if (t.endsWith('%')) return (Number.parseFloat(t) / 100) * total;
  return Number.parseFloat(t) || 0;
}

let tamanhoDaTela: [number, number] = [0, 0];

function formaParaCaminho(tag: string, a: Record<string, string>): string | undefined {
  const eixo = (k: string) => (/^(x|cx|width|rx)$/.test(k) ? tamanhoDaTela[0] : /^(y|cy|height|ry)$/.test(k) ? tamanhoDaTela[1] : Math.hypot(...tamanhoDaTela) / Math.SQRT2);
  const n = (k: string) => medida(a[k], eixo(k));
  if (tag === 'path') return a.d;
  if (tag === 'rect') {
    const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
    const rx = Math.min(medida(a.rx ?? a.ry, tamanhoDaTela[0]), w / 2);
    const ry = Math.min(medida(a.ry ?? a.rx, tamanhoDaTela[1]), h / 2);
    if (!rx && !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const [cx, cy] = [n('cx'), n('cy')];
    const rx = tag === 'circle' ? n('r') : n('rx');
    const ry = tag === 'circle' ? n('r') : n('ry');
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const v = (a.points ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (v.length < 4) return undefined;
    let d = `M${v[0]} ${v[1]}`;
    for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
    return tag === 'polygon' ? `${d}Z` : d;
  }
  return undefined;
}

// ---------- cor ----------

const NOMES: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  silver: '#c0c0c0',
};

function normalizarCor(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const v = c.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return 'none';
  if (v === 'currentcolor') return '#000000';
  if (NOMES[v]) return NOMES[v];
  const h3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (h3) return `#${h3[1]}${h3[1]}${h3[2]}${h3[2]}${h3[3]}${h3[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
  return undefined;
}

// ---------- documento ----------

interface No {
  tag: string;
  attrs: Record<string, string>;
  filhos: No[];
  texto?: string;
}

function converterArvore(bruto: unknown[]): No[] {
  const saida: No[] = [];
  for (const item of bruto as Record<string, unknown>[]) {
    const tag = Object.keys(item).find((k) => k !== ':@');
    if (!tag) continue;
    const attrs = Object.fromEntries(Object.entries((item[':@'] as Record<string, string>) ?? {}).map(([k, v]) => [k.replace(/^@_/, ''), String(v)]));
    if (tag === '#text') continue;
    const conteudo = item[tag];
    const filhos = Array.isArray(conteudo) ? converterArvore(conteudo) : [];
    const texto = Array.isArray(conteudo) ? (conteudo as Record<string, unknown>[]).map((c) => c['#text'] ?? '').join('') : undefined;
    saida.push({ tag: tag.replace(/^svg:/, ''), attrs, filhos, ...(texto ? { texto } : {}) });
  }
  return saida;
}

function estilos(el: No): Record<string, string> {
  const r: Record<string, string> = {};
  for (const par of (el.attrs.style ?? '').split(';')) {
    const [k, v] = par.split(':');
    if (k && v) r[k.trim()] = v.trim();
  }
  return r;
}

export function importarSvg(svg: string): VetorImportado {
  try {
    return importar(svg);
  } catch (e) {
    if (e instanceof SvgRecusado) throw e;
    // XML quebrado, aninhamento que estoura a pilha, número que não é número: tudo é "malformado"
    throw new SvgRecusado('malformado');
  }
}

function importar(svg: string): VetorImportado {
  // Declaração de entidade é o caminho da bomba de entidades e da entidade externa. Logo de verdade
  // não precisa: recusa antes de ler. (DOCTYPE sem entidade, comum em exportação antiga, passa.)
  if (/<!ENTITY/i.test(svg)) throw new SvgRecusado('entidades');
  if ((svg.match(/</g)?.length ?? 0) > ELEMENTOS_NO_MAXIMO) throw new SvgRecusado('grande_demais');
  // processEntities desligado: nenhuma entidade é expandida, nem as do próprio arquivo
  const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, attributeNamePrefix: '@_', allowBooleanAttributes: true, processEntities: false });
  const raiz = converterArvore(parser.parse(svg) as unknown[]).find((n) => n.tag === 'svg');
  if (!raiz) throw new SvgRecusado('sem_svg');
  const avisos = new Set<string>();

  // CSS de classe (.cls-1{fill:#...}), comum em logo exportado do Illustrator
  const css: Record<string, Record<string, string>> = {};
  const gradientes: Record<string, string> = {};
  const varrerDefs = (n: No) => {
    if (n.tag === 'style' && n.texto) {
      for (const [, seletores, corpo] of n.texto.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const decl: Record<string, string> = {};
        for (const par of (corpo ?? '').split(';')) {
          const [k, v] = par.split(':');
          if (k && v) decl[k.trim()] = v.trim();
        }
        for (const sel of (seletores ?? '').split(',')) {
          const m = sel.trim().match(/^\.([\w-]+)$/);
          if (m) css[m[1]!] = { ...css[m[1]!], ...decl };
        }
      }
    }
    if ((n.tag === 'linearGradient' || n.tag === 'radialGradient') && n.attrs.id) {
      const parada = n.filhos.find((f) => f.tag === 'stop');
      const cor = parada ? normalizarCor(parada.attrs['stop-color'] ?? estilos(parada)['stop-color']) : undefined;
      if (cor) gradientes[n.attrs.id] = cor;
    }
    n.filhos.forEach(varrerDefs);
  };
  varrerDefs(raiz);

  const brutos: { subs: Subcaminho[]; cor?: string; traco?: TracoImportado; regra: 'nao-zero' | 'par-impar' }[] = [];
  const percorrer = (n: No, m: Matriz, herdado: Herdado) => {
    if (n.tag === 'defs' || n.tag === 'clipPath' || n.tag === 'mask' || n.tag === 'style' || n.tag === 'title' || n.tag === 'desc' || n.tag === 'metadata') return;
    if (n.tag === 'text') {
      avisos.add('texto dentro do SVG não é importado; converta em contornos no Illustrator');
      return;
    }
    if (n.tag === 'image') {
      avisos.add('imagem embutida no SVG não é importada');
      return;
    }
    if (n.tag === 'use') avisos.add('elemento <use> não é importado');
    if (n.attrs['clip-path'] || n.attrs.mask) avisos.add('recorte (clip-path) e máscara do SVG são ignorados: o desenho entra sem o recorte');
    const matriz = mult(m, lerTransformacao(n.attrs.transform));
    const st = estilos(n);
    const classe = (n.attrs.class ?? '').split(/\s+/).reduce<Record<string, string>>((acc, c) => Object.assign(acc, css[c] ?? {}), {});
    const prop = (k: string) => st[k] ?? n.attrs[k] ?? classe[k];
    const fillBruto = prop('fill') ?? herdado.fill;
    const regra = prop('fill-rule') ?? herdado.regra;
    const herda: Herdado = { ...herdado };
    if (fillBruto !== undefined) herda.fill = fillBruto;
    if (regra !== undefined) herda.regra = regra;
    for (const [k, attr] of [
      ['stroke', 'stroke'],
      ['largura', 'stroke-width'],
      ['ponta', 'stroke-linecap'],
      ['juncao', 'stroke-linejoin'],
    ] as const) {
      const v = prop(attr);
      if (v !== undefined) herda[k] = v;
    }
    if ((prop('opacity') ?? prop('fill-opacity') ?? prop('stroke-opacity')) !== undefined) avisos.add('transparência do SVG é ignorada');
    if (prop('stroke-dasharray') && prop('stroke-dasharray') !== 'none') avisos.add('traço tracejado (stroke-dasharray) entra contínuo');
    const d = formaParaCaminho(n.tag, n.attrs);
    if (d) {
      let cor: string | undefined;
      const url = fillBruto?.match(/url\(#([^)]+)\)/);
      if (url) {
        cor = gradientes[url[1]!];
        avisos.add('degradê do SVG vira cor sólida (a primeira cor do degradê)');
      } else cor = fillBruto === undefined ? '#000000' : normalizarCor(fillBruto);
      let traco: TracoImportado | undefined;
      const urlDoTraco = herda.stroke?.match(/url\(#([^)]+)\)/);
      const corDoTraco = !herda.stroke || herda.stroke === 'none' ? undefined : urlDoTraco ? gradientes[urlDoTraco[1]!] : normalizarCor(herda.stroke);
      if (corDoTraco && corDoTraco !== 'none') {
        // a espessura acompanha a escala da transformação (média geométrica dos eixos)
        const escala = Math.sqrt(Math.abs(matriz[0] * matriz[3] - matriz[1] * matriz[2]));
        const espessura = (herda.largura === undefined ? 1 : medida(herda.largura, 1)) * escala;
        if (espessura > 0) traco = { cor: corDoTraco, espessura: Math.round(espessura * 100) / 100, ponta: PONTAS[herda.ponta ?? ''] ?? 'reta', juncao: JUNCOES[herda.juncao ?? ''] ?? 'angular' };
      }
      const preenche = cor && cor !== 'none' ? cor : undefined;
      if (preenche || traco) {
        const subs = caminhoParaSubcaminhos(d).map((s) => ({
          inicio: aplicar(matriz, s.inicio),
          segmentos: s.segmentos.map((g) => g.map((q) => aplicar(matriz, q)) as [Ponto, Ponto, Ponto]),
          fechado: s.fechado,
        }));
        if (subs.length) brutos.push({ subs, ...(preenche ? { cor: preenche } : {}), ...(traco ? { traco } : {}), regra: regra === 'evenodd' ? 'par-impar' : 'nao-zero' });
      }
    }
    for (const f of n.filhos) percorrer(f, matriz, herda);
  };
  // viewBox → origem no zero
  const vb = (raiz.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  tamanhoDaTela = vb.length === 4 ? [vb[2]!, vb[3]!] : [medida(raiz.attrs.width, 0) || 100, medida(raiz.attrs.height, 0) || 100];
  const m0: Matriz = vb.length === 4 ? [1, 0, 0, 1, -vb[0]!, -vb[1]!] : IDENTIDADE;
  percorrer(raiz, m0, {});
  if (brutos.length === 0) throw new SvgRecusado('sem_formas');

  // caixa de tudo o que foi desenhado (com meia espessura do traço): o logo encosta na moldura, sem margem vazia
  const pts = brutos.flatMap((b) => b.subs.flatMap((s) => [s.inicio, ...s.segmentos.map((g) => g[2])]));
  const folga = Math.max(0, ...brutos.map((b) => (b.traco ? b.traco.espessura / 2 : 0)));
  const x0 = Math.min(...pts.map((p) => p[0])) - folga;
  const y0 = Math.min(...pts.map((p) => p[1])) - folga;
  const x1 = Math.max(...pts.map((p) => p[0])) + folga;
  const y1 = Math.max(...pts.map((p) => p[1])) + folga;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const fmt = ([x, y]: Ponto) => `${r2(x - x0)} ${r2(y - y0)}`;
  const paraD = (subs: Subcaminho[]) => subs.map((s) => `M${fmt(s.inicio)}${s.segmentos.map((g) => `C${fmt(g[0])} ${fmt(g[1])} ${fmt(g[2])}`).join('')}${s.fechado ? 'Z' : ''}`).join('');

  // caminhos seguidos com a mesma cor e regra viram um só (menos camadas no PSD, mesma aparência)
  const caminhos: CaminhoImportado[] = [];
  for (const b of brutos) {
    const ultimo = caminhos.at(-1);
    if (ultimo && ultimo.preenchimento === b.cor && ultimo.regra === b.regra && JSON.stringify(ultimo.traco) === JSON.stringify(b.traco)) ultimo.d += paraD(b.subs);
    else caminhos.push({ d: paraD(b.subs), ...(b.cor ? { preenchimento: b.cor } : {}), ...(b.traco ? { traco: b.traco } : {}), regra: b.regra });
  }
  if (caminhos.length > CAMINHOS_NO_MAXIMO) throw new SvgRecusado('grande_demais');
  const moldura: [number, number] = [Math.max(1, r2(x1 - x0)), Math.max(1, r2(y1 - y0))];
  if (!Number.isFinite(moldura[0]) || !Number.isFinite(moldura[1])) throw new SvgRecusado('malformado');
  return { moldura, caminhos, avisos: [...avisos] };
}

/** Subcaminhos de um "d" já normalizado (M, C, Z), para montar a máscara vetorial do PSD. */
export function subcaminhosNormalizados(d: string): Subcaminho[] {
  return caminhoParaSubcaminhos(d);
}
