// Quanto o fornecedor de inferência ainda deixa gastar AGORA, estimado a partir da última leitura.
//
// O cabeçalho do fornecedor chama o limite de "por dia" (45 milhões), mas as leituras de 2026-10-02
// (docs/tecnico/custos.md, seção 10) mostram um balde de 4,5 milhões que se repõe ao longo do dia: 2,25 milhões
// às 14h42 UTC, cheio de novo às 17h11. A confirmar com o fornecedor. Enquanto isso:
// - a leitura só é renovada quando chamamos o modelo. Se recusarmos tarefa por causa dela, ela nunca seria
//   renovada: por isso a folga cresce com o tempo, a uma taxa conservadora, até a capacidade;
// - a taxa padrão (900 mil por hora) é o mínimo compatível com as duas leituras acima.
// Regra pura.

export interface LeituraDoFornecedor {
  restanteNoFornecedor?: number;
  vistoEm?: Date;
}

export interface BaldeDoFornecedor {
  capacidade: number;
  reposicaoPorHora: number;
}

/** undefined: o fornecedor ainda não disse nada (não há o que conferir). */
export function folgaNoFornecedor(leitura: LeituraDoFornecedor, agora: Date, balde: BaldeDoFornecedor): number | undefined {
  const visto = leitura.restanteNoFornecedor;
  if (visto === undefined) return undefined;
  if (!leitura.vistoEm) return visto;
  const horas = Math.max(0, agora.getTime() - leitura.vistoEm.getTime()) / 3_600_000;
  // a reposição não passa da capacidade; mas se o fornecedor mostrou mais que a capacidade suposta, vale o que ele mostrou
  return Math.max(visto, Math.min(balde.capacidade, Math.round(visto + horas * balde.reposicaoPorHora)));
}
