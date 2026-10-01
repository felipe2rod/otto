// A ÚNICA forma de chegar ao banco (ADR 023, decisões 3 e 4). O cliente do Prisma não é exportado.
// Toda operação de negócio roda numa transação cuja primeira instrução é
//   SELECT set_config('app.conta_id', <conta>, true)
// O `true` é "local à transação": some no COMMIT e no ROLLBACK, então a conexão volta ao pool limpa.
// Não existe caminho para setar o escopo fora de transação.
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EscopoDaConta } from '../escopo/escopo-da-conta';
import { EscopoDivergente } from '../escopo/escopo-da-conta';
import { type Prisma, PrismaClient } from './gerado/client';

/** O que um repositório recebe para consultar: o cliente preso à transação com escopo. */
export type TransacaoComEscopo = Prisma.TransactionClient;
/** Valor gravável em coluna JSON. Os repositórios usam este nome; o tipo do Prisma não sai desta pasta. */
export type JsonDoBanco = Prisma.InputJsonValue;

export interface OpcoesDoBanco {
  /** Conexões do pool deste processo. Transação com escopo segura uma conexão: nunca deixe no padrão. */
  conexoes: number;
  /** Tempo máximo de uma transação. Job travado não pode drenar o pool. */
  tempoLimiteMs: number;
  /** Tempo máximo de espera por uma conexão livre. */
  esperaMaximaMs: number;
}

const PADRAO: OpcoesDoBanco = { conexoes: 5, tempoLimiteMs: 10_000, esperaMaximaMs: 5_000 };

export class PrismaComEscopo {
  private readonly cliente: PrismaClient;
  private readonly opcoes: OpcoesDoBanco;
  // O parâmetro decide, isto só CONFERE (ADR 023, decisão 2.4): nunca é fonte do escopo.
  private readonly aberta = new AsyncLocalStorage<{ escopo: EscopoDaConta; tx: TransacaoComEscopo }>();

  constructor(urlDoApp: string, opcoes: Partial<OpcoesDoBanco> = {}) {
    this.opcoes = { ...PADRAO, ...opcoes };
    this.cliente = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlDoApp, max: this.opcoes.conexoes }) });
  }

  async executar<T>(escopo: EscopoDaConta, fn: (tx: TransacaoComEscopo) => Promise<T>): Promise<T> {
    const atual = this.aberta.getStore();
    if (atual) {
      if (atual.escopo.contaId !== escopo.contaId) throw new EscopoDivergente();
      return fn(atual.tx);
    }
    return this.cliente.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.conta_id', ${escopo.contaId}, true)`;
        return this.aberta.run({ escopo, tx }, () => fn(tx));
      },
      { timeout: this.opcoes.tempoLimiteMs, maxWait: this.opcoes.esperaMaximaMs },
    );
  }

  /**
   * Leitura e acréscimo em CATÁLOGO GLOBAL (tabelas de prisma/isolamento.excecoes.ts com motivo
   * 'catalogo-global': fontes do Otto). Não abre escopo: qualquer consulta a tabela de negócio
   * feita por aqui dá erro no banco (app.conta_id não está setado), não lista vazia.
   */
  async noCatalogoGlobal<T>(fn: (tx: TransacaoComEscopo) => Promise<T>): Promise<T> {
    return this.cliente.$transaction((tx) => fn(tx), { timeout: this.opcoes.tempoLimiteMs, maxWait: this.opcoes.esperaMaximaMs });
  }

  /** Para a rota de prontidão: o banco responde? Não abre escopo e não toca tabela de negócio. Nunca lança. */
  async responde(): Promise<boolean> {
    try {
      await this.cliente.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async fechar(): Promise<void> {
    await this.cliente.$disconnect();
  }
}
