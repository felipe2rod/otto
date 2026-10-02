// Os consumidores das filas de exportação (exportar e limpar o que venceu): é o que o worker liga na subida (e o que os testes de HTTP
// ligam no próprio processo). O que vem na fila é hipótese (ADR 023, item 5b): o escopo é aberto a
// partir da conta do trabalho e o caso de uso relê a exportação sob esse escopo. Se ela não existe
// nessa conta, nada roda.
import { escopoDoTrabalho } from '../../plataforma/escopo/escopo-do-trabalho';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import type { CasosDeUsoDeExportacao } from '../application/casos-de-uso-de-exportacao';

/**
 * @param exportacoesAoMesmoTempo quantas exportações este processo roda ao mesmo tempo, de contas diferentes.
 *   É o número de threads do motor: cada uma ocupa um núcleo e tem a própria memória de render.
 */
export async function consumirExportacoes(fila: BarramentoDeEventos, exportacoes: CasosDeUsoDeExportacao, exportacoesAoMesmoTempo = 1): Promise<void> {
  await fila.consumir(FILAS.exportacao, { concorrencia: exportacoesAoMesmoTempo }, async (trabalho) => {
    // outra exportação da conta está rodando (em qualquer worker): a fila entrega de novo daqui a pouco, sem gastar tentativa
    return (await exportacoes.executar(escopoDoTrabalho(trabalho), trabalho.id)) === 'ocupada' ? 'adiar' : undefined;
  });
  await fila.consumir(FILAS.limpezaDeExportacao, { concorrencia: 1 }, async (trabalho) => {
    // se ainda não venceu ou o armazenamento falhou, o erro sobe e a fila entrega de novo mais tarde
    await exportacoes.limpar(escopoDoTrabalho(trabalho), trabalho.id);
    return undefined;
  });
}
