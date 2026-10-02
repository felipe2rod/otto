// Adaptador de MotorDeExportacao que roda o motor em threads (worker_threads), uma exportação por
// thread. Por quê:
// - o render é síncrono e leva até 43 s numa prancheta pesada (medido). No laço principal, isso
//   travava o processo inteiro: sem sinal de vida para a fila, sem resposta na rota de saúde, sem
//   pegar outro trabalho;
// - com N threads, um worker roda N exportações ao mesmo tempo de verdade (cada uma num núcleo);
// - a thread que ficou parada é encerrada: a memória do WebAssembly, que nunca volta ao sistema
//   dentro de um processo, volta quando a thread termina. Outra sobe no lugar, de prontidão;
// - a thread que morre (falta de memória no WebAssembly) derruba só a exportação dela.
// A thread não tem banco, fila nem armazenamento: recebe documento e recursos por cópia e devolve bytes.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Documento } from '@otto/documento';
import type { RecursosDaExportacao } from '@otto/psd';
import { type ArquivoGerado, type EntreEtapas, MotorDeExportacao, type OpcoesDoPdf, type OpcoesDoSvg } from '../../application/motor-de-exportacao';

type OpcoesPsd = { nome: string; pranchetas: readonly string[]; arquivos: 'por-prancheta' | 'juntas' };
type OpcoesPng = { nome: string; pranchetas: readonly string[]; escala: 1 | 2; semFundo: boolean };

export type PedidoAThread = { id: number; doc: Documento; recursos: RecursosDaExportacao } & (
  | { formato: 'psd'; opcoes: OpcoesPsd }
  | { formato: 'png'; opcoes: OpcoesPng }
  | { formato: 'svg'; opcoes: OpcoesDoSvg }
  | { formato: 'pdf'; opcoes: OpcoesDoPdf }
);
type Pedido = PedidoAThread extends infer P ? (P extends unknown ? Omit<P, 'id'> : never) : never;

export type RespostaDaThread = { id: number; ok: true; arquivos: ArquivoGerado[] } | { id: number; ok: false; erro: { nome: string; mensagem: string; pilha: string } };

/** A thread da exportação terminou antes da resposta (foi encerrada, ou caiu por falta de memória). */
export class MotorInterrompido extends Error {
  constructor() {
    super('a thread de exportação terminou antes de responder');
    this.name = 'MotorInterrompido';
  }
}

export interface OpcoesDoMotorEmThread {
  /** Quantas exportações ao mesmo tempo. Cada thread ocupa um núcleo e tem a própria memória de render. */
  threads: number;
  /**
   * Depois de quanto tempo parada a thread que já exportou é trocada por uma nova, para devolver a memória.
   * Padrão: 10 s. Não é a cada chamada: subir uma thread custa mais que renderizar uma prancheta leve
   * (medido: um PSD de 5 pranchetas foi de 6 s para 21 s trocando de thread a cada prancheta).
   */
  ociosaPorMs?: number;
}

interface Thread {
  worker: Worker;
  feitas: number;
  ociosidade?: NodeJS.Timeout;
  emCurso?: { id: number; resolver: (arquivos: ArquivoGerado[]) => void; rejeitar: (erro: Error) => void };
}

/** Em desenvolvimento e em teste a thread roda o TypeScript (com o tsx); empacotada, o arquivo vizinho gerado pelo build. */
function entradaDaThread(): { arquivo: URL; execArgv: string[] } {
  const fonte = new URL('./motor.thread.ts', import.meta.url);
  if (existsSync(fileURLToPath(fonte))) return { arquivo: fonte, execArgv: ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href] };
  return { arquivo: new URL('./motor.thread.mjs', import.meta.url), execArgv: [] };
}

export class MotorDeExportacaoEmThread extends MotorDeExportacao {
  private readonly livres: Thread[] = [];
  private readonly todas = new Set<Thread>();
  private readonly esperando: (() => void)[] = [];
  private proximoId = 1;
  private fechado = false;
  /** O maior número de threads que existiram ao mesmo tempo. Nunca passa de `threads`. */
  threadsNoMaximo = 0;
  threadsCriadas = 0;

  get threadsVivas(): number {
    return this.todas.size;
  }

  constructor(private readonly opcoes: OpcoesDoMotorEmThread) {
    super();
    if (!Number.isInteger(opcoes.threads) || opcoes.threads < 1) throw new Error('o motor precisa de ao menos uma thread');
  }

  psd(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesPsd, _entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    return this.rodar({ formato: 'psd', doc, recursos, opcoes });
  }
  png(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesPng, _entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    return this.rodar({ formato: 'png', doc, recursos, opcoes });
  }
  svg(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoSvg, _entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    return this.rodar({ formato: 'svg', doc, recursos, opcoes });
  }
  pdf(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoPdf, _entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    return this.rodar({ formato: 'pdf', doc, recursos, opcoes });
  }

  private async rodar(pedido: Pedido): Promise<ArquivoGerado[]> {
    const thread = await this.pegarThread();
    const id = this.proximoId++;
    try {
      return await new Promise<ArquivoGerado[]>((resolver, rejeitar) => {
        thread.emCurso = { id, resolver, rejeitar };
        // sem lista de transferência: os recursos são COPIADOS. Quem chama guarda os bytes para a prancheta seguinte.
        thread.worker.postMessage({ ...pedido, id } as PedidoAThread);
      });
    } finally {
      delete thread.emCurso;
      thread.feitas++;
      this.devolver(thread);
    }
  }

  private async pegarThread(): Promise<Thread> {
    for (;;) {
      if (this.fechado) throw new MotorInterrompido();
      const livre = this.livres.pop();
      if (livre) {
        clearTimeout(livre.ociosidade);
        return livre;
      }
      if (this.todas.size < this.opcoes.threads) return this.criarThread();
      await new Promise<void>((ok) => this.esperando.push(ok));
    }
  }

  private criarThread(): Thread {
    const { arquivo, execArgv } = entradaDaThread();
    const worker = new Worker(arquivo, { execArgv });
    const thread: Thread = { worker, feitas: 0 };
    this.todas.add(thread);
    this.threadsCriadas++;
    this.threadsNoMaximo = Math.max(this.threadsNoMaximo, this.todas.size);
    worker.on('message', (resposta: RespostaDaThread) => {
      const emCurso = thread.emCurso;
      if (!emCurso || emCurso.id !== resposta.id) return;
      if (resposta.ok) return emCurso.resolver(resposta.arquivos);
      const erro = new Error(resposta.erro.mensagem);
      erro.name = resposta.erro.nome;
      erro.stack = resposta.erro.pilha;
      emCurso.rejeitar(erro);
    });
    // 'error' (exceção não tratada, falta de memória) é sempre seguido de 'exit': a limpeza fica num lugar só
    worker.on('error', () => undefined);
    worker.on('exit', () => {
      clearTimeout(thread.ociosidade);
      this.todas.delete(thread);
      const livre = this.livres.indexOf(thread);
      if (livre >= 0) this.livres.splice(livre, 1);
      thread.emCurso?.rejeitar(new MotorInterrompido());
      // A substituta sobe já, de prontidão: a próxima exportação não paga a subida da thread (cerca de 1 s
      // em desenvolvimento). Parada, ela só tem o código carregado; a memória de render nasce com o uso.
      if (!this.fechado && this.todas.size < this.opcoes.threads) this.livres.push(this.criarThread());
      this.esperando.shift()?.();
    });
    return thread;
  }

  private devolver(thread: Thread): void {
    if (!this.todas.has(thread)) return;
    if (this.fechado) {
      void thread.worker.terminate();
      return;
    }
    // Parada por tempo demais, é encerrada: é o que devolve a memória do WebAssembly ao sistema. A vaga
    // reabre no 'exit', já com a substituta.
    thread.ociosidade = setTimeout(() => {
      const livre = this.livres.indexOf(thread);
      if (livre < 0) return;
      this.livres.splice(livre, 1);
      void thread.worker.terminate();
    }, this.opcoes.ociosaPorMs ?? 10_000);
    thread.ociosidade.unref();
    this.livres.push(thread);
    this.esperando.shift()?.();
  }

  /** Encerra as threads como se tivessem caído: a exportação em curso é rejeitada. O motor continua aceitando trabalho. */
  async derrubarThreads(): Promise<void> {
    await Promise.all([...this.todas].map((t) => t.worker.terminate()));
  }

  /** Encerra tudo e não aceita mais exportação. */
  override async fechar(): Promise<void> {
    this.fechado = true;
    await this.derrubarThreads();
    for (const acordar of this.esperando.splice(0)) acordar();
  }
}
