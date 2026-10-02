// Porta: o registro das tarefas do Otto, com a linha do tempo, o custo e as pendências.
// O escopo da conta é sempre o primeiro argumento (ADR 023). Nenhum tipo do Prisma cruza esta porta.
//
// O que é conteúdo do trabalho (preparo, entrega, eventos, pendências) fica aqui, no banco, sob a
// conta. Não vai para log nem para evento de uso (ADR 031). Custo é só número.
import type { ChamadaRegistrada, CustoDaTarefa, EntradaDaTarefa, Entrega, EtapaPrevista, EventoDaTarefa, Pendencia, Preparo } from '@otto/agente';
import type { EstadoDaPendencia, EstadoDaTarefa, FimDaTarefa } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export type FaseDaTarefa = 'preparo' | 'execucao';

export interface TarefaGuardada {
  id: string;
  documentoId: string;
  tipo: EntradaDaTarefa['tipo'];
  esforco?: string;
  estado: EstadoDaTarefa;
  /** Qual parte está na fila ou rodando: entender e planejar, ou fazer e conferir. */
  fase: FaseDaTarefa;
  fim?: FimDaTarefa;
  erroCodigo?: string;
  etapa?: EtapaPrevista;
  etapas: EtapaPrevista[];
  preparo?: Preparo;
  aprovadaEm?: Date;
  versaoInicial: number;
  versaoFinal?: number;
  lotes: number;
  tocados: string[];
  entrega?: Entrega;
  conferida?: boolean;
  /** Quantos ids a primeira parte consumiu (só o modelo roteirizado usa: para a segunda parte continuar a sequência). */
  idsDoPreparo: number;
  origemId?: string;
  cancelamentoPedidoEm?: Date;
  /** Sequência do último evento gravado; -1 se nenhum. */
  ultimoEvento: number;
  /** Chamadas ao modelo já registradas. */
  chamadas: number;
  duracaoMs: number;
  criadaEm: Date;
  iniciadaEm?: Date;
  terminadaEm?: Date;
  decididaEm?: Date;
}

export interface NovaTarefa {
  id: string;
  documentoId: string;
  entrada: EntradaDaTarefa;
  origemId?: string;
  criadaEm: Date;
}

export type CriacaoDeTarefa =
  /** `jaNaFila`: quantas a conta já tinha esperando ou trabalhando (é a posição dela na fila, para a justiça entre contas). */
  | { tarefa: TarefaGuardada; jaNaFila: number }
  /** O documento não existe nesta conta. */
  | { recusa: 'documento' }
  /** A peça já tem uma tarefa viva. */
  | { recusa: 'viva'; viva: { id: string; estado: EstadoDaTarefa } }
  /** A conta já tem tarefas demais esperando ou trabalhando. */
  | { recusa: 'limite' };

export type InicioDeTarefa =
  /** Passou de na_fila para preparando ou rodando: este worker é o dono. */
  | { resultado: 'iniciada'; tarefa: TarefaGuardada }
  /** Outra tarefa da MESMA conta está trabalhando: tente depois. */
  | { resultado: 'ocupada' }
  /** Não existe nesta conta, ou não está na fila (entrega repetida, cancelada, aguardando o "pode"). */
  | { resultado: 'ignorada' };

export interface EventoGuardado {
  sequencia: number;
  quando: Date;
  evento: EventoDaTarefa;
}

export interface ConclusaoDeTarefa {
  estado: 'em_revisao' | 'aceita' | 'cancelada' | 'falhou';
  fim: FimDaTarefa;
  erroCodigo?: string;
  entrega?: Entrega;
  conferida?: boolean;
  versaoFinal?: number;
  /** O total que o ciclo devolveu. Os tokens já foram somados chamada a chamada; daqui saem imagens, voltas, duração e dinheiro. */
  custo?: CustoDaTarefa;
  /** aceita: a tarefa terminou sem nada para revisar. */
  resultado?: string;
  agora: Date;
}

export interface PendenciaGuardada extends Pendencia {
  id: string;
  documentoId: string;
  tarefaId: string;
  estado: EstadoDaPendencia;
  criadaEm: Date;
  fechadaEm?: Date;
}

export abstract class RepositorioDeTarefas {
  /**
   * Cria a tarefa e guarda a entrada, numa transação que trava a peça: é o que impede duas tarefas vivas
   * na mesma peça e uma edição do designer no meio. A versão inicial é a da peça nesse instante.
   */
  abstract criar(escopo: EscopoDaConta, nova: NovaTarefa, limite: { naFilaPorConta: number }): Promise<CriacaoDeTarefa>;
  /** undefined se não existe ou é de outra conta. */
  abstract buscar(escopo: EscopoDaConta, id: string): Promise<TarefaGuardada | undefined>;
  /** A entrada como foi enviada, e os ajustes pedidos no "pode", na ordem. */
  abstract entradaDe(escopo: EscopoDaConta, id: string): Promise<{ entrada: EntradaDaTarefa; ajustes: string[] } | undefined>;
  abstract vivaDoDocumento(escopo: EscopoDaConta, documentoId: string): Promise<TarefaGuardada | undefined>;
  /** As tarefas vivas da conta, por peça: para a lista de peças. */
  abstract vivasDaConta(escopo: EscopoDaConta): Promise<Map<string, { id: string; estado: EstadoDaTarefa }>>;
  /** Da mais nova para a mais velha. */
  abstract listarDoDocumento(escopo: EscopoDaConta, documentoId: string, limite: number): Promise<TarefaGuardada[]>;
  abstract contarCriadasDesde(escopo: EscopoDaConta, desde: Date): Promise<number>;
  /** Quantas a conta tem esperando ou trabalhando (na_fila, preparando, rodando). */
  abstract contarNaFila(escopo: EscopoDaConta): Promise<number>;
  /**
   * na_fila → preparando (fase de preparo) ou rodando (fase de execução), só se nenhuma outra tarefa da
   * conta está trabalhando. É o que torna o consumidor idempotente e garante uma por vez por conta.
   */
  abstract iniciar(escopo: EscopoDaConta, id: string, agora: Date): Promise<InicioDeTarefa>;
  /** Sinal de vida do worker. Devolve se o designer pediu para interromper. */
  abstract bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ cancelamentoPedido: boolean }>;
  /**
   * Guarda o resultado da primeira parte. `seguir: 'aguardar'`: preparando → aguardando_confirmacao (nada
   * roda até o "pode"). `seguir: 'executar'`: preparando → rodando, na fase de execução, no mesmo trabalho.
   */
  abstract guardarPreparo(escopo: EscopoDaConta, id: string, dados: { preparo: Preparo; idsDoPreparo: number; seguir: 'aguardar' | 'executar'; agora: Date }): Promise<boolean>;
  /** O "pode": aguardando_confirmacao → na_fila, na fase de execução. Devolve a posição da conta na fila; undefined se a tarefa não estava aguardando. */
  abstract aprovar(escopo: EscopoDaConta, id: string, agora: Date): Promise<{ jaNaFila: number } | undefined>;
  /** "Ajustar a direção": aguardando_confirmacao → na_fila, de volta à fase de preparo, com o texto guardado. */
  abstract pedirAjuste(escopo: EscopoDaConta, id: string, texto: string): Promise<{ jaNaFila: number } | undefined>;
  /**
   * Na fila ou no "pode": cancela na hora ('cancelada'). Trabalhando: marca o pedido, e o worker interrompe ('pedido').
   * Em qualquer outro estado: 'fora'.
   */
  abstract pedirCancelamento(escopo: EscopoDaConta, id: string, agora: Date): Promise<'cancelada' | 'pedido' | 'fora' | undefined>;
  /** Grava o evento e devolve a sequência dele. O evento existe antes de ser mostrado. */
  abstract registrarEvento(escopo: EscopoDaConta, id: string, evento: EventoDaTarefa, agora: Date): Promise<number>;
  abstract eventosDepois(escopo: EscopoDaConta, id: string, depoisDe: number, limite: number): Promise<EventoGuardado[]>;
  /** Uma linha por chamada ao modelo, inclusive a que falhou, e a soma nos totais da tarefa. Se o worker cair, o que já foi gasto está gravado. */
  abstract registrarChamada(escopo: EscopoDaConta, id: string, chamada: ChamadaRegistrada, agora: Date): Promise<void>;
  /** Um lote entrou: conta e acumula o que foi tocado. */
  abstract registrarLote(escopo: EscopoDaConta, id: string, tocados: readonly string[]): Promise<void>;
  abstract atualizarEtapa(escopo: EscopoDaConta, id: string, dados: { etapa?: EtapaPrevista; etapas?: EtapaPrevista[] }): Promise<void>;
  /** preparando ou rodando → estado final ou revisão. Não mexe em tarefa que já saiu desses estados. */
  abstract concluir(escopo: EscopoDaConta, id: string, conclusao: ConclusaoDeTarefa): Promise<boolean>;
  /** A decisão do designer: de um dos estados `de` para `para`. false se a tarefa não estava em nenhum deles. */
  abstract decidir(escopo: EscopoDaConta, id: string, decisao: { de: readonly EstadoDaTarefa[]; para: 'aceita' | 'desfeita'; resultado: string; agora: Date }): Promise<boolean>;
  /**
   * Fecha, NESTA conta, a tarefa que está trabalhando sem sinal de vida desde `semSinalDesde` (o worker caiu):
   * com lote gravado vai para revisão, sem lote falha; nos dois casos com fim `interrompida`. Devolve as que fechou.
   */
  abstract darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, semSinalDesde: Date): Promise<TarefaGuardada[]>;

  abstract criarPendencias(escopo: EscopoDaConta, tarefa: { id: string; documentoId: string }, pendencias: readonly (Pendencia & { id: string })[], agora: Date): Promise<void>;
  abstract listarPendencias(escopo: EscopoDaConta, documentoId: string, estado: EstadoDaPendencia): Promise<PendenciaGuardada[]>;
  /** undefined se não existe nesta conta. */
  abstract mudarPendencia(escopo: EscopoDaConta, id: string, estado: EstadoDaPendencia, agora: Date): Promise<PendenciaGuardada | undefined>;
  /** As pendências abertas da tarefa passam a resolvidas (a tarefa foi desfeita). */
  abstract fecharPendenciasDaTarefa(escopo: EscopoDaConta, tarefaId: string, agora: Date): Promise<void>;
}
