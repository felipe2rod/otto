// Contrato da porta RepositorioDeTarefas, contra o adaptador do banco e o falso (ADR 020, ADR 023).
import { randomUUID } from 'node:crypto';
import type { ChamadaRegistrada, EntradaDaTarefa, Preparo } from '@otto/agente';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { RepositorioDeTarefas, TarefaGuardada } from './repositorio-de-tarefas';

export interface RepositorioDeTarefasSobTeste {
  repositorio: RepositorioDeTarefas;
  contaA: EscopoDaConta;
  contaB: EscopoDaConta;
  /** Cria um documento na conta, já com `versao` lotes gravados, e devolve o id. */
  criarDocumento(escopo: EscopoDaConta, versao?: number): Promise<string>;
  /** Cria um briefing salvo na conta e devolve o id. Só o adaptador do banco precisa (a chave estrangeira confere). */
  criarBriefing?(escopo: EscopoDaConta): Promise<string>;
}

const AGORA = new Date('2026-10-03T12:00:00.000Z');
const depois = (segundos: number) => new Date(AGORA.getTime() + segundos * 1000);
const PEDIDO: EntradaDaTarefa = { tipo: 'pedido', pedido: 'adapta para Story' };
const CUSTO = {
  modelo: 'roteiro',
  chamadas: 1,
  tokens: { entrada: 10, cacheLido: 0, cacheCriado: 0, saida: 5 },
  porPapel: {},
  imagensVistas: 0,
  voltasDeConferencia: 0,
  lotes: 0,
  lotesRecusados: 0,
  duracaoMs: 100,
  dolares: null,
};
const PREPARO: Preparo = {
  versao: 1,
  direcao: null,
  cartao: null,
  plano: { resumo: 'Crio o Story.', criar: [{ nome: 'Story', largura: 1080, altura: 1920 }], alterar: [], remover: [], pontual: false },
  pedeConfirmacao: true,
  motivos: ['varias_pranchetas'],
  custo: CUSTO,
};
const CHAMADA: ChamadaRegistrada = { papel: 'agente', modelo: 'roteiro', uso: { entrada: 100, cacheLido: 900, cacheCriado: 50, saida: 30 }, duracaoMs: 1200, imagens: 2, resultado: 'ok' };
const LIMITE = { naFilaPorConta: 3 };

export function contratoDoRepositorioDeTarefas(nome: string, criar: () => Promise<RepositorioDeTarefasSobTeste>): void {
  describe(`contrato de RepositorioDeTarefas: ${nome}`, () => {
    let sob: RepositorioDeTarefasSobTeste;
    let r: RepositorioDeTarefas;

    beforeAll(async () => {
      sob = await criar();
      r = sob.repositorio;
    });

    /** Uma tarefa nova numa peça nova da conta. */
    const nova = async (escopo: EscopoDaConta, extra: { documentoId?: string; entrada?: EntradaDaTarefa; criadaEm?: Date; versao?: number } = {}): Promise<TarefaGuardada> => {
      const documentoId = extra.documentoId ?? (await sob.criarDocumento(escopo, extra.versao ?? 0));
      const criada = await r.criar(escopo, { id: randomUUID(), documentoId, entrada: extra.entrada ?? PEDIDO, criadaEm: extra.criadaEm ?? AGORA }, { naFilaPorConta: 50 });
      if (!('tarefa' in criada)) throw new Error(`a tarefa de teste não foi criada: ${JSON.stringify(criada)}`);
      return criada.tarefa;
    };
    /** Fecha a tarefa, para ela não segurar a conta nem a peça nos testes seguintes. */
    const encerrar = async (escopo: EscopoDaConta, id: string) => {
      await r.pedirCancelamento(escopo, id, AGORA);
      await r.concluir(escopo, id, { estado: 'cancelada', fim: 'cancelada', agora: AGORA });
    };

    it('nasce na fila, na fase de preparo, com a versão da peça naquele instante e a entrada guardada à parte', async () => {
      const t = await nova(sob.contaA, { versao: 3, entrada: { tipo: 'criar', pedido: 'cartaz de jazz', esforco: 'REFINED' } });
      expect(t).toMatchObject({ tipo: 'criar', esforco: 'REFINED', estado: 'na_fila', fase: 'preparo', versaoInicial: 3, lotes: 0, tocados: [], etapas: [], ultimoEvento: -1, chamadas: 0 });
      expect(t.consumo).toEqual({ tokensDeEntrada: 0, tokensDeCacheLidos: 0, tokensDeCacheCriados: 0, tokensDeSaida: 0, imagens: 0 });
      expect(await r.buscar(sob.contaA, t.id)).toEqual(t);
      expect(await r.entradaDe(sob.contaA, t.id)).toEqual({ entrada: { tipo: 'criar', pedido: 'cartaz de jazz', esforco: 'REFINED' }, ajustes: [] });
      expect(await r.buscar(sob.contaA, randomUUID())).toBeUndefined();
      expect(await r.buscar(sob.contaA, 'não-é-uuid')).toBeUndefined();
      await encerrar(sob.contaA, t.id);
    });

    it('uma tarefa viva por peça: a segunda é recusada, dizendo qual está viva; depois de encerrada a primeira, outra entra', async () => {
      const primeira = await nova(sob.contaA);
      const segunda = await r.criar(sob.contaA, { id: randomUUID(), documentoId: primeira.documentoId, entrada: PEDIDO, criadaEm: AGORA }, { naFilaPorConta: 50 });
      expect(segunda).toEqual({ recusa: 'viva', viva: { id: primeira.id, estado: 'na_fila' } });
      expect((await r.vivaDoDocumento(sob.contaA, primeira.documentoId))?.id).toBe(primeira.id);
      expect((await r.vivasDaConta(sob.contaA)).get(primeira.documentoId)).toEqual({ id: primeira.id, estado: 'na_fila' });
      await encerrar(sob.contaA, primeira.id);
      expect(await r.vivaDoDocumento(sob.contaA, primeira.documentoId)).toBeUndefined();
      const terceira = await r.criar(sob.contaA, { id: randomUUID(), documentoId: primeira.documentoId, entrada: PEDIDO, criadaEm: AGORA }, { naFilaPorConta: 50 });
      expect('tarefa' in terceira).toBe(true);
      if ('tarefa' in terceira) await encerrar(sob.contaA, terceira.tarefa.id);
    });

    it('de doze pedidos simultâneos na mesma peça, entra um só', async () => {
      const documentoId = await sob.criarDocumento(sob.contaA);
      const resultados = await Promise.all(Array.from({ length: 12 }, () => r.criar(sob.contaA, { id: randomUUID(), documentoId, entrada: PEDIDO, criadaEm: AGORA }, { naFilaPorConta: 50 })));
      const criadas = resultados.flatMap((x) => ('tarefa' in x ? [x.tarefa] : []));
      expect(criadas).toHaveLength(1);
      expect(resultados.filter((x) => 'recusa' in x && x.recusa === 'viva')).toHaveLength(11);
      await encerrar(sob.contaA, criadas[0]?.id as string);
    });

    it('documento de outra conta, ou que não existe: recusa "documento", e nada é criado', async () => {
      const deB = await sob.criarDocumento(sob.contaB);
      expect(await r.criar(sob.contaA, { id: randomUUID(), documentoId: deB, entrada: PEDIDO, criadaEm: AGORA }, LIMITE)).toEqual({ recusa: 'documento' });
      expect(await r.criar(sob.contaA, { id: randomUUID(), documentoId: randomUUID(), entrada: PEDIDO, criadaEm: AGORA }, LIMITE)).toEqual({ recusa: 'documento' });
      expect(await r.vivaDoDocumento(sob.contaB, deB)).toBeUndefined();
    });

    it('limite de tarefas esperando ou trabalhando por conta, e a posição da conta na fila', async () => {
      const { contaA: conta } = await criar();
      const posicoes: number[] = [];
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const c = await r.criar(conta, { id: randomUUID(), documentoId: await sob.criarDocumento(conta), entrada: PEDIDO, criadaEm: AGORA }, LIMITE);
        if ('tarefa' in c) {
          posicoes.push(c.jaNaFila);
          ids.push(c.tarefa.id);
        }
      }
      expect(posicoes).toEqual([0, 1, 2]);
      expect(await r.contarNaFila(conta)).toBe(3);
      expect(await r.criar(conta, { id: randomUUID(), documentoId: await sob.criarDocumento(conta), entrada: PEDIDO, criadaEm: AGORA }, LIMITE)).toEqual({ recusa: 'limite' });
      expect(await r.contarCriadasDesde(conta, depois(-60))).toBe(3);
      expect(await r.contarCriadasDesde(conta, depois(60))).toBe(0);
      for (const id of ids) await encerrar(conta, id);
    });

    it('escopo trocado: a conta B não acha, não inicia, não aprova, não cancela, não grava evento nem conclui tarefa da conta A', async () => {
      const t = await nova(sob.contaA);
      expect(await r.buscar(sob.contaB, t.id)).toBeUndefined();
      expect(await r.entradaDe(sob.contaB, t.id)).toBeUndefined();
      expect(await r.iniciar(sob.contaB, t.id, AGORA)).toEqual({ resultado: 'ignorada' });
      expect(await r.aprovar(sob.contaB, t.id, AGORA)).toBeUndefined();
      expect(await r.pedirCancelamento(sob.contaB, t.id, AGORA)).toBeUndefined();
      await r.registrarEvento(sob.contaB, t.id, { tipo: 'mensagem', texto: 'invasão' }, AGORA).catch(() => undefined);
      expect(await r.concluir(sob.contaB, t.id, { estado: 'falhou', fim: 'erro', agora: AGORA })).toBe(false);
      expect(await r.eventosDepois(sob.contaB, t.id, -1, 10)).toEqual([]);
      expect(await r.listarDoDocumento(sob.contaB, t.documentoId, 10)).toEqual([]);
      expect(await r.buscar(sob.contaA, t.id)).toMatchObject({ estado: 'na_fila', ultimoEvento: -1 });
      await encerrar(sob.contaA, t.id);
    });

    it('iniciar: na_fila vira preparando uma vez só; uma tarefa trabalhando por conta; a de outra conta não espera', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const [um, dois, deOutra] = [await nova(conta), await nova(conta), await nova(outra)];
      const inicio = await r.iniciar(conta, um.id, AGORA);
      expect(inicio).toMatchObject({ resultado: 'iniciada', tarefa: { id: um.id, estado: 'preparando', fase: 'preparo' } });
      expect(await r.iniciar(conta, um.id, AGORA)).toEqual({ resultado: 'ignorada' });
      expect(await r.iniciar(conta, dois.id, AGORA)).toEqual({ resultado: 'ocupada' });
      expect((await r.iniciar(outra, deOutra.id, AGORA)).resultado).toBe('iniciada');
      await encerrar(conta, um.id);
      expect((await r.iniciar(conta, dois.id, AGORA)).resultado).toBe('iniciada');
      await encerrar(conta, dois.id);
      await encerrar(outra, deOutra.id);
    });

    it('o "pode": o preparo é guardado e a tarefa espera sem trabalhar; aprovar a põe na fila da execução; iniciar de novo a põe para rodar', async () => {
      const { contaA: conta } = await criar();
      const t = await nova(conta);
      await r.iniciar(conta, t.id, AGORA);
      expect(await r.guardarPreparo(conta, t.id, { preparo: PREPARO, idsDoPreparo: 2, seguir: 'aguardar', agora: depois(5) })).toBe(true);
      const esperando = await r.buscar(conta, t.id);
      expect(esperando).toMatchObject({ estado: 'aguardando_confirmacao', preparo: PREPARO, idsDoPreparo: 2 });
      // esperando, não ocupa a conta e não é entregue a worker nenhum
      expect(await r.contarNaFila(conta)).toBe(0);
      expect(await r.iniciar(conta, t.id, depois(6))).toEqual({ resultado: 'ignorada' });
      expect(await r.aprovar(conta, t.id, depois(600))).toEqual({ jaNaFila: 0 });
      expect(await r.aprovar(conta, t.id, depois(601))).toBeUndefined();
      expect(await r.buscar(conta, t.id)).toMatchObject({ estado: 'na_fila', fase: 'execucao' });
      const rodando = await r.iniciar(conta, t.id, depois(602));
      expect(rodando).toMatchObject({ resultado: 'iniciada', tarefa: { estado: 'rodando', fase: 'execucao', preparo: PREPARO } });
      expect((await r.buscar(conta, t.id))?.iniciadaEm?.toISOString()).toBe(depois(602).toISOString());
      await encerrar(conta, t.id);
    });

    it('sem pedir o "pode", o preparo leva direto à execução, no mesmo trabalho', async () => {
      const { contaA: conta } = await criar();
      const t = await nova(conta);
      await r.iniciar(conta, t.id, AGORA);
      await r.guardarPreparo(conta, t.id, { preparo: { ...PREPARO, pedeConfirmacao: false, motivos: [] }, idsDoPreparo: 1, seguir: 'executar', agora: depois(2) });
      expect(await r.buscar(conta, t.id)).toMatchObject({ estado: 'rodando', fase: 'execucao' });
      await encerrar(conta, t.id);
    });

    it('"ajustar a direção": volta para a fila do preparo e guarda o texto do ajuste, na ordem', async () => {
      const { contaA: conta } = await criar();
      const t = await nova(conta);
      await r.iniciar(conta, t.id, AGORA);
      await r.guardarPreparo(conta, t.id, { preparo: PREPARO, idsDoPreparo: 2, seguir: 'aguardar', agora: AGORA });
      expect(await r.pedirAjuste(conta, t.id, 'menos dourado', AGORA)).toEqual({ jaNaFila: 0 });
      expect(await r.buscar(conta, t.id)).toMatchObject({ estado: 'na_fila', fase: 'preparo' });
      expect((await r.entradaDe(conta, t.id))?.ajustes).toEqual(['menos dourado']);
      expect(await r.pedirAjuste(conta, t.id, 'outro', AGORA)).toBeUndefined();
      await encerrar(conta, t.id);
    });

    it('cancelar: na fila ou no "pode" fecha na hora; trabalhando, marca o pedido e o sinal de vida avisa o worker; já encerrada, fica como está', async () => {
      const { contaA: conta } = await criar();
      const naFila = await nova(conta);
      expect(await r.pedirCancelamento(conta, naFila.id, AGORA)).toBe('cancelada');
      expect(await r.buscar(conta, naFila.id)).toMatchObject({ estado: 'cancelada', fim: 'cancelada' });
      expect(await r.pedirCancelamento(conta, naFila.id, AGORA)).toBe('fora');

      const trabalhando = await nova(conta);
      await r.iniciar(conta, trabalhando.id, AGORA);
      expect(await r.bater(conta, trabalhando.id, depois(2))).toEqual({ cancelamentoPedido: false });
      expect(await r.pedirCancelamento(conta, trabalhando.id, depois(3))).toBe('pedido');
      expect(await r.bater(conta, trabalhando.id, depois(4))).toEqual({ cancelamentoPedido: true });
      expect((await r.buscar(conta, trabalhando.id))?.estado).toBe('preparando');
      await r.concluir(conta, trabalhando.id, { estado: 'cancelada', fim: 'cancelada', agora: depois(5) });
    });

    it('eventos: a sequência cresce de um em um, a tarefa sabe a última, e a leitura retoma de onde parou', async () => {
      const t = await nova(sob.contaA);
      const sequencias = [];
      for (const texto of ['um', 'dois', 'três']) sequencias.push(await r.registrarEvento(sob.contaA, t.id, { tipo: 'mensagem', texto }, AGORA));
      expect(sequencias).toEqual([0, 1, 2]);
      expect((await r.buscar(sob.contaA, t.id))?.ultimoEvento).toBe(2);
      expect((await r.eventosDepois(sob.contaA, t.id, -1, 10)).map((e) => [e.sequencia, e.evento])).toEqual([
        [0, { tipo: 'mensagem', texto: 'um' }],
        [1, { tipo: 'mensagem', texto: 'dois' }],
        [2, { tipo: 'mensagem', texto: 'três' }],
      ]);
      expect((await r.eventosDepois(sob.contaA, t.id, 0, 10)).map((e) => e.sequencia)).toEqual([1, 2]);
      expect((await r.eventosDepois(sob.contaA, t.id, -1, 2)).map((e) => e.sequencia)).toEqual([0, 1]);
      expect(await r.eventosDepois(sob.contaA, t.id, 2, 10)).toEqual([]);
      await encerrar(sob.contaA, t.id);
    });

    it('custo: cada chamada ao modelo soma nos totais da tarefa na hora, inclusive a que falhou', async () => {
      const t = await nova(sob.contaA);
      await r.registrarChamada(sob.contaA, t.id, CHAMADA, AGORA);
      await r.registrarChamada(sob.contaA, t.id, { ...CHAMADA, papel: 'revisor', resultado: 'rede', uso: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 } }, depois(1));
      expect((await r.buscar(sob.contaA, t.id))?.chamadas).toBe(2);
      await encerrar(sob.contaA, t.id);
    });

    it('etapa, lotes e conclusão: a tarefa com lote vai para revisão, com como parou, a entrega e a versão final', async () => {
      const { contaA: conta } = await criar();
      const t = await nova(conta, { versao: 2 });
      await r.iniciar(conta, t.id, AGORA);
      await r.guardarPreparo(conta, t.id, { preparo: { ...PREPARO, pedeConfirmacao: false }, idsDoPreparo: 0, seguir: 'executar', agora: AGORA });
      await r.atualizarEtapa(conta, t.id, { etapas: [{ etapa: 'leitura' }, { etapa: 'producao', prancheta: { nome: 'Story' } }] });
      await r.atualizarEtapa(conta, t.id, { etapa: { etapa: 'producao', prancheta: { nome: 'Story' } } });
      await r.registrarLote(conta, t.id, ['n1', 'n2']);
      await r.registrarLote(conta, t.id, ['n2', 'n3']);
      expect(await r.buscar(conta, t.id)).toMatchObject({
        lotes: 2,
        tocados: ['n1', 'n2', 'n3'],
        etapa: { etapa: 'producao' },
        etapas: [{ etapa: 'leitura' }, { etapa: 'producao', prancheta: { nome: 'Story' } }],
      });
      const entrega = { resumo: 'Montei o Story.', pendencias: [] };
      expect(
        await r.concluir(conta, t.id, { estado: 'em_revisao', fim: 'limite_de_tempo', entrega, conferida: false, versaoFinal: 4, custo: { ...CUSTO, duracaoMs: 61_000 }, agora: depois(70) }),
      ).toBe(true);
      const fim = await r.buscar(conta, t.id);
      expect(fim).toMatchObject({ estado: 'em_revisao', fim: 'limite_de_tempo', entrega, conferida: false, versaoFinal: 4, duracaoMs: 61_000 });
      expect(fim?.terminadaEm?.toISOString()).toBe(depois(70).toISOString());
      // concluir de novo não muda nada; em revisão a peça continua com tarefa viva, mas a conta está livre
      expect(await r.concluir(conta, t.id, { estado: 'falhou', fim: 'erro', agora: depois(80) })).toBe(false);
      expect((await r.vivaDoDocumento(conta, t.documentoId))?.estado).toBe('em_revisao');
      expect(await r.contarNaFila(conta)).toBe(0);

      expect(await r.decidir(conta, t.id, { de: ['em_revisao'], para: 'aceita', resultado: 'aceita', agora: depois(90) })).toBe(true);
      expect(await r.decidir(conta, t.id, { de: ['em_revisao'], para: 'desfeita', resultado: 'desfeita', agora: depois(91) })).toBe(false);
      expect(await r.buscar(conta, t.id)).toMatchObject({ estado: 'aceita' });
      expect(await r.vivaDoDocumento(conta, t.documentoId)).toBeUndefined();
    });

    it('worker que caiu: a tarefa trabalhando sem sinal de vida vai para revisão se já gravou lote, e falha se não gravou; a conta volta a andar', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const comLote = await nova(conta, { versao: 1 });
      await r.iniciar(conta, comLote.id, AGORA);
      await r.registrarLote(conta, comLote.id, ['n1']);
      const viva = await nova(outra);
      await r.iniciar(outra, viva.id, AGORA);

      expect(await r.darBaixaNasParadas(conta, depois(30), depois(-60))).toEqual([]);
      const fechadas = await r.darBaixaNasParadas(conta, depois(120), depois(60));
      expect(fechadas.map((t) => [t.id, t.estado, t.fim])).toEqual([[comLote.id, 'em_revisao', 'interrompida']]);
      expect((await r.buscar(conta, comLote.id))?.versaoFinal).toBe(1);
      // a baixa é da conta do escopo: a tarefa da outra conta, tão parada quanto, continua como estava
      expect((await r.buscar(outra, viva.id))?.estado).toBe('preparando');

      const semLote = await nova(conta);
      await r.iniciar(conta, semLote.id, depois(130));
      await r.bater(conta, semLote.id, depois(140));
      expect(await r.darBaixaNasParadas(conta, depois(150), depois(135))).toEqual([]);
      expect((await r.darBaixaNasParadas(conta, depois(400), depois(340))).map((t) => [t.estado, t.fim, t.erroCodigo])).toEqual([['falhou', 'interrompida', 'interrompida']]);
      await encerrar(outra, viva.id);
    });

    it('a lista de vivas da conta diz como o trabalho parou: em revisão sem ter entregue, a tarefa não terminou', async () => {
      const t = await nova(sob.contaA);
      expect((await r.vivasDaConta(sob.contaA)).get(t.documentoId)).toEqual({ id: t.id, estado: 'na_fila' });
      await r.iniciar(sob.contaA, t.id, AGORA);
      await r.guardarPreparo(sob.contaA, t.id, { preparo: { ...PREPARO, pedeConfirmacao: false }, idsDoPreparo: 0, seguir: 'executar', agora: AGORA });
      await r.registrarLote(sob.contaA, t.id, ['n1']);
      await r.concluir(sob.contaA, t.id, { estado: 'em_revisao', fim: 'interrompida', agora: depois(5) });
      expect((await r.vivasDaConta(sob.contaA)).get(t.documentoId)).toEqual({ id: t.id, estado: 'em_revisao', fim: 'interrompida' });
      expect((await r.vivaDoDocumento(sob.contaA, t.documentoId))?.fim).toBe('interrompida');
      await r.decidir(sob.contaA, t.id, { de: ['em_revisao'], para: 'desfeita', resultado: 'desfeita', agora: depois(6) });
    });

    it('a tarefa parada na fila (o trabalho se perdeu) é devolvida à fila uma vez por intervalo, e só a que está na fila', async () => {
      const { contaA: conta } = await criar();
      const parada = await nova(conta, { criadaEm: AGORA });
      expect(parada.enfileiradaEm).toEqual(AGORA);
      // ainda não passou o intervalo
      expect(await r.devolverAFila(conta, depois(-1), depois(10))).toEqual([]);
      expect(await r.devolverAFila(conta, depois(60), depois(120))).toEqual([{ id: parada.id, jaNaFila: 0 }]);
      // devolvida agora: a próxima varredura, dentro do intervalo, não a devolve de novo
      expect(await r.devolverAFila(conta, depois(60), depois(125))).toEqual([]);
      expect((await r.buscar(conta, parada.id))?.enfileiradaEm).toEqual(depois(120));
      // trabalhando, no "pode" ou encerrada: não é da fila
      await r.iniciar(conta, parada.id, depois(130));
      expect(await r.devolverAFila(conta, depois(1000), depois(1001))).toEqual([]);
      await r.guardarPreparo(conta, parada.id, { preparo: PREPARO, idsDoPreparo: 0, seguir: 'aguardar', agora: depois(131) });
      expect(await r.devolverAFila(conta, depois(1000), depois(1001))).toEqual([]);
      // aprovada, volta para a fila com a hora da aprovação
      await r.aprovar(conta, parada.id, depois(2000));
      expect((await r.buscar(conta, parada.id))?.enfileiradaEm).toEqual(depois(2000));
      expect(await r.devolverAFila(conta, depois(2060), depois(2061))).toEqual([{ id: parada.id, jaNaFila: 0 }]);
      // de outra conta, nada
      expect(await r.devolverAFila(sob.contaB, depois(99_999), depois(100_000))).toEqual([]);
      await encerrar(conta, parada.id);
    });

    it('lista as tarefas em andamento da conta, na ordem em que vão ser atendidas: a que trabalha, depois as da fila por ordem de chegada', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const primeira = await nova(conta, { criadaEm: AGORA });
      const segunda = await nova(conta, { criadaEm: depois(10) });
      const terceira = await nova(conta, { criadaEm: depois(20) });
      await nova(outra, { criadaEm: depois(5) });
      await r.iniciar(conta, segunda.id, depois(30));
      expect((await r.emAndamentoDaConta(conta)).map((t) => [t.id, t.estado])).toEqual([
        [segunda.id, 'preparando'],
        [primeira.id, 'na_fila'],
        [terceira.id, 'na_fila'],
      ]);
      // a que espera o "pode" e a que está em revisão não estão na frente de ninguém
      await r.guardarPreparo(conta, segunda.id, { preparo: PREPARO, idsDoPreparo: 0, seguir: 'aguardar', agora: depois(31) });
      expect((await r.emAndamentoDaConta(conta)).map((t) => t.id)).toEqual([primeira.id, terceira.id]);
      for (const t of [primeira, segunda, terceira]) await encerrar(conta, t.id);
      expect(await r.emAndamentoDaConta(conta)).toEqual([]);
    });

    it('guarda o briefing salvo de onde a tarefa partiu', async () => {
      const documentoId = await sob.criarDocumento(sob.contaA, 0);
      const briefingId = sob.criarBriefing ? await sob.criarBriefing(sob.contaA) : randomUUID();
      const criada = await r.criar(sob.contaA, { id: randomUUID(), documentoId, entrada: PEDIDO, briefingId, criadaEm: AGORA }, { naFilaPorConta: 50 });
      if (!('tarefa' in criada)) throw new Error('não criou');
      expect(criada.tarefa.briefingId).toBe(briefingId);
      expect((await r.buscar(sob.contaA, criada.tarefa.id))?.briefingId).toBe(briefingId);
      await encerrar(sob.contaA, criada.tarefa.id);
    });

    it('lista as tarefas de uma peça, da mais nova para a mais velha', async () => {
      const documentoId = await sob.criarDocumento(sob.contaA);
      const velha = await nova(sob.contaA, { documentoId, criadaEm: depois(-3600) });
      await encerrar(sob.contaA, velha.id);
      const recente = await nova(sob.contaA, { documentoId, criadaEm: depois(-60) });
      expect((await r.listarDoDocumento(sob.contaA, documentoId, 10)).map((t) => t.id)).toEqual([recente.id, velha.id]);
      expect((await r.listarDoDocumento(sob.contaA, documentoId, 1)).map((t) => t.id)).toEqual([recente.id]);
      await encerrar(sob.contaA, recente.id);
    });

    it('pendências da peça: nascem abertas, o designer dispensa e reabre, e as de uma tarefa desfeita fecham juntas; outra conta não vê nem mexe', async () => {
      const t = await nova(sob.contaA);
      const [p1, p2] = [randomUUID(), randomUUID()];
      await r.criarPendencias(
        sob.contaA,
        t,
        [
          { id: p1, tipo: 'resolucao_da_imagem', texto: 'Foto ampliada 140%', camadas: ['n3'], prancheta: 'p2', origem: 'otto' },
          { id: p2, tipo: 'aviso_da_verificacao', texto: 'Contraste baixo', camadas: ['n1'], origem: 'verificacao', regra: 'contraste', gravidade: 'aviso' },
        ],
        AGORA,
      );
      const abertas = await r.listarPendencias(sob.contaA, t.documentoId, 'aberta');
      expect(abertas.map((p) => [p.id, p.tipo, p.estado, p.tarefaId]).sort()).toEqual(
        [
          [p1, 'resolucao_da_imagem', 'aberta', t.id],
          [p2, 'aviso_da_verificacao', 'aberta', t.id],
        ].sort(),
      );
      expect(abertas.find((p) => p.id === p2)).toMatchObject({ regra: 'contraste', gravidade: 'aviso', camadas: ['n1'] });
      expect(await r.listarPendencias(sob.contaB, t.documentoId, 'aberta')).toEqual([]);
      expect(await r.mudarPendencia(sob.contaB, p1, 'dispensada', AGORA)).toBeUndefined();

      expect(await r.mudarPendencia(sob.contaA, p1, 'dispensada', depois(10))).toMatchObject({ id: p1, estado: 'dispensada' });
      expect((await r.listarPendencias(sob.contaA, t.documentoId, 'aberta')).map((p) => p.id)).toEqual([p2]);
      expect((await r.listarPendencias(sob.contaA, t.documentoId, 'dispensada')).map((p) => p.id)).toEqual([p1]);
      expect(await r.mudarPendencia(sob.contaA, p1, 'aberta', depois(20))).toMatchObject({ estado: 'aberta' });

      await r.fecharPendenciasDaTarefa(sob.contaA, t.id, depois(30));
      expect(await r.listarPendencias(sob.contaA, t.documentoId, 'aberta')).toEqual([]);
      expect((await r.listarPendencias(sob.contaA, t.documentoId, 'resolvida')).map((p) => p.id).sort()).toEqual([p1, p2].sort());
      await encerrar(sob.contaA, t.id);
    });
  });
}
