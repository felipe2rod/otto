// Sem login no MVP: aceito pelo Felipe em 2026-10-02 (ADR 035, itens 4 e 7; docs/mvp/README.md, decisão 2).
// Sem login no MVP: toda requisição cai na mesma conta, a que a migração inicial semeia.
// O banco já nasce com conta_id e RLS em tudo, então o login entra depois trocando SÓ este
// adaptador por um que resolve a conta pela sessão. Nenhum caso de uso muda.
//
// Enquanto isto valer, o servidor não distingue pessoas: não exponha fora da máquina local.
import type { ContaId } from '@otto/shared';
import { EscopoDaConta } from '../escopo-da-conta';
import { ResolvedorDeEscopo } from '../resolvedor-de-escopo';

export class ResolvedorDeContaFixa extends ResolvedorDeEscopo {
  private readonly escopo: EscopoDaConta;

  constructor(contaFixaId: ContaId) {
    super();
    this.escopo = EscopoDaConta.abrir(contaFixaId);
  }

  async resolverDaRequisicao(_credencial: string | undefined): Promise<EscopoDaConta> {
    return this.escopo;
  }
}
