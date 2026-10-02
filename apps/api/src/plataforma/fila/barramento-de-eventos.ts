// Porta BarramentoDeEventos (ADR 009, ADR 020): toda fila passa por aqui. O caso de uso publica;
// quem consome é adaptador. Regras do ADR 023, item 5b:
// - o trabalho carrega SÓ identificadores: nunca texto de pedido, nome de camada ou árvore;
// - o `contaId` do trabalho é hipótese: quem consome reabre o escopo e relê a linha sob RLS;
// - uma conta tem no máximo um trabalho rodando por fila, e os outros esperam. Entre processos a
//   fila faz o melhor que pode, mas a GARANTIA é de quem consome: confere no banco e devolve 'adiar'
//   se a conta está ocupada;
// - justiça entre contas: o trabalho de quem tem menos na fila passa na frente;
// - entrega ao menos uma vez: o consumidor precisa ser idempotente.
import { z } from 'zod';

export const FILAS = {
  /** Renderiza e monta os arquivos de uma exportação. `id` é o da exportação. */
  exportacao: 'exportacao',
  /** Apaga do armazenamento os arquivos de uma exportação vencida. `id` é o da exportação. Publicado com hora marcada. */
  limpezaDeExportacao: 'limpeza-de-exportacao',
} as const;
export type NomeDaFila = (typeof FILAS)[keyof typeof FILAS];

/**
 * Como cada fila se comporta. Fila nova é uma linha aqui, um consumidor e a preparação do esquema
 * (que lê esta tabela): nada mais no adaptador.
 *
 * A fatia 3 traz a tarefa do agente, que é outro tipo de trabalho: longo (14 a 30 minutos), quase só
 * espera de rede, com custo de token a cada volta. O que muda para ela está previsto aqui:
 * - `expiraEmSegundos` na casa de uma hora, com `sinalDeVidaEmSegundos` curto: quem diz que o worker
 *   morreu é a falta de sinal, não o teto;
 * - `tentativas: 0` para falha (repetir uma tarefa gasta token de novo: retomar é decisão do caso de
 *   uso, de onde parou), e `adiar` para esperar a vez da conta sem gastar tentativa;
 * - fila própria, com concorrência própria no worker: tarefa longa não ocupa a vaga de exportação.
 */
export interface RegrasDaFila {
  /** Teto de um trabalho ativo. Passou disso, a fila o dá como perdido. */
  expiraEmSegundos: number;
  /** Quantas vezes um trabalho que FALHOU (lançou) é entregue de novo. Adiar não conta. */
  tentativas: number;
  /** Espera antes de entregar de novo um trabalho que falhou. */
  reentregaEmSegundos: number;
  /** Espera antes de entregar de novo um trabalho adiado (a conta estava ocupada). */
  adiamentoEmSegundos: number;
  /**
   * O worker avisa à fila que o trabalho continua vivo. Sem aviso por este tempo (worker morto ou
   * travado), a fila entrega o trabalho a outro. Mínimo 10. Sem isto, só `expiraEmSegundos` vale.
   */
  sinalDeVidaEmSegundos?: number;
}

export const REGRAS_DAS_FILAS: Record<NomeDaFila, RegrasDaFila> = {
  // O render roda fora do laço principal do worker, então o sinal de vida sai mesmo no meio de uma
  // prancheta pesada. Falha de render não é tentada de novo pela fila: o caso de uso a registra.
  // As 5 tentativas são para falha de infraestrutura (banco ou armazenamento fora).
  [FILAS.exportacao]: { expiraEmSegundos: 900, tentativas: 5, reentregaEmSegundos: 5, adiamentoEmSegundos: 3, sinalDeVidaEmSegundos: 30 },
  // apagar objetos é rápido; se o armazenamento estiver fora, tenta de novo a cada 10 minutos por um dia
  [FILAS.limpezaDeExportacao]: { expiraEmSegundos: 300, tentativas: 144, reentregaEmSegundos: 600, adiamentoEmSegundos: 600 },
};

export const Trabalho = z.strictObject({ contaId: z.uuid(), id: z.uuid() });
export type Trabalho = z.infer<typeof Trabalho>;

export interface OpcoesDoConsumidor {
  /** Quantos trabalhos desta fila este processo roda ao mesmo tempo (de contas diferentes). */
  concorrencia: number;
}

export interface OpcoesDePublicacao {
  /** O trabalho só é entregue a partir desta hora. */
  naoAntesDe?: Date;
  /**
   * Quantos trabalhos esta conta já tem esperando ou rodando nesta fila. É o que dá justiça entre
   * contas: quem tem menos passa na frente; no empate, quem chegou primeiro. Sem isto, 0.
   */
  jaNaFilaDaConta?: number;
}

/** O que quem trata devolve. 'adiar': não é a vez desta conta; entregue de novo daqui a pouco, sem contar como falha. */
// biome-ignore lint/suspicious/noConfusingVoidType: quem trata e não adia não devolve nada
export type Tratamento = void | 'adiar';

export abstract class BarramentoDeEventos {
  abstract iniciar(): Promise<void>;
  /** Lança se o trabalho está fora do formato ou se a fila não aceitou. */
  abstract publicar(fila: NomeDaFila, trabalho: Trabalho, opcoes?: OpcoesDePublicacao): Promise<void>;
  /**
   * Se `tratar` lançar, o trabalho volta para a fila e é entregue de novo mais tarde, até o limite de
   * tentativas da fila. Se devolver 'adiar', volta sem gastar tentativa.
   */
  abstract consumir(fila: NomeDaFila, opcoes: OpcoesDoConsumidor, tratar: (trabalho: Trabalho) => Promise<Tratamento>): Promise<void>;
  /** A fila está no ar e alcançável agora? Para a rota de prontidão. Nunca lança. */
  abstract responde(): Promise<boolean>;
  /** Para de pegar trabalho e espera o que está em curso terminar. */
  abstract parar(): Promise<void>;
}
