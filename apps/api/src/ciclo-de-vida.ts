// Liga a fila na subida e desliga tudo, em ordem, quando o processo recebe o sinal de término:
// primeiro interrompe as tarefas do Otto em curso (uma tarefa de 10 a 30 minutos não cabe no prazo de um
// deploy: ela fecha como interrompida, com o parcial em revisão), depois a fila (espera a exportação em curso
// terminar), depois as threads do motor de exportação, por último o pool do banco.
// Só o worker consome; a API só publica.
//
// Fila fora do ar não derruba o processo: "vivo" não depende de dependência (docs/mvp/backend.md, 7.8).
// A API continua abrindo e editando (pedir exportação responde 503) e o worker fica tentando ligar.
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { CasosDeUsoDeMiniatura } from './documento/application/casos-de-uso-de-miniatura';
import type { CasosDeUsoDeExportacao } from './exportacao/application/casos-de-uso-de-exportacao';
import { consumirExportacoes } from './exportacao/infrastructure/consumidor-de-exportacoes';
import { escopoDoTrabalho } from './plataforma/escopo/escopo-do-trabalho';
import { type BarramentoDeEventos, FILAS } from './plataforma/fila/barramento-de-eventos';
import { semConteudo } from './plataforma/log/sem-conteudo';
import type { Servico } from './plataforma/servico';
import type { CasosDeUsoDeTarefa } from './tarefa/application/casos-de-uso-de-tarefa';
import { consumirTarefas } from './tarefa/infrastructure/consumidor-de-tarefas';

export class CicloDeVida implements OnApplicationBootstrap, OnApplicationShutdown {
  private novaTentativa: NodeJS.Timeout | undefined;
  private encerrado = false;

  constructor(
    private readonly servico: Servico,
    private readonly banco: { fechar(): Promise<void> },
    private readonly fila: BarramentoDeEventos,
    private readonly exportacoes: CasosDeUsoDeExportacao,
    private readonly registro: { error(linha: Record<string, unknown>): void },
    private readonly opcoes: { exportacoesAoMesmoTempo: number; motor: { fechar(): Promise<void> }; intervaloEntreTentativasMs?: number; tarefasAoMesmoTempo?: number },
    private readonly tarefas?: CasosDeUsoDeTarefa,
    private readonly miniaturas?: CasosDeUsoDeMiniatura,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ligarFila(true);
  }

  private async ligarFila(primeiraVez: boolean): Promise<void> {
    try {
      await this.fila.iniciar();
      if (this.servico === 'worker') {
        await consumirExportacoes(this.fila, this.exportacoes, this.opcoes.exportacoesAoMesmoTempo);
        if (this.tarefas) await consumirTarefas(this.fila, this.tarefas, this.opcoes.tarefasAoMesmoTempo ?? 1);
        const miniaturas = this.miniaturas;
        // a miniatura da peça: um render pequeno, um por vez (é a mesma thread de render das tarefas)
        if (miniaturas) await this.fila.consumir(FILAS.miniaturaDaPeca, { concorrencia: 1 }, async (trabalho) => void (await miniaturas.gerar(escopoDoTrabalho(trabalho), trabalho.id)));
      }
    } catch (erro) {
      // uma linha por subida, não uma a cada tentativa
      if (primeiraVez) this.registro.error({ evento: 'fila_indisponivel', ...semConteudo(erro) });
      if (this.encerrado) return;
      this.novaTentativa = setTimeout(() => void this.ligarFila(false), this.opcoes.intervaloEntreTentativasMs ?? 5_000);
      this.novaTentativa.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.encerrado = true;
    clearTimeout(this.novaTentativa);
    // aborta a chamada ao modelo em curso; cada tarefa grava o próprio fecho antes de a fila parar
    await this.tarefas?.interromperTudo();
    await this.fila.parar();
    await this.opcoes.motor.fechar();
    await this.banco.fechar();
  }
}
