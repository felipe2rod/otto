// Regras da tarefa do Otto, sem NestJS, sem banco, sem fila e sem modelo: o ciclo de @otto/agente de
// verdade, com o modelo roteirizado, repositórios em memória e uma bancada de mentira.
import { randomUUID } from 'node:crypto';
import { criarModeloRoteirizado, type EntradaDaTarefa, type ModeloDoAgente, type Passo, type PedidoAoModelo } from '@otto/agente';
import roteiroDoBriefing from '@otto/agente/roteiros/briefing-dois-formatos.json' with { type: 'json' };
import { type Aviso, type Documento, resumirDocumento } from '@otto/documento';
import { CODIGOS_DE_ERRO, lerContaId, Tarefa } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { CasosDeUsoDeDocumento } from '../../documento/application/casos-de-uso-de-documento';
import type { MedidorAberto } from '../../documento/application/medidor-de-texto';
import { MedidorDeTexto } from '../../documento/application/medidor-de-texto';
import { RepositorioDeDocumentosEmMemoria } from '../../documento/infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { BarramentoEmMemoria } from '../../plataforma/fila/adaptadores/memoria/barramento-em-memoria';
import { FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { type EventoDeUso, RegistroDeUso } from '../../plataforma/uso/registro-de-uso';
import { RepositorioDeTarefasEmMemoria } from '../infrastructure/memoria/repositorio-de-tarefas-em-memoria';
import { type BancadaAberta, BancadaDoOtto } from './bancada-do-otto';
import { CasosDeUsoDeTarefa, type DependenciasDaTarefa, SEM_SINAL_DA_TAREFA_MS } from './casos-de-uso-de-tarefa';
import { ConsumoDoModeloEmMemoria } from './consumo-do-modelo';
import { type ModeloAberto, ModelosDoOtto, type PedidoDeModelo } from './modelos-do-otto';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const AGORA = new Date('2026-10-03T12:00:00.000Z');
const SENTINELA = 'SENTINELA-DO-PEDIDO-91bc';

class MedidorDeMentira extends MedidorDeTexto {
  async abrir(): Promise<MedidorAberto> {
    return { medidor: { tinta: (no) => ({ x: 0, y: 0, w: 0, h: 0, ...(no as object) }) as never }, liberar: () => undefined };
  }
}

class BancadaDeMentira extends BancadaDoOtto {
  abertas = 0;
  fechadas = 0;
  renders = 0;
  avisos: (doc: Documento) => Aviso[] = () => [];
  async abrir(): Promise<BancadaAberta> {
    this.abertas++;
    return {
      fontes: [
        { familia: 'Anton', pesos: [400] },
        { familia: 'DM Serif Display', pesos: [400] },
        { familia: 'IBM Plex Sans', pesos: [400, 500, 600, 700] },
      ],
      resumir: (doc, prancheta) => resumirDocumento(doc, prancheta ? { prancheta } : {}),
      renderizar: async () => {
        this.renders++;
        return { mime: 'image/jpeg', base64: '/9j/AAAA', largura: 614, altura: 768 };
      },
      verificar: async (doc) => this.avisos(doc),
      previaDeArquivo: async () => undefined,
      fechar: () => void this.fechadas++,
    };
  }
}

/** O modelo roteirizado, um por tarefa de teste: as duas partes da tarefa continuam o mesmo roteiro. */
class ModelosDeTeste extends ModelosDoOtto {
  passos: Passo[] = [];
  ids: string[] | undefined;
  pedidos: PedidoDeModelo[] = [];
  private modelo: (ModeloDoAgente & { pedidos: PedidoAoModelo[]; restantes(): number }) | undefined;
  private proximoId = 0;

  roteiro(passos: Passo[], ids?: string[]) {
    this.passos = passos;
    this.ids = ids;
    this.modelo = undefined;
    this.proximoId = 0;
  }
  get chamado(): ModeloDoAgente & { pedidos: PedidoAoModelo[]; restantes(): number } {
    this.modelo ??= criarModeloRoteirizado({ passos: this.passos }, { preco: { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 } });
    return this.modelo;
  }
  abrir(pedido: PedidoDeModelo): ModeloAberto {
    this.pedidos.push(pedido);
    return { modelo: this.chamado, novoId: () => this.ids?.[this.proximoId++] ?? `0199aaaa-bbbb-7ccc-8ddd-${String(++this.proximoId).padStart(12, '0')}` };
  }
}

class UsoEspiao extends RegistroDeUso {
  eventos: EventoDeUso[] = [];
  registrar(_escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.eventos.push(evento);
  }
}

let documentos: RepositorioDeDocumentosEmMemoria;
let tarefas: RepositorioDeTarefasEmMemoria;
let pecas: CasosDeUsoDeDocumento;
let fila: BarramentoEmMemoria;
let bancada: BancadaDeMentira;
let modelos: ModelosDeTeste;
let consumo: ConsumoDoModeloEmMemoria;
let uso: UsoEspiao;
let casos: CasosDeUsoDeTarefa;
let relogio: Date;

function montar(extras: Partial<DependenciasDaTarefa> = {}) {
  casos = new CasosDeUsoDeTarefa({
    tarefas,
    documentos,
    pecas,
    fila,
    bancada,
    modelos,
    consumo,
    gerarId: randomUUID,
    agora: () => relogio,
    uso,
    limites: { tarefasPorDia: 6, naFilaPorConta: 3, tetoDiarioDeTokens: 40_000_000, restoMinimoNoFornecedor: 200_000 },
    intervaloDoSinalDeVidaMs: 5,
    ...extras,
  });
}

beforeEach(() => {
  documentos = new RepositorioDeDocumentosEmMemoria();
  tarefas = new RepositorioDeTarefasEmMemoria(documentos);
  uso = new UsoEspiao();
  pecas = new CasosDeUsoDeDocumento(documentos, new RepositorioDeArquivosEmMemoria(), new MedidorDeMentira(), randomUUID, uso, undefined, {
    viva: async (escopo, id) => tarefas.vivaDoDocumento(escopo, id),
    vivas: (escopo) => tarefas.vivasDaConta(escopo),
  });
  fila = new BarramentoEmMemoria();
  bancada = new BancadaDeMentira();
  modelos = new ModelosDeTeste();
  consumo = new ConsumoDoModeloEmMemoria();
  relogio = AGORA;
  montar();
});

const texto = (nome: string, conteudo: string, y: number) => ({ tipo: 'texto', nome, conteudo, x: 72, y, largura: 900, altura: 160, fonte: 'Anton', tamanho: 80, cor: '#111111' });
const lote = (versaoBase: number, operacoes: unknown[]) => ({ id: randomUUID(), versaoBase, descricao: 'do designer', operacoes });

/** Uma peça que "o designer fez": Feed com título e selo. Fica na versão 1. */
async function peca(escopo = contaA): Promise<string> {
  const d = await pecas.criar(escopo, { nome: 'Promoção' });
  await pecas.aplicarLote(
    escopo,
    d.id,
    lote(0, [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
      { op: 'criarNo', prancheta: 'Feed', no: texto('Título', 'Cappuccino em dobro', 200) },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'elipse', nome: 'Selo', x: 800, y: 80, largura: 200, altura: 200, preenchimento: '#f4c430' } },
    ]),
  );
  return d.id;
}

const AJUSTE: EntradaDaTarefa = { tipo: 'ajuste', pedido: `deixa o título maior ${SENTINELA}` };
const aplicar = (operacoes: unknown[], descricao = 'Título maior'): Passo => ({
  papel: 'ajuste',
  chamadas: [{ nome: 'aplicarOperacoes', argumentos: { descricao, operacoes } }],
  uso: { entrada: 10, cacheLido: 900, cacheCriado: 100, saida: 50 },
});
const entregar = (resumo = 'Aumentei o título.', pendencias: unknown[] = []): Passo => ({
  papel: 'ajuste',
  chamadas: [{ nome: 'entregar', argumentos: { resumo, pendencias } }],
  uso: { entrada: 5, cacheLido: 1000, cacheCriado: 0, saida: 20 },
});
const TITULO_MAIOR = [{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: 96 } }];

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}
const arvoreDe = async (id: string, escopo = contaA) => (await pecas.abrir(escopo, id)).arvore;
const nomesDe = (a: Documento) => a.pranchetas.map((p) => `${p.nome}: ${p.filhos.map((n) => n.nome).join(', ')}`);

describe('pedir uma tarefa', () => {
  it('cria na fila, com a versão da peça e a entrada guardada; na fila vão só a conta e o id; o evento de uso não leva o texto do pedido', async () => {
    const id = await peca();
    const t = Tarefa.parse(await casos.criar(contaA, id, AJUSTE));
    expect(t).toMatchObject({ documentoId: id, tipo: 'ajuste', estado: 'na_fila', versaoInicial: 1, lotes: 0, ultimoEvento: -1, entrada: AJUSTE });
    expect(fila.publicados).toEqual([{ fila: FILAS.tarefaDoOtto, trabalho: { contaId: contaA.contaId, id: t.id } }]);
    expect(uso.eventos.at(-1)).toEqual({ evento: 'tarefa_pedida', tarefaId: t.id, documentoId: id, tipo: 'ajuste' });
    expect(JSON.stringify(uso.eventos)).not.toContain(SENTINELA);
  });

  it('segunda tarefa na mesma peça é recusada, dizendo qual está viva; peça de outra conta é "não encontrado"', async () => {
    const id = await peca();
    const primeira = await casos.criar(contaA, id, AJUSTE);
    expect(await erroDe(casos.criar(contaA, id, AJUSTE))).toMatchObject({ codigo: CODIGOS_DE_ERRO.tarefaEmAndamento, detalhe: { tarefaId: primeira.id, estado: 'na_fila' } });
    expect((await erroDe(casos.criar(contaB, id, AJUSTE))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect(fila.publicados).toHaveLength(1);
  });

  it('com a tarefa na fila, a peça já é somente leitura para o designer', async () => {
    const id = await peca();
    await casos.criar(contaA, id, AJUSTE);
    expect((await erroDe(pecas.aplicarLote(contaA, id, lote(1, [{ op: 'mover', alvo: 'Feed/Selo', x: 10, y: 10 }])))).codigo).toBe(CODIGOS_DE_ERRO.documentoEmTarefa);
  });

  it('fila fora do ar: responde fila_indisponivel e a peça não fica presa a uma tarefa que ninguém vai rodar', async () => {
    class ForaDoAr extends BarramentoEmMemoria {
      override async publicar(): Promise<void> {
        throw new Error('fila fora do ar');
      }
    }
    montar({ fila: new ForaDoAr() });
    const id = await peca();
    expect((await erroDe(casos.criar(contaA, id, AJUSTE))).codigo).toBe(CODIGOS_DE_ERRO.filaIndisponivel);
    expect(await tarefas.vivaDoDocumento(contaA, id)).toBeUndefined();
  });
});

describe('limites, ditos antes', () => {
  it('a conta tem um número de tarefas por dia: a consulta diz quantas já foram, e a que passa do limite é recusada sem entrar na fila', async () => {
    montar({ limites: { tarefasPorDia: 2, naFilaPorConta: 3, tetoDiarioDeTokens: 40_000_000, restoMinimoNoFornecedor: 200_000 } });
    expect(await casos.limites(contaA)).toEqual({ podeEnviar: true, tarefasHoje: 0, tarefasPorDia: 2, naFila: 0, naFilaNoMaximo: 3 });
    for (let i = 0; i < 2; i++) await casos.criar(contaA, await peca(), AJUSTE);
    expect(await casos.limites(contaA)).toEqual({ podeEnviar: false, motivo: 'limite_da_conta', tarefasHoje: 2, tarefasPorDia: 2, naFila: 2, naFilaNoMaximo: 3 });
    expect(await erroDe(casos.criar(contaA, await peca(), AJUSTE))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeTarefas, detalhe: { motivo: 'limite_da_conta', limite: 2 } });
    // o limite é da conta: a outra pede
    expect((await casos.criar(contaB, await peca(contaB), AJUSTE)).estado).toBe('na_fila');
    // e é do dia: amanhã a conta volta a pedir
    relogio = new Date(AGORA.getTime() + 86_400_000);
    expect((await casos.limites(contaA)).tarefasHoje).toBe(0);
  });

  it('fila cheia: a conta com o máximo de tarefas esperando não põe mais uma', async () => {
    for (let i = 0; i < 3; i++) await casos.criar(contaA, await peca(), AJUSTE);
    expect((await casos.limites(contaA)).motivo).toBe('fila_cheia');
    expect(await erroDe(casos.criar(contaA, await peca(), AJUSTE))).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeTarefas, detalhe: { motivo: 'fila_cheia', limite: 3 } });
  });

  it('o teto diário da plataforma é conferido ANTES de aceitar a tarefa: bateu, a resposta é limite_diario, para qualquer conta', async () => {
    await consumo.somar(AGORA, 40_000_000);
    expect(await casos.limites(contaB)).toMatchObject({ podeEnviar: false, motivo: 'limite_diario' });
    expect((await erroDe(casos.criar(contaA, await peca(), AJUSTE))).codigo).toBe(CODIGOS_DE_ERRO.limiteDiario);
    expect(fila.publicados).toEqual([]);
  });

  it('o que o fornecedor diz que resta no dia também conta: abaixo do mínimo, não começa', async () => {
    await consumo.anotarRestante(AGORA, 150_000);
    expect((await casos.limites(contaA)).motivo).toBe('limite_diario');
  });
});

describe('o ciclo no worker (ajuste pontual)', () => {
  async function pedirERodar(passos: Passo[] = [aplicar(TITULO_MAIOR), entregar()]) {
    const id = await peca();
    modelos.roteiro(passos);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    const resultado = await casos.trabalhar(contaA, pedida.id);
    return { id, resultado, tarefa: Tarefa.parse(await casos.consultar(contaA, pedida.id)) };
  }

  it('roda o ciclo, grava o lote com autoria do Otto e leva a tarefa para revisão, com a fotografia completa', async () => {
    const { id, resultado, tarefa: t } = await pedirERodar();
    expect(resultado).toBe('feita');
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 1, versaoInicial: 1, versaoFinal: 2, resumo: 'Aumentei o título.', conferida: true, pranchetasNovas: [] });
    expect(t.tocados.length).toBeGreaterThan(0);
    expect(t.etapas.map((e) => e.etapa)).toEqual(['leitura', 'producao', 'conferencia', 'entrega']);
    const historico = (await pecas.historico(contaA, id, { limite: 5 })).itens;
    expect(historico[0]).toMatchObject({ versao: 2, autoria: 'agente', tarefaId: t.id, descricao: 'Título maior' });
    expect(bancada).toMatchObject({ abertas: 1, fechadas: 1 });
    expect(bancada.renders).toBeGreaterThan(0);
  });

  it('cada passo visível vira um evento gravado, em sequência, e a leitura retoma exatamente de onde parou', async () => {
    const { tarefa: t } = await pedirERodar();
    const { eventos } = await casos.eventos(contaA, t.id, -1);
    expect(eventos.map((e) => e.sequencia)).toEqual(eventos.map((_, i) => i));
    expect(t.ultimoEvento).toBe(eventos.length - 1);
    const tipos = eventos.map((e) => e.evento.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['etapas', 'etapa', 'lote', 'render', 'verificacao', 'entrega']));
    expect(tipos.at(-1)).toBe('entrega');
    // quem já viu até o 3 recebe do 4 em diante, nada antes e nada repetido
    const resto = await casos.eventos(contaA, t.id, 3);
    expect(resto.eventos.map((e) => e.sequencia)).toEqual(eventos.slice(4).map((e) => e.sequencia));
    expect(resto.tarefa.estado).toBe('em_revisao');
    expect((await casos.eventos(contaA, t.id, t.ultimoEvento)).eventos).toEqual([]);
  });

  it('cada chamada ao modelo deixa uma linha de custo e soma no contador do dia da plataforma', async () => {
    const { tarefa: t } = await pedirERodar();
    expect(tarefas.chamadas.filter((c) => c.tarefaId === t.id).map((c) => [c.sequencia, c.chamada.papel, c.chamada.resultado, c.chamada.uso.saida])).toEqual([
      [0, 'ajuste', 'ok', 50],
      [1, 'ajuste', 'ok', 20],
    ]);
    expect(await consumo.hoje(AGORA)).toEqual({ tokens: 10 + 900 + 100 + 50 + 5 + 1000 + 20, chamadas: 2 });
    // o custo não vai na fotografia da tarefa
    expect(JSON.stringify(t)).not.toMatch(/token|dolar|custo/i);
  });

  it('o custo fica gravado também quando a tarefa falha: sem lote, a tarefa falha com o código; com lote, o que foi feito vai para revisão', async () => {
    const semLote = await pedirERodar([{ papel: 'ajuste', erro: 'rede' }]);
    expect(semLote.tarefa).toMatchObject({ estado: 'falhou', fim: 'erro', erro: { codigo: 'rede' }, lotes: 0 });
    expect(tarefas.chamadas.filter((c) => c.tarefaId === semLote.tarefa.id).map((c) => c.chamada.resultado)).toEqual(['rede']);
    expect(await tarefas.vivaDoDocumento(contaA, semLote.id)).toBeUndefined();

    const comLote = await pedirERodar([aplicar(TITULO_MAIOR), { papel: 'ajuste', erro: 'rede' }]);
    expect(comLote.tarefa).toMatchObject({ estado: 'em_revisao', fim: 'erro', erro: { codigo: 'rede' }, lotes: 1, conferida: false });
    expect(tarefas.chamadas.filter((c) => c.tarefaId === comLote.tarefa.id).map((c) => c.chamada.resultado)).toEqual(['ok', 'rede']);
  });

  it('trabalho repetido não roda o ciclo duas vezes; com a conta trocada, não roda nenhuma', async () => {
    const id = await peca();
    modelos.roteiro([aplicar(TITULO_MAIOR), entregar()]);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    expect(await casos.trabalhar(contaB, pedida.id)).toBe('ignorada');
    expect(modelos.chamado.pedidos).toHaveLength(0);
    expect(await casos.trabalhar(contaA, pedida.id)).toBe('feita');
    expect(await casos.trabalhar(contaA, pedida.id)).toBe('ignorada');
    expect(modelos.chamado.pedidos).toHaveLength(2);
    expect((await pecas.abrir(contaA, id)).versao).toBe(2);
  });

  it('uma tarefa por vez por conta: com outra trabalhando, responde "ocupada" (a fila adia) e não chama o modelo', async () => {
    const [um, dois] = [await casos.criar(contaA, await peca(), AJUSTE), await casos.criar(contaA, await peca(), AJUSTE)];
    await tarefas.iniciar(contaA, um.id, AGORA);
    modelos.roteiro([aplicar(TITULO_MAIOR), entregar()]);
    expect(await casos.trabalhar(contaA, dois.id)).toBe('ocupada');
    expect(modelos.chamado.pedidos).toHaveLength(0);
    expect((await casos.consultar(contaA, dois.id)).estado).toBe('na_fila');
  });

  it('o que a tarefa deixa de pendência vira pendência da peça, aberta', async () => {
    const pendencia = { tipo: 'aviso_da_verificacao', texto: 'Contraste baixo no título', camadas: [] };
    const { id, tarefa: t } = await pedirERodar([aplicar(TITULO_MAIOR), entregar('Aumentei.', [pendencia])]);
    expect(t.pendencias).toHaveLength(1);
    const daPeca = (await casos.pendencias(contaA, id, 'aberta')).itens;
    expect(daPeca).toHaveLength(1);
    expect(daPeca[0]).toMatchObject({ tarefaId: t.id, tipo: 'aviso_da_verificacao', texto: 'Contraste baixo no título', origem: 'otto', estado: 'aberta' });
    expect((await casos.dispensar(contaA, daPeca[0]?.id as string)).estado).toBe('dispensada');
    expect((await casos.pendencias(contaA, id, 'aberta')).itens).toEqual([]);
    expect((await casos.reabrir(contaA, daPeca[0]?.id as string)).estado).toBe('aberta');
    expect((await erroDe(casos.dispensar(contaB, daPeca[0]?.id as string))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(casos.pendencias(contaB, id, 'aberta'))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('pedido que não cabe no ajuste: o Otto admite, não altera nada, e a tarefa termina sem nada para revisar', async () => {
    const { id, tarefa: t } = await pedirERodar([entregar('Isso não é um ajuste pontual.', [{ tipo: 'fora_do_ajuste', texto: 'Pede três pranchetas novas.', camadas: [] }])]);
    expect(t).toMatchObject({ estado: 'aceita', fim: 'entregue', lotes: 0 });
    expect(t.pendencias.map((p) => p.tipo)).toContain('fora_do_ajuste');
    expect((await pecas.abrir(contaA, id)).versao).toBe(1);
    expect(await tarefas.vivaDoDocumento(contaA, id)).toBeUndefined();
  });

  it('o registro de uso da tarefa terminada leva números e códigos, nunca o pedido nem o resumo', async () => {
    const { tarefa: t } = await pedirERodar();
    const terminada = uso.eventos.find((e) => e.evento === 'tarefa_terminada');
    expect(terminada).toMatchObject({ tarefaId: t.id, tipo: 'ajuste', estado: 'em_revisao', fim: 'entregue', lotes: 1, chamadas: 2, tokensDeSaida: 70, conferida: true });
    expect(JSON.stringify(uso.eventos)).not.toMatch(new RegExp(`${SENTINELA}|Aumentei|Título`));
  });
});

describe('o "pode", cumprido pelo servidor', () => {
  const BRIEFING = roteiroDoBriefing.entrada as EntradaDaTarefa;

  async function ateOPode() {
    const d = await pecas.criar(contaA, { nome: 'Novo horário' });
    modelos.roteiro(roteiroDoBriefing.passos as Passo[], roteiroDoBriefing.ids);
    const pedida = await casos.criar(contaA, d.id, BRIEFING);
    await casos.trabalhar(contaA, pedida.id);
    return { id: d.id, tarefaId: pedida.id };
  }

  it('tarefa de dois formatos: a primeira parte define a direção e o plano, guarda os dois e PARA, sem tocar na peça e sem trabalho na fila', async () => {
    const { id, tarefaId } = await ateOPode();
    const t = Tarefa.parse(await casos.consultar(contaA, tarefaId));
    expect(t.estado).toBe('aguardando_confirmacao');
    expect(t.confirmacao?.motivos).toEqual(['varias_pranchetas']);
    expect(t.confirmacao?.plano.criar.map((f) => f.nome)).toEqual(['Feed', 'Story']);
    expect(t.confirmacao?.cartao?.conceito).toContain('7h');
    expect((await pecas.abrir(contaA, id)).versao).toBe(0);
    expect(modelos.chamado.pedidos.map((p) => p.papel)).toEqual(['diretor']);
    expect(fila.publicados).toHaveLength(1);
    expect((await casos.eventos(contaA, tarefaId, -1)).eventos.map((e) => e.evento.tipo)).toEqual(expect.arrayContaining(['direcao', 'plano']));
  });

  it('sem o "pode", nada roda: entregar o trabalho de novo é ignorado, e a espera não tem prazo', async () => {
    const { id, tarefaId } = await ateOPode();
    expect(await casos.trabalhar(contaA, tarefaId)).toBe('ignorada');
    relogio = new Date(AGORA.getTime() + 30 * 86_400_000);
    expect((await casos.consultar(contaA, tarefaId)).estado).toBe('aguardando_confirmacao');
    expect((await casos.listar(contaA, id)).viva).toBe(tarefaId);
    expect(modelos.chamado.pedidos).toHaveLength(1);
    expect((await pecas.abrir(contaA, id)).versao).toBe(0);
  });

  it('com o "pode", a segunda parte entra na fila como outro trabalho, começa conversa nova e produz as duas pranchetas', async () => {
    const { id, tarefaId } = await ateOPode();
    const aprovada = await casos.aprovar(contaA, tarefaId);
    expect(aprovada.estado).toBe('na_fila');
    expect(fila.publicados.map((p) => p.trabalho.id)).toEqual([tarefaId, tarefaId]);
    expect(await casos.trabalhar(contaA, tarefaId)).toBe('feita');
    const t = Tarefa.parse(await casos.consultar(contaA, tarefaId));
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 5, conferida: true });
    expect((await arvoreDe(id)).pranchetas.map((p) => `${p.nome} ${p.largura}×${p.altura}`)).toEqual(['Feed 1080×1350', 'Story 1080×1920']);
    expect(t.pranchetasNovas).toHaveLength(2);
    expect(modelos.chamado.restantes()).toBe(0);
    expect(modelos.pedidos.map((p) => [p.parte, p.idsDoPreparo > 0])).toEqual([
      ['preparo', false],
      ['execucao', true],
    ]);
    // aprovar duas vezes não põe dois trabalhos
    expect((await erroDe(casos.aprovar(contaA, tarefaId))).codigo).toBe(CODIGOS_DE_ERRO.tarefaForaDoEstado);
  });

  it('"ajustar a direção": o texto é guardado, a primeira parte roda de novo com o ajuste e a tarefa volta a esperar', async () => {
    const { tarefaId } = await ateOPode();
    const vistos: unknown[] = [];
    const ciclo = await import('@otto/agente');
    montar({
      ciclo: {
        preparar: async (_amb, _entrada, opcoes) => {
          vistos.push(opcoes?.ajuste?.texto);
          if (!opcoes?.ajuste) throw new Error('esperava o ajuste');
          return { ...opcoes.ajuste.anterior, pedeConfirmacao: true };
        },
        executar: ciclo.executarTarefa,
      },
    });
    expect((await casos.ajustar(contaA, tarefaId, { texto: 'menos dourado' })).estado).toBe('na_fila');
    expect(fila.publicados).toHaveLength(2);
    await casos.trabalhar(contaA, tarefaId);
    expect(vistos).toEqual(['menos dourado']);
    expect((await casos.consultar(contaA, tarefaId)).estado).toBe('aguardando_confirmacao');
    expect((await tarefas.entradaDe(contaA, tarefaId))?.ajustes).toEqual(['menos dourado']);
  });

  it('cancelar no "pode": nada foi criado, a peça volta a ser editável e a tarefa fica cancelada', async () => {
    const { id, tarefaId } = await ateOPode();
    expect(await casos.cancelar(contaA, tarefaId)).toMatchObject({ estado: 'cancelada', fim: 'cancelada', lotes: 0 });
    expect((await pecas.aplicarLote(contaA, id, lote(0, [{ op: 'criarPrancheta', nome: 'Minha', largura: 100, altura: 100, fundo: '#ffffff' }]))).versao).toBe(1);
    expect(await casos.trabalhar(contaA, tarefaId)).toBe('ignorada');
  });

  it('a regra vale no servidor, não só no ciclo: um lote que cria prancheta além do plano, ou remove o que já existia, é recusado na porta', async () => {
    const id = await peca();
    const tentativas: unknown[] = [];
    const ciclo = await import('@otto/agente');
    montar({
      ciclo: {
        preparar: ciclo.prepararTarefa,
        // um ciclo que não respeita plano nenhum: manda os lotes direto para a porta
        executar: async (amb) => {
          tentativas.push(
            await amb.aplicarLote({ id: randomUUID(), descricao: 'cria prancheta', operacoes: [{ op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' }] }),
          );
          tentativas.push(await amb.aplicarLote({ id: randomUUID(), descricao: 'remove o selo', operacoes: [{ op: 'remover', alvo: 'Feed/Selo' }] }));
          tentativas.push(await amb.aplicarLote({ id: randomUUID(), descricao: 'dentro do ajuste', operacoes: TITULO_MAIOR }));
          return { fim: 'entregue', entrega: { resumo: 'feito', pendencias: [] }, conferida: false, lotes: 1, custo: ciclo.custoVazio('hostil') };
        },
      },
    });
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await casos.trabalhar(contaA, pedida.id);
    expect(tentativas.map((t) => (t as { ok: boolean }).ok)).toEqual([false, false, true]);
    expect(nomesDe(await arvoreDe(id))).toEqual(['Feed: Título, Selo']);
    expect((await pecas.abrir(contaA, id)).versao).toBe(2);
  });
});

describe('interromper, queda e desligamento', () => {
  const lento = (ms: number, passo: Passo): Passo => ({ ...(passo as object), duracaoMs: ms });

  async function rodandoDevagar(passos: Passo[]) {
    const id = await peca();
    modelos.roteiro(passos);
    // velocidade 1: o segundo passo demora de verdade
    const modelo = criarModeloRoteirizado({ passos }, { velocidade: 1 });
    montar({
      modelos: new (class extends ModelosDoOtto {
        abrir(): ModeloAberto {
          return { modelo, novoId: () => randomUUID() };
        }
      })(),
    });
    const pedida = await casos.criar(contaA, id, AJUSTE);
    const trabalho = casos.trabalhar(contaA, pedida.id);
    return { id, tarefaId: pedida.id, trabalho };
  }
  const ate = async (condicao: () => Promise<boolean>) => {
    for (let i = 0; i < 200 && !(await condicao()); i++) await new Promise((ok) => setTimeout(ok, 10));
  };

  it('interromper com lote já aplicado leva para revisão, com o que foi feito; a chamada ao modelo em curso é abortada', async () => {
    const { id, tarefaId, trabalho } = await rodandoDevagar([aplicar(TITULO_MAIOR), lento(5000, entregar())]);
    await ate(async () => (await casos.consultar(contaA, tarefaId)).lotes === 1);
    expect((await casos.cancelar(contaA, tarefaId)).estado).toBe('rodando');
    await trabalho;
    expect(await casos.consultar(contaA, tarefaId)).toMatchObject({ estado: 'em_revisao', fim: 'cancelada', lotes: 1, conferida: false });
    expect((await pecas.abrir(contaA, id)).versao).toBe(2);
  });

  it('interromper antes de qualquer lote: cancelada, e a peça fica livre', async () => {
    const { id, tarefaId, trabalho } = await rodandoDevagar([lento(5000, aplicar(TITULO_MAIOR)), entregar()]);
    await ate(async () => (await casos.consultar(contaA, tarefaId)).estado === 'rodando');
    await casos.cancelar(contaA, tarefaId);
    await trabalho;
    expect(await casos.consultar(contaA, tarefaId)).toMatchObject({ estado: 'cancelada', fim: 'cancelada', lotes: 0 });
    expect(await tarefas.vivaDoDocumento(contaA, id)).toBeUndefined();
  });

  it('desligamento do worker (deploy): a tarefa em curso é fechada como interrompida, com o parcial em revisão, sem esperar o fim dela', async () => {
    const { tarefaId, trabalho } = await rodandoDevagar([aplicar(TITULO_MAIOR), lento(60_000, entregar())]);
    await ate(async () => (await casos.consultar(contaA, tarefaId)).lotes === 1);
    const inicio = Date.now();
    await casos.interromperTudo();
    await trabalho;
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(await casos.consultar(contaA, tarefaId)).toMatchObject({ estado: 'em_revisao', fim: 'interrompida', lotes: 1 });
  });

  it('desligamento antes de qualquer lote: falha como interrompida ("não consegui começar"), e dá para tentar de novo', async () => {
    const { id, tarefaId, trabalho } = await rodandoDevagar([lento(60_000, aplicar(TITULO_MAIOR)), entregar()]);
    await ate(async () => (await casos.consultar(contaA, tarefaId)).estado === 'rodando');
    await casos.interromperTudo();
    await trabalho;
    expect(await casos.consultar(contaA, tarefaId)).toMatchObject({ estado: 'falhou', fim: 'interrompida', erro: { codigo: 'interrompida' } });
    expect(await tarefas.vivaDoDocumento(contaA, id)).toBeUndefined();
  });

  it('queda do worker (sem desligamento): quem consulta depois do tempo sem sinal de vida recebe a tarefa interrompida, não "rodando" para sempre', async () => {
    const id = await peca();
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await tarefas.iniciar(contaA, pedida.id, AGORA);
    await tarefas.registrarLote(contaA, pedida.id, ['n1']);
    relogio = new Date(AGORA.getTime() + SEM_SINAL_DA_TAREFA_MS - 1000);
    expect((await casos.consultar(contaA, pedida.id)).estado).toBe('preparando');
    relogio = new Date(AGORA.getTime() + SEM_SINAL_DA_TAREFA_MS + 1000);
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'em_revisao', fim: 'interrompida' });
  });
});

describe('o teto diário, no meio da tarefa', () => {
  it('antes de CADA chamada ao modelo o contador do dia é conferido: estourou no meio, a tarefa para com limite_diario e o que foi feito fica para revisão', async () => {
    montar({ limites: { tarefasPorDia: 6, naFilaPorConta: 3, tetoDiarioDeTokens: 1500, restoMinimoNoFornecedor: 0 } });
    const id = await peca();
    // a primeira chamada gasta 1060 tokens, a segunda passaria do teto de 1500? não: 1060 < 1500; a terceira não sai
    modelos.roteiro([aplicar(TITULO_MAIOR), aplicar([{ op: 'alterar', alvo: 'Feed/Título', props: { tamanho: 100 } }]), entregar()]);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await casos.trabalhar(contaA, pedida.id);
    const t = await casos.consultar(contaA, pedida.id);
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'erro', erro: { codigo: 'limite_diario' }, lotes: 2 });
    expect(modelos.chamado.pedidos).toHaveLength(2);
    expect(modelos.chamado.restantes()).toBe(1);
  });

  it('o teto pode ter estourado entre o pedido e o começo: a tarefa nem chama o modelo', async () => {
    const id = await peca();
    modelos.roteiro([aplicar(TITULO_MAIOR), entregar()]);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await consumo.somar(AGORA, 40_000_000);
    await casos.trabalhar(contaA, pedida.id);
    expect(await casos.consultar(contaA, pedida.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'limite_diario' } });
    expect(modelos.chamado.pedidos).toHaveLength(0);
  });
});

describe('revisão: aceitar, desfazer, descartar, tentar de novo', () => {
  async function emRevisao(passos: Passo[] = [aplicar(TITULO_MAIOR), entregar('Aumentei.', [{ tipo: 'outro', texto: 'Confira o contraste', camadas: [] }])]) {
    const id = await peca();
    modelos.roteiro(passos);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await casos.trabalhar(contaA, pedida.id);
    return { id, tarefaId: pedida.id };
  }

  it('em revisão a peça continua somente leitura, com o código de revisão; aceitar libera, e as pendências sobrevivem ao aceite', async () => {
    const { id, tarefaId } = await emRevisao();
    expect((await erroDe(pecas.aplicarLote(contaA, id, lote(2, [{ op: 'mover', alvo: 'Feed/Selo', x: 10, y: 10 }])))).codigo).toBe(CODIGOS_DE_ERRO.revisaoPendente);
    const aceita = Tarefa.parse(await casos.aceitar(contaA, tarefaId));
    expect(aceita).toMatchObject({ estado: 'aceita', edicoesDepois: 0 });
    expect(aceita.decididaEm).toBeDefined();
    expect((await pecas.aplicarLote(contaA, id, lote(2, [{ op: 'mover', alvo: 'Feed/Selo', x: 10, y: 10 }]))).versao).toBe(3);
    expect((await casos.pendencias(contaA, id, 'aberta')).itens).toHaveLength(1);
    expect((await erroDe(casos.aceitar(contaA, tarefaId))).codigo).toBe(CODIGOS_DE_ERRO.tarefaForaDoEstado);
    expect(uso.eventos.find((e) => e.evento === 'tarefa_decidida')).toMatchObject({ tarefaId, resultado: 'aceita' });
  });

  it('desfazer tudo: a peça volta ao que era antes da tarefa, num passo, a tarefa fica desfeita e as pendências dela fecham', async () => {
    const { id, tarefaId } = await emRevisao();
    const antes = (await casos.antes(contaA, tarefaId)).arvore;
    const r = await casos.desfazer(contaA, tarefaId, { incluirEdicoesPosteriores: false });
    expect(r.tarefa.estado).toBe('desfeita');
    expect(r.arvore).toEqual(antes);
    expect(r.versao).toBe(3);
    expect(await arvoreDe(id)).toEqual(antes);
    expect((await casos.pendencias(contaA, id, 'aberta')).itens).toEqual([]);
    expect(await tarefas.vivaDoDocumento(contaA, id)).toBeUndefined();
    expect((await erroDe(casos.desfazer(contaA, tarefaId, { incluirEdicoesPosteriores: false }))).codigo).toBe(CODIGOS_DE_ERRO.tarefaForaDoEstado);
  });

  it('"voltar para antes desta tarefa" depois de aceita: se o designer editou depois, é recusado dizendo quantas edições vão junto; confirmando, volta tudo', async () => {
    const { id, tarefaId } = await emRevisao();
    await casos.aceitar(contaA, tarefaId);
    await pecas.aplicarLote(contaA, id, lote(2, [{ op: 'mover', alvo: 'Feed/Selo', x: 10, y: 10 }]));
    expect((await casos.consultar(contaA, tarefaId)).edicoesDepois).toBe(1);
    expect(await erroDe(casos.desfazer(contaA, tarefaId, { incluirEdicoesPosteriores: false }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.editadoDepois, detalhe: { edicoes: 1 } });
    expect((await pecas.abrir(contaA, id)).versao).toBe(3);
    const r = await casos.desfazer(contaA, tarefaId, { incluirEdicoesPosteriores: true });
    expect(nomesDe(r.arvore)).toEqual(['Feed: Título, Selo']);
    expect(r.tarefa.estado).toBe('desfeita');
  });

  it('desfazer é recusado enquanto a tarefa ainda anda, e em tarefa que não alterou nada', async () => {
    const id = await peca();
    const pedida = await casos.criar(contaA, id, AJUSTE);
    expect(await erroDe(casos.desfazer(contaA, pedida.id, { incluirEdicoesPosteriores: false }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.tarefaForaDoEstado, detalhe: { estado: 'na_fila' } });
  });

  it('descartar por prancheta: tira uma prancheta que a tarefa criou e o resto fica; a que já existia não se descarta; aceitar depois registra "aceita em parte"', async () => {
    const id = await peca();
    const tentativas: unknown[] = [];
    const ciclo = await import('@otto/agente');
    montar({
      ciclo: {
        preparar: async () => ({
          versao: 1,
          direcao: null,
          cartao: null,
          plano: { resumo: '', criar: [{ nome: 'Story', largura: 1080, altura: 1920 }], alterar: [], remover: [], pontual: false },
          pedeConfirmacao: false,
          motivos: [],
          custo: ciclo.custoVazio('x'),
        }),
        executar: async (amb) => {
          tentativas.push(await amb.aplicarLote({ id: randomUUID(), descricao: 'Story', operacoes: [{ op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' }] }));
          return { fim: 'entregue', entrega: { resumo: 'Criei o Story.', pendencias: [] }, conferida: true, lotes: 1, custo: ciclo.custoVazio('x') };
        },
      },
    });
    const pedida = await casos.criar(contaA, id, { tipo: 'pedido', pedido: 'adapta para Story' });
    await casos.trabalhar(contaA, pedida.id);
    const t = await casos.consultar(contaA, pedida.id);
    expect(t.pranchetasNovas).toHaveLength(1);
    const feed = (await arvoreDe(id)).pranchetas[0]?.id as string;
    expect((await erroDe(casos.descartar(contaA, pedida.id, { pranchetaId: feed }))).codigo).toBe(CODIGOS_DE_ERRO.pranchetaNaoDescartavel);
    const r = await casos.descartar(contaA, pedida.id, { pranchetaId: t.pranchetasNovas?.[0] as string });
    expect(r.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
    expect(r.tarefa).toMatchObject({ estado: 'em_revisao', pranchetasNovas: [] });
    await casos.aceitar(contaA, pedida.id);
    expect(uso.eventos.at(-1)).toMatchObject({ evento: 'tarefa_decidida', resultado: 'aceita_em_parte' });
    // o descarte é parte da revisão da tarefa: não conta como edição do designer depois dela, e voltar não pede confirmação
    expect((await casos.consultar(contaA, pedida.id)).edicoesDepois).toBe(0);
    const desfeita = await casos.desfazer(contaA, pedida.id, { incluirEdicoesPosteriores: false });
    expect(desfeita.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('"tentar de novo": desfaz o parcial e pede outra tarefa com a mesma entrada', async () => {
    const { id, tarefaId } = await emRevisao([aplicar(TITULO_MAIOR), { papel: 'ajuste', erro: 'rede' }]);
    const nova = Tarefa.parse(await casos.tentarDeNovo(contaA, tarefaId));
    expect(nova.id).not.toBe(tarefaId);
    expect(nova).toMatchObject({ estado: 'na_fila', tipo: 'ajuste', entrada: AJUSTE, versaoInicial: 3 });
    expect((await casos.consultar(contaA, tarefaId)).estado).toBe('desfeita');
    expect(nomesDe(await arvoreDe(id))).toEqual(['Feed: Título, Selo']);
    expect(fila.publicados.at(-1)?.trabalho.id).toBe(nova.id);
    // em tarefa entregue e ainda em revisão, "tentar de novo" não vale: é aceitar ou desfazer
    const entregue = await emRevisao();
    expect((await erroDe(casos.tentarDeNovo(contaA, entregue.tarefaId))).codigo).toBe(CODIGOS_DE_ERRO.tarefaForaDoEstado);
  });
});

describe('isolamento entre contas', () => {
  it('com o escopo de outra conta, a tarefa não existe para nenhuma ação, e nada muda', async () => {
    const id = await peca();
    modelos.roteiro([aplicar(TITULO_MAIOR), entregar()]);
    const pedida = await casos.criar(contaA, id, AJUSTE);
    await casos.trabalhar(contaA, pedida.id);
    const antes = await casos.consultar(contaA, pedida.id);
    for (const tentar of [
      () => casos.consultar(contaB, pedida.id),
      () => casos.eventos(contaB, pedida.id, -1),
      () => casos.antes(contaB, pedida.id),
      () => casos.aprovar(contaB, pedida.id),
      () => casos.ajustar(contaB, pedida.id, { texto: 'x' }),
      () => casos.cancelar(contaB, pedida.id),
      () => casos.aceitar(contaB, pedida.id),
      () => casos.desfazer(contaB, pedida.id, { incluirEdicoesPosteriores: true }),
      () => casos.descartar(contaB, pedida.id, { pranchetaId: 'p' }),
      () => casos.tentarDeNovo(contaB, pedida.id),
      () => casos.listar(contaB, id),
    ]) {
      expect((await erroDe(tentar())).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    }
    expect(await casos.consultar(contaA, pedida.id)).toEqual(antes);
  });
});
