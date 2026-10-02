// Adaptador de RepositorioDeImportacoes sobre PostgreSQL (Prisma), sob RLS.
import { PedidoDeImportacao, RelatorioDeImportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { JsonDoBanco, PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import {
  type ConclusaoDaImportacao,
  ESTADOS_ABERTOS,
  type ImportacaoGuardada,
  type InicioDeImportacao,
  type NovaImportacao,
  RepositorioDeImportacoes,
  type RetomadaDeImportacao,
} from '../../application/repositorio-de-importacoes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Nome do índice único parcial que garante uma importação rodando por conta (migração 20261006090000). */
const UMA_POR_CONTA = 'importacoes_uma_rodando_por_conta';
/** A peça criada vem pela chave estrangeira de documentos: a linha da peça é a verdade. */
const COM_A_PECA = { documentos: { select: { id: true }, take: 1 } } as const;

const umaLinha = (tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string) => tx.importacao.findFirst({ where: { id, contaId: escopo.contaId }, include: COM_A_PECA });
type Linha = NonNullable<Awaited<ReturnType<typeof umaLinha>>>;

function paraGuardada(l: Linha): ImportacaoGuardada {
  const pedido = l.pedido ? PedidoDeImportacao.parse(l.pedido) : undefined;
  const relatorio = l.relatorio ? RelatorioDeImportacao.parse(l.relatorio) : undefined;
  const documentoId = l.estado === 'pronta' ? l.documentos[0]?.id : undefined;
  return {
    id: l.id,
    estado: l.estado,
    nomeDoArquivo: l.nomeDoArquivo,
    bytes: l.bytes,
    sha256: l.sha256,
    formato: l.formato === 'psb' ? 'psb' : 'psd',
    largura: l.largura,
    altura: l.altura,
    camadas: l.camadas,
    fontes: Array.isArray(l.fontes) ? l.fontes.filter((f): f is string => typeof f === 'string') : [],
    ...(pedido ? { pedido } : {}),
    chaveDoObjeto: l.chaveDoObjeto,
    ...(documentoId ? { documentoId } : {}),
    ...(relatorio ? { relatorio } : {}),
    ...(l.erroCodigo ? { erro: { codigo: l.erroCodigo, ...(l.erroMotivo ? { motivo: l.erroMotivo } : {}), ...(l.erroMensagem ? { mensagem: l.erroMensagem } : {}) } } : {}),
    ...(l.duracaoMs !== null ? { duracaoMs: l.duracaoMs } : {}),
    tentativas: l.tentativas,
    criadaEm: l.criadaEm,
    ...(l.pedidaEm ? { pedidaEm: l.pedidaEm } : {}),
    ...(l.terminadaEm ? { terminadaEm: l.terminadaEm } : {}),
    expiraEm: l.expiraEm,
    ...(l.arquivoRemovidoEm ? { arquivoRemovidoEm: l.arquivoRemovidoEm } : {}),
  };
}

const semSinal = (desde: Date) => ({ OR: [{ batimentoEm: { lt: desde } }, { batimentoEm: null }] });
const INTERROMPIDA = { estado: 'falhou', erroCodigo: 'interrompida' } as const;

export class RepositorioDeImportacoesNoBanco extends RepositorioDeImportacoes {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  private async ler(tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string): Promise<ImportacaoGuardada | undefined> {
    const l = await umaLinha(tx, escopo, id);
    return l ? paraGuardada(l) : undefined;
  }

  async criarSeCouber(escopo: EscopoDaConta, nova: NovaImportacao, limite: number): Promise<ImportacaoGuardada | undefined> {
    return this.prisma.executar(escopo, async (tx) => {
      // uma trava por conta, solta no fim da transação: envios simultâneos contam e criam um depois do outro
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`importacoes:${escopo.contaId}`}, 0))`;
      const abertas = await tx.importacao.count({ where: { contaId: escopo.contaId, estado: { in: [...ESTADOS_ABERTOS] } } });
      if (abertas >= limite) return undefined;
      await tx.importacao.create({
        data: {
          id: nova.id,
          contaId: escopo.contaId,
          nomeDoArquivo: nova.nomeDoArquivo,
          bytes: nova.bytes,
          sha256: nova.sha256,
          formato: nova.formato,
          largura: nova.largura,
          altura: nova.altura,
          camadas: nova.camadas,
          fontes: nova.fontes as unknown as JsonDoBanco,
          chaveDoObjeto: nova.chaveDoObjeto,
          criadaEm: nova.criadaEm,
          expiraEm: nova.expiraEm,
        },
      });
      return this.ler(tx, escopo, nova.id);
    });
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<ImportacaoGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, (tx) => this.ler(tx, escopo, id));
  }

  async daPeca(escopo: EscopoDaConta, documentoId: string): Promise<ImportacaoGuardada | undefined> {
    if (!UUID.test(documentoId)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const peca = await tx.documento.findFirst({ where: { id: documentoId, contaId: escopo.contaId }, select: { importacaoId: true } });
      return peca?.importacaoId ? this.ler(tx, escopo, peca.importacaoId) : undefined;
    });
  }

  async listar(escopo: EscopoDaConta, filtro: { criadasDesde: Date; limite: number }): Promise<ImportacaoGuardada[]> {
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.importacao.findMany({ where: { contaId: escopo.contaId, criadaEm: { gte: filtro.criadasDesde } }, orderBy: { criadaEm: 'desc' }, take: filtro.limite, include: COM_A_PECA }),
    );
    return linhas.map(paraGuardada);
  }

  async pedir(escopo: EscopoDaConta, id: string, pedido: PedidoDeImportacao, agora: Date): Promise<{ importacao: ImportacaoGuardada; naFrente: number } | 'fora-do-estado' | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      // a mesma trava do envio: `naFrente` de dois pedidos simultâneos sai em ordem
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`importacoes:${escopo.contaId}`}, 0))`;
      const naFrente = await tx.importacao.count({ where: { contaId: escopo.contaId, estado: { in: ['na_fila', 'rodando'] } } });
      // a condição vai no próprio UPDATE: de dois pedidos para a mesma importação, um só entra na fila
      const mudou = await tx.importacao.updateMany({
        where: { id, contaId: escopo.contaId, estado: 'enviada', expiraEm: { gt: agora } },
        data: { estado: 'na_fila', pedido: pedido as unknown as JsonDoBanco, pedidaEm: agora },
      });
      const lida = await this.ler(tx, escopo, id);
      if (!lida) return undefined;
      return mudou.count === 1 ? { importacao: lida, naFrente } : ('fora-do-estado' as const);
    });
  }

  async devolver(escopo: EscopoDaConta, id: string): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(
      escopo,
      (tx) => tx.$executeRaw`UPDATE importacoes SET estado = 'enviada', pedido = NULL, pedida_em = NULL WHERE id = ${id}::uuid AND conta_id = ${escopo.contaId}::uuid AND estado = 'na_fila'`,
    );
  }

  async descartar(escopo: EscopoDaConta, id: string, agora: Date): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const mudou = await this.prisma.executar(escopo, (tx) =>
      tx.importacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'enviada' }, data: { estado: 'descartada', terminadaEm: agora } }),
    );
    return mudou.count === 1;
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date, retomar?: RetomadaDeImportacao): Promise<InicioDeImportacao> {
    if (!UUID.test(id)) return { resultado: 'ignorada' };
    try {
      return await this.prisma.executar(escopo, async (tx) => {
        // worker que morreu no meio não pode segurar a conta para sempre (a própria importação, quando há retomada, é decidida abaixo)
        await tx.importacao.updateMany({
          where: { contaId: escopo.contaId, estado: 'rodando', ...(retomar ? { id: { not: id } } : {}), ...semSinal(semSinalDesde) },
          data: { ...INTERROMPIDA, terminadaEm: agora },
        });
        const alvo = await tx.importacao.findFirst({ where: { id, contaId: escopo.contaId }, select: { estado: true } });
        if (alvo?.estado === 'rodando' && retomar) {
          // a condição vai no próprio UPDATE: de dois workers com o mesmo trabalho reentregue, um só retoma
          const retomou = await tx.importacao.updateMany({
            where: { id, contaId: escopo.contaId, estado: 'rodando', tentativas: { lt: retomar.maximoDeTentativas }, ...semSinal(retomar.semSinalDesde) },
            data: { iniciadaEm: agora, batimentoEm: agora, tentativas: { increment: 1 } },
          });
          if (retomou.count === 1) return { resultado: 'iniciada' as const, importacao: (await this.ler(tx, escopo, id)) as ImportacaoGuardada, retomada: true as const };
          // parada e sem tentativa sobrando: fecha. Com o dono vivo, este UPDATE não pega nada.
          await tx.importacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'rodando', ...semSinal(retomar.semSinalDesde) }, data: { ...INTERROMPIDA, terminadaEm: agora } });
          return { resultado: 'ignorada' as const };
        }
        if (alvo?.estado !== 'na_fila') return { resultado: 'ignorada' as const };
        if ((await tx.importacao.count({ where: { contaId: escopo.contaId, estado: 'rodando' } })) > 0) return { resultado: 'ocupada' as const };
        const mudou = await tx.importacao.updateMany({
          where: { id, contaId: escopo.contaId, estado: 'na_fila' },
          data: { estado: 'rodando', iniciadaEm: agora, batimentoEm: agora, tentativas: { increment: 1 } },
        });
        if (mudou.count === 0) return { resultado: 'ignorada' as const };
        return { resultado: 'iniciada' as const, importacao: (await this.ler(tx, escopo, id)) as ImportacaoGuardada };
      });
    } catch (e) {
      // dois workers ao mesmo tempo: o índice único parcial deixa passar um só
      if (e instanceof Error && (e.message.includes(UMA_POR_CONTA) || /unique constraint/i.test(e.message))) {
        // o que perdeu a corrida pela PRÓPRIA importação não tem o que esperar; o de outra importação da conta, sim
        const atual = await this.buscar(escopo, id);
        return atual?.estado === 'na_fila' ? { resultado: 'ocupada' } : { resultado: 'ignorada' };
      }
      throw e;
    }
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) => tx.importacao.updateMany({ where: { id, contaId: escopo.contaId, estado: 'rodando' }, data: { batimentoEm: agora } }));
  }

  async concluir(escopo: EscopoDaConta, id: string, c: ConclusaoDaImportacao): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.importacao.updateMany({
        where: { id, contaId: escopo.contaId, estado: { in: ['na_fila', 'rodando'] } },
        data:
          c.estado === 'pronta'
            ? { estado: 'pronta', terminadaEm: c.terminadaEm, duracaoMs: c.duracaoMs, relatorio: c.relatorio as unknown as JsonDoBanco, erroCodigo: null, erroMotivo: null, erroMensagem: null }
            : { estado: 'falhou', terminadaEm: c.terminadaEm, duracaoMs: c.duracaoMs, erroCodigo: c.erro.codigo, erroMotivo: c.erro.motivo ?? null, erroMensagem: c.erro.mensagem ?? null },
      }),
    );
  }

  async darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, limites: { naFilaDesde: Date; semSinalDesde: Date }): Promise<ImportacaoGuardada[]> {
    return this.prisma.executar(escopo, async (tx) => {
      const daConta = { contaId: escopo.contaId };
      // Os ids saem dos próprios UPDATEs (RETURNING): o que outro processo fechou no meio não é devolvido duas vezes.
      const vencidas = await tx.importacao.updateManyAndReturn({
        where: { ...daConta, estado: 'enviada', expiraEm: { lte: agora } },
        data: { estado: 'descartada', terminadaEm: agora },
        select: { id: true },
      });
      const abandonadas = await tx.importacao.updateManyAndReturn({
        where: { ...daConta, estado: 'na_fila', pedidaEm: { lt: limites.naFilaDesde } },
        data: { estado: 'falhou', erroCodigo: 'abandonada', terminadaEm: agora },
        select: { id: true },
      });
      const interrompidas = await tx.importacao.updateManyAndReturn({
        where: { ...daConta, estado: 'rodando', ...semSinal(limites.semSinalDesde) },
        data: { ...INTERROMPIDA, terminadaEm: agora },
        select: { id: true },
      });
      const ids = [...vencidas, ...abandonadas, ...interrompidas].map((l) => l.id);
      if (ids.length === 0) return [];
      return (await tx.importacao.findMany({ where: { ...daConta, id: { in: ids } }, include: COM_A_PECA })).map(paraGuardada);
    });
  }

  async marcarArquivoRemovido(escopo: EscopoDaConta, id: string, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) => tx.importacao.updateMany({ where: { id, contaId: escopo.contaId }, data: { arquivoRemovidoEm: agora } }));
  }
}
