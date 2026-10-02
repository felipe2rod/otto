// Os consumidores das filas de importação de PSD (importar e limpar o arquivo que venceu): é o que o worker liga na
// subida (e o que os testes de HTTP ligam no próprio processo). O que vem na fila é hipótese (ADR 023, item 5b): o
// escopo é aberto a partir da conta do trabalho e o caso de uso relê a importação sob esse escopo.
import { escopoDoTrabalho } from '../../plataforma/escopo/escopo-do-trabalho';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import type { CasosDeUsoDeImportacao } from '../application/casos-de-uso-de-importacao';

/**
 * @param importacoesAoMesmoTempo quantas importações este processo roda ao mesmo tempo, de contas diferentes. Cada
 *   uma segura o arquivo inteiro e uma camada decodificada: o padrão é uma.
 */
export async function consumirImportacoes(fila: BarramentoDeEventos, importacoes: CasosDeUsoDeImportacao, importacoesAoMesmoTempo = 1): Promise<void> {
  await fila.consumir(FILAS.importacao, { concorrencia: importacoesAoMesmoTempo }, async (trabalho) => {
    // outra importação da conta está rodando (em qualquer worker): a fila entrega de novo daqui a pouco, sem gastar tentativa
    return (await importacoes.executar(escopoDoTrabalho(trabalho), trabalho.id)) === 'ocupada' ? 'adiar' : undefined;
  });
  await fila.consumir(FILAS.limpezaDeImportacao, { concorrencia: 1 }, async (trabalho) => {
    // se ainda não é hora ou o armazenamento falhou, o erro sobe e a fila entrega de novo mais tarde
    await importacoes.limpar(escopoDoTrabalho(trabalho), trabalho.id);
    return undefined;
  });
}
