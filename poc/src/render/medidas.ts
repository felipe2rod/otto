// Medidor: onde cada camada de fato aparece. Texto pela tinta; forma e foto pela caixa; grupo pela união.
import { caixaVisual, ehVisual, girarCaixa, type No } from '../documento/esquema';
import { caixaDe, type Medidor } from '../documento/operacoes';
import { diagramarTexto } from './texto';

export function criarMedidor(ctx: CanvasRenderingContext2D): Medidor {
  // texto: a tinta girada junto com a camada; o resto: a caixa girada
  const medir = (n: No) => (n.tipo === 'texto' ? girarCaixa(diagramarTexto(ctx, n).tinta, n.x + n.largura / 2, n.y + n.altura / 2, n.rotacao) : ehVisual(n) ? caixaVisual(n) : { x: 0, y: 0, w: 0, h: 0 });
  return { tinta: (no: No) => caixaDe(no, medir) ?? { x: 0, y: 0, w: 0, h: 0 } };
}
