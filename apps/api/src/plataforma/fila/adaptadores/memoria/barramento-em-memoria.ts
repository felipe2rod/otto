// Adaptador falso de BarramentoDeEventos: roda no próprio processo, sem banco. É o que os testes
// de caso de uso e de HTTP usam. Passa pelo mesmo contrato do adaptador de verdade.
import { BarramentoDeEventos, type NomeDaFila, type OpcoesDoConsumidor, Trabalho } from '../../barramento-de-eventos';

interface Consumidor {
  concorrencia: number;
  tratar: (trabalho: Trabalho) => Promise<void>;
}

export class BarramentoEmMemoria extends BarramentoDeEventos {
  private readonly consumidores = new Map<NomeDaFila, Consumidor>();
  private readonly pendentes = new Map<NomeDaFila, Trabalho[]>();
  private readonly contasRodando = new Set<string>();
  private readonly emCurso = new Set<Promise<void>>();
  private parado = false;
  /** Tudo que já foi publicado, para o teste conferir o que foi para a fila. */
  readonly publicados: { fila: NomeDaFila; trabalho: Trabalho }[] = [];

  constructor(private readonly reentregaEmMs = 20) {
    super();
  }

  async iniciar(): Promise<void> {
    this.parado = false;
  }

  async publicar(fila: NomeDaFila, trabalho: Trabalho): Promise<void> {
    const valido = Trabalho.parse(trabalho);
    this.publicados.push({ fila, trabalho: valido });
    this.pendentes.set(fila, [...(this.pendentes.get(fila) ?? []), valido]);
    this.escoar(fila);
  }

  async consumir(fila: NomeDaFila, opcoes: OpcoesDoConsumidor, tratar: (trabalho: Trabalho) => Promise<void>): Promise<void> {
    this.consumidores.set(fila, { concorrencia: opcoes.concorrencia, tratar });
    this.escoar(fila);
  }

  private escoar(fila: NomeDaFila): void {
    const consumidor = this.consumidores.get(fila);
    if (!consumidor || this.parado) return;
    const pendentes = this.pendentes.get(fila) ?? [];
    while (this.emCurso.size < consumidor.concorrencia) {
      // o primeiro trabalho cuja conta não tem outro rodando: uma conta por vez
      const indice = pendentes.findIndex((t) => !this.contasRodando.has(`${fila}:${t.contaId}`));
      if (indice < 0) return;
      const [trabalho] = pendentes.splice(indice, 1) as [Trabalho];
      const chave = `${fila}:${trabalho.contaId}`;
      this.contasRodando.add(chave);
      const execucao: Promise<void> = consumidor
        .tratar(trabalho)
        .catch(async () => {
          // falhou: volta para a fila, mais tarde
          await new Promise((ok) => setTimeout(ok, this.reentregaEmMs));
          pendentes.push(trabalho);
        })
        .finally(() => {
          this.contasRodando.delete(chave);
          this.emCurso.delete(execucao);
          this.escoar(fila);
        });
      this.emCurso.add(execucao);
    }
  }

  /** Para os testes: espera a fila esvaziar e os trabalhos em curso terminarem. */
  async ociosa(): Promise<void> {
    while (this.emCurso.size > 0 || [...this.pendentes.entries()].some(([fila, p]) => p.length > 0 && this.consumidores.has(fila))) {
      await Promise.race([...this.emCurso, new Promise((ok) => setTimeout(ok, 10))]);
    }
  }

  async parar(): Promise<void> {
    this.parado = true;
    await Promise.all([...this.emCurso]);
  }
}
