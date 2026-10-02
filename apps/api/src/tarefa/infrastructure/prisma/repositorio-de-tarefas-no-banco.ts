// Adaptador de RepositorioDeTarefas sobre PostgreSQL (Prisma), sob RLS.
// As duas garantias que não dependem da aplicação estão no banco (migração 20261003090000): uma tarefa
// viva por peça e uma tarefa trabalhando por conta, em índices únicos parciais.
import type { ChamadaRegistrada, EntradaDaTarefa, Entrega, EtapaPrevista, EventoDaTarefa, Pendencia, Preparo } from '@otto/agente';
import { ESTADOS_VIVOS_DA_TAREFA, type EstadoDaPendencia, type EstadoDaTarefa, type FimDaTarefa } from '@otto/shared';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { JsonDoBanco, PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import {
  type ConclusaoDeTarefa,
  type CriacaoDeTarefa,
  type EventoGuardado,
  type FaseDaTarefa,
  type InicioDeTarefa,
  type NovaTarefa,
  type PendenciaGuardada,
  RepositorioDeTarefas,
  type TarefaGuardada,
} from '../../application/repositorio-de-tarefas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIVOS = [...ESTADOS_VIVOS_DA_TAREFA];
const TRABALHANDO: EstadoDaTarefa[] = ['preparando', 'rodando'];
const NA_FILA: EstadoDaTarefa[] = ['na_fila', 'preparando', 'rodando'];
const violouUnicidade = (e: unknown): boolean => e instanceof Error && /unique constraint|Unique constraint|uma_viva_por_documento|uma_trabalhando_por_conta/i.test(e.message);

const umaLinha = (tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string) => tx.tarefaDoAgente.findFirst({ where: { id, contaId: escopo.contaId } });
type Linha = NonNullable<Awaited<ReturnType<typeof umaLinha>>>;
const umaPendencia = (tx: TransacaoComEscopo, escopo: EscopoDaConta, id: string) => tx.pendencia.findFirst({ where: { id, contaId: escopo.contaId } });
type LinhaDePendencia = NonNullable<Awaited<ReturnType<typeof umaPendencia>>>;

function paraGuardada(l: Linha): TarefaGuardada {
  return {
    id: l.id,
    documentoId: l.documentoId,
    tipo: l.tipo as EntradaDaTarefa['tipo'],
    ...(l.esforco ? { esforco: l.esforco } : {}),
    estado: l.estado,
    fase: l.fase as FaseDaTarefa,
    ...(l.fim ? { fim: l.fim as FimDaTarefa } : {}),
    ...(l.erroCodigo ? { erroCodigo: l.erroCodigo } : {}),
    ...(l.etapa ? { etapa: l.etapa as unknown as EtapaPrevista } : {}),
    etapas: (Array.isArray(l.etapas) ? l.etapas : []) as unknown as EtapaPrevista[],
    ...(l.preparo ? { preparo: l.preparo as unknown as Preparo } : {}),
    ...(l.aprovadaEm ? { aprovadaEm: l.aprovadaEm } : {}),
    versaoInicial: l.versaoInicial,
    ...(l.versaoFinal !== null ? { versaoFinal: l.versaoFinal } : {}),
    lotes: l.lotes,
    tocados: (Array.isArray(l.tocados) ? l.tocados : []) as string[],
    ...(l.entrega ? { entrega: l.entrega as unknown as Entrega } : {}),
    ...(l.conferida !== null ? { conferida: l.conferida } : {}),
    idsDoPreparo: l.idsDoPreparo,
    ...(l.origemId ? { origemId: l.origemId } : {}),
    ...(l.briefingId ? { briefingId: l.briefingId } : {}),
    enfileiradaEm: l.enfileiradaEm,
    ...(l.cancelamentoPedidoEm ? { cancelamentoPedidoEm: l.cancelamentoPedidoEm } : {}),
    ultimoEvento: l.ultimoEvento,
    chamadas: l.chamadas,
    consumo: {
      tokensDeEntrada: Number(l.tokensDeEntrada),
      tokensDeCacheLidos: Number(l.tokensDeCacheLidos),
      tokensDeCacheCriados: Number(l.tokensDeCacheCriados),
      tokensDeSaida: Number(l.tokensDeSaida),
      imagens: l.imagensEnviadas,
    },
    duracaoMs: l.duracaoMs,
    criadaEm: l.criadaEm,
    ...(l.iniciadaEm ? { iniciadaEm: l.iniciadaEm } : {}),
    ...(l.terminadaEm ? { terminadaEm: l.terminadaEm } : {}),
    ...(l.decididaEm ? { decididaEm: l.decididaEm } : {}),
  };
}

function pendenciaGuardada(l: LinhaDePendencia): PendenciaGuardada {
  return {
    id: l.id,
    documentoId: l.documentoId,
    tarefaId: l.tarefaId,
    tipo: l.tipo as Pendencia['tipo'],
    texto: l.texto,
    camadas: (Array.isArray(l.camadas) ? l.camadas : []) as string[],
    ...(l.prancheta ? { prancheta: l.prancheta } : {}),
    origem: l.origem as Pendencia['origem'],
    ...(l.regra ? { regra: l.regra } : {}),
    ...(l.gravidade ? { gravidade: l.gravidade as 'erro' | 'aviso' } : {}),
    estado: l.estado,
    criadaEm: l.criadaEm,
    ...(l.fechadaEm ? { fechadaEm: l.fechadaEm } : {}),
  };
}

export class RepositorioDeTarefasNoBanco extends RepositorioDeTarefas {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  /** Trava por conta, solta no fim da transação: contar e mudar a fila da conta é uma coisa só. */
  private async travarFilaDaConta(tx: TransacaoComEscopo, escopo: EscopoDaConta): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tarefas:${escopo.contaId}`}, 0))`;
    return tx.tarefaDoAgente.count({ where: { contaId: escopo.contaId, estado: { in: NA_FILA } } });
  }

  async criar(escopo: EscopoDaConta, nova: NovaTarefa, limite: { naFilaPorConta: number }): Promise<CriacaoDeTarefa> {
    if (!UUID.test(nova.documentoId)) return { recusa: 'documento' };
    const vivaDe = (tx: TransacaoComEscopo) =>
      tx.tarefaDoAgente.findFirst({ where: { contaId: escopo.contaId, documentoId: nova.documentoId, estado: { in: VIVOS } }, select: { id: true, estado: true } });
    try {
      return await this.prisma.executar(escopo, async (tx) => {
        // FOR UPDATE na peça: uma edição do designer e outra tarefa na mesma peça esperam esta transação
        const peca = await tx.$queryRaw<{ versao_atual: number }[]>`
          SELECT versao_atual FROM documentos WHERE id = ${nova.documentoId}::uuid AND conta_id = ${escopo.contaId}::uuid AND arquivado_em IS NULL FOR UPDATE`;
        if (!peca[0]) return { recusa: 'documento' as const };
        const viva = await vivaDe(tx);
        if (viva) return { recusa: 'viva' as const, viva };
        const jaNaFila = await this.travarFilaDaConta(tx, escopo);
        if (jaNaFila >= limite.naFilaPorConta) return { recusa: 'limite' as const };
        const esforco = 'esforco' in nova.entrada ? nova.entrada.esforco : undefined;
        await tx.tarefaDoAgente.create({
          data: {
            id: nova.id,
            contaId: escopo.contaId,
            documentoId: nova.documentoId,
            tipo: nova.entrada.tipo,
            esforco: esforco ?? null,
            versaoInicial: peca[0].versao_atual,
            origemId: nova.origemId ?? null,
            briefingId: nova.briefingId ?? null,
            enfileiradaEm: nova.criadaEm,
            criadaEm: nova.criadaEm,
          },
        });
        await tx.entradaDeTarefa.create({ data: { tarefaId: nova.id, contaId: escopo.contaId, entrada: nova.entrada as unknown as JsonDoBanco } });
        return { tarefa: paraGuardada((await umaLinha(tx, escopo, nova.id)) as Linha), jaNaFila };
      });
    } catch (e) {
      if (!violouUnicidade(e)) throw e;
      const viva = await this.prisma.executar(escopo, vivaDe);
      if (!viva) throw e;
      return { recusa: 'viva', viva };
    }
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<TarefaGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    const l = await this.prisma.executar(escopo, (tx) => umaLinha(tx, escopo, id));
    return l ? paraGuardada(l) : undefined;
  }

  async entradaDe(escopo: EscopoDaConta, id: string): Promise<{ entrada: EntradaDaTarefa; ajustes: string[] } | undefined> {
    if (!UUID.test(id)) return undefined;
    const l = await this.prisma.executar(escopo, (tx) => tx.entradaDeTarefa.findFirst({ where: { tarefaId: id, contaId: escopo.contaId } }));
    return l ? { entrada: l.entrada as unknown as EntradaDaTarefa, ajustes: (Array.isArray(l.ajustes) ? l.ajustes : []) as string[] } : undefined;
  }

  async vivaDoDocumento(escopo: EscopoDaConta, documentoId: string): Promise<TarefaGuardada | undefined> {
    if (!UUID.test(documentoId)) return undefined;
    const l = await this.prisma.executar(escopo, (tx) => tx.tarefaDoAgente.findFirst({ where: { contaId: escopo.contaId, documentoId, estado: { in: VIVOS } } }));
    return l ? paraGuardada(l) : undefined;
  }

  async vivasDaConta(escopo: EscopoDaConta): Promise<Map<string, { id: string; estado: EstadoDaTarefa; fim?: FimDaTarefa }>> {
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.findMany({ where: { contaId: escopo.contaId, estado: { in: VIVOS } }, select: { id: true, estado: true, fim: true, documentoId: true } }),
    );
    return new Map(linhas.map((l) => [l.documentoId, { id: l.id, estado: l.estado, ...(l.fim ? { fim: l.fim as FimDaTarefa } : {}) }]));
  }

  async listarDoDocumento(escopo: EscopoDaConta, documentoId: string, limite: number): Promise<TarefaGuardada[]> {
    if (!UUID.test(documentoId)) return [];
    const linhas = await this.prisma.executar(escopo, (tx) => tx.tarefaDoAgente.findMany({ where: { contaId: escopo.contaId, documentoId }, orderBy: { criadaEm: 'desc' }, take: limite }));
    return linhas.map(paraGuardada);
  }

  async contarCriadasDesde(escopo: EscopoDaConta, desde: Date): Promise<number> {
    return this.prisma.executar(escopo, (tx) => tx.tarefaDoAgente.count({ where: { contaId: escopo.contaId, criadaEm: { gte: desde } } }));
  }

  async emAndamentoDaConta(escopo: EscopoDaConta): Promise<TarefaGuardada[]> {
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.findMany({ where: { contaId: escopo.contaId, estado: { in: NA_FILA } }, orderBy: [{ enfileiradaEm: 'asc' }, { id: 'asc' }] }),
    );
    // quem já está trabalhando vem primeiro; a fila, por ordem de chegada
    return linhas.map(paraGuardada).sort((a, b) => Number(a.estado === 'na_fila') - Number(b.estado === 'na_fila'));
  }

  async contarNaFila(escopo: EscopoDaConta): Promise<number> {
    return this.prisma.executar(escopo, (tx) => tx.tarefaDoAgente.count({ where: { contaId: escopo.contaId, estado: { in: NA_FILA } } }));
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date): Promise<InicioDeTarefa> {
    if (!UUID.test(id)) return { resultado: 'ignorada' };
    try {
      return await this.prisma.executar(escopo, async (tx) => {
        const alvo = await tx.tarefaDoAgente.findFirst({ where: { id, contaId: escopo.contaId }, select: { estado: true, fase: true } });
        if (alvo?.estado !== 'na_fila') return { resultado: 'ignorada' as const };
        if ((await tx.tarefaDoAgente.count({ where: { contaId: escopo.contaId, estado: { in: TRABALHANDO } } })) > 0) return { resultado: 'ocupada' as const };
        const execucao = alvo.fase === 'execucao';
        // a condição no próprio UPDATE é o que torna o consumidor idempotente
        const mudou = await tx.tarefaDoAgente.updateMany({
          where: { id, contaId: escopo.contaId, estado: 'na_fila' },
          data: { estado: execucao ? 'rodando' : 'preparando', batimentoEm: agora, cancelamentoPedidoEm: null, ...(execucao ? { iniciadaEm: agora } : {}) },
        });
        if (mudou.count === 0) return { resultado: 'ignorada' as const };
        return { resultado: 'iniciada' as const, tarefa: paraGuardada((await umaLinha(tx, escopo, id)) as Linha) };
      });
    } catch (e) {
      // dois workers ao mesmo tempo: o índice único parcial deixa passar um só
      if (violouUnicidade(e)) return { resultado: 'ocupada' };
      throw e;
    }
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ cancelamentoPedido: boolean }> {
    if (!UUID.test(id)) return { cancelamentoPedido: false };
    return this.prisma.executar(escopo, async (tx) => {
      await tx.tarefaDoAgente.updateMany({ where: { id, contaId: escopo.contaId, estado: { in: TRABALHANDO } }, data: { batimentoEm: agora } });
      const l = await tx.tarefaDoAgente.findFirst({ where: { id, contaId: escopo.contaId }, select: { cancelamentoPedidoEm: true } });
      return { cancelamentoPedido: Boolean(l?.cancelamentoPedidoEm) };
    });
  }

  async guardarPreparo(escopo: EscopoDaConta, id: string, dados: { preparo: Preparo; idsDoPreparo: number; seguir: 'aguardar' | 'executar'; agora: Date }): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const mudou = await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.updateMany({
        where: { id, contaId: escopo.contaId, estado: 'preparando' },
        data: {
          preparo: dados.preparo as unknown as JsonDoBanco,
          idsDoPreparo: dados.idsDoPreparo,
          batimentoEm: dados.agora,
          ...(dados.seguir === 'aguardar' ? { estado: 'aguardando_confirmacao' } : { estado: 'rodando', fase: 'execucao', iniciadaEm: dados.agora }),
        },
      }),
    );
    return mudou.count === 1;
  }

  private async voltarParaAFila(
    escopo: EscopoDaConta,
    id: string,
    dados: { fase: FaseDaTarefa; aprovadaEm?: Date; agora: Date },
    depois?: (tx: TransacaoComEscopo) => Promise<unknown>,
  ): Promise<{ jaNaFila: number } | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const jaNaFila = await this.travarFilaDaConta(tx, escopo);
      const mudou = await tx.tarefaDoAgente.updateMany({
        where: { id, contaId: escopo.contaId, estado: 'aguardando_confirmacao' },
        data: { estado: 'na_fila', fase: dados.fase, enfileiradaEm: dados.agora, ...(dados.aprovadaEm ? { aprovadaEm: dados.aprovadaEm } : {}) },
      });
      if (mudou.count === 0) return undefined;
      await depois?.(tx);
      return { jaNaFila };
    });
  }

  async aprovar(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ jaNaFila: number } | undefined> {
    return this.voltarParaAFila(escopo, id, { fase: 'execucao', aprovadaEm: agora, agora });
  }

  async pedirAjuste(escopo: EscopoDaConta, id: string, texto: string, agora: Date): Promise<{ jaNaFila: number } | undefined> {
    return this.voltarParaAFila(escopo, id, { fase: 'preparo', agora }, async (tx) => {
      const l = await tx.entradaDeTarefa.findFirst({ where: { tarefaId: id, contaId: escopo.contaId }, select: { ajustes: true } });
      const ajustes = [...((Array.isArray(l?.ajustes) ? l.ajustes : []) as string[]), texto];
      await tx.entradaDeTarefa.updateMany({ where: { tarefaId: id, contaId: escopo.contaId }, data: { ajustes } });
    });
  }

  devolverAFila(escopo: EscopoDaConta, antesDe: Date, agora: Date): Promise<{ id: string; jaNaFila: number }[]> {
    return this.prisma.executar(escopo, async (tx) => {
      // a condição vai no UPDATE: duas leituras ao mesmo tempo devolvem a tarefa uma vez só
      const linhas = await tx.$queryRaw<{ id: string }[]>`
        UPDATE tarefas_do_agente SET enfileirada_em = ${agora}
        WHERE conta_id = ${escopo.contaId}::uuid AND estado = 'na_fila' AND enfileirada_em < ${antesDe}
        RETURNING id`;
      return linhas.map((l, i) => ({ id: l.id, jaNaFila: i }));
    });
  }

  async pedirCancelamento(escopo: EscopoDaConta, id: string, agora: Date): Promise<'cancelada' | 'pedido' | 'fora' | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const fechou = await tx.tarefaDoAgente.updateMany({
        where: { id, contaId: escopo.contaId, estado: { in: ['na_fila', 'aguardando_confirmacao'] } },
        data: { estado: 'cancelada', fim: 'cancelada', terminadaEm: agora },
      });
      if (fechou.count === 1) return 'cancelada' as const;
      const pediu = await tx.tarefaDoAgente.updateMany({ where: { id, contaId: escopo.contaId, estado: { in: TRABALHANDO } }, data: { cancelamentoPedidoEm: agora } });
      if (pediu.count === 1) return 'pedido' as const;
      return (await tx.tarefaDoAgente.count({ where: { id, contaId: escopo.contaId } })) === 1 ? ('fora' as const) : undefined;
    });
  }

  async registrarEvento(escopo: EscopoDaConta, id: string, evento: EventoDaTarefa, agora: Date): Promise<number> {
    if (!UUID.test(id)) throw new Error('tarefa inexistente neste escopo');
    return this.prisma.executar(escopo, async (tx) => {
      // a sequência sai da linha da tarefa, na mesma transação do evento: um escritor por tarefa, sem buraco
      const linhas = await tx.$queryRaw<{ ultimo_evento: number }[]>`
        UPDATE tarefas_do_agente SET ultimo_evento = ultimo_evento + 1 WHERE id = ${id}::uuid AND conta_id = ${escopo.contaId}::uuid RETURNING ultimo_evento`;
      const sequencia = linhas[0]?.ultimo_evento;
      if (sequencia === undefined) throw new Error('tarefa inexistente neste escopo');
      await tx.eventoDeTarefa.create({ data: { tarefaId: id, sequencia, contaId: escopo.contaId, tipo: evento.tipo, dados: evento as unknown as JsonDoBanco, criadoEm: agora } });
      return sequencia;
    });
  }

  async eventosDepois(escopo: EscopoDaConta, id: string, depoisDe: number, limite: number): Promise<EventoGuardado[]> {
    if (!UUID.test(id)) return [];
    const linhas = await this.prisma.executar(escopo, (tx) =>
      tx.eventoDeTarefa.findMany({ where: { tarefaId: id, contaId: escopo.contaId, sequencia: { gt: depoisDe } }, orderBy: { sequencia: 'asc' }, take: limite }),
    );
    return linhas.map((l) => ({ sequencia: l.sequencia, quando: l.criadoEm, evento: l.dados as unknown as EventoDaTarefa }));
  }

  async registrarChamada(escopo: EscopoDaConta, id: string, c: ChamadaRegistrada, agora: Date): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, async (tx) => {
      const linhas = await tx.$queryRaw<{ chamadas: number }[]>`
        UPDATE tarefas_do_agente
        SET chamadas = chamadas + 1, modelo = ${c.modelo},
            tokens_de_entrada = tokens_de_entrada + ${c.uso.entrada}, tokens_de_cache_lidos = tokens_de_cache_lidos + ${c.uso.cacheLido},
            tokens_de_cache_criados = tokens_de_cache_criados + ${c.uso.cacheCriado}, tokens_de_saida = tokens_de_saida + ${c.uso.saida},
            imagens_enviadas = imagens_enviadas + ${c.imagens}
        WHERE id = ${id}::uuid AND conta_id = ${escopo.contaId}::uuid RETURNING chamadas`;
      const total = linhas[0]?.chamadas;
      if (total === undefined) return;
      await tx.chamadaAoModelo.create({
        data: {
          tarefaId: id,
          sequencia: total - 1,
          contaId: escopo.contaId,
          papel: c.papel,
          modelo: c.modelo,
          tokensDeEntrada: c.uso.entrada,
          tokensDeCacheLidos: c.uso.cacheLido,
          tokensDeCacheCriados: c.uso.cacheCriado,
          tokensDeSaida: c.uso.saida,
          imagens: c.imagens,
          duracaoMs: Math.round(c.duracaoMs),
          resultado: c.resultado,
          criadaEm: agora,
        },
      });
    });
  }

  async registrarLote(escopo: EscopoDaConta, id: string, tocados: readonly string[]): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, async (tx) => {
      const l = await tx.tarefaDoAgente.findFirst({ where: { id, contaId: escopo.contaId }, select: { tocados: true } });
      if (!l) return;
      const todos = [...new Set([...((Array.isArray(l.tocados) ? l.tocados : []) as string[]), ...tocados])];
      await tx.tarefaDoAgente.updateMany({ where: { id, contaId: escopo.contaId }, data: { lotes: { increment: 1 }, tocados: todos } });
    });
  }

  async atualizarEtapa(escopo: EscopoDaConta, id: string, dados: { etapa?: EtapaPrevista; etapas?: EtapaPrevista[] }): Promise<void> {
    if (!UUID.test(id)) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.updateMany({
        where: { id, contaId: escopo.contaId },
        data: { ...(dados.etapa ? { etapa: dados.etapa as unknown as JsonDoBanco } : {}), ...(dados.etapas ? { etapas: dados.etapas as unknown as JsonDoBanco } : {}) },
      }),
    );
  }

  async concluir(escopo: EscopoDaConta, id: string, c: ConclusaoDeTarefa): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const mudou = await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.updateMany({
        where: { id, contaId: escopo.contaId, estado: { in: TRABALHANDO } },
        data: {
          estado: c.estado,
          fim: c.fim,
          erroCodigo: c.erroCodigo ?? null,
          terminadaEm: c.agora,
          ...(c.entrega ? { entrega: c.entrega as unknown as JsonDoBanco } : {}),
          ...(c.conferida !== undefined ? { conferida: c.conferida } : {}),
          ...(c.versaoFinal !== undefined ? { versaoFinal: c.versaoFinal } : {}),
          ...(c.resultado ? { resultado: c.resultado, decididaEm: c.agora } : {}),
          ...(c.custo
            ? {
                modelo: c.custo.modelo,
                voltasDeConferencia: c.custo.voltasDeConferencia,
                lotesRecusados: c.custo.lotesRecusados,
                duracaoMs: Math.round(c.custo.duracaoMs),
                custoEstimadoMicroUsd: c.custo.dolares === null ? null : BigInt(Math.round(c.custo.dolares * 1_000_000)),
              }
            : {}),
        },
      }),
    );
    return mudou.count === 1;
  }

  async decidir(escopo: EscopoDaConta, id: string, d: { de: readonly EstadoDaTarefa[]; para: 'aceita' | 'desfeita'; resultado: string; agora: Date }): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const mudou = await this.prisma.executar(escopo, (tx) =>
      tx.tarefaDoAgente.updateMany({ where: { id, contaId: escopo.contaId, estado: { in: [...d.de] } }, data: { estado: d.para, resultado: d.resultado, decididaEm: d.agora } }),
    );
    return mudou.count === 1;
  }

  async darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, semSinalDesde: Date): Promise<TarefaGuardada[]> {
    return this.prisma.executar(escopo, async (tx) => {
      const paradas = await tx.tarefaDoAgente.findMany({
        where: { contaId: escopo.contaId, estado: { in: TRABALHANDO }, OR: [{ batimentoEm: { lt: semSinalDesde } }, { batimentoEm: null }] },
        select: { id: true, lotes: true, documentoId: true },
      });
      const fechadas: TarefaGuardada[] = [];
      for (const p of paradas) {
        const comLote = p.lotes > 0;
        const peca = comLote ? await tx.documento.findFirst({ where: { id: p.documentoId, contaId: escopo.contaId }, select: { versaoAtual: true } }) : undefined;
        const mudou = await tx.tarefaDoAgente.updateMany({
          where: { id: p.id, contaId: escopo.contaId, estado: { in: TRABALHANDO } },
          data: { estado: comLote ? 'em_revisao' : 'falhou', fim: 'interrompida', erroCodigo: comLote ? null : 'interrompida', terminadaEm: agora, ...(peca ? { versaoFinal: peca.versaoAtual } : {}) },
        });
        if (mudou.count === 1) fechadas.push(paraGuardada((await umaLinha(tx, escopo, p.id)) as Linha));
      }
      return fechadas;
    });
  }

  async criarPendencias(escopo: EscopoDaConta, tarefa: { id: string; documentoId: string }, pendencias: readonly (Pendencia & { id: string })[], agora: Date): Promise<void> {
    if (pendencias.length === 0) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.pendencia.createMany({
        data: pendencias.map((p) => ({
          id: p.id,
          contaId: escopo.contaId,
          documentoId: tarefa.documentoId,
          tarefaId: tarefa.id,
          tipo: p.tipo,
          texto: p.texto,
          camadas: p.camadas,
          prancheta: p.prancheta ?? null,
          origem: p.origem,
          regra: p.regra ?? null,
          gravidade: p.gravidade ?? null,
          criadaEm: agora,
        })),
      }),
    );
  }

  async listarPendencias(escopo: EscopoDaConta, documentoId: string, estado: EstadoDaPendencia): Promise<PendenciaGuardada[]> {
    if (!UUID.test(documentoId)) return [];
    const linhas = await this.prisma.executar(escopo, (tx) => tx.pendencia.findMany({ where: { contaId: escopo.contaId, documentoId, estado }, orderBy: { criadaEm: 'asc' } }));
    return linhas.map(pendenciaGuardada);
  }

  async mudarPendencia(escopo: EscopoDaConta, id: string, estado: EstadoDaPendencia, agora: Date): Promise<PendenciaGuardada | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const mudou = await tx.pendencia.updateMany({ where: { id, contaId: escopo.contaId }, data: { estado, fechadaEm: estado === 'aberta' ? null : agora } });
      if (mudou.count === 0) return undefined;
      return pendenciaGuardada((await umaPendencia(tx, escopo, id)) as LinhaDePendencia);
    });
  }

  async fecharPendenciasDaTarefa(escopo: EscopoDaConta, tarefaId: string, agora: Date): Promise<void> {
    if (!UUID.test(tarefaId)) return;
    await this.prisma.executar(escopo, (tx) =>
      tx.pendencia.updateMany({ where: { contaId: escopo.contaId, tarefaId, estado: { not: 'resolvida' } }, data: { estado: 'resolvida', fechadaEm: agora } }),
    );
  }
}
