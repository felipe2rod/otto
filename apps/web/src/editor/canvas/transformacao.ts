// Redimensionar e girar pela alça: geometria pura, em unidades do documento. Quem desenha são as
// sobreposições; quem arrasta é o controle de gestos; quem mostra a prévia é o motor.
//
// Um QUADRO é uma caixa com rotação em torno do próprio centro, em graus, no sentido horário da
// tela: a mesma convenção de `rotacao` em @otto/documento. Uma camada selecionada tem o quadro
// dela; várias têm a caixa reta que cobre todas.
import type { Ponto } from '../nucleo/camera';

export interface Quadro {
  x: number;
  y: number;
  w: number;
  h: number;
  rotacao: number;
}

/** Norte, sul, leste, oeste e os quatro cantos. */
export type Alca = 'n' | 's' | 'l' | 'o' | 'ne' | 'no' | 'se' | 'so';
/** O que dá para pegar num quadro: uma das oito alças, ou a pega de girar. */
export type Pega = Alca | 'girar';

export const ALCAS: readonly Alca[] = ['no', 'n', 'ne', 'l', 'se', 's', 'so', 'o'];

/** Para onde a alça puxa, no sistema da camada: -1, 0 ou 1 em cada eixo. */
const SENTIDO: Readonly<Record<Alca, readonly [number, number]>> = { no: [-1, -1], n: [0, -1], ne: [1, -1], l: [1, 0], se: [1, 1], s: [0, 1], so: [-1, 1], o: [-1, 0] };

const centroDe = (q: Quadro): Ponto => ({ x: q.x + q.w / 2, y: q.y + q.h / 2 });

/** Gira o vetor (x, y) por `graus`, no sentido horário da tela. */
function girar(x: number, y: number, graus: number): Ponto {
  if (graus === 0) return { x, y };
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** O ponto do quadro em (fx, fy), de -1 a 1 em cada eixo a partir do centro, já com a rotação. */
function pontoDoQuadro(q: Quadro, fx: number, fy: number): Ponto {
  const c = centroDe(q);
  const v = girar((fx * q.w) / 2, (fy * q.h) / 2, q.rotacao);
  return { x: c.x + v.x, y: c.y + v.y };
}

export function pontosDasAlcas(q: Quadro): Record<Alca, Ponto> {
  return Object.fromEntries(ALCAS.map((a) => [a, pontoDoQuadro(q, SENTIDO[a][0], SENTIDO[a][1])])) as Record<Alca, Ponto>;
}

/** Os quatro cantos, em ordem, para traçar o contorno. */
export const cantosDe = (q: Quadro): Ponto[] => (['no', 'ne', 'se', 'so'] as const).map((a) => pontoDoQuadro(q, SENTIDO[a][0], SENTIDO[a][1]));

/** A pega de girar: para fora do lado de cima, a `distancia` dele (pixels de tela divididos pelo zoom). */
export function pontoDeGirar(q: Quadro, distancia: number): Ponto {
  const c = centroDe(q);
  const v = girar(0, -q.h / 2 - distancia, q.rotacao);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** A pega sob o ponto, com folga (em unidades do documento). As alças ganham da pega de girar. */
export function pegaEm(q: Quadro, ponto: Ponto, folga: number, distanciaDoGiro: number): Pega | undefined {
  const dentro = (p: Ponto) => Math.abs(p.x - ponto.x) <= folga && Math.abs(p.y - ponto.y) <= folga;
  const alcas = pontosDasAlcas(q);
  return ALCAS.find((a) => dentro(alcas[a])) ?? (dentro(pontoDeGirar(q, distanciaDoGiro)) ? 'girar' : undefined);
}

const casas = (n: number, quantas: number): number => {
  const f = 10 ** quantas;
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
};

/** Posição de camada reta sai inteira; de camada girada, com duas casas (o canto oposto não pode andar). */
const posicao = (n: number, rotacao: number): number => casas(n, rotacao === 0 ? 0 : 2);

/**
 * O quadro novo para um arraste de (dx, dy) na alça. O arraste vale no sistema da camada: numa
 * camada girada, a alça leste alarga na direção para onde ela aponta. O lado oposto fica parado, o
 * tamanho mínimo é 1 e largura e altura saem inteiras. Com `proporcional` (Shift), o canto mantém a
 * proporção, e o lado leva a outra dimensão junto, pelo meio.
 */
export function redimensionarQuadro(q: Quadro, alca: Alca, dx: number, dy: number, opcoes: { proporcional?: boolean } = {}): Quadro {
  const [sx, sy] = SENTIDO[alca];
  const local = girar(dx, dy, -q.rotacao);
  let w = q.w + sx * local.x;
  let h = q.h + sy * local.y;

  if (opcoes.proporcional) {
    const razao = q.w / q.h;
    if (sx !== 0 && sy !== 0) {
      // vale o eixo que mais andou, em proporção ao tamanho
      if (Math.abs(w - q.w) / q.w >= Math.abs(h - q.h) / q.h) h = w / razao;
      else w = h * razao;
    } else if (sx !== 0) h = w / razao;
    else w = h * razao;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  // a âncora é o ponto oposto à alça; no eixo em que a alça não puxa, é o meio
  const ancora = pontoDoQuadro(q, -sx, -sy);
  const ateOCentro = girar((sx * w) / 2, (sy * h) / 2, q.rotacao);
  return { x: posicao(ancora.x + ateOCentro.x - w / 2, q.rotacao), y: posicao(ancora.y + ateOCentro.y - h / 2, q.rotacao), w, h, rotacao: q.rotacao };
}

/** Quanto o ponteiro girou em torno do centro, de `de` até `ate`, em graus (horário positivo). */
export function deltaDoGiro(centro: Ponto, de: Ponto, ate: Ponto): number {
  const a = Math.atan2(de.y - centro.y, de.x - centro.x);
  const b = Math.atan2(ate.y - centro.y, ate.x - centro.x);
  // pelo caminho mais curto: passar pela esquerda do centro não pode virar uma volta inteira
  let graus = ((b - a) * 180) / Math.PI;
  if (graus > 180) graus -= 360;
  if (graus <= -180) graus += 360;
  return graus;
}

/** A rotação como o documento a guarda: entre -180 (fora) e 180, com uma casa. */
export function normalizarRotacao(graus: number): number {
  let r = graus % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return casas(r, 1);
}

/** Com Shift: o múltiplo de `passo` mais próximo. */
export const travarEmPassos = (graus: number, passo = 15): number => casas(Math.round(graus / passo) * passo, 1);

/** O que um quadro girado ocupa, em caixa reta. */
function ocupado(q: Quadro): { x0: number; y0: number; x1: number; y1: number } {
  const cantos = cantosDe(q);
  return { x0: Math.min(...cantos.map((p) => p.x)), y0: Math.min(...cantos.map((p) => p.y)), x1: Math.max(...cantos.map((p) => p.x)), y1: Math.max(...cantos.map((p) => p.y)) };
}

/** O quadro das alças: o da camada, quando é uma; a caixa reta que cobre todas, quando são várias. */
export function quadroDaSelecao(folhas: readonly Quadro[]): Quadro {
  const [unica] = folhas;
  if (folhas.length === 1 && unica) return unica;
  const areas = folhas.map(ocupado);
  const x = Math.min(...areas.map((a) => a.x0));
  const y = Math.min(...areas.map((a) => a.y0));
  return { x, y, w: Math.max(...areas.map((a) => a.x1)) - x, h: Math.max(...areas.map((a) => a.y1)) - y, rotacao: 0 };
}

/**
 * Cada camada do conjunto levada de `antes` para `depois` (quadros retos). Posição e tamanho seguem a
 * proporção do conjunto. Camada girada cresce igual nos dois lados: esticar só um a entortaria, e o
 * documento não guarda camada torta. Quem chama deve redimensionar em proporção quando há girada.
 */
export function redimensionarVarias(folhas: readonly Quadro[], antes: Quadro, depois: Quadro): Quadro[] {
  const sx = depois.w / antes.w;
  const sy = depois.h / antes.h;
  return folhas.map((f) => {
    const c = centroDe(f);
    const centro = { x: depois.x + (c.x - antes.x) * sx, y: depois.y + (c.y - antes.y) * sy };
    const igual = (sx + sy) / 2;
    const w = Math.max(1, Math.round(f.w * (f.rotacao === 0 ? sx : igual)));
    const h = Math.max(1, Math.round(f.h * (f.rotacao === 0 ? sy : igual)));
    return { x: posicao(centro.x - w / 2, f.rotacao), y: posicao(centro.y - h / 2, f.rotacao), w, h, rotacao: f.rotacao };
  });
}

/** Cada camada girada `delta` graus em torno de `centro`: o centro dela anda, e a rotação soma. */
export function girarVarias(folhas: readonly Quadro[], centro: Ponto, delta: number): Quadro[] {
  return folhas.map((f) => {
    const c = centroDe(f);
    const v = girar(c.x - centro.x, c.y - centro.y, delta);
    return { x: casas(centro.x + v.x - f.w / 2, 2), y: casas(centro.y + v.y - f.h / 2, 2), w: f.w, h: f.h, rotacao: normalizarRotacao(f.rotacao + delta) };
  });
}

export interface Arraste {
  /** Onde o ponteiro apertou e onde está, no mesmo sistema dos quadros. */
  de: Ponto;
  ate: Ponto;
  /** Shift: mantém a proporção ao redimensionar; trava em passos de 15° ao girar. */
  shift: boolean;
}

/**
 * O gesto inteiro: o quadro novo de cada camada para um arraste na pega. Uma camada usa o quadro
 * dela (com rotação); várias, a caixa reta do conjunto.
 */
export function transformar(folhas: readonly Quadro[], pega: Pega, arraste: Arraste): Quadro[] {
  const quadro = quadroDaSelecao(folhas);
  const [unica] = folhas;
  if (pega === 'girar') {
    const centro = centroDe(quadro);
    let delta = deltaDoGiro(centro, arraste.de, arraste.ate);
    // uma camada: a rotação final cai no passo; várias: o giro é que cai (cada uma tem a sua rotação)
    if (arraste.shift) delta = folhas.length === 1 && unica ? travarEmPassos(unica.rotacao + delta) - unica.rotacao : travarEmPassos(delta);
    return girarVarias(folhas, centro, delta);
  }
  const dx = arraste.ate.x - arraste.de.x;
  const dy = arraste.ate.y - arraste.de.y;
  if (folhas.length === 1 && unica) return [redimensionarQuadro(unica, pega, dx, dy, { proporcional: arraste.shift })];
  const proporcional = arraste.shift || folhas.some((f) => f.rotacao !== 0);
  return redimensionarVarias(folhas, quadro, redimensionarQuadro(quadro, pega, dx, dy, { proporcional }));
}

const CURSORES = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
const ANGULO_DA_ALCA: Readonly<Record<Alca, number>> = { n: 0, ne: 45, l: 90, se: 135, s: 180, so: 225, o: 270, no: 315 };

/** O cursor da pega, já com a rotação do quadro: a seta aponta para onde a alça puxa na tela. */
export function cursorDaPega(pega: Pega, rotacao: number): string {
  if (pega === 'girar') return 'crosshair';
  const angulo = (((ANGULO_DA_ALCA[pega] + rotacao) % 180) + 180) % 180;
  return CURSORES[Math.round(angulo / 45) % 4] as string;
}
