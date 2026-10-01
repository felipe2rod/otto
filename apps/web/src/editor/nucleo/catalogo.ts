// A ponte entre a sessão do documento e o catálogo de @otto/documento. A sessão não conhece o
// formato da árvore; aqui ela ganha o aplicarLote de verdade.
//
// Humano e agente usam as mesmas operações (ADR 027): este é o único lugar do editor que aplica
// mudança no documento, e sempre como lote do catálogo, com autoria "designer".
import { aplicarLote, type Documento, descreverErro, type Medidor } from '@otto/documento';
import type { ResultadoDeAplicar } from './sessaoDoDocumento';

/**
 * @param medidor o medidor de tinta do motor, quando ele já existe. Sem ele, alinhar e distribuir
 *   medem pela caixa da camada, e o servidor pode chegar a outro lugar: por isso a função é
 *   consultada a cada lote, e não uma vez só.
 */
export function aplicadorDoCatalogo(medidor: () => Medidor | undefined) {
  return (doc: Documento, operacoes: readonly unknown[], idDoLote: string): ResultadoDeAplicar<Documento> => {
    const m = medidor();
    const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote, ...(m ? { medidor: m } : {}) });
    // o motivo é o texto que o catálogo escreve para o agente; a frase do designer é de textos/erros.ts
    return r.ok ? { ok: true, doc: r.doc, tocados: r.tocados } : { ok: false, motivo: descreverErro(r.erro) };
  };
}
