// As duas partes da tarefa, de uma vez: para quem não precisa parar entre elas (a avaliação, os testes,
// um comando de terminal). O servidor chama as duas em separado: prepararTarefa, guarda o Preparo, espera o
// "pode" quando `pedeConfirmacao`, e executarTarefa (docs/mvp/backend.md, 8.2).
import { executarTarefa, type OpcoesDaExecucao } from './ciclo';
import type { EntradaDaTarefa, Preparo, ResultadoDaTarefa } from './contrato';
import { type AmbienteDaTarefa, ErroDoModelo } from './portas';
import { prepararTarefa } from './preparo';
import { RESUMO_DA_ENTREGA_PARCIAL } from './textos';

/** O que o designer respondeu ao "pode". */
export type RespostaAoPode = 'pode' | 'cancelar' | { ajustar: string };

export interface OpcoesDaTarefa extends OpcoesDaExecucao {
  /** Chamado quando o preparo pede confirmação. Ausente: aprova sempre (avaliação e teste). */
  confirmar?(preparo: Preparo): Promise<RespostaAoPode> | RespostaAoPode;
}

export async function rodarTarefa(amb: AmbienteDaTarefa, entrada: EntradaDaTarefa, opcoes: OpcoesDaTarefa = {}): Promise<{ preparo: Preparo | undefined; resultado: ResultadoDaTarefa }> {
  let preparo: Preparo | undefined;
  try {
    preparo = await prepararTarefa(amb, entrada);
    while (preparo.pedeConfirmacao && opcoes.confirmar) {
      const resposta = await opcoes.confirmar(preparo);
      if (resposta === 'pode') break;
      if (resposta === 'cancelar') {
        const resumo = RESUMO_DA_ENTREGA_PARCIAL.cancelada.semAlteracoes;
        return { preparo, resultado: { fim: 'cancelada', entrega: { resumo, pendencias: [] }, conferida: false, lotes: 0, custo: preparo.custo } };
      }
      preparo = await prepararTarefa(amb, entrada, { ajuste: { anterior: preparo, texto: resposta.ajustar } });
    }
  } catch (e) {
    if (!(e instanceof ErroDoModelo)) throw e;
    const fim = e.codigo === 'cancelada' ? 'cancelada' : 'erro';
    const resumo = RESUMO_DA_ENTREGA_PARCIAL[fim].semAlteracoes;
    const custo = preparo?.custo ?? {
      modelo: amb.modelo.nome,
      chamadas: 0,
      tokens: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 },
      porPapel: {},
      imagensVistas: 0,
      voltasDeConferencia: 0,
      lotes: 0,
      lotesRecusados: 0,
      duracaoMs: 0,
      dolares: null,
    };
    return { preparo, resultado: { fim, entrega: { resumo, pendencias: [] }, conferida: false, lotes: 0, ...(fim === 'erro' ? { erro: e.codigo } : {}), custo } };
  }
  return { preparo, resultado: await executarTarefa(amb, entrada, preparo, opcoes.esquemaDasOperacoes ? { esquemaDasOperacoes: opcoes.esquemaDasOperacoes } : {}) };
}
