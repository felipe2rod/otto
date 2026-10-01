// O consumidor da fila de exportação: é o que o worker liga na subida (e o que os testes de HTTP
// ligam no próprio processo). O que vem na fila é hipótese (ADR 023, item 5b): o escopo é aberto a
// partir da conta do trabalho e o caso de uso relê a exportação sob esse escopo. Se ela não existe
// nessa conta, nada roda.
import { escopoDoTrabalho } from '../../plataforma/escopo/escopo-do-trabalho';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import type { CasosDeUsoDeExportacao } from '../application/casos-de-uso-de-exportacao';

/**
 * Quantas exportações este processo roda ao mesmo tempo. Uma: cada exportação ocupa centenas de MB
 * e um núcleo inteiro. Mais vazão é mais processo de worker, não mais concorrência aqui.
 */
export const EXPORTACOES_AO_MESMO_TEMPO = 1;

export async function consumirExportacoes(fila: BarramentoDeEventos, exportacoes: CasosDeUsoDeExportacao): Promise<void> {
  await fila.consumir(FILAS.exportacao, { concorrencia: EXPORTACOES_AO_MESMO_TEMPO }, async (trabalho) => {
    // ContaOcupada (outra exportação da conta rodando) sobe daqui: a fila entrega de novo mais tarde
    await exportacoes.executar(escopoDoTrabalho(trabalho), trabalho.id);
  });
}
