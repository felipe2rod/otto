// O contrato da fila contra o pg-boss de verdade, na base de teste, com otto_app (sem privilégio
// de esquema). O esquema da fila foi criado pelo migrador em testes/banco/preparar-banco-de-teste.ts.
import { randomUUID } from 'node:crypto';
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import type { RecursosDaExportacao } from '@otto/psd';
import { describe, expect, it } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../../testes/banco/conexoes';
import { ArmazenamentoEmMemoria } from '../../../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { RepositorioDeArquivosNoBanco } from '../../../../arquivo/infrastructure/prisma/repositorio-de-arquivos-no-banco';
import { BibliotecaDeFontesEmMemoria } from '../../../../biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { RepositorioDeDocumentosNoBanco } from '../../../../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { CasosDeUsoDeExportacao } from '../../../../exportacao/application/casos-de-uso-de-exportacao';
import { type ArquivoGerado, MotorDeExportacao } from '../../../../exportacao/application/motor-de-exportacao';
import { consumirExportacoes } from '../../../../exportacao/infrastructure/consumidor-de-exportacoes';
import { RepositorioDeExportacoesNoBanco } from '../../../../exportacao/infrastructure/prisma/repositorio-de-exportacoes-no-banco';
import { PrismaComEscopo } from '../../../persistencia/prisma-com-escopo';
import { contratoDoBarramentoDeEventos } from '../../barramento-de-eventos.contrato';
import { BarramentoComPgBoss } from './barramento-com-pg-boss';

contratoDoBarramentoDeEventos(
  'pg-boss no PostgreSQL',
  async () => ({ barramento: new BarramentoComPgBoss(urlDoAppDeTeste(), { consumidor: true, intervaloDeConsultaEmSegundos: 0.5, intervaloDeManutencaoEmSegundos: 1 }), limpar: async () => undefined }),
  {
    entregaMs: 6000,
    reentregaMs: 8000,
    adiamentoMs: 3000,
  },
);

// ---------------------------------------------------------------------------------------------
// Dois workers de verdade sobre a mesma fila e o mesmo banco: o caso de uso, o repositório no
// PostgreSQL (com o índice único parcial) e o pg-boss, com um motor falso e lento.
// Fica neste arquivo de propósito: quem consome a fila de teste é um arquivo só, em sequência.
// ---------------------------------------------------------------------------------------------
describe('dois workers sobre a mesma fila', () => {
  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  const DURACAO_DO_MOTOR_MS = 500;

  class MotorLento extends MotorDeExportacao {
    constructor(private readonly aoRodar: () => void) {
      super();
    }
    private async gerar(nome: string, extensao: string): Promise<ArquivoGerado[]> {
      this.aoRodar();
      await esperar(DURACAO_DO_MOTOR_MS);
      return [{ nome: `${nome}.${extensao}`, bytes: new Uint8Array(8) }];
    }
    psd(_d: Documento, _r: RecursosDaExportacao, o: { nome: string }) {
      return this.gerar(o.nome, 'psd');
    }
    png(_d: Documento, _r: RecursosDaExportacao, o: { nome: string }) {
      return this.gerar(o.nome, 'png');
    }
    svg(_d: Documento, _r: RecursosDaExportacao, o: { nome: string }) {
      return this.gerar(o.nome, 'svg');
    }
    pdf(_d: Documento, _r: RecursosDaExportacao, o: { nome: string }) {
      return this.gerar(o.nome, 'pdf');
    }
  }

  it('uma exportação por vez por conta ENTRE workers, e a exportação única de uma conta não espera as quatro de outra', async () => {
    const prisma = new PrismaComEscopo(urlDoAppDeTeste());
    const [contaCheia, contaNova] = [await criarContaDeTeste('Conta com quatro na fila'), await criarContaDeTeste('Conta com uma')];
    const documentos = new RepositorioDeDocumentosNoBanco(prisma);
    const exportacoes = new RepositorioDeExportacoesNoBanco(prisma);
    const armazenamento = new ArmazenamentoEmMemoria();
    const arvore = aplicarLote(documentoVazio(), [{ op: 'criarPrancheta', nome: 'Feed', largura: 100, altura: 100, fundo: '#ffffff' }], { autoria: { tipo: 'designer' }, idDoLote: randomUUID() });
    if (!arvore.ok) throw new Error(arvore.erro.mensagem);
    const rodadasPorWorker = [0, 0];

    const worker = (indice: number) => {
      const fila = new BarramentoComPgBoss(urlDoAppDeTeste(), { consumidor: true, intervaloDeConsultaEmSegundos: 0.5 });
      const casos = new CasosDeUsoDeExportacao({
        documentos,
        exportacoes,
        arquivos: new RepositorioDeArquivosNoBanco(prisma),
        armazenamento,
        fontes: new BibliotecaDeFontesEmMemoria(),
        fila,
        motor: new MotorLento(() => {
          rodadasPorWorker[indice] = (rodadasPorWorker[indice] ?? 0) + 1;
        }),
        gerarId: randomUUID,
      });
      return { fila, casos };
    };
    const [w1, w2] = [worker(0), worker(1)];
    for (const w of [w1, w2]) {
      await w.fila.iniciar();
      // cada worker roda duas ao mesmo tempo: quatro vagas para cinco exportações de duas contas
      await consumirExportacoes(w.fila, w.casos, 2);
    }

    // amostra o banco: quantas exportações cada conta tem "rodando" a cada instante
    let maximoRodandoPorConta = 0;
    let amostrando = true;
    const amostragem = (async () => {
      while (amostrando) {
        for (const conta of [contaCheia, contaNova]) {
          const rodando = await prisma.executar(conta, (tx) => tx.exportacao.count({ where: { contaId: conta.contaId, estado: 'rodando' } }));
          maximoRodandoPorConta = Math.max(maximoRodandoPorConta, rodando);
        }
        await esperar(25);
      }
    })();

    const docCheia = await documentos.criar(contaCheia, { id: randomUUID(), nome: 'Cheia', arvore: arvore.doc });
    const docNova = await documentos.criar(contaNova, { id: randomUUID(), nome: 'Nova', arvore: arvore.doc });
    const daCheia = [];
    for (let i = 0; i < 4; i++) daCheia.push(await w1.casos.pedir(contaCheia, docCheia.id, { formato: 'png', escala: 1, semFundo: false }));
    const daNova = await w1.casos.pedir(contaNova, docNova.id, { formato: 'png', escala: 1, semFundo: false });

    const estado = async (conta: typeof contaCheia, id: string) => w1.casos.consultar(conta, id);
    const fim = Date.now() + 30_000;
    for (;;) {
      const todas = [...(await Promise.all(daCheia.map((e) => estado(contaCheia, e.id)))), await estado(contaNova, daNova.id)];
      if (todas.every((e) => e.estado === 'pronta')) break;
      if (Date.now() > fim) throw new Error(`não terminou a tempo: ${todas.map((e) => e.estado).join(', ')}`);
      await esperar(100);
    }
    amostrando = false;
    await amostragem;

    const prontaEm = async (conta: typeof contaCheia, id: string) => Date.parse((await estado(conta, id)).prontaEm as string);
    const fimDaCheia = (await Promise.all(daCheia.map((e) => prontaEm(contaCheia, e.id)))).sort((a, b) => a - b);
    // a regra, medida no banco: nunca duas exportações da mesma conta rodando, com quatro vagas livres em dois workers
    expect(maximoRodandoPorConta).toBe(1);
    // as quatro da conta cheia saíram uma depois da outra
    expect((fimDaCheia[3] as number) - (fimDaCheia[0] as number)).toBeGreaterThanOrEqual(DURACAO_DO_MOTOR_MS * 3 * 0.9);
    // e a única da conta nova, pedida por último, não esperou por elas: terminou antes da terceira da conta cheia
    // (com folga para máquina carregada: sem justiça entre contas ela seria a quinta)
    expect(await prontaEm(contaNova, daNova.id)).toBeLessThan(fimDaCheia[2] as number);
    // cada exportação rodou uma vez só, somando os dois workers
    expect((rodadasPorWorker[0] as number) + (rodadasPorWorker[1] as number)).toBe(5);

    await Promise.all([w1.fila.parar(), w2.fila.parar()]);
    await prisma.fechar();
  }, 60_000);
});
