// Adaptador de MotorDeImportacao que roda na MESMA reserva de threads de render da exportação: importação e
// exportação juntas nunca passam do número de threads do worker, que é o que dimensiona a memória do contêiner.
// A thread que cai (falta de memória) derruba só a importação dela.
import type { ResultadoDaImportacao } from '@otto/psd';
import type { MotorDeExportacaoEmThread } from '../../../exportacao/infrastructure/render/motor-em-thread';
import { MotorDeImportacao, type OpcoesDoMotorDeImportacao } from '../../application/motor-de-importacao';

export class MotorDeImportacaoEmThread extends MotorDeImportacao {
  constructor(private readonly threads: MotorDeExportacaoEmThread) {
    super();
  }

  importar(bytes: Uint8Array, opcoes: OpcoesDoMotorDeImportacao): Promise<ResultadoDaImportacao> {
    return this.threads.importarPsd(bytes, opcoes);
  }
}
