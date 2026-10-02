// O consumidor da fila de tarefas do Otto: é o que o worker liga na subida (e o que os testes de HTTP ligam
// no próprio processo). O que vem na fila é hipótese (ADR 023, item 5b): o escopo é aberto a partir da conta
// do trabalho e o caso de uso relê a tarefa sob esse escopo. Se ela não existe nessa conta, nada roda.
import { escopoDoTrabalho } from '../../plataforma/escopo/escopo-do-trabalho';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import type { CasosDeUsoDeTarefa } from '../application/casos-de-uso-de-tarefa';

/** @param tarefasAoMesmoTempo quantas tarefas este processo roda ao mesmo tempo, de contas diferentes. */
export async function consumirTarefas(fila: BarramentoDeEventos, tarefas: CasosDeUsoDeTarefa, tarefasAoMesmoTempo = 1): Promise<void> {
  await fila.consumir(FILAS.tarefaDoOtto, { concorrencia: tarefasAoMesmoTempo }, async (trabalho) => {
    // outra tarefa da conta está trabalhando (em qualquer worker), ou este worker está desligando: a fila
    // entrega de novo daqui a pouco, sem gastar tentativa
    return (await tarefas.trabalhar(escopoDoTrabalho(trabalho), trabalho.id)) === 'ocupada' ? 'adiar' : undefined;
  });
}
