// Geometria vetorial da exportação: a forma e o caminho do documento como nós de Bézier.
import type { NoDeBezier } from './porta';

/** Constante da aproximação de um quarto de círculo por uma cúbica. */
const K = 0.5522847498;

type Ponto = [number, number];
export type Mapa = (x: number, y: number) => Ponto;

const no = (chegada: Ponto, ancora: Ponto, saida: Ponto, ligado: boolean): NoDeBezier => ({ chegada, ancora, saida, ligado });

/** Retângulo (com raio) ou elipse como caminho fechado, no sentido horário, começando em cima. */
export function nosDaForma(forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number): NoDeBezier[] {
  if (forma === 'elipse') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    return [
      no([cx - rx * K, cy - ry], [cx, cy - ry], [cx + rx * K, cy - ry], true),
      no([cx + rx, cy - ry * K], [cx + rx, cy], [cx + rx, cy + ry * K], true),
      no([cx + rx * K, cy + ry], [cx, cy + ry], [cx - rx * K, cy + ry], true),
      no([cx - rx, cy + ry * K], [cx - rx, cy], [cx - rx, cy - ry * K], true),
    ];
  }
  const r = Math.min(raio, w / 2, h / 2);
  const canto = (px: number, py: number): NoDeBezier => no([px, py], [px, py], [px, py], false);
  if (r <= 0) return [canto(x, y), canto(x + w, y), canto(x + w, y + h), canto(x, y + h)];
  const c = r * K;
  return [
    no([x + r - c, y], [x + r, y], [x + r, y], false),
    no([x + w - r, y], [x + w - r, y], [x + w - r + c, y], false),
    no([x + w, y + r - c], [x + w, y + r], [x + w, y + r], false),
    no([x + w, y + h - r], [x + w, y + h - r], [x + w, y + h - r + c], false),
    no([x + w - r + c, y + h], [x + w - r, y + h], [x + w - r, y + h], false),
    no([x + r, y + h], [x + r, y + h], [x + r - c, y + h], false),
    no([x, y + h - r + c], [x, y + h - r], [x, y + h - r], false),
    no([x, y + r], [x, y + r], [x, y + r - c], false),
  ];
}

export const mapearNos = (nos: readonly NoDeBezier[], f: Mapa): NoDeBezier[] => nos.map((n) => ({ ...n, chegada: f(...n.chegada), ancora: f(...n.ancora), saida: f(...n.saida) }));

export interface Subcaminho {
  inicio: Ponto;
  /** cada segmento: controle 1, controle 2, ponto final */
  segmentos: [Ponto, Ponto, Ponto][];
  fechado: boolean;
}

/**
 * Subcaminhos de um "d" do documento. O esquema só aceita M, C e Z, em coordenadas absolutas (quem importa o SVG normaliza).
 * Qualquer outra coisa devolve undefined: a exportação então grava a camada como pixel, com aviso.
 */
export function subcaminhosDe(d: string): Subcaminho[] | undefined {
  const fichas = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!fichas) return undefined;
  const subcaminhos: Subcaminho[] = [];
  let atual: Subcaminho | undefined;
  let comando = '';
  let i = 0;
  const numero = (): number | undefined => {
    const ficha = fichas[i];
    if (ficha === undefined || /^[a-zA-Z]$/.test(ficha)) return undefined;
    i++;
    return Number(ficha);
  };
  const ponto = (): Ponto | undefined => {
    const x = numero();
    const y = numero();
    return x === undefined || y === undefined ? undefined : [x, y];
  };
  while (i < fichas.length) {
    const ficha = fichas[i] as string;
    if (/^[a-zA-Z]$/.test(ficha)) {
      comando = ficha;
      i++;
      if (comando === 'Z' || comando === 'z') {
        if (!atual) return undefined;
        atual.fechado = true;
        atual = undefined;
        continue;
      }
    }
    if (comando === 'M') {
      const p = ponto();
      if (!p) return undefined;
      atual = { inicio: p, segmentos: [], fechado: false };
      subcaminhos.push(atual);
      // números que seguem um M sem outro comando seriam linhas: fora do que o esquema aceita
      comando = '';
    } else if (comando === 'C') {
      const c1 = ponto();
      const c2 = ponto();
      const fim = ponto();
      if (!atual || !c1 || !c2 || !fim) return undefined;
      atual.segmentos.push([c1, c2, fim]);
    } else return undefined;
  }
  const comDesenho = subcaminhos.filter((s) => s.segmentos.length > 0);
  return comDesenho.length > 0 ? comDesenho : undefined;
}

/** Subcaminho como nós de Bézier (controle de chegada, âncora, controle de saída), levados ao arquivo por "f". */
export function nosDoSubcaminho(sub: Subcaminho, f: Mapa): { nos: NoDeBezier[]; aberto: boolean } {
  const segmentos = sub.segmentos;
  const ultimo = segmentos[segmentos.length - 1] as [Ponto, Ponto, Ponto];
  // o último segmento já volta ao início: o ponto final não vira um nó a mais
  const fechaSozinho = Math.hypot(ultimo[2][0] - sub.inicio[0], ultimo[2][1] - sub.inicio[1]) < 0.01;
  const ancoras: Ponto[] = [sub.inicio, ...segmentos.map((s) => s[2])];
  if (fechaSozinho) ancoras.pop();
  const nos = ancoras.map((ancora, i): NoDeBezier => {
    const chegada = i === 0 ? (fechaSozinho ? ultimo[1] : ancora) : (segmentos[i - 1] as [Ponto, Ponto, Ponto])[1];
    const saida = i < segmentos.length ? (segmentos[i] as [Ponto, Ponto, Ponto])[0] : ancora;
    return { chegada: f(...chegada), ancora: f(...ancora), saida: f(...saida), ligado: false };
  });
  return { nos, aberto: !sub.fechado };
}
