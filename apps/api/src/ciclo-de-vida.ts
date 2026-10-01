// Liga a fila na subida e desliga tudo, em ordem, quando o processo recebe o sinal de término:
// primeiro a fila (espera a exportação em curso terminar), depois o pool do banco.
// Só o worker consome; a API só publica.
//
// Fila fora do ar não derruba o processo: "vivo" não depende de dependência (docs/mvp/backend.md, 7.8).
// A API continua abrindo e editando (pedir exportação responde 503) e o worker fica tentando ligar.
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { CasosDeUsoDeExportacao } from './exportacao/application/casos-de-uso-de-exportacao';
import { consumirExportacoes } from './exportacao/infrastructure/consumidor-de-exportacoes';
import type { BarramentoDeEventos } from './plataforma/fila/barramento-de-eventos';
import { semConteudo } from './plataforma/log/sem-conteudo';
import type { Servico } from './plataforma/servico';

export class CicloDeVida implements OnApplicationBootstrap, OnApplicationShutdown {
  private novaTentativa: NodeJS.Timeout | undefined;
  private encerrado = false;

  constructor(
    private readonly servico: Servico,
    private readonly banco: { fechar(): Promise<void> },
    private readonly fila: BarramentoDeEventos,
    private readonly exportacoes: CasosDeUsoDeExportacao,
    private readonly registro: { error(linha: Record<string, unknown>): void },
    private readonly intervaloEntreTentativasMs = 5_000,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ligarFila(true);
  }

  private async ligarFila(primeiraVez: boolean): Promise<void> {
    try {
      await this.fila.iniciar();
      if (this.servico === 'worker') await consumirExportacoes(this.fila, this.exportacoes);
    } catch (erro) {
      // uma linha por subida, não uma a cada tentativa
      if (primeiraVez) this.registro.error({ evento: 'fila_indisponivel', ...semConteudo(erro) });
      if (this.encerrado) return;
      this.novaTentativa = setTimeout(() => void this.ligarFila(false), this.intervaloEntreTentativasMs);
      this.novaTentativa.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.encerrado = true;
    clearTimeout(this.novaTentativa);
    await this.fila.parar();
    await this.banco.fechar();
  }
}
