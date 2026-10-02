// A subida e a descida da fila, sem NestJS: o processo fica de pé com a fila fora do ar e tenta de novo.
import { lerContaId } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { CicloDeVida } from './ciclo-de-vida';
import type { CasosDeUsoDeExportacao } from './exportacao/application/casos-de-uso-de-exportacao';
import { BarramentoEmMemoria } from './plataforma/fila/adaptadores/memoria/barramento-em-memoria';

const CONTA = lerContaId('01990000-0000-7000-8000-00000000000a');
const ID = '01990000-0000-7000-8000-0000000000e1';

class FilaQueDemoraAVoltar extends BarramentoEmMemoria {
  tentativas = 0;
  constructor(private readonly falhas: number) {
    super();
  }
  override async iniciar(): Promise<void> {
    this.tentativas++;
    if (this.tentativas <= this.falhas) throw new Error('banco fora do ar: SENTINELA-DE-MENSAGEM');
    return super.iniciar();
  }
}

function montar(servico: 'api' | 'worker', fila: BarramentoEmMemoria) {
  const linhas: Record<string, unknown>[] = [];
  const executadas: string[] = [];
  const ordem: string[] = [];
  const limpas: string[] = [];
  const exportacoes = {
    executar: async (escopo: { contaId: string }, id: string) => void executadas.push(`${escopo.contaId}:${id}`),
    limpar: async (escopo: { contaId: string }, id: string) => void limpas.push(`${escopo.contaId}:${id}`),
  } as unknown as CasosDeUsoDeExportacao;
  const paradaOriginal = fila.parar.bind(fila);
  fila.parar = async () => {
    ordem.push('fila');
    await paradaOriginal();
  };
  const ciclo = new CicloDeVida(
    servico,
    { fechar: async () => void ordem.push('banco') },
    fila,
    exportacoes,
    { error: (linha) => void linhas.push(linha) },
    { exportacoesAoMesmoTempo: 2, motor: { fechar: async () => void ordem.push('motor') }, intervaloEntreTentativasMs: 5 },
  );
  return { ciclo, linhas, executadas, limpas, ordem };
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

describe('CicloDeVida', () => {
  it('no worker, liga o consumidor de exportações: o que é publicado é executado com o escopo da conta do trabalho', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo, executadas } = montar('worker', fila);
    await ciclo.onApplicationBootstrap();
    await fila.publicar('exportacao', { contaId: CONTA, id: ID });
    await fila.ociosa();
    expect(executadas).toEqual([`${CONTA}:${ID}`]);
    await ciclo.onApplicationShutdown();
  });

  it('no worker, liga também o consumidor da limpeza: o trabalho de limpeza apaga com o escopo da conta do trabalho, e não roda exportação', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo, executadas, limpas } = montar('worker', fila);
    await ciclo.onApplicationBootstrap();
    await fila.publicar('limpeza-de-exportacao', { contaId: CONTA, id: ID }, { naoAntesDe: new Date(Date.now() + 7 * 86_400_000) });
    await fila.ociosa();
    expect(limpas).toEqual([]);
    fila.adiantar();
    await fila.ociosa();
    expect(limpas).toEqual([`${CONTA}:${ID}`]);
    expect(executadas).toEqual([]);
    await ciclo.onApplicationShutdown();
  });

  it('no worker, roda tantas exportações ao mesmo tempo quantas a configuração manda, de contas diferentes', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo } = montar('worker', fila);
    let rodando = 0;
    let maximo = 0;
    (ciclo as unknown as { exportacoes: CasosDeUsoDeExportacao }).exportacoes.executar = (async () => {
      rodando++;
      maximo = Math.max(maximo, rodando);
      await esperar(60);
      rodando--;
      return 'feita';
    }) as CasosDeUsoDeExportacao['executar'];
    await ciclo.onApplicationBootstrap();
    for (const conta of ['a', 'b', 'c']) await fila.publicar('exportacao', { contaId: `01990000-0000-7000-8000-00000000000${conta}`, id: ID });
    await fila.ociosa();
    expect(maximo).toBe(2);
    await ciclo.onApplicationShutdown();
  });

  it('conta ocupada em outro worker: o trabalho é adiado, não falha', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo } = montar('worker', fila);
    const respostas: ('ocupada' | 'feita')[] = ['ocupada', 'ocupada', 'feita'];
    let chamadas = 0;
    (ciclo as unknown as { exportacoes: CasosDeUsoDeExportacao }).exportacoes.executar = (async () => respostas[chamadas++]) as CasosDeUsoDeExportacao['executar'];
    await ciclo.onApplicationBootstrap();
    await fila.publicar('exportacao', { contaId: CONTA, id: ID });
    await fila.ociosa();
    expect(chamadas).toBe(3);
    await ciclo.onApplicationShutdown();
  });

  it('na API, só publica: nada é consumido', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo, executadas } = montar('api', fila);
    await ciclo.onApplicationBootstrap();
    await fila.publicar('exportacao', { contaId: CONTA, id: ID });
    await esperar(30);
    expect(executadas).toEqual([]);
    await ciclo.onApplicationShutdown();
  });

  it('com a fila fora do ar, o processo sobe assim mesmo, registra sem a mensagem do erro e tenta de novo até ligar', async () => {
    const fila = new FilaQueDemoraAVoltar(2);
    const { ciclo, linhas, executadas } = montar('worker', fila);
    await ciclo.onApplicationBootstrap();
    expect(linhas[0]).toMatchObject({ evento: 'fila_indisponivel', erro: 'Error' });
    expect(JSON.stringify(linhas)).not.toContain('SENTINELA');
    await esperar(60);
    expect(fila.tentativas).toBe(3);
    await fila.publicar('exportacao', { contaId: CONTA, id: ID });
    await fila.ociosa();
    expect(executadas).toHaveLength(1);
    await ciclo.onApplicationShutdown();
  });

  it('na descida, para a fila antes de fechar o banco, e não tenta mais ligar', async () => {
    const fila = new FilaQueDemoraAVoltar(1000);
    const { ciclo, ordem } = montar('worker', fila);
    await ciclo.onApplicationBootstrap();
    await ciclo.onApplicationShutdown();
    const tentativas = fila.tentativas;
    await esperar(30);
    expect(fila.tentativas).toBe(tentativas);
    // a fila primeiro (espera a exportação em curso), depois as threads do motor, por último o banco
    expect(ordem).toEqual(['fila', 'motor', 'banco']);
  });
});

describe('CicloDeVida e a tarefa do Otto', () => {
  function montarComTarefas(servico: 'api' | 'worker', fila: BarramentoEmMemoria, trabalhar: (conta: string, id: string) => Promise<'feita' | 'ignorada' | 'ocupada'>) {
    const ordem: string[] = [];
    const tarefas = {
      trabalhar: (escopo: { contaId: string }, id: string) => trabalhar(escopo.contaId, id),
      interromperTudo: async () => void ordem.push('tarefas'),
    } as unknown as import('./tarefa/application/casos-de-uso-de-tarefa').CasosDeUsoDeTarefa;
    const paradaOriginal = fila.parar.bind(fila);
    fila.parar = async () => {
      ordem.push('fila');
      await paradaOriginal();
    };
    const ciclo = new CicloDeVida(
      servico,
      { fechar: async () => void ordem.push('banco') },
      fila,
      { executar: async () => undefined, limpar: async () => undefined } as unknown as CasosDeUsoDeExportacao,
      { error: () => undefined },
      { exportacoesAoMesmoTempo: 1, tarefasAoMesmoTempo: 2, motor: { fechar: async () => void ordem.push('motor') } },
      tarefas,
    );
    return { ciclo, ordem };
  }

  it('no worker, o trabalho da fila de tarefas roda com o escopo da conta do trabalho; a API não consome', async () => {
    for (const [servico, esperado] of [
      ['worker', [`${CONTA}:${ID}`]],
      ['api', []],
    ] as const) {
      const fila = new BarramentoEmMemoria();
      const feitas: string[] = [];
      const { ciclo } = montarComTarefas(servico, fila, async (conta, id) => {
        feitas.push(`${conta}:${id}`);
        return 'feita';
      });
      await ciclo.onApplicationBootstrap();
      await fila.publicar('tarefa-do-otto', { contaId: CONTA, id: ID });
      await esperar(20);
      expect(feitas).toEqual(esperado);
      await ciclo.onApplicationShutdown();
    }
  });

  it('conta ocupada com outra tarefa: o trabalho é adiado e entregue de novo, sem se perder', async () => {
    const fila = new BarramentoEmMemoria();
    let vezes = 0;
    const { ciclo } = montarComTarefas('worker', fila, async () => (++vezes === 1 ? 'ocupada' : 'feita'));
    await ciclo.onApplicationBootstrap();
    await fila.publicar('tarefa-do-otto', { contaId: CONTA, id: ID });
    await fila.ociosa();
    fila.adiantar();
    await fila.ociosa();
    expect(vezes).toBe(2);
    await ciclo.onApplicationShutdown();
  });

  it('no desligamento, as tarefas em curso são interrompidas ANTES de a fila parar: a espera da fila não segura uma tarefa de meia hora', async () => {
    const fila = new BarramentoEmMemoria();
    const { ciclo, ordem } = montarComTarefas('worker', fila, async () => 'feita');
    await ciclo.onApplicationBootstrap();
    await ciclo.onApplicationShutdown();
    expect(ordem).toEqual(['tarefas', 'fila', 'motor', 'banco']);
  });
});
