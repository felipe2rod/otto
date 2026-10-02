// Porta: de onde vem o modelo de uma parte da tarefa. O caso de uso não sabe se é o modelo de verdade
// ou o roteirizado: recebe um ModeloDoAgente (porta de @otto/agente) e a fonte de ids.
import type { EntradaDaTarefa, ModeloDoAgente } from '@otto/agente';

export interface ModeloAberto {
  modelo: ModeloDoAgente;
  modeloDoJulgamento?: ModeloDoAgente;
  /** Id novo (UUID). Vira id de lote e marca de material. */
  novoId(): string;
}

export interface PedidoDeModelo {
  entrada: EntradaDaTarefa;
  /** As duas partes da tarefa começam conversas separadas com o modelo. */
  parte: 'preparo' | 'execucao';
  /** Quantos ids a primeira parte consumiu. Só o modelo roteirizado usa: os ids da gravação continuam de onde pararam. */
  idsDoPreparo: number;
}

export abstract class ModelosDoOtto {
  abstract abrir(pedido: PedidoDeModelo): ModeloAberto;
}
