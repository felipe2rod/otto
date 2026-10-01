// Alças de redimensionar: geometria pura, em unidades do documento. Quem desenha são as
// sobreposições; quem arrasta é o controle de gestos. Só para camada sem rotação: com rotação, a
// alça teria de trabalhar no sistema da camada, e isso entra com o girar pela alça.
import type { Caixa } from '@otto/documento';
import type { Ponto } from '../nucleo/camera';

/** Norte, sul, leste, oeste e os quatro cantos. */
export type Alca = 'n' | 's' | 'l' | 'o' | 'ne' | 'no' | 'se' | 'so';

export const ALCAS: readonly Alca[] = ['no', 'n', 'ne', 'l', 'se', 's', 'so', 'o'];

export function alcasDe(c: Caixa): Record<Alca, Ponto> {
  const meioX = c.x + c.w / 2;
  const meioY = c.y + c.h / 2;
  const direita = c.x + c.w;
  const base = c.y + c.h;
  return {
    no: { x: c.x, y: c.y },
    n: { x: meioX, y: c.y },
    ne: { x: direita, y: c.y },
    l: { x: direita, y: meioY },
    se: { x: direita, y: base },
    s: { x: meioX, y: base },
    so: { x: c.x, y: base },
    o: { x: c.x, y: meioY },
  };
}

/** A alça sob o ponto, com folga (em unidades do documento: pixels de tela divididos pelo zoom). */
export function alcaEm(c: Caixa, ponto: Ponto, folga: number): Alca | undefined {
  const alcas = alcasDe(c);
  return ALCAS.find((a) => Math.abs(alcas[a].x - ponto.x) <= folga && Math.abs(alcas[a].y - ponto.y) <= folga);
}

/**
 * A caixa nova para um arraste de (dx, dy) na alça. O lado oposto fica parado, o tamanho mínimo é 1
 * e os valores saem inteiros. Com `proporcional` (Shift), o canto mantém a proporção da caixa.
 */
export function redimensionar(c: Caixa, alca: Alca, dx: number, dy: number, opcoes: { proporcional?: boolean } = {}): Caixa {
  const mexeOeste = alca.includes('o');
  const mexeLeste = alca.includes('l') || alca.includes('e');
  const mexeNorte = alca.includes('n');
  const mexeSul = alca.includes('s');

  let w = c.w + (mexeLeste ? dx : mexeOeste ? -dx : 0);
  let h = c.h + (mexeSul ? dy : mexeNorte ? -dy : 0);

  if (opcoes.proporcional && (mexeLeste || mexeOeste) && (mexeNorte || mexeSul)) {
    const razao = c.w / c.h;
    // vale o eixo que mais andou, em proporção ao tamanho
    if (Math.abs(w - c.w) / c.w >= Math.abs(h - c.h) / c.h) h = w / razao;
    else w = h * razao;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  return { x: mexeOeste ? Math.round(c.x + c.w - w) : c.x, y: mexeNorte ? Math.round(c.y + c.h - h) : c.y, w, h };
}
