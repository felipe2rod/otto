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
  const ciclo = new CicloDeVida(servico, { fechar: async () => void ordem.push('banco') }, fila, exportacoes, { error: (linha) => void linhas.push(linha) }, 5);
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
    expect(ordem).toEqual(['fila', 'banco']);
  });
});
