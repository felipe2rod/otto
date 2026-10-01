// Estado da tarefa do Otto na tela. Função pura: recebe a tarefa e um evento, devolve a tarefa.
// Os nomes de estado, etapa e fim são os do contrato (docs/mvp/backend.md, seção 7.5). O que o
// designer lê em cada estado fica em textos/, não aqui.
//
// Esqueleto da fatia 0: sem rede. O fluxo de eventos e a fotografia inicial entram na fatia da tarefa.

export type EstadoDaTarefa = 'na_fila' | 'rodando' | 'aguardando_confirmacao' | 'em_revisao' | 'aceita' | 'aceita_em_parte' | 'desfeita' | 'cancelada' | 'falhou';

/** Como o trabalho parou. Vale quando o estado deixa de ser `rodando`. */
export type FimDaTarefa = 'entregue' | 'cancelada' | 'erro' | 'limite_de_passos' | 'interrompida';

export interface TarefaNaTela {
  id: string;
  estado: EstadoDaTarefa;
  etapa?: string;
  fim?: FimDaTarefa;
  resumo?: string;
  pendencias?: readonly string[];
  /** Camadas e pranchetas tocadas pelos lotes da tarefa: é o que a marca em âmbar lê. */
  tocados: ReadonlySet<string>;
  /** Sequência do último evento aplicado. Evento com sequência menor ou igual é ignorado. */
  ultimaSequencia: number;
}

export interface EventoDaTarefa {
  sequencia: number;
  tipo: string;
  dados: Record<string, unknown>;
}

export function novaTarefa(inicial: { id: string; estado: EstadoDaTarefa; fim?: FimDaTarefa; etapa?: string; tocados?: Iterable<string>; ultimaSequencia?: number }): TarefaNaTela {
  return {
    id: inicial.id,
    estado: inicial.estado,
    ...(inicial.fim ? { fim: inicial.fim } : {}),
    ...(inicial.etapa ? { etapa: inicial.etapa } : {}),
    tocados: new Set(inicial.tocados ?? []),
    ultimaSequencia: inicial.ultimaSequencia ?? 0,
  };
}

const ESTADOS: ReadonlySet<string> = new Set<EstadoDaTarefa>(['na_fila', 'rodando', 'aguardando_confirmacao', 'em_revisao', 'aceita', 'aceita_em_parte', 'desfeita', 'cancelada', 'falhou']);
const FINS: ReadonlySet<string> = new Set<FimDaTarefa>(['entregue', 'cancelada', 'erro', 'limite_de_passos', 'interrompida']);

const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Aplica um evento. Repetido ou atrasado devolve a MESMA tarefa: receber duas vezes não muda nada. */
export function receberEvento(tarefa: TarefaNaTela, evento: EventoDaTarefa): TarefaNaTela {
  if (evento.sequencia <= tarefa.ultimaSequencia) return tarefa;
  const proxima: TarefaNaTela = { ...tarefa, ultimaSequencia: evento.sequencia };
  const { dados } = evento;

  switch (evento.tipo) {
    case 'estado': {
      const estado = texto(dados.estado);
      const fim = texto(dados.fim);
      if (estado && ESTADOS.has(estado)) proxima.estado = estado as EstadoDaTarefa;
      if (fim && FINS.has(fim)) proxima.fim = fim as FimDaTarefa;
      return proxima;
    }
    case 'etapa': {
      const etapa = texto(dados.etapa);
      if (etapa) proxima.etapa = etapa;
      return proxima;
    }
    case 'lote': {
      const novos = textos(dados.tocados);
      if (novos.length > 0) proxima.tocados = new Set([...tarefa.tocados, ...novos]);
      return proxima;
    }
    case 'entrega': {
      const resumo = texto(dados.resumo);
      if (resumo) proxima.resumo = resumo;
      proxima.pendencias = textos(dados.pendencias);
      return proxima;
    }
    default:
      return proxima;
  }
}

/** Enquanto o Otto trabalha ou espera o "pode", o designer navega e seleciona, mas não edita. */
export function documentoSomenteLeitura(tarefa: TarefaNaTela | undefined): boolean {
  return tarefa?.estado === 'rodando' || tarefa?.estado === 'aguardando_confirmacao';
}

/** "Não terminou": parou sem entregar. O que foi feito, se houve, está no conjunto para revisar. */
export function naoTerminou(tarefa: TarefaNaTela | undefined): boolean {
  if (!tarefa) return false;
  if (tarefa.estado === 'falhou') return true;
  return tarefa.estado === 'em_revisao' && tarefa.fim !== undefined && tarefa.fim !== 'entregue';
}

/** Uma peça tem no máximo uma tarefa viva: qualquer estado antes de aceita, desfeita ou cancelada. */
export function tarefaViva(tarefa: TarefaNaTela | undefined): boolean {
  if (!tarefa) return false;
  return tarefa.estado === 'na_fila' || tarefa.estado === 'rodando' || tarefa.estado === 'aguardando_confirmacao' || tarefa.estado === 'em_revisao' || tarefa.estado === 'falhou';
}
