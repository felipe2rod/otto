// Porta: de onde sai o escopo da conta. É o PONTO ÚNICO em que a conta é decidida no servidor.
// A conta nunca vem do corpo, da query, de cabeçalho escolhido pelo cliente nem de payload (ADR 023).
import type { EscopoDaConta } from './escopo-da-conta';

export abstract class ResolvedorDeEscopo {
  /**
   * Escopo de uma requisição do editor.
   * @param credencial o que a requisição apresenta (no futuro, o token do cookie de sessão).
   *   Sem login no MVP, o adaptador em uso ignora este valor.
   */
  abstract resolverDaRequisicao(credencial: string | undefined): Promise<EscopoDaConta>;
}
