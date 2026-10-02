// Frases que o designer pode chegar a ler e que nascem no ciclo (não no modelo): resumo de entrega parcial
// e pendências do sistema. RASCUNHO: a marca ainda vai fechar o texto, e o editor deve preferir montar a
// frase dele pelo `tipo` da pendência e pelo `fim` da tarefa. Critério seguido: docs/marca/identidade.md
// (colega de estúdio, direto, primeira pessoa) e docs/mvp/experiencia.md, 6.2.
import type { FimDaTarefa } from './contrato';

export const RESUMO_DA_ENTREGA_PARCIAL: Record<Exclude<FimDaTarefa, 'entregue'>, { comAlteracoes: string; semAlteracoes: string }> = {
  cancelada: { comAlteracoes: 'Você interrompeu. O que eu já tinha feito está aqui para revisar.', semAlteracoes: 'Você interrompeu antes de eu alterar a peça.' },
  erro: { comAlteracoes: 'Parei no meio. O que eu já tinha feito está aqui.', semAlteracoes: 'Não consegui começar. Nada foi alterado na peça.' },
  limite_de_passos: {
    comAlteracoes: 'Parei no limite de passos desta tarefa antes de terminar. O que eu já tinha feito está aqui.',
    semAlteracoes: 'Parei no limite de passos desta tarefa sem alterar a peça.',
  },
  limite_de_custo: { comAlteracoes: 'Parei no limite desta tarefa antes de terminar. O que eu já tinha feito está aqui.', semAlteracoes: 'Parei no limite desta tarefa sem alterar a peça.' },
  limite_de_tempo: {
    comAlteracoes: 'Parei no limite de tempo desta tarefa antes de terminar. O que eu já tinha feito está aqui.',
    semAlteracoes: 'Parei no limite de tempo desta tarefa sem alterar a peça.',
  },
};

export const PENDENCIA_DO_SISTEMA = {
  interrompida: 'A tarefa foi interrompida antes do fim.',
  erro: 'A tarefa não terminou por uma falha.',
  limite_de_passos: 'Parei no limite de passos.',
  limite_de_custo: 'Parei no limite desta tarefa.',
  limite_de_tempo: 'Parei no limite de tempo.',
  limite_de_conferencias: 'Parei no limite de conferências.',
  semRender: (prancheta: string) => `Não conferi pelo render a última versão de "${prancheta}".`,
  semVerificacao: 'Não rodei a verificação depois da última alteração.',
  semVisao: 'Conferi pela estrutura e pela verificação; não vi o render.',
} as const;
