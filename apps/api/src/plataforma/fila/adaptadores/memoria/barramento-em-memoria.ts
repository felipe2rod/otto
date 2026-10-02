// Adaptador falso de BarramentoDeEventos: roda no próprio processo, sem banco. É o que os testes
// de caso de uso e de HTTP usam. Passa pelo mesmo contrato do adaptador de verdade.
import { BarramentoDeEventos, type NomeDaFila, type OpcoesDePublicacao, type OpcoesDoConsumidor, Trabalho, type Tratamento } from '../../barramento-de-eventos';

/** Hora marcada mais longe que isto não arma relógio no teste: só `adiantar()` entrega. */
const ESPERA_MAXIMA_EM_MS = 60_000;

interface Consumidor {
  concorrencia: number;
  tratar: (trabalho: Trabalho) => Promise<Tratamento>;
}

/** Um trabalho esperando, com a posição dele na fila da conta (menor passa na frente). */
interface Pendente {
  trabalho: Trabalho;
  jaNaFilaDaConta: number;
}

export class BarramentoEmMemoria extends BarramentoDeEventos {
  private readonly consumidores = new Map<NomeDaFila, Consumidor>();
  private readonly pendentes = new Map<NomeDaFila, Pendente[]>();
  private readonly contasRodando = new Set<string>();
  private readonly emCurso = new Set<Promise<void>>();
  /** Quantos trabalhos de cada fila estão rodando: a concorrência é por fila. */
  private readonly rodandoNaFila = new Map<NomeDaFila, number>();
  private parado = true;
  /** Tudo que já foi publicado, para o teste conferir o que foi para a fila. */
  readonly publicados: { fila: NomeDaFila; trabalho: Trabalho }[] = [];
  /** Para o teste conferir a justiça entre contas: com quantos na frente (da mesma conta) cada trabalho foi publicado. */
  readonly posicoes = new Map<string, number>();
  /** O que foi publicado com hora marcada e ainda não chegou à fila. */
  readonly agendados: { fila: NomeDaFila; trabalho: Trabalho; naoAntesDe: Date; jaNaFilaDaConta: number; relogio?: NodeJS.Timeout }[] = [];

  constructor(
    private readonly reentregaEmMs = 20,
    private readonly adiamentoEmMs = reentregaEmMs,
  ) {
    super();
  }

  async iniciar(): Promise<void> {
    this.parado = false;
    for (const fila of this.consumidores.keys()) this.escoar(fila);
  }

  async responde(): Promise<boolean> {
    return !this.parado;
  }

  async publicar(fila: NomeDaFila, trabalho: Trabalho, opcoes: OpcoesDePublicacao = {}): Promise<void> {
    const valido = Trabalho.parse(trabalho);
    const espera = opcoes.naoAntesDe ? opcoes.naoAntesDe.getTime() - Date.now() : 0;
    if (opcoes.naoAntesDe && espera > 0) {
      const agendado: (typeof this.agendados)[number] = { fila, trabalho: valido, naoAntesDe: opcoes.naoAntesDe, jaNaFilaDaConta: opcoes.jaNaFilaDaConta ?? 0 };
      if (espera <= ESPERA_MAXIMA_EM_MS) agendado.relogio = setTimeout(() => this.entregarAgendado(agendado), espera);
      this.agendados.push(agendado);
      return;
    }
    this.enfileirar(fila, valido, opcoes.jaNaFilaDaConta ?? 0);
  }

  private enfileirar(fila: NomeDaFila, trabalho: Trabalho, jaNaFilaDaConta: number): void {
    this.publicados.push({ fila, trabalho });
    this.posicoes.set(trabalho.id, jaNaFilaDaConta);
    // a lista é sempre a mesma: quem está escoando a fila enxerga o que chega depois
    const pendentes = this.pendentes.get(fila) ?? [];
    this.pendentes.set(fila, pendentes);
    pendentes.push({ trabalho, jaNaFilaDaConta });
    this.escoar(fila);
  }

  private entregarAgendado(agendado: (typeof this.agendados)[number]): void {
    const indice = this.agendados.indexOf(agendado);
    if (indice < 0) return;
    this.agendados.splice(indice, 1);
    clearTimeout(agendado.relogio);
    this.enfileirar(agendado.fila, agendado.trabalho, agendado.jaNaFilaDaConta);
  }

  /** Para os testes: a hora marcada de tudo que está agendado chegou. */
  adiantar(): void {
    for (const agendado of [...this.agendados]) this.entregarAgendado(agendado);
  }

  async consumir(fila: NomeDaFila, opcoes: OpcoesDoConsumidor, tratar: (trabalho: Trabalho) => Promise<Tratamento>): Promise<void> {
    this.consumidores.set(fila, { concorrencia: opcoes.concorrencia, tratar });
    this.escoar(fila);
  }

  private escoar(fila: NomeDaFila): void {
    const consumidor = this.consumidores.get(fila);
    if (!consumidor || this.parado) return;
    const pendentes = this.pendentes.get(fila) ?? [];
    this.pendentes.set(fila, pendentes);
    while ((this.rodandoNaFila.get(fila) ?? 0) < consumidor.concorrencia) {
      // Dos trabalhos cuja conta não tem outro rodando (uma conta por vez), sai o de quem tem menos na
      // fila; no empate, o que chegou primeiro.
      let indice = -1;
      for (const [i, p] of pendentes.entries()) {
        if (this.contasRodando.has(`${fila}:${p.trabalho.contaId}`)) continue;
        if (indice < 0 || p.jaNaFilaDaConta < (pendentes[indice] as Pendente).jaNaFilaDaConta) indice = i;
      }
      if (indice < 0) return;
      const [pendente] = pendentes.splice(indice, 1) as [Pendente];
      const { trabalho } = pendente;
      const chave = `${fila}:${trabalho.contaId}`;
      this.contasRodando.add(chave);
      const execucao: Promise<void> = consumidor
        .tratar(trabalho)
        .then(
          async (tratamento) => {
            if (tratamento !== 'adiar') return;
            // não era a vez da conta: volta mais tarde, sem contar como falha
            await new Promise((ok) => setTimeout(ok, this.adiamentoEmMs));
            pendentes.push(pendente);
          },
          async () => {
            // falhou: volta para a fila, mais tarde
            await new Promise((ok) => setTimeout(ok, this.reentregaEmMs));
            pendentes.push(pendente);
          },
        )
        .finally(() => {
          this.contasRodando.delete(chave);
          this.emCurso.delete(execucao);
          this.rodandoNaFila.set(fila, (this.rodandoNaFila.get(fila) ?? 1) - 1);
          this.escoar(fila);
        });
      this.emCurso.add(execucao);
      this.rodandoNaFila.set(fila, (this.rodandoNaFila.get(fila) ?? 0) + 1);
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
    for (const agendado of this.agendados) clearTimeout(agendado.relogio);
    await Promise.all([...this.emCurso]);
  }
}
