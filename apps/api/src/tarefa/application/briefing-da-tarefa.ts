// Porta: o que a tarefa precisa do formulário de briefing. Quem implementa é o módulo de briefing (marcas,
// briefings salvos, arquivos da conta). A tarefa não conhece marca nem arquivo: recebe a entrada pronta.
//
// São dois momentos, de propósito:
// - `preparar`, na criação (API): confere marca e arquivos, aplica a marca ao formulário e devolve a entrada
//   que será GUARDADA. Ela continua sendo só referência (hashes): é pequena, e é o que "nova peça com este
//   briefing" devolve ao editor;
// - `paraOCiclo`, na execução (worker): troca as referências pelo material que o ciclo lê (medidas das
//   imagens, o desenho do logo), relendo cada arquivo sob a conta do trabalho.
import type { EntradaDaTarefa } from '@otto/agente';
import type { PedidoDeTarefaPorBriefing } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export abstract class BriefingDaTarefa {
  /** Lança ErroDaAplicacao (marca_desconhecida, arquivo_desconhecido) se o formulário cita o que a conta não tem. */
  abstract preparar(escopo: EscopoDaConta, pedido: PedidoDeTarefaPorBriefing): Promise<{ entrada: EntradaDaTarefa; briefingId?: string }>;
  /** Entrada que não veio do formulário volta como chegou. */
  abstract paraOCiclo(escopo: EscopoDaConta, entrada: EntradaDaTarefa): Promise<EntradaDaTarefa>;
  /** Uma tarefa nasceu deste briefing salvo. */
  abstract usado(escopo: EscopoDaConta, briefingId: string): Promise<void>;
}
