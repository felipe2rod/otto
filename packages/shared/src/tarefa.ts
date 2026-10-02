// O contrato HTTP da tarefa do Otto (docs/mvp/backend.md, 7.5 e 17.11).
//
//   POST /api/documentos/:id/tarefas          PedidoDeTarefa → 202 Tarefa (pelo formulário: PedidoDeTarefaPorBriefing, em briefing.ts)
//   POST /api/documentos/com-tarefa           PedidoDePecaComTarefa → 202 PecaComTarefa (cria a peça e a tarefa numa chamada só)
//   GET  /api/documentos/:id/tarefas          → ListaDeTarefas (as recentes da peça e qual está viva)
//   GET  /api/tarefas/limites                 → LimitesDeTarefa (antes de enviar)
//   GET  /api/tarefas/:id                     → Tarefa (a fotografia do estado atual)
//   GET  /api/tarefas/:id/eventos             → fluxo de eventos (Accept: text/event-stream), ou
//                                               EventosDaTarefa com ?depoisDe=<sequência>
//   GET  /api/tarefas/:id/antes               → { versao, arvore } de antes da tarefa
//   POST /api/tarefas/:id/aprovar             o "pode" → Tarefa
//   POST /api/tarefas/:id/ajustar             PedidoDeAjusteDoPlano → Tarefa (refaz direção e plano)
//   POST /api/tarefas/:id/cancelar            cancela na fila ou no "pode"; interrompe se está rodando → Tarefa
//   POST /api/tarefas/:id/interromper         o mesmo que cancelar
//   POST /api/tarefas/:id/aceitar             → Tarefa
//   POST /api/tarefas/:id/desfazer            PedidoDeDesfazerTarefa → RespostaDeDesfazerTarefa
//   POST /api/tarefas/:id/descartar           PedidoDeDescartar → RespostaDeDesfazerTarefa (tira uma prancheta que a tarefa criou)
//   POST /api/tarefas/:id/tentar-de-novo      → 202 Tarefa (outra tarefa, com a mesma entrada)
//   GET  /api/documentos/:id/pendencias       → ListaDePendencias
//   POST /api/pendencias/:id/dispensar        → PendenciaDaPeca
//   POST /api/pendencias/:id/reabrir          → PendenciaDaPeca
//
// FLUXO DE EVENTOS. Cada evento gravado vem com `id` (a sequência, inteiro crescente por tarefa),
// `event` (o tipo) e `data` (EventoDaTarefa em JSON). O navegador reconecta mandando Last-Event-ID
// e recebe exatamente o que faltava. A cada mudança de estado vem `event: tarefa` (sem id), com a
// Tarefa. Comentário de batimento a cada 15 s. Quando a tarefa para de andar (pede o "pode", vai
// para revisão, termina), vem `event: fim` com a Tarefa e a conexão fecha: depois de agir
// (aprovar, ajustar), abra de novo.
//
// DE ONDE VÊM OS TIPOS. Entrada, plano, cartão da direção, etapas, eventos e pendência são do ciclo
// do agente (@otto/agente, contrato.ts, do treinador-do-otto). Aqui eles entram SÓ COMO TIPO: este
// arquivo não importa código de @otto/agente, para o editor não carregar o ciclo nem o prompt. Quem
// valida esses pedaços com o esquema de verdade é o servidor, na entrada e na gravação.
import type {
  CartaoDaDirecao as CartaoDaDirecaoDoAgente,
  EntradaDaTarefa as EntradaDoAgente,
  EtapaPrevista as EtapaDoAgente,
  EventoDaTarefa as EventoDoAgente,
  MotivoDoPode as MotivoDoAgente,
  Pendencia as PendenciaDoAgente,
  Plano as PlanoDoAgente,
} from '@otto/agente/contrato';
import type { Documento as ArvoreDoDocumento } from '@otto/documento';
import { z } from 'zod';
import type { PedidoDeTarefaPorBriefing } from './briefing';

export type EntradaDaTarefa = EntradaDoAgente;
/**
 * O que POST /api/documentos/:id/tarefas aceita: o pedido livre e o ajuste (entradas do ciclo), ou o
 * formulário de briefing (briefing.ts). `Tarefa.entrada` de uma tarefa criada pelo formulário traz o
 * formulário em `briefing` (com a marca já aplicada) e o `cuidado`: leia com `briefingDaTarefa`.
 */
export type PedidoDeTarefa = Exclude<EntradaDoAgente, { tipo: 'briefing' }> | z.input<typeof PedidoDeTarefaPorBriefing>;
export type PlanoDaTarefa = PlanoDoAgente;
export type CartaoDaDirecao = CartaoDaDirecaoDoAgente;
export type EtapaDaTarefa = EtapaDoAgente;
export type EventoDaTarefa = EventoDoAgente;
export type MotivoDoPode = MotivoDoAgente;
export type Pendencia = PendenciaDoAgente;

/** Um pedaço que vem do ciclo do agente: aqui só se confere que é objeto; o tipo é o do agente. */
const doAgente = <T>() => z.custom<T>((valor) => typeof valor === 'object' && valor !== null);

const Id = z.uuid();
const Quando = z.iso.datetime();

export const TIPOS_DE_TAREFA = ['briefing', 'criar', 'pedido', 'ajuste'] as const;

/**
 * - na_fila: esperando um worker (antes da direção, ou depois do "pode");
 * - preparando: entendendo e planejando (direção de arte ou plano). Nada muda na peça;
 * - aguardando_confirmacao: esperando o "pode". Não há prazo, e nada roda nem custa na espera;
 * - rodando: produzindo e conferindo. A peça fica somente leitura para o designer;
 * - em_revisao: há alterações para aceitar ou desfazer. `fim` diz como o trabalho parou;
 * - aceita, desfeita, cancelada, falhou: finais.
 */
export const EstadoDaTarefa = z.enum(['na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao', 'aceita', 'desfeita', 'cancelada', 'falhou']);
export type EstadoDaTarefa = z.infer<typeof EstadoDaTarefa>;

/** Uma peça tem no máximo uma tarefa num destes estados. */
export const ESTADOS_VIVOS_DA_TAREFA: readonly EstadoDaTarefa[] = ['na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao'];
/** Enquanto a tarefa está num destes, o fluxo de eventos fica aberto. */
export const ESTADOS_DE_TAREFA_EM_ANDAMENTO: readonly EstadoDaTarefa[] = ['na_fila', 'preparando', 'rodando'];

/**
 * Como o trabalho parou. Só `entregue` é entrega completa. `interrompida`: o servidor caiu ou foi
 * reiniciado no meio. Em qualquer um deles, se houve alteração, a tarefa está `em_revisao`.
 */
export const FimDaTarefa = z.enum(['entregue', 'cancelada', 'erro', 'limite_de_passos', 'limite_de_custo', 'limite_de_tempo', 'interrompida']);
export type FimDaTarefa = z.infer<typeof FimDaTarefa>;

const Etapa = doAgente<EtapaDoAgente>();

/**
 * Resposta de quase todas as rotas de tarefa: a fotografia do estado atual.
 * O custo (tokens, chamadas, dinheiro) fica no servidor e não faz parte dela: a tela mostra o tempo.
 */
export const Tarefa = z.object({
  id: Id,
  documentoId: Id,
  tipo: z.enum(TIPOS_DE_TAREFA),
  estado: EstadoDaTarefa,
  /** Presente quando o trabalho parou. */
  fim: FimDaTarefa.optional(),
  /** Com `fim: "erro"` ou estado `falhou`: o código do que deu errado (por exemplo `limite_diario`, `rede`, `interrompida`). */
  erro: z.object({ codigo: z.string() }).optional(),
  /** O que foi pedido, como foi enviado. Serve para mostrar o pedido e para "tentar de novo". */
  entrada: doAgente<EntradaDoAgente>(),
  /** A etapa em curso, enquanto a tarefa anda. Vem do ciclo. */
  etapa: Etapa.optional(),
  /** As etapas previstas, para o painel desenhar as que faltam. Pode mudar no caminho. */
  etapas: z.array(Etapa).default([]),
  /**
   * A direção em campos curtos e o plano (criar, alterar, remover). Presente depois de `preparando`.
   * Com o estado `aguardando_confirmacao`, é o que o designer aprova; `motivos` diz por que o "pode" foi pedido.
   */
  confirmacao: z
    .object({ cartao: doAgente<CartaoDaDirecaoDoAgente>().nullable(), plano: doAgente<PlanoDoAgente>(), motivos: z.array(z.custom<MotivoDoAgente>((v) => typeof v === 'string')) })
    .optional(),
  /** A versão da peça quando a tarefa foi pedida: é para onde "desfazer tudo" volta. */
  versaoInicial: z.int().min(0),
  /** A versão da peça quando o trabalho parou. */
  versaoFinal: z.int().min(0).optional(),
  /** Quantos lotes de alteração a tarefa gravou. Zero: não há o que revisar. */
  lotes: z.int().min(0),
  /** Ids das camadas e pranchetas que a tarefa tocou. */
  tocados: z.array(z.string()),
  /** Ids das pranchetas que a tarefa criou e ainda existem: as que dá para descartar na revisão. */
  pranchetasNovas: z.array(z.string()).optional(),
  /** O que o Otto diz que fez. */
  resumo: z.string().optional(),
  /** A última versão foi renderizada, olhada e verificada antes da entrega. Falso em entrega parcial. */
  conferida: z.boolean().optional(),
  /** As pendências da entrega. Com a tarefa em revisão ou aceita, elas também existem como pendências da peça. */
  pendencias: z.array(doAgente<PendenciaDoAgente>()).default([]),
  /** Tarefa aceita: quantas edições vieram depois dela. "Voltar para antes desta tarefa" leva essas junto. */
  edicoesDepois: z.int().min(0).optional(),
  /** A sequência do último evento gravado; -1 se não há nenhum. Abra o fluxo com Last-Event-ID igual a isto para não repetir. */
  ultimoEvento: z.int().min(-1),
  criadaEm: Quando,
  /** Quando a produção começou. A tela calcula o tempo decorrido a partir daqui. */
  iniciadaEm: Quando.optional(),
  terminadaEm: Quando.optional(),
  /** Quando o designer aceitou ou desfez. */
  decididaEm: Quando.optional(),
  /** Quanto o trabalho levou, somando preparo e produção, sem a espera do "pode". */
  duracaoMs: z.int().min(0).optional(),
});
export type Tarefa = z.infer<typeof Tarefa>;

/** Resposta de GET /api/documentos/:id/tarefas: até 20, da mais nova para a mais velha. `viva` é o id da tarefa viva da peça, se houver. */
export const ListaDeTarefas = z.object({ itens: z.array(Tarefa), viva: Id.optional() });
export type ListaDeTarefas = z.infer<typeof ListaDeTarefas>;

/** Um evento gravado: `evento` é o que o ciclo emitiu (EventoDaTarefa de @otto/agente). */
export const EventoGravado = z.object({ sequencia: z.int().min(0), quando: Quando, evento: doAgente<EventoDoAgente>() });
export type EventoGravado = z.infer<typeof EventoGravado>;

/** Resposta de GET /api/tarefas/:id/eventos?depoisDe=N sem `Accept: text/event-stream`: a reserva por consulta periódica. */
export const EventosDaTarefa = z.object({ eventos: z.array(EventoGravado), tarefa: Tarefa });
export type EventosDaTarefa = z.infer<typeof EventosDaTarefa>;

/** Corpo de POST /api/tarefas/:id/ajustar: o que muda na direção ou no plano. É dado da tarefa, como o pedido. */
export const PedidoDeAjusteDoPlano = z.strictObject({ texto: z.string().trim().min(1).max(2000) });
export type PedidoDeAjusteDoPlano = z.infer<typeof PedidoDeAjusteDoPlano>;

/** Corpo de POST /api/tarefas/:id/descartar. Só prancheta que a tarefa criou (`pranchetasNovas`). */
export const PedidoDeDescartar = z.strictObject({ pranchetaId: z.string().min(1) });
export type PedidoDeDescartar = z.infer<typeof PedidoDeDescartar>;

/**
 * Corpo de POST /api/tarefas/:id/desfazer. Em tarefa aceita com edições depois dela, sem
 * `incluirEdicoesPosteriores: true` a resposta é 409 editado_depois, com `{ edicoes }`.
 */
export const PedidoDeDesfazerTarefa = z.strictObject({ incluirEdicoesPosteriores: z.boolean().default(false) });
export type PedidoDeDesfazerTarefa = z.infer<typeof PedidoDeDesfazerTarefa>;

/** Resposta de desfazer e de descartar: a tarefa e a peça como ficou. */
export const RespostaDeDesfazerTarefa = z.object({ tarefa: Tarefa, versao: z.int().min(0), arvore: z.custom<ArvoreDoDocumento>((v) => typeof v === 'object' && v !== null) });
export type RespostaDeDesfazerTarefa = z.infer<typeof RespostaDeDesfazerTarefa>;

/** Resposta de GET /api/tarefas/:id/antes: a peça como era antes da tarefa. */
export const AntesDaTarefa = z.object({ versao: z.int().min(0), arvore: z.custom<ArvoreDoDocumento>((v) => typeof v === 'object' && v !== null) });
export type AntesDaTarefa = z.infer<typeof AntesDaTarefa>;

/**
 * Resposta de GET /api/tarefas/limites: o que dizer ANTES de o designer enviar. Em tarefas, nunca em tokens.
 * - limite_da_conta: a conta já pediu `tarefasPorDia` tarefas hoje;
 * - fila_cheia: a conta já tem `naFilaNoMaximo` tarefas esperando ou rodando;
 * - limite_diario: o Otto inteiro bateu no limite de hoje. Só amanhã.
 */
export const LimitesDeTarefa = z.object({
  podeEnviar: z.boolean(),
  /**
   * Um ajuste pontual cabe agora? Pode ser verdadeiro com `podeEnviar` falso por `limite_diario`: o ajuste gasta
   * cem vezes menos que uma tarefa que cria peça.
   */
  podeAjustar: z.boolean().optional(),
  motivo: z.enum(['limite_da_conta', 'fila_cheia', 'limite_diario']).optional(),
  tarefasHoje: z.int().min(0),
  tarefasPorDia: z.int().min(0),
  naFila: z.int().min(0),
  naFilaNoMaximo: z.int().min(0),
  /**
   * As peças da conta em que o Otto está trabalhando ou vai trabalhar antes de um pedido novo, na ordem.
   * É para o formulário dizer "entra na fila, atrás de <peça>".
   */
  naFrente: z.array(z.object({ tarefaId: Id, documentoId: Id, nome: z.string(), estado: EstadoDaTarefa })).optional(),
});
export type LimitesDeTarefa = z.infer<typeof LimitesDeTarefa>;

/** Aberta; resolvida (a causa sumiu, ou a tarefa foi desfeita); dispensada pelo designer. */
export const EstadoDaPendencia = z.enum(['aberta', 'resolvida', 'dispensada']);
export type EstadoDaPendencia = z.infer<typeof EstadoDaPendencia>;

/** Uma pendência como item da peça: a que o Otto declarou, com id e estado. Sobrevive ao aceite. */
export const PendenciaDaPeca = z.object({
  id: Id,
  tarefaId: Id,
  tipo: z.string(),
  /** Frase provisória: o editor monta a dele pelo `tipo` (e pela `regra`, nos avisos da verificação). */
  texto: z.string(),
  camadas: z.array(z.string()),
  prancheta: z.string().optional(),
  origem: z.enum(['otto', 'verificacao', 'sistema']),
  regra: z.string().optional(),
  gravidade: z.enum(['erro', 'aviso']).optional(),
  estado: EstadoDaPendencia,
  criadaEm: Quando,
  fechadaEm: Quando.optional(),
});
export type PendenciaDaPeca = z.infer<typeof PendenciaDaPeca>;

/** Resposta de GET /api/documentos/:id/pendencias (?estado=aberta|resolvida|dispensada; sem o parâmetro, as abertas). */
export const ListaDePendencias = z.object({ itens: z.array(PendenciaDaPeca) });
export type ListaDePendencias = z.infer<typeof ListaDePendencias>;

/**
 * Corpo de POST /api/documentos/com-tarefa: cria a peça E a tarefa numa chamada. Se a tarefa não puder ser
 * criada (formulário inválido, limite, fila fora), nenhuma peça fica para trás. Só para o que parte de peça
 * nova: formulário de briefing ou pedido livre de criar.
 */
export interface PedidoDePecaComTarefa {
  /** Nome da peça. Ausente: o nome do briefing, ou o nome padrão. */
  nome?: string;
  tarefa: Extract<PedidoDeTarefa, { tipo: 'briefing' | 'criar' }>;
}

export const PecaComTarefa = z.object({ documento: z.object({ id: Id, nome: z.string() }), tarefa: Tarefa });
export type PecaComTarefa = z.infer<typeof PecaComTarefa>;
