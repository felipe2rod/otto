// A thread de render da tarefa do Otto, vista do laço principal do worker: uma por processo, criada no
// primeiro uso. As chamadas entram numa fila e são atendidas uma por vez (o render é síncrono lá dentro).
// - se a thread cair (falta de memória no WebAssembly), as chamadas em curso são rejeitadas com
//   `OficinaInterrompida`, e a próxima chamada sobe outra thread. Quem tinha sessão aberta a remonta
//   (a bancada guarda o que entregou);
// - parada por um tempo, a thread é encerrada: é o que devolve a memória do WebAssembly ao sistema.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { PedidoDeRender } from '@otto/agente';
import type { Aviso, Documento } from '@otto/documento';
import type { FonteDeArquivo, ImagemDeArquivo } from '@otto/render';

export type PedidoAOficina =
  | { tipo: 'abrir'; sessao: number; fontes: FonteDeArquivo[]; imagens: ImagemDeArquivo[] }
  | { tipo: 'fonte'; sessao: number; fonte: FonteDeArquivo }
  | { tipo: 'imagem'; sessao: number; imagem: ImagemDeArquivo }
  | { tipo: 'renderizar'; sessao: number; doc: Documento; pedido: PedidoDeRender }
  | { tipo: 'verificar'; sessao: number; doc: Documento; prancheta?: string }
  | { tipo: 'reduzir'; sessao: number; bytes: Uint8Array; ladoMaximo: number }
  | { tipo: 'fechar'; sessao: number };

export type ResultadoDaOficina = { tipo: 'feito' } | { tipo: 'nada' } | { tipo: 'imagem'; jpeg: Uint8Array; largura: number; altura: number } | { tipo: 'avisos'; avisos: Aviso[] };
export type RespostaDaOficina = { id: number; ok: true; resultado: ResultadoDaOficina } | { id: number; ok: false; erro: { nome: string; mensagem: string } };

/** A thread de render terminou antes de responder (caiu, ou o processo está desligando). */
export class OficinaInterrompida extends Error {
  constructor() {
    super('a thread de render terminou antes de responder');
    this.name = 'OficinaInterrompida';
  }
}

/** Em desenvolvimento e em teste a thread roda o TypeScript (com o tsx); empacotada, o arquivo vizinho gerado pelo build. */
function entradaDaThread(): { arquivo: URL; execArgv: string[] } {
  const fonte = new URL('./oficina.thread.ts', import.meta.url);
  if (existsSync(fileURLToPath(fonte))) return { arquivo: fonte, execArgv: ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href] };
  return { arquivo: new URL('./oficina.thread.mjs', import.meta.url), execArgv: [] };
}

interface Espera {
  resolver: (resultado: ResultadoDaOficina) => void;
  rejeitar: (erro: Error) => void;
}

export class OficinaDeRender {
  private thread: Worker | undefined;
  private readonly esperas = new Map<number, Espera>();
  private ociosidade: NodeJS.Timeout | undefined;
  private proximoId = 1;
  private proximaSessao = 1;
  private fechada = false;
  /** Quantas threads este processo já criou. Sobe quando uma cai ou é encerrada por ociosidade. */
  threadsCriadas = 0;
  /** Muda a cada thread nova: quem tem sessão aberta sabe que precisa remontá-la. */
  geracao = 0;

  /** @param opcoes.ociosaPorMs depois de quanto tempo sem sessão aberta a thread é encerrada. Padrão: 60 s. */
  constructor(private readonly opcoes: { ociosaPorMs?: number } = {}) {}

  /** Há uma thread de pé agora? */
  get viva(): boolean {
    return this.thread !== undefined;
  }

  novaSessao(): number {
    return this.proximaSessao++;
  }

  private garantirThread(): Worker {
    if (this.fechada) throw new OficinaInterrompida();
    clearTimeout(this.ociosidade);
    if (this.thread) return this.thread;
    const { arquivo, execArgv } = entradaDaThread();
    const thread = new Worker(arquivo, { execArgv });
    this.thread = thread;
    this.threadsCriadas++;
    this.geracao++;
    thread.on('message', (resposta: RespostaDaOficina) => {
      const espera = this.esperas.get(resposta.id);
      if (!espera) return;
      this.esperas.delete(resposta.id);
      if (resposta.ok) return espera.resolver(resposta.resultado);
      const erro = new Error(resposta.erro.mensagem);
      erro.name = resposta.erro.nome;
      espera.rejeitar(erro);
    });
    // 'error' é sempre seguido de 'exit': a limpeza fica num lugar só
    thread.on('error', () => undefined);
    thread.on('exit', () => {
      if (this.thread === thread) this.thread = undefined;
      for (const espera of this.esperas.values()) espera.rejeitar(new OficinaInterrompida());
      this.esperas.clear();
    });
    // a thread não segura o processo de pé
    thread.unref();
    return thread;
  }

  pedir(pedido: PedidoAOficina): Promise<ResultadoDaOficina> {
    let thread: Worker;
    try {
      thread = this.garantirThread();
    } catch (erro) {
      return Promise.reject(erro);
    }
    const id = this.proximoId++;
    return new Promise<ResultadoDaOficina>((resolver, rejeitar) => {
      this.esperas.set(id, { resolver, rejeitar });
      thread.postMessage({ ...pedido, id });
    });
  }

  /** Sem sessão aberta por um tempo, a thread é encerrada: a próxima tarefa sobe outra. */
  semSessoes(): void {
    clearTimeout(this.ociosidade);
    this.ociosidade = setTimeout(() => {
      if (this.esperas.size === 0) void this.thread?.terminate();
    }, this.opcoes.ociosaPorMs ?? 60_000);
    this.ociosidade.unref();
  }

  /** Encerra a thread como se tivesse caído. A oficina continua aceitando trabalho. */
  async derrubar(): Promise<void> {
    await this.thread?.terminate();
  }

  /** Encerra tudo e não aceita mais trabalho. */
  async fechar(): Promise<void> {
    this.fechada = true;
    clearTimeout(this.ociosidade);
    await this.thread?.terminate();
  }
}
