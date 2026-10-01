// Adaptador de RepositorioDeExportacoes sobre PostgreSQL (Prisma), sob RLS.
import { RelatorioDeExportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { JsonDoBanco, PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import {
  type ArquivoGuardado,
  type Conclusao,
  type ExportacaoGuardada,
  type FalhaDePrancheta,
  type InicioDeExportacao,
  type NovaExportacao,
  type OpcoesGuardadas,
  RepositorioDeExportacoes,
} from '../../application/repositorio-de-exportacoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Nome do índice único parcial que garante uma exportação rodando por conta (migração 20261001180000). */
const UMA_POR_CONTA = 'exportacoes_uma_rodando_por_conta';

const COM_ARQUIVOS = { arquivos: { orderBy: { indice: 'asc' } } } as const;
const umaLinha = (tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string) => tx.exportacao.findFirst({ where: { id, contaId: escopo.contaId }, include: COM_ARQUIVOS });
type Linha = NonNullable<Awaited<ReturnType<typeof umaLinha>>>;

function paraGuardada(l: Linha): ExportacaoGuardada {
  const relatorio = l.relatorio ? RelatorioDeExportacao.parse(l.relatorio) : undefined;
  return {
    id: l.id,
    documentoId: l.documentoId,
    versao: l.versao,
    nome: l.nome,
    opcoes: l.opcoes as unknown as OpcoesGuardadas,
    estado: l.estado,
    pranchetasNoTotal: l.pranchetasNoTotal,
    pranchetasProntas: l.pranchetasProntas,
    arquivos: l.arquivos.map((a) => ({
      indice: a.indice,
      nome: a.nome,
      tipoMime: a.tipoMime,
      bytes: a.bytes,
      ...(a.pranchetaId ? { pranchetaId: a.pranchetaId } : {}),
      chaveDoObjeto: a.chaveDoObjeto,
    })),
    falhas: Array.isArray(l.falhas) ? (l.falhas as unknown as FalhaDePrancheta[]) : [],
    ...(relatorio ? { relatorio } : {}),
    ...(l.erroCodigo ? { erroCodigo: l.erroCodigo } : {}),
    ...(l.duracaoMs !== null ? { duracaoMs: l.duracaoMs } : {}),
    criadaEm: l.criadaEm,
    ...(l.terminadaEm ? { terminadaEm: l.terminadaEm } : {}),
    ...(l.expiraEm ? { expiraEm: l.expiraEm } : {}),
    ...(l.arquivosRemovidosEm ? { arquivosRemovidosEm: l.arquivosRemovidosEm } : {}),
  };
}

export class RepositorioDeExportacoesNoBanco extends RepositorioDeExportacoes {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  private async ler(tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string): Promise<ExportacaoGuardada | undefined> {
    const l = await umaLinha(tx, escopo, id);
    return l ? paraGuardada(l) : undefined;
  }

  async criar(escopo: EscopoDaConta, nova: NovaExportacao): Promise<ExportacaoGuardada> {
    return this.prisma.executar(escopo, async (tx) => {
      await tx.exportacao.create({
        data: {
          id: nova.id,
          contaId: escopo.contaId,
          documentoId: nova.documentoId,
          versao: nova.versao,
          nome: nova.nome,
          formato: nova.opcoes.formato,
          opcoes: nova.opcoes as unknown as JsonDoBanco,
          pranchetasNoTotal: nova.opcoes.pranchetas.length,
          ...(nova.criadaEm ? { criadaEm: nova.criadaEm } : {}),
        },
      });
      return (await this.ler(tx, escopo, nova.id)) as ExportacaoGuardada;
    });
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<ExportacaoGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, (tx) => this.ler(tx, escopo, id));
  }

  async listarDoDocumento(escopo: EscopoDaConta, documentoId: string, filtro: { criadasDesde: Date; limite: number }): Promise<ExportacaoGuardada[]> {
    if (!UUID.test(documentoId)) return [];
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.exportacao.findMany({
        where: { contaId: escopo.contaId, documentoId, criadaEm: { gte: filtro.criadasDesde } },
        orderBy: { criadaEm: 'desc' },
        take: filtro.limite,
        include: COM_ARQUIVOS,
      }),
    );
    return linhas.map(paraGuardada);
  }

  async darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, limites: { naFilaDesde: Date; semSinalDesde: Date }): Promise<number> {
    return this.prisma.executar(escopo, async (tx) => {
      const abandonadas = await tx.exportacao.updateMany({
        where: { contaId: escopo.contaId, estado: 'na_fila', criadaEm: { lt: limites.naFilaDesde } },
        data: { estado: 'falhou', erroCodigo: 'abandonada', terminadaEm: agora },
      });
      const interrompidas = await tx.exportacao.updateMany({
        where: { contaId: escopo.contaId, estado: 'rodando', OR: [{ batimentoEm: { lt: limites.semSinalDesde } }, { batimentoEm: null }] },
        data: { estado: 'falhou', erroCodigo: 'interrompida', terminadaEm: agora },
      });
      return abandonadas.count + interrompidas.count;
    });
  }

  async marcarArquivosRemovidos(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) => tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId }, data: { arquivosRemovidosEm: agora } }));
  }

  async contarEmAndamento(escopo: EscopoDaConta): Promise<number> {
    return this.prisma.executar(escopo, (tx) => tx.exportacao.count({ where: { contaId: escopo.contaId, estado: { in: ['na_fila', 'rodando'] } } }));
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date): Promise<InicioDeExportacao> {
    if (!UUID.test(id)) return { resultado: 'ignorada' };
    try {
      return await this.prisma.executar(escopo, async (tx) => {
        // worker que morreu no meio não pode segurar a conta para sempre
        await tx.exportacao.updateMany({
          where: { contaId: escopo.contaId, estado: 'rodando', OR: [{ batimentoEm: { lt: semSinalDesde } }, { batimentoEm: null }] },
          data: { estado: 'falhou', erroCodigo: 'interrompida', terminadaEm: agora },
        });
        const alvo = await tx.exportacao.findFirst({ where: { id, contaId: escopo.contaId }, select: { estado: true } });
        if (alvo?.estado !== 'na_fila') return { resultado: 'ignorada' as const };
        if ((await tx.exportacao.count({ where: { contaId: escopo.contaId, estado: 'rodando' } })) > 0) return { resultado: 'ocupada' as const };
        // a condição no próprio UPDATE é o que torna o consumidor idempotente
        const mudou = await tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'na_fila' }, data: { estado: 'rodando', iniciadaEm: agora, batimentoEm: agora } });
        if (mudou.count === 0) return { resultado: 'ignorada' as const };
        return { resultado: 'iniciada' as const, exportacao: (await this.ler(tx, escopo, id)) as ExportacaoGuardada };
      });
    } catch (e) {
      // dois workers ao mesmo tempo: o índice único parcial deixa passar um só
      if (e instanceof Error && (e.message.includes(UMA_POR_CONTA) || /unique constraint/i.test(e.message))) return { resultado: 'ocupada' };
      throw e;
    }
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) => tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'rodando' }, data: { batimentoEm: agora } }));
  }

  async registrarArquivo(escopo: EscopoDaConta, id: string, arquivo: ArquivoGuardado, pranchetas: number, agora: Date): Promise<void> {
    await this.prisma.executar(escopo, async (tx) => {
      await tx.arquivoDeExportacao.create({
        data: {
          contaId: escopo.contaId,
          exportacaoId: id,
          indice: arquivo.indice,
          nome: arquivo.nome,
          tipoMime: arquivo.tipoMime,
          bytes: arquivo.bytes,
          pranchetaId: arquivo.pranchetaId ?? null,
          chaveDoObjeto: arquivo.chaveDoObjeto,
        },
      });
      await tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId }, data: { pranchetasProntas: { increment: pranchetas }, batimentoEm: agora } });
    });
  }

  async registrarProgresso(escopo: EscopoDaConta, id: string, pranchetas: number, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'rodando' }, data: { pranchetasProntas: { increment: pranchetas }, batimentoEm: agora } }),
    );
  }

  async registrarFalha(escopo: EscopoDaConta, id: string, falha: FalhaDePrancheta, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, async (tx) => {
      const atual = await tx.exportacao.findFirst({ where: { id, contaId: escopo.contaId }, select: { falhas: true } });
      if (!atual) return;
      const falhas = [...(Array.isArray(atual.falhas) ? (atual.falhas as unknown as FalhaDePrancheta[]) : []), falha];
      await tx.exportacao.updateMany({ where: { id, contaId: escopo.contaId }, data: { falhas: falhas as unknown as JsonDoBanco, pranchetasProntas: { increment: 1 }, batimentoEm: agora } });
    });
  }

  async concluir(escopo: EscopoDaConta, id: string, c: Conclusao): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.exportacao.updateMany({
        where: { id, contaId: escopo.contaId, estado: { in: ['na_fila', 'rodando'] } },
        data: {
          estado: c.estado,
          terminadaEm: c.terminadaEm,
          duracaoMs: c.duracaoMs,
          erroCodigo: c.erroCodigo ?? null,
          expiraEm: c.expiraEm ?? null,
          ...(c.relatorio ? { relatorio: c.relatorio as unknown as JsonDoBanco } : {}),
        },
      }),
    );
  }
}
