// Porta BarramentoDeEventos (ADR 009, ADR 020): toda fila passa por aqui. O caso de uso publica;
// quem consome é adaptador. Regras do ADR 023, item 5b:
// - o trabalho carrega SÓ identificadores: nunca texto de pedido, nome de camada ou árvore;
// - o `contaId` do trabalho é hipótese: quem consome reabre o escopo e relê a linha sob RLS;
// - dentro de um processo consumidor, uma conta tem no máximo um trabalho rodando por fila; os outros
//   esperam. ENTRE processos a porta não garante: quem consome confere no banco e lança se a conta
//   está ocupada (o trabalho volta para a fila);
// - entrega ao menos uma vez: o consumidor precisa ser idempotente.
import { z } from 'zod';

export const FILAS = {
  /** Renderiza e monta os arquivos de uma exportação. `id` é o da exportação. */
  exportacao: 'exportacao',
  /** Apaga do armazenamento os arquivos de uma exportação vencida. `id` é o da exportação. Publicado com hora marcada. */
  limpezaDeExportacao: 'limpeza-de-exportacao',
} as const;
export type NomeDaFila = (typeof FILAS)[keyof typeof FILAS];

export const Trabalho = z.strictObject({ contaId: z.uuid(), id: z.uuid() });
export type Trabalho = z.infer<typeof Trabalho>;

export interface OpcoesDoConsumidor {
  /** Quantos trabalhos desta fila este processo roda ao mesmo tempo (de contas diferentes). */
  concorrencia: number;
}

export interface OpcoesDePublicacao {
  /** O trabalho só é entregue a partir desta hora. */
  naoAntesDe?: Date;
}

export abstract class BarramentoDeEventos {
  abstract iniciar(): Promise<void>;
  /** Lança se o trabalho está fora do formato ou se a fila não aceitou. */
  abstract publicar(fila: NomeDaFila, trabalho: Trabalho, opcoes?: OpcoesDePublicacao): Promise<void>;
  /** Se `tratar` lançar, o trabalho volta para a fila e é entregue de novo mais tarde. */
  abstract consumir(fila: NomeDaFila, opcoes: OpcoesDoConsumidor, tratar: (trabalho: Trabalho) => Promise<void>): Promise<void>;
  /** Para de pegar trabalho e espera o que está em curso terminar. */
  abstract parar(): Promise<void>;
}
