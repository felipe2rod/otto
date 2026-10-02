// Adaptador de ConsumoDoModelo: uma linha por dia, da plataforma inteira, sem conta (prisma/isolamento.excecoes.ts).
import type { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { type ConsumoDeHoje, ConsumoDoModelo, diaDe } from '../../application/consumo-do-modelo';

export class ConsumoDoModeloNoBanco extends ConsumoDoModelo {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  async hoje(agora: Date): Promise<ConsumoDeHoje> {
    const linhas = await this.prisma.noCatalogoGlobal(
      (tx) => tx.$queryRaw<{ tokens: bigint; chamadas: number; restante_no_fornecedor: bigint | null; visto_em: Date | null }[]>`
        SELECT tokens, chamadas, restante_no_fornecedor, visto_em FROM consumo_diario_do_modelo WHERE dia = ${diaDe(agora)}::date`,
    );
    const l = linhas[0];
    if (!l) return { tokens: 0, chamadas: 0 };
    return {
      tokens: Number(l.tokens),
      chamadas: l.chamadas,
      ...(l.restante_no_fornecedor !== null ? { restanteNoFornecedor: Number(l.restante_no_fornecedor) } : {}),
      ...(l.visto_em ? { vistoEm: l.visto_em } : {}),
    };
  }

  async somar(agora: Date, tokens: number): Promise<void> {
    await this.prisma.noCatalogoGlobal(
      (tx) => tx.$executeRaw`
        INSERT INTO consumo_diario_do_modelo (dia, tokens, chamadas) VALUES (${diaDe(agora)}::date, ${tokens}, 1)
        ON CONFLICT (dia) DO UPDATE SET tokens = consumo_diario_do_modelo.tokens + EXCLUDED.tokens, chamadas = consumo_diario_do_modelo.chamadas + 1`,
    );
  }

  async anotarRestante(agora: Date, restante: number): Promise<void> {
    await this.prisma.noCatalogoGlobal(
      (tx) => tx.$executeRaw`
        INSERT INTO consumo_diario_do_modelo (dia, restante_no_fornecedor, visto_em) VALUES (${diaDe(agora)}::date, ${restante}, ${agora})
        ON CONFLICT (dia) DO UPDATE SET restante_no_fornecedor = EXCLUDED.restante_no_fornecedor, visto_em = EXCLUDED.visto_em`,
    );
  }
}
