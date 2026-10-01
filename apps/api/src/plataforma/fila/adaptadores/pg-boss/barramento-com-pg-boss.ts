// Adaptador de BarramentoDeEventos sobre o pg-boss: a fila mora no próprio PostgreSQL (ADR 009).
// O esquema da fila é criado pelo papel MIGRADOR (preparar-esquema-da-fila.ts); API e worker só
// leem e escrevem linha, com otto_app, e por isso sobem com migrate e createSchema desligados.
//
// Uma conta por vez NÃO é feita pela fila. A política "singleton" do pg-boss (um trabalho ativo por
// chave) foi medida em 2026-10-01 e descartada: ela decide por uma estatística refeita a cada minuto,
// e o trabalho seguinte da mesma conta ficou 123 s parado (teste "a vez da conta" do contrato).
// A fila é comum; a vez da conta é garantida em dois lugares:
// - neste processo, os trabalhos de uma mesma conta são encadeados (um espera o outro terminar);
// - entre processos, pelo banco: índice único parcial em exportacoes, conferido pelo caso de uso
//   antes de começar. Quem perde a vez lança, e o trabalho é entregue de novo mais tarde.
import { PgBoss } from 'pg-boss';
import { BarramentoDeEventos, FILAS, type NomeDaFila, type OpcoesDoConsumidor, Trabalho } from '../../barramento-de-eventos';

export const ESQUEMA_DA_FILA = 'pgboss';

export const POLITICA_DAS_FILAS = 'standard';

/** Como cada fila é criada. Vale para todo trabalho dela. */
export const CONFIGURACAO_DAS_FILAS: Record<NomeDaFila, { expiraEmSegundos: number; tentativas: number; reentregaEmSegundos: number }> = {
  // 10 minutos é o teto antes de o trabalho ser dado como perdido (a peça mais pesada medida leva segundos).
  // 200 tentativas a cada 3 s: quem perde a vez da conta para outro processo espera até 10 minutos por ela.
  [FILAS.exportacao]: { expiraEmSegundos: 600, tentativas: 200, reentregaEmSegundos: 3 },
};

export interface OpcoesDoPgBoss {
  /** Só o processo que consome faz a manutenção da fila (expirar, arquivar). */
  consumidor: boolean;
  /** De quanto em quanto tempo o consumidor olha a fila. Mínimo 0,5. */
  intervaloDeConsultaEmSegundos?: number;
  /** De quanto em quanto tempo a manutenção da fila passa. Padrão da biblioteca: 60. Só os testes mexem. */
  intervaloDeManutencaoEmSegundos?: number;
  /** Chamada quando a fila emite erro de fundo. Recebe só o tipo do erro: a mensagem pode citar dado. */
  aoErrar?: (tipo: string) => void;
}

export class BarramentoComPgBoss extends BarramentoDeEventos {
  private readonly boss: PgBoss;
  private iniciado = false;
  /** O último trabalho de cada conta neste processo: o seguinte da mesma conta espera por ele. */
  private readonly vezDaConta = new Map<string, Promise<void>>();

  constructor(
    urlDoApp: string,
    private readonly opcoes: OpcoesDoPgBoss,
  ) {
    super();
    this.boss = new PgBoss({
      connectionString: urlDoApp,
      schema: ESQUEMA_DA_FILA,
      migrate: false,
      createSchema: false,
      supervise: opcoes.consumidor,
      schedule: false,
      max: 4,
      ...(opcoes.intervaloDeManutencaoEmSegundos ? { superviseIntervalSeconds: opcoes.intervaloDeManutencaoEmSegundos, monitorIntervalSeconds: opcoes.intervaloDeManutencaoEmSegundos } : {}),
    });
    this.boss.on('error', (erro: unknown) => this.opcoes.aoErrar?.(erro instanceof Error ? erro.name : typeof erro));
  }

  async iniciar(): Promise<void> {
    if (this.iniciado) return;
    await this.boss.start();
    this.iniciado = true;
  }

  async publicar(fila: NomeDaFila, trabalho: Trabalho): Promise<void> {
    const valido = Trabalho.parse(trabalho);
    // se a fila não respondeu na subida, tenta de novo agora: a API não precisa reiniciar quando o banco volta
    await this.iniciar();
    const id = await this.boss.send(fila, valido);
    if (!id) throw new Error('a fila não aceitou o trabalho');
  }

  async consumir(fila: NomeDaFila, opcoes: OpcoesDoConsumidor, tratar: (trabalho: Trabalho) => Promise<void>): Promise<void> {
    await this.boss.work<unknown>(fila, { batchSize: 1, localConcurrency: opcoes.concorrencia, pollingIntervalSeconds: this.opcoes.intervaloDeConsultaEmSegundos ?? 1 }, async (trabalhos) => {
      for (const t of trabalhos) {
        // o que está na fila é hipótese: fora do formato, o trabalho é descartado sem rodar nada
        const lido = Trabalho.safeParse(t.data);
        if (lido.success) await this.naVezDaConta(`${fila}:${lido.data.contaId}`, () => tratar(lido.data));
      }
    });
  }

  private async naVezDaConta(chave: string, rodar: () => Promise<void>): Promise<void> {
    const anterior = this.vezDaConta.get(chave) ?? Promise.resolve();
    const atual = anterior.then(rodar);
    // o que fica guardado nunca rejeita: a falha de um trabalho não derruba o seguinte da fila da conta
    const guardado = atual.then(
      () => undefined,
      () => undefined,
    );
    this.vezDaConta.set(chave, guardado);
    try {
      await atual;
    } finally {
      if (this.vezDaConta.get(chave) === guardado) this.vezDaConta.delete(chave);
    }
  }

  async parar(): Promise<void> {
    if (!this.iniciado) return;
    this.iniciado = false;
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
