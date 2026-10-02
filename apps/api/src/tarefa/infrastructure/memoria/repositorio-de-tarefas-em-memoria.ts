// Adaptador falso de RepositorioDeTarefas, para os testes de caso de uso. Passa pelo mesmo contrato do banco.
import type { ChamadaRegistrada, EntradaDaTarefa, EtapaPrevista, EventoDaTarefa, Pendencia, Preparo } from '@otto/agente';
import { ESTADOS_VIVOS_DA_TAREFA, type EstadoDaPendencia, type EstadoDaTarefa, type FimDaTarefa } from '@otto/shared';
import type { RepositorioDeDocumentos } from '../../../documento/application/repositorio-de-documentos';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import {
  type ConclusaoDeTarefa,
  type CriacaoDeTarefa,
  type EventoGuardado,
  type InicioDeTarefa,
  type NovaTarefa,
  type PendenciaGuardada,
  RepositorioDeTarefas,
  type TarefaGuardada,
} from '../../application/repositorio-de-tarefas';

interface Guardada {
  contaId: string;
  tarefa: TarefaGuardada;
  entrada: EntradaDaTarefa;
  ajustes: string[];
  eventos: EventoGuardado[];
  batimentoEm?: Date;
}

const copia = <T>(valor: T): T => structuredClone(valor);
const TRABALHANDO: readonly EstadoDaTarefa[] = ['preparando', 'rodando'];
const NA_FILA: readonly EstadoDaTarefa[] = ['na_fila', 'preparando', 'rodando'];

export class RepositorioDeTarefasEmMemoria extends RepositorioDeTarefas {
  private readonly todas = new Map<string, Guardada>();
  private readonly pendencias = new Map<string, { contaId: string; pendencia: PendenciaGuardada }>();
  /** As chamadas ao modelo registradas, para o teste conferir o custo. */
  readonly chamadas: { tarefaId: string; sequencia: number; chamada: ChamadaRegistrada }[] = [];

  constructor(private readonly documentos: RepositorioDeDocumentos) {
    super();
  }

  private achar(escopo: EscopoDaConta, id: string): Guardada | undefined {
    const g = this.todas.get(id);
    return g && g.contaId === escopo.contaId ? g : undefined;
  }
  private daConta(escopo: EscopoDaConta): Guardada[] {
    return [...this.todas.values()].filter((g) => g.contaId === escopo.contaId);
  }
  private naFila(escopo: EscopoDaConta): number {
    return this.daConta(escopo).filter((g) => NA_FILA.includes(g.tarefa.estado)).length;
  }

  async criar(escopo: EscopoDaConta, nova: NovaTarefa, limite: { naFilaPorConta: number }): Promise<CriacaoDeTarefa> {
    const doc = await this.documentos.abrir(escopo, nova.documentoId);
    if (!doc) return { recusa: 'documento' };
    // daqui em diante não há espera: num processo só, conferir e criar é atômico
    const viva = this.daConta(escopo).find((g) => g.tarefa.documentoId === nova.documentoId && ESTADOS_VIVOS_DA_TAREFA.includes(g.tarefa.estado));
    if (viva) return { recusa: 'viva', viva: { id: viva.tarefa.id, estado: viva.tarefa.estado } };
    const jaNaFila = this.naFila(escopo);
    if (jaNaFila >= limite.naFilaPorConta) return { recusa: 'limite' };
    const esforco = 'esforco' in nova.entrada ? nova.entrada.esforco : undefined;
    const tarefa: TarefaGuardada = {
      id: nova.id,
      documentoId: nova.documentoId,
      tipo: nova.entrada.tipo,
      ...(esforco ? { esforco } : {}),
      estado: 'na_fila',
      fase: 'preparo',
      etapas: [],
      versaoInicial: doc.versao,
      lotes: 0,
      tocados: [],
      idsDoPreparo: 0,
      ...(nova.origemId ? { origemId: nova.origemId } : {}),
      ...(nova.briefingId ? { briefingId: nova.briefingId } : {}),
      enfileiradaEm: nova.criadaEm,
      ultimoEvento: -1,
      chamadas: 0,
      consumo: { tokensDeEntrada: 0, tokensDeCacheLidos: 0, tokensDeCacheCriados: 0, tokensDeSaida: 0, imagens: 0 },
      duracaoMs: 0,
      criadaEm: nova.criadaEm,
    };
    this.todas.set(nova.id, { contaId: escopo.contaId, tarefa, entrada: copia(nova.entrada), ajustes: [], eventos: [] });
    return { tarefa: copia(tarefa), jaNaFila };
  }

  async buscar(escopo: EscopoDaConta, id: string): Promise<TarefaGuardada | undefined> {
    const g = this.achar(escopo, id);
    return g ? copia(g.tarefa) : undefined;
  }

  async entradaDe(escopo: EscopoDaConta, id: string): Promise<{ entrada: EntradaDaTarefa; ajustes: string[] } | undefined> {
    const g = this.achar(escopo, id);
    return g ? { entrada: copia(g.entrada), ajustes: [...g.ajustes] } : undefined;
  }

  async vivaDoDocumento(escopo: EscopoDaConta, documentoId: string): Promise<TarefaGuardada | undefined> {
    const g = this.daConta(escopo).find((x) => x.tarefa.documentoId === documentoId && ESTADOS_VIVOS_DA_TAREFA.includes(x.tarefa.estado));
    return g ? copia(g.tarefa) : undefined;
  }

  async vivasDaConta(escopo: EscopoDaConta): Promise<Map<string, { id: string; estado: EstadoDaTarefa; fim?: FimDaTarefa }>> {
    return new Map(
      this.daConta(escopo)
        .filter((g) => ESTADOS_VIVOS_DA_TAREFA.includes(g.tarefa.estado))
        .map((g) => [g.tarefa.documentoId, { id: g.tarefa.id, estado: g.tarefa.estado, ...(g.tarefa.fim ? { fim: g.tarefa.fim } : {}) }]),
    );
  }

  async listarDoDocumento(escopo: EscopoDaConta, documentoId: string, limite: number): Promise<TarefaGuardada[]> {
    return this.daConta(escopo)
      .filter((g) => g.tarefa.documentoId === documentoId)
      .sort((a, b) => b.tarefa.criadaEm.getTime() - a.tarefa.criadaEm.getTime())
      .slice(0, limite)
      .map((g) => copia(g.tarefa));
  }

  async contarCriadasDesde(escopo: EscopoDaConta, desde: Date): Promise<number> {
    return this.daConta(escopo).filter((g) => g.tarefa.criadaEm >= desde).length;
  }

  async emAndamentoDaConta(escopo: EscopoDaConta): Promise<TarefaGuardada[]> {
    return this.daConta(escopo)
      .filter((g) => NA_FILA.includes(g.tarefa.estado))
      .sort((a, b) => Number(a.tarefa.estado === 'na_fila') - Number(b.tarefa.estado === 'na_fila') || a.tarefa.enfileiradaEm.getTime() - b.tarefa.enfileiradaEm.getTime())
      .map((g) => copia(g.tarefa));
  }

  async contarNaFila(escopo: EscopoDaConta): Promise<number> {
    return this.naFila(escopo);
  }

  async iniciar(escopo: EscopoDaConta, id: string, agora: Date): Promise<InicioDeTarefa> {
    const g = this.achar(escopo, id);
    if (g?.tarefa.estado !== 'na_fila') return { resultado: 'ignorada' };
    if (this.daConta(escopo).some((x) => TRABALHANDO.includes(x.tarefa.estado))) return { resultado: 'ocupada' };
    const execucao = g.tarefa.fase === 'execucao';
    g.tarefa = { ...g.tarefa, estado: execucao ? 'rodando' : 'preparando', ...(execucao ? { iniciadaEm: agora } : {}) };
    delete g.tarefa.cancelamentoPedidoEm;
    g.batimentoEm = agora;
    return { resultado: 'iniciada', tarefa: copia(g.tarefa) };
  }

  async bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ cancelamentoPedido: boolean }> {
    const g = this.achar(escopo, id);
    if (!g) return { cancelamentoPedido: false };
    g.batimentoEm = agora;
    return { cancelamentoPedido: g.tarefa.cancelamentoPedidoEm !== undefined };
  }

  async guardarPreparo(escopo: EscopoDaConta, id: string, dados: { preparo: Preparo; idsDoPreparo: number; seguir: 'aguardar' | 'executar'; agora: Date }): Promise<boolean> {
    const g = this.achar(escopo, id);
    if (g?.tarefa.estado !== 'preparando') return false;
    g.tarefa = {
      ...g.tarefa,
      preparo: copia(dados.preparo),
      idsDoPreparo: dados.idsDoPreparo,
      ...(dados.seguir === 'aguardar' ? { estado: 'aguardando_confirmacao' as const } : { estado: 'rodando' as const, fase: 'execucao' as const, iniciadaEm: dados.agora }),
    };
    g.batimentoEm = dados.agora;
    return true;
  }

  async aprovar(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ jaNaFila: number } | undefined> {
    const g = this.achar(escopo, id);
    if (g?.tarefa.estado !== 'aguardando_confirmacao') return undefined;
    const jaNaFila = this.naFila(escopo);
    g.tarefa = { ...g.tarefa, estado: 'na_fila', fase: 'execucao', aprovadaEm: agora, enfileiradaEm: agora };
    return { jaNaFila };
  }

  async pedirAjuste(escopo: EscopoDaConta, id: string, texto: string, agora: Date): Promise<{ jaNaFila: number } | undefined> {
    const g = this.achar(escopo, id);
    if (g?.tarefa.estado !== 'aguardando_confirmacao') return undefined;
    const jaNaFila = this.naFila(escopo);
    g.tarefa = { ...g.tarefa, estado: 'na_fila', fase: 'preparo', enfileiradaEm: agora };
    g.ajustes.push(texto);
    return { jaNaFila };
  }

  async devolverAFila(escopo: EscopoDaConta, antesDe: Date, agora: Date): Promise<{ id: string; jaNaFila: number }[]> {
    const paradas = this.daConta(escopo).filter((g) => g.tarefa.estado === 'na_fila' && g.tarefa.enfileiradaEm < antesDe);
    return paradas.map((g, i) => {
      g.tarefa = { ...g.tarefa, enfileiradaEm: agora };
      return { id: g.tarefa.id, jaNaFila: i };
    });
  }

  async pedirCancelamento(escopo: EscopoDaConta, id: string, agora: Date): Promise<'cancelada' | 'pedido' | 'fora' | undefined> {
    const g = this.achar(escopo, id);
    if (!g) return undefined;
    if (g.tarefa.estado === 'na_fila' || g.tarefa.estado === 'aguardando_confirmacao') {
      g.tarefa = { ...g.tarefa, estado: 'cancelada', fim: 'cancelada', terminadaEm: agora };
      return 'cancelada';
    }
    if (!TRABALHANDO.includes(g.tarefa.estado)) return 'fora';
    g.tarefa = { ...g.tarefa, cancelamentoPedidoEm: agora };
    return 'pedido';
  }

  async registrarEvento(escopo: EscopoDaConta, id: string, evento: EventoDaTarefa, agora: Date): Promise<number> {
    const g = this.achar(escopo, id);
    if (!g) throw new Error('tarefa inexistente neste escopo');
    const sequencia = g.tarefa.ultimoEvento + 1;
    g.eventos.push({ sequencia, quando: agora, evento: copia(evento) });
    g.tarefa = { ...g.tarefa, ultimoEvento: sequencia };
    return sequencia;
  }

  async eventosDepois(escopo: EscopoDaConta, id: string, depoisDe: number, limite: number): Promise<EventoGuardado[]> {
    return copia((this.achar(escopo, id)?.eventos ?? []).filter((e) => e.sequencia > depoisDe).slice(0, limite));
  }

  async registrarChamada(escopo: EscopoDaConta, id: string, chamada: ChamadaRegistrada, _agora: Date): Promise<void> {
    const g = this.achar(escopo, id);
    if (!g) return;
    this.chamadas.push({ tarefaId: id, sequencia: g.tarefa.chamadas, chamada: copia(chamada) });
    const antes = g.tarefa.consumo;
    g.tarefa = {
      ...g.tarefa,
      chamadas: g.tarefa.chamadas + 1,
      consumo: {
        tokensDeEntrada: antes.tokensDeEntrada + chamada.uso.entrada,
        tokensDeCacheLidos: antes.tokensDeCacheLidos + chamada.uso.cacheLido,
        tokensDeCacheCriados: antes.tokensDeCacheCriados + chamada.uso.cacheCriado,
        tokensDeSaida: antes.tokensDeSaida + chamada.uso.saida,
        imagens: antes.imagens + chamada.imagens,
      },
    };
  }

  async registrarLote(escopo: EscopoDaConta, id: string, tocados: readonly string[]): Promise<void> {
    const g = this.achar(escopo, id);
    if (g) g.tarefa = { ...g.tarefa, lotes: g.tarefa.lotes + 1, tocados: [...new Set([...g.tarefa.tocados, ...tocados])] };
  }

  async atualizarEtapa(escopo: EscopoDaConta, id: string, dados: { etapa?: EtapaPrevista; etapas?: EtapaPrevista[] }): Promise<void> {
    const g = this.achar(escopo, id);
    if (g) g.tarefa = { ...g.tarefa, ...(dados.etapa ? { etapa: copia(dados.etapa) } : {}), ...(dados.etapas ? { etapas: copia(dados.etapas) } : {}) };
  }

  async concluir(escopo: EscopoDaConta, id: string, c: ConclusaoDeTarefa): Promise<boolean> {
    const g = this.achar(escopo, id);
    if (!g || !TRABALHANDO.includes(g.tarefa.estado)) return false;
    g.tarefa = {
      ...g.tarefa,
      estado: c.estado,
      fim: c.fim,
      terminadaEm: c.agora,
      ...(c.erroCodigo ? { erroCodigo: c.erroCodigo } : {}),
      ...(c.entrega ? { entrega: copia(c.entrega) } : {}),
      ...(c.conferida !== undefined ? { conferida: c.conferida } : {}),
      ...(c.versaoFinal !== undefined ? { versaoFinal: c.versaoFinal } : {}),
      ...(c.custo ? { duracaoMs: Math.round(c.custo.duracaoMs) } : {}),
    };
    return true;
  }

  async decidir(escopo: EscopoDaConta, id: string, d: { de: readonly EstadoDaTarefa[]; para: 'aceita' | 'desfeita'; resultado: string; agora: Date }): Promise<boolean> {
    const g = this.achar(escopo, id);
    if (!g || !d.de.includes(g.tarefa.estado)) return false;
    g.tarefa = { ...g.tarefa, estado: d.para, decididaEm: d.agora };
    return true;
  }

  async darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, semSinalDesde: Date): Promise<TarefaGuardada[]> {
    const fechadas: TarefaGuardada[] = [];
    for (const g of this.daConta(escopo)) {
      if (!TRABALHANDO.includes(g.tarefa.estado) || (g.batimentoEm ?? new Date(0)) >= semSinalDesde) continue;
      const comLote = g.tarefa.lotes > 0;
      const versaoFinal = comLote ? (await this.documentos.abrir(escopo, g.tarefa.documentoId))?.versao : undefined;
      g.tarefa = {
        ...g.tarefa,
        estado: comLote ? 'em_revisao' : 'falhou',
        fim: 'interrompida',
        terminadaEm: agora,
        ...(comLote ? {} : { erroCodigo: 'interrompida' }),
        ...(versaoFinal !== undefined ? { versaoFinal } : {}),
      };
      fechadas.push(copia(g.tarefa));
    }
    return fechadas;
  }

  async criarPendencias(escopo: EscopoDaConta, tarefa: { id: string; documentoId: string }, pendencias: readonly (Pendencia & { id: string })[], agora: Date): Promise<void> {
    for (const p of pendencias)
      this.pendencias.set(p.id, { contaId: escopo.contaId, pendencia: { ...copia(p), documentoId: tarefa.documentoId, tarefaId: tarefa.id, estado: 'aberta', criadaEm: agora } });
  }

  async listarPendencias(escopo: EscopoDaConta, documentoId: string, estado: EstadoDaPendencia): Promise<PendenciaGuardada[]> {
    return [...this.pendencias.values()].filter((p) => p.contaId === escopo.contaId && p.pendencia.documentoId === documentoId && p.pendencia.estado === estado).map((p) => copia(p.pendencia));
  }

  async mudarPendencia(escopo: EscopoDaConta, id: string, estado: EstadoDaPendencia, agora: Date): Promise<PendenciaGuardada | undefined> {
    const p = this.pendencias.get(id);
    if (!p || p.contaId !== escopo.contaId) return undefined;
    const { fechadaEm: _antes, ...resto } = p.pendencia;
    p.pendencia = { ...resto, estado, ...(estado === 'aberta' ? {} : { fechadaEm: agora }) };
    return copia(p.pendencia);
  }

  async fecharPendenciasDaTarefa(escopo: EscopoDaConta, tarefaId: string, agora: Date): Promise<void> {
    for (const p of this.pendencias.values()) {
      if (p.contaId === escopo.contaId && p.pendencia.tarefaId === tarefaId && p.pendencia.estado !== 'resolvida') p.pendencia = { ...p.pendencia, estado: 'resolvida', fechadaEm: agora };
    }
  }
}
