// Porta: quanto a PLATAFORMA já gastou de modelo hoje. O limite diário do fornecedor de inferência é um
// só para todas as contas, então este contador não tem conta: só números e data (exceção declarada em
// prisma/isolamento.excecoes.ts). É conferido antes de aceitar uma tarefa e antes de cada chamada.
export interface ConsumoDeHoje {
  tokens: number;
  chamadas: number;
  /** O que o fornecedor disse que resta, na última resposta que trouxe o número, e quando foi. */
  restanteNoFornecedor?: number;
  vistoEm?: Date;
}

export abstract class ConsumoDoModelo {
  abstract hoje(agora: Date): Promise<ConsumoDeHoje>;
  abstract somar(agora: Date, tokens: number): Promise<void>;
  abstract anotarRestante(agora: Date, restante: number): Promise<void>;
}

/** O dia do contador, em UTC. */
export const diaDe = (agora: Date): string => agora.toISOString().slice(0, 10);

export class ConsumoDoModeloEmMemoria extends ConsumoDoModelo {
  private readonly dias = new Map<string, ConsumoDeHoje>();

  private do(agora: Date): ConsumoDeHoje {
    const dia = diaDe(agora);
    let atual = this.dias.get(dia);
    if (!atual) {
      atual = { tokens: 0, chamadas: 0 };
      this.dias.set(dia, atual);
    }
    return atual;
  }
  async hoje(agora: Date): Promise<ConsumoDeHoje> {
    return { ...this.do(agora) };
  }
  async somar(agora: Date, tokens: number): Promise<void> {
    const dia = this.do(agora);
    dia.tokens += tokens;
    dia.chamadas += 1;
  }
  async anotarRestante(agora: Date, restante: number): Promise<void> {
    const dia = this.do(agora);
    dia.restanteNoFornecedor = restante;
    dia.vistoEm = agora;
  }
}
