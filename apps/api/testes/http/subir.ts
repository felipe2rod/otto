// Sobe a API de verdade (NestJS, rotas, guarda, filtro, banco de teste) sem abrir porta de rede.
// Trocados só na borda: armazenamento, biblioteca de fontes e fila em memória, o registro (para ler
// o log) e o resolvedor de escopo, que nos testes escolhe a conta pelo cookie. É assim que a suíte
// "duas-contas" existe antes do login: o ponto único de escopo é o mesmo da produção.
// A fila roda no próprio processo, com o MESMO consumidor do worker e o motor de exportação de verdade
// (no laço principal, sem a thread). A tarefa do Otto roda com o consumidor do worker, a bancada de render de
// verdade e o modelo roteirizado (sem espera): nenhum teste fala com modelo.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import roteiroDoBriefing from '@otto/agente/roteiros/briefing-dois-formatos.json' with { type: 'json' };
import { CABECALHOS } from '@otto/shared';
import request from 'supertest';
import { configurarAplicacao, ModuloRaiz } from '../../src/aplicacao';
import { ArmazenamentoDeArquivo } from '../../src/arquivo/application/armazenamento-de-arquivo';
import { ArmazenamentoEmMemoria } from '../../src/arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { BibliotecaDeFontes } from '../../src/biblioteca/application/biblioteca-de-fontes';
import { BibliotecaDeFontesEmMemoria } from '../../src/biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { CasosDeUsoDeExportacao } from '../../src/exportacao/application/casos-de-uso-de-exportacao';
import { MotorDeExportacao } from '../../src/exportacao/application/motor-de-exportacao';
import { consumirExportacoes } from '../../src/exportacao/infrastructure/consumidor-de-exportacoes';
import { MotorDeExportacaoComRender } from '../../src/exportacao/infrastructure/render/motor-de-exportacao-com-render';
import { lerConfiguracao } from '../../src/plataforma/config/configuracao';
import type { EscopoDaConta } from '../../src/plataforma/escopo/escopo-da-conta';
import { ResolvedorDeEscopo } from '../../src/plataforma/escopo/resolvedor-de-escopo';
import { BarramentoEmMemoria } from '../../src/plataforma/fila/adaptadores/memoria/barramento-em-memoria';
import { BarramentoDeEventos } from '../../src/plataforma/fila/barramento-de-eventos';
import { Registro } from '../../src/plataforma/log/registro';
import { CasosDeUsoDeTarefa } from '../../src/tarefa/application/casos-de-uso-de-tarefa';
import { consumirTarefas } from '../../src/tarefa/infrastructure/consumidor-de-tarefas';
import { criarContaDeTeste, urlDoAppDeTeste } from '../banco/conexoes';

const RECURSOS = path.resolve(import.meta.dirname, '../../../../packages/render/recursos-de-teste');
export const PNG = readFileSync(path.join(RECURSOS, 'imagens/recorte-com-alfa.png'));
export const JPEG = readFileSync(path.join(RECURSOS, 'imagens/foto-paisagem.jpg'));
export const FONTE_ANTON = readFileSync(path.join(RECURSOS, 'fontes/Anton-Regular.ttf'));

/** Nos testes, a credencial (cookie otto_sessao) é o apelido da conta. Sem cookie: a conta A. */
class ResolvedorDeTeste extends ResolvedorDeEscopo {
  constructor(private readonly contas: Record<string, EscopoDaConta>) {
    super();
  }
  async resolverDaRequisicao(credencial: string | undefined): Promise<EscopoDaConta> {
    const escopo = this.contas[credencial ?? 'A'];
    if (!escopo) throw new Error(`conta de teste desconhecida: ${credencial}`);
    return escopo;
  }
}

/** Armazenamento que conta as chamadas: para provar que arquivo de outra conta nem chega à porta. */
export class ArmazenamentoEspiao extends ArmazenamentoEmMemoria {
  leituras = 0;
  override async ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined> {
    this.leituras++;
    return super.ler(escopo, chave);
  }
  linksPedidos = 0;
  override async linkAssinado(...argumentos: Parameters<ArmazenamentoEmMemoria['linkAssinado']>): Promise<string> {
    this.linksPedidos++;
    return super.linkAssinado(...argumentos);
  }
}

export interface ApiDeTeste {
  app: INestApplication;
  contaA: EscopoDaConta;
  contaB: EscopoDaConta;
  armazenamento: ArmazenamentoEspiao;
  fontes: BibliotecaDeFontesEmMemoria;
  /** A fila, no próprio processo. `await fila.ociosa()` espera as exportações pedidas terminarem. */
  fila: BarramentoEmMemoria;
  /** Linhas de log emitidas, já lidas como JSON. */
  log: Record<string, unknown>[];
  logCru: string[];
  /** Cliente HTTP de uma conta, já com o cabeçalho de escrita. */
  como(conta: 'A' | 'B'): ClienteDeTeste;
  /** Liga o consumidor de tarefas do Otto (para quem subiu com `consumirTarefas: false`). */
  ligarTarefas(): Promise<void>;
  fechar(): Promise<void>;
}

export interface ClienteDeTeste {
  get(caminho: string): request.Test;
  post(caminho: string): request.Test;
  patch(caminho: string): request.Test;
  delete(caminho: string): request.Test;
  /** Sem o cabeçalho X-Otto-Cliente, como faria um site qualquer. */
  cru: ReturnType<typeof request>;
}

/**
 * @param opcoes `consumirFila: false` deixa as exportações paradas na fila (para testar o que acontece antes de ficarem prontas);
 *   `consumirTarefas: false` faz o mesmo com as tarefas do Otto, até `ligarTarefas()`.
 */
export async function subirApi(envExtra: Record<string, string> = {}, opcoes: { consumirFila?: boolean; consumirTarefas?: boolean } = {}): Promise<ApiDeTeste> {
  const [contaA, contaB] = [await criarContaDeTeste('Conta A'), await criarContaDeTeste('Conta B')];
  const config = lerConfiguracao({
    AMBIENTE: 'teste',
    NIVEL_DE_LOG: 'trace',
    BANCO_URL_APP: urlDoAppDeTeste(),
    CONTA_FIXA_ID: contaA.contaId,
    ARMAZENAMENTO_ADAPTADOR: 'disco-local',
    ARMAZENAMENTO_PASTA: '/tmp/otto-nao-usado',
    // o roteiro responde na hora
    VELOCIDADE_DO_ROTEIRO: '0',
    ...envExtra,
  });
  const logCru: string[] = [];
  const log: Record<string, unknown>[] = [];
  const registro = new Registro('api', config, {
    write(linha: string) {
      logCru.push(linha);
      log.push(JSON.parse(linha) as Record<string, unknown>);
    },
  });
  const armazenamento = new ArmazenamentoEspiao();
  const fontes = new BibliotecaDeFontesEmMemoria();
  const fila = new BarramentoEmMemoria();
  await fontes.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: 'SIL Open Font License 1.1', conteudo: FONTE_ANTON });

  const modulo = await Test.createTestingModule({ imports: [ModuloRaiz.para('api', config)] })
    .overrideProvider(ResolvedorDeEscopo)
    .useValue(new ResolvedorDeTeste({ A: contaA, B: contaB }))
    .overrideProvider(ArmazenamentoDeArquivo)
    .useValue(armazenamento)
    .overrideProvider(BibliotecaDeFontes)
    .useValue(fontes)
    .overrideProvider(BarramentoDeEventos)
    .useValue(fila)
    // o mesmo motor, no próprio laço: subir uma thread por exportação custa 1 s a cada teste. O motor em
    // thread tem o teste dele (motor-em-thread.test.ts) e roda de verdade no worker do compose.
    .overrideProvider(MotorDeExportacao)
    .useValue(new MotorDeExportacaoComRender())
    .overrideProvider(Registro)
    .useValue(registro)
    .compile();
  const app = configurarAplicacao(modulo.createNestApplication({ bodyParser: false }));
  await app.init();
  if (opcoes.consumirFila !== false) await consumirExportacoes(fila, app.get(CasosDeUsoDeExportacao));
  const ligarTarefas = () => consumirTarefas(fila, app.get(CasosDeUsoDeTarefa), 2);
  if (opcoes.consumirTarefas !== false) await ligarTarefas();

  const como = (conta: 'A' | 'B'): ClienteDeTeste => {
    const agente = request(app.getHttpServer());
    const com = (t: request.Test) => t.set('Cookie', `otto_sessao=${conta}`).set(CABECALHOS.cliente.nome, CABECALHOS.cliente.valor);
    return { get: (c) => com(agente.get(c)), post: (c) => com(agente.post(c)), patch: (c) => com(agente.patch(c)), delete: (c) => com(agente.delete(c)), cru: agente };
  };
  return { app, contaA, contaB, armazenamento, fontes, fila, log, logCru, como, ligarTarefas, fechar: () => app.close() };
}

export const criarPrancheta = (nome = 'Feed') => ({ op: 'criarPrancheta', nome, largura: 1080, altura: 1350, fundo: '#ffffff' });
export const criarForma = (nome: string, extra: object = {}) => ({
  op: 'criarNo',
  prancheta: 'Feed',
  no: { tipo: 'forma', nome, forma: 'retangulo', x: 10, y: 10, largura: 100, altura: 50, preenchimento: '#ff0000', ...extra },
});

/** A entrada que o roteiro de briefing responde (parte de uma peça vazia e pede o "pode"). */
export const ENTRADA_DE_BRIEFING = roteiroDoBriefing.entrada;

/** Uma peça em que o roteiro de ajuste funciona: prancheta "Feed", camada de texto "Título" e o token "destaque". */
export const PECA_PARA_O_AJUSTE = [
  { op: 'definirToken', nome: 'destaque', valor: '#f4c430' },
  { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
  { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 80, y: 120, largura: 900, altura: 300, conteudo: 'Promoção da semana', fonte: 'Anton', tamanho: 120, cor: '#17171c' } },
];
