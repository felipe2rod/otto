// A tarefa do Otto como a tela a vê. Funções puras: recebem a tarefa na tela e uma fotografia ou um
// evento do fluxo, e devolvem a tarefa na tela. Os nomes de estado, etapa e fim são os do contrato
// (packages/shared/src/tarefa.ts). O que o designer lê em cada um fica em textos/otto.ts, não aqui.
import { ESTADOS_DE_TAREFA_EM_ANDAMENTO, ESTADOS_VIVOS_DA_TAREFA, type EtapaDaTarefa, type EventoDaTarefa, type Tarefa } from '@otto/shared';

/** Um evento do fluxo, guardado para o registro fechado ("como o Otto está trabalhando"). */
export interface LinhaDoRegistro {
  sequencia: number;
  evento: EventoDaTarefa;
}

export interface TarefaNaTela {
  /** A fotografia mais recente, com o que os eventos já acrescentaram. */
  tarefa: Tarefa;
  registro: readonly LinhaDoRegistro[];
  /** Camadas e pranchetas tocadas pela tarefa: é o que a marca em âmbar lê. */
  tocados: ReadonlySet<string>;
  /** Sequência do último evento aplicado; -1 se nenhum. Evento com sequência menor ou igual é ignorado. */
  ultimaSequencia: number;
}

const juntar = (a: ReadonlySet<string>, b: readonly string[]): ReadonlySet<string> => (b.every((id) => a.has(id)) ? a : new Set([...a, ...b]));

export function novaTarefaNaTela(tarefa: Tarefa): TarefaNaTela {
  return { tarefa, registro: [], tocados: new Set(tarefa.tocados), ultimaSequencia: -1 };
}

/**
 * A fotografia que o servidor manda quando o estado muda. Ela é a verdade sobre o estado; o registro
 * e as camadas tocadas que os eventos já trouxeram continuam.
 */
export function receberFotografia(naTela: TarefaNaTela, tarefa: Tarefa): TarefaNaTela {
  if (tarefa.id !== naTela.tarefa.id) return novaTarefaNaTela(tarefa);
  return { ...naTela, tarefa, tocados: juntar(naTela.tocados, tarefa.tocados) };
}

/** Eventos que só atualizam o estado e não entram no registro que o designer lê. */
const FORA_DO_REGISTRO: ReadonlySet<EventoDaTarefa['tipo']> = new Set(['etapas', 'direcao', 'plano']);

/** Aplica um evento do fluxo. Repetido ou atrasado devolve a MESMA tarefa: receber duas vezes não muda nada. */
export function receberEvento(naTela: TarefaNaTela, sequencia: number, evento: EventoDaTarefa): TarefaNaTela {
  if (sequencia <= naTela.ultimaSequencia) return naTela;
  const proxima: TarefaNaTela = { ...naTela, ultimaSequencia: sequencia, registro: FORA_DO_REGISTRO.has(evento.tipo) ? naTela.registro : [...naTela.registro, { sequencia, evento }] };
  const { tarefa } = naTela;

  switch (evento.tipo) {
    case 'etapa':
      proxima.tarefa = { ...tarefa, etapa: { etapa: evento.etapa, ...(evento.prancheta ? { prancheta: evento.prancheta } : {}), ...(evento.rodada !== undefined ? { rodada: evento.rodada } : {}) } };
      return proxima;
    case 'etapas':
      proxima.tarefa = { ...tarefa, etapas: evento.previstas };
      return proxima;
    case 'lote':
      proxima.tocados = juntar(naTela.tocados, evento.tocados);
      return proxima;
    case 'entrega':
      proxima.tarefa = { ...tarefa, resumo: evento.resumo, pendencias: evento.pendencias };
      return proxima;
    default:
      return proxima;
  }
}

export type SituacaoDaEtapa = 'feita' | 'atual' | 'por-vir';

const mesmaEtapa = (a: EtapaDaTarefa, b: EtapaDaTarefa): boolean => a.etapa === b.etapa && (a.prancheta?.nome ?? '') === (b.prancheta?.nome ?? '') && (a.rodada ?? 1) === (b.rodada ?? 1);

/**
 * As etapas previstas com a situação de cada uma. Não é barra de progresso: o ciclo do Otto pode voltar
 * (da conferência para a produção de outra prancheta), e a lista mostra onde ele ESTÁ, não uma fração.
 */
export function etapasNaTela(tarefa: Pick<Tarefa, 'etapa' | 'etapas'>): { etapa: EtapaDaTarefa; situacao: SituacaoDaEtapa }[] {
  const { etapa: atual, etapas } = tarefa;
  if (!atual) return etapas.map((etapa) => ({ etapa, situacao: 'por-vir' }));
  let indice = etapas.findIndex((e) => mesmaEtapa(e, atual));
  // a etapa atual não coincide com a prancheta prevista (o ciclo deu o id depois): vale a etapa de mesmo nome
  if (indice < 0) indice = etapas.findIndex((e) => e.etapa === atual.etapa);
  // etapa fora da previsão: entra no fim da lista, como a atual
  if (indice < 0) return [...etapas.map((etapa) => ({ etapa, situacao: 'feita' as const })), { etapa: atual, situacao: 'atual' }];
  return etapas.map((etapa, i) => ({ etapa, situacao: i < indice ? 'feita' : i === indice ? 'atual' : 'por-vir' }));
}

/** A tarefa ocupa a peça: enquanto vive, o designer navega e seleciona, mas não edita. */
export const tarefaViva = (tarefa: Pick<Tarefa, 'estado'> | undefined): boolean => tarefa !== undefined && ESTADOS_VIVOS_DA_TAREFA.includes(tarefa.estado);

/** O Otto está trabalhando (ou na fila): é quando o fluxo de eventos fica aberto. */
export const emAndamento = (tarefa: Pick<Tarefa, 'estado'> | undefined): boolean => tarefa !== undefined && ESTADOS_DE_TAREFA_EM_ANDAMENTO.includes(tarefa.estado);

/** "Não terminou": parou sem entregar. O que foi feito, se houve, está em revisão. */
export function naoTerminou(tarefa: Pick<Tarefa, 'estado' | 'fim'> | undefined): boolean {
  if (!tarefa) return false;
  if (tarefa.estado === 'falhou') return true;
  return tarefa.estado === 'em_revisao' && tarefa.fim !== undefined && tarefa.fim !== 'entregue';
}

/** De quando contar o tempo que o designer vê: do começo da produção, ou do pedido enquanto ela não começa. */
export const inicioDoTempo = (tarefa: Pick<Tarefa, 'criadaEm' | 'iniciadaEm'>): number => Date.parse(tarefa.iniciadaEm ?? tarefa.criadaEm);
