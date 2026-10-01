// O escopo da conta (ADR 023, decisão 2). É o PRIMEIRO argumento de todo caso de uso e de todo
// método de repositório: o núcleo não sabe de onde ele veio (HTTP, job, comando).
// Só o código desta pasta abre um escopo; o teste fronteira-do-escopo confere.
import type { ContaId } from '@otto/shared';

export class EscopoDaConta {
  readonly contaId: ContaId;

  private constructor(contaId: ContaId) {
    this.contaId = contaId;
    Object.freeze(this);
  }

  /** Só para os resolvedores de escopo (esta pasta) e para testes. */
  static abrir(contaId: ContaId): EscopoDaConta {
    return new EscopoDaConta(contaId);
  }
}

/** O escopo recebido não é o da transação aberta, ou a chave pedida é de outra conta. Nunca é "sem resultado": é erro. */
export class EscopoDivergente extends Error {
  constructor() {
    // sem id de conta na mensagem: ela pode ir para o log
    super('o escopo recebido não é o da conta dona do recurso');
    this.name = 'EscopoDivergente';
  }
}
