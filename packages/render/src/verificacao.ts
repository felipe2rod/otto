// As portas de @otto/documento que precisam de motor, implementadas com o render de referência (CPU):
// - Medidor: onde cada camada de fato aparece (texto pela tinta), para alinhar, distribuir e o resumo;
// - MeiosDeVerificacao: diagramação de texto e render reduzido, para o lint.
import { caixaDe, caixaVisual, ehVisual, girarCaixa, type Medidor, type MeiosDeVerificacao, type No } from '@otto/documento';
import { renderizarPrancheta } from './compositor';
import type { Sessao } from './sessao';

/** Medidor leve: só usa o motor de texto da sessão, não cria superfície nem rasteriza. Cabe numa requisição da API. */
export function criarMedidor(sessao: Sessao): Medidor {
  // texto: a tinta girada junto com a camada; o resto: a caixa girada
  const medir = (n: No) =>
    n.tipo === 'texto' ? girarCaixa(sessao.texto.diagramar(n).tinta, n.x + n.largura / 2, n.y + n.altura / 2, n.rotacao) : ehVisual(n) ? caixaVisual(n) : { x: 0, y: 0, w: 0, h: 0 };
  return { tinta: (no) => caixaDe(no, medir) ?? { x: 0, y: 0, w: 0, h: 0 } };
}

export function criarMeiosDeVerificacao(sessao: Sessao): MeiosDeVerificacao {
  return {
    diagramar: (no) => sessao.texto.diagramar(no),
    renderizar: (doc, prancheta, opcoes) => renderizarPrancheta(sessao, doc, prancheta, { escala: opcoes.escala, ...(opcoes.excluir ? { excluir: opcoes.excluir } : {}) }),
  };
}
