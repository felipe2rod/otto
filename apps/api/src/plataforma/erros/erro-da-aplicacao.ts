// Erros que um caso de uso levanta. Não conhecem HTTP: carregam o código estável do contrato
// (@otto/shared) e um detalhe. Quem traduz para status é o filtro de erros, em um lugar só.
// O detalhe vai para o cliente e NUNCA para o log (pode citar nome de camada).
import { CODIGOS_DE_ERRO, type CodigoDeErro } from '@otto/shared';

export class ErroDaAplicacao extends Error {
  constructor(
    readonly codigo: CodigoDeErro,
    readonly detalhe?: Record<string, unknown>,
  ) {
    super(codigo);
    this.name = 'ErroDaAplicacao';
  }
}

/** O recurso não existe ou é de outra conta: a resposta é a mesma, de propósito (ADR 023). */
export class NaoEncontrado extends ErroDaAplicacao {
  constructor() {
    super(CODIGOS_DE_ERRO.naoEncontrado);
  }
}

export class PedidoInvalido extends ErroDaAplicacao {
  constructor(campos: readonly string[]) {
    super(CODIGOS_DE_ERRO.pedidoInvalido, { campos: [...campos] });
  }
}
