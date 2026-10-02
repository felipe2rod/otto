// A tarefa do Otto de ponta a ponta (docs/mvp/backend.md, 7.5 e 17.11): rota, fila, o consumidor do worker, o
// ciclo de @otto/agente, a bancada de render de verdade e o banco. Só o modelo é o roteirizado (uma tarefa
// gravada pelo treinador, respondida sem espera), e armazenamento e fila são os de memória.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  CODIGOS_DE_ERRO,
  DocumentoAberto,
  ErroDaApi,
  EventosDaTarefa,
  Historico,
  LimitesDeTarefa,
  ListaDeDocumentos,
  ListaDePendencias,
  ListaDeTarefas,
  RespostaDeDesfazerTarefa,
  Tarefa,
} from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { semearFontes } from '../../src/biblioteca/application/semear-fontes';
import { CasosDeUsoDeTarefa } from '../../src/tarefa/application/casos-de-uso-de-tarefa';
import { comoMigrador } from '../banco/conexoes';
import { type ApiDeTeste, type ClienteDeTeste, ENTRADA_DE_BRIEFING, PECA_PARA_O_AJUSTE, subirApi } from './subir';

const AJUSTE = { tipo: 'ajuste', pedido: 'deixa o primeiro texto da peça em azul' };

async function novaPeca(cliente: ClienteDeTeste, nome: string, operacoes?: unknown[]): Promise<DocumentoAberto> {
  const criado = DocumentoAberto.parse((await cliente.post('/api/documentos').send({ nome })).body);
  if (operacoes) expect((await cliente.post(`/api/documentos/${criado.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'monta a peça', operacoes })).status).toBe(200);
  return abrir(cliente, criado.id);
}
const abrir = async (cliente: ClienteDeTeste, id: string) => DocumentoAberto.parse((await cliente.get(`/api/documentos/${id}`)).body);
const tarefaDe = async (cliente: ClienteDeTeste, id: string) => Tarefa.parse((await cliente.get(`/api/tarefas/${id}`)).body);
const mover = (versaoBase: number) => ({ id: randomUUID(), versaoBase, descricao: 'mexe', operacoes: [{ op: 'mover', alvo: 'Feed/Título', x: 10, y: 10 }] });

/** Lê o fluxo até o servidor fechar e devolve os quadros (id, evento, dados). */
async function fluxo(cliente: ClienteDeTeste, tarefaId: string, ultimoVisto?: number): Promise<{ id?: number; evento: string; dados: unknown }[]> {
  let pedido = cliente.get(`/api/tarefas/${tarefaId}/eventos`).set('Accept', 'text/event-stream').buffer(true);
  if (ultimoVisto !== undefined) pedido = pedido.set('Last-Event-ID', String(ultimoVisto));
  const r = await pedido.parse((res, pronto) => {
    let texto = '';
    res.setEncoding('utf8');
    res.on('data', (pedaco: string) => {
      texto += pedaco;
    });
    res.on('end', () => pronto(null, texto));
  });
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toBe('text/event-stream; charset=utf-8');
  return (r.body as string)
    .split('\n\n')
    .filter((q) => q.includes('event: '))
    .map((q) => {
      const campo = (nome: string) =>
        q
          .split('\n')
          .find((l) => l.startsWith(`${nome}: `))
          ?.slice(nome.length + 2);
      const id = campo('id');
      return { ...(id !== undefined ? { id: Number(id) } : {}), evento: campo('event') as string, dados: JSON.parse(campo('data') as string) as unknown };
    });
}

describe('tarefa com o "pode": briefing de dois formatos, do pedido ao desfazer', () => {
  let api: ApiDeTeste;
  let A: ClienteDeTeste;
  let peca: DocumentoAberto;
  let tarefaId: string;

  beforeAll(async () => {
    api = await subirApi();
    A = api.como('A');
    // as fontes de verdade da biblioteca: o roteiro usa DM Serif Display e IBM Plex Sans
    await semearFontes(api.fontes, path.resolve(import.meta.dirname, '../../recursos/fontes'));
    peca = await novaPeca(A, 'Novo horário');
  }, 60_000);
  afterAll(async () => {
    await api?.fechar();
  });

  it('antes de enviar, a consulta de limites diz que pode, em tarefas e não em tokens', async () => {
    const r = await A.get('/api/tarefas/limites');
    expect(r.status).toBe(200);
    expect(LimitesDeTarefa.parse(r.body)).toEqual({ podeEnviar: true, podeAjustar: true, tarefasHoje: 0, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3, naFrente: [] });
  });

  it('entrada malformada é 400 com o nome do campo; peça que não existe e id torto são 404', async () => {
    const torta = await A.post(`/api/documentos/${peca.id}/tarefas`).send({ tipo: 'ajuste' });
    expect(torta.status).toBe(400);
    expect(ErroDaApi.parse(torta.body).codigo).toBe(CODIGOS_DE_ERRO.pedidoInvalido);
    expect((await A.post(`/api/documentos/${randomUUID()}/tarefas`).send(AJUSTE)).status).toBe(404);
    expect((await A.get('/api/tarefas/nao-e-uuid')).status).toBe(404);
    expect((await A.get(`/api/tarefas/${randomUUID()}/eventos`).set('Accept', 'text/event-stream')).status).toBe(404);
    expect(api.fila.publicados).toEqual([]);
  });

  it('o pedido é aceito com 202; a primeira parte roda no worker e PARA no "pode", com direção e plano, sem tocar a peça', async () => {
    const r = await A.post(`/api/documentos/${peca.id}/tarefas`).send(ENTRADA_DE_BRIEFING);
    expect(r.status).toBe(202);
    const criada = Tarefa.parse(r.body);
    tarefaId = criada.id;
    expect(criada).toMatchObject({ documentoId: peca.id, tipo: 'briefing', versaoInicial: 0, lotes: 0 });
    // na fila vão só os identificadores
    expect(api.fila.publicados.at(-1)).toEqual({ fila: 'tarefa-do-otto', trabalho: { contaId: api.contaA.contaId, id: tarefaId } });
    await api.fila.ociosa();

    const parada = await tarefaDe(A, tarefaId);
    expect(parada.estado).toBe('aguardando_confirmacao');
    expect(parada.confirmacao?.plano.criar.map((f) => f.nome)).toEqual(['Feed', 'Story']);
    expect(parada.confirmacao?.motivos.length).toBeGreaterThan(0);
    expect(parada.confirmacao?.cartao).toBeTruthy();
    expect((await abrir(A, peca.id)).versao).toBe(0);
  }, 60_000);

  it('enquanto espera o "pode" (sem prazo), a peça é somente leitura, aparece com a tarefa, e não aceita outra tarefa', async () => {
    const aberta = await abrir(A, peca.id);
    expect(aberta.tarefaAtiva).toEqual({ id: tarefaId, estado: 'aguardando_confirmacao' });
    const edicao = await A.post(`/api/documentos/${peca.id}/lotes`).send({
      id: randomUUID(),
      versaoBase: 0,
      descricao: 'x',
      operacoes: [{ op: 'criarPrancheta', nome: 'Minha', largura: 100, altura: 100, fundo: '#ffffff' }],
    });
    expect(edicao.status).toBe(409);
    expect(ErroDaApi.parse(edicao.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.documentoEmTarefa });
    const outra = await A.post(`/api/documentos/${peca.id}/tarefas`).send(AJUSTE);
    expect(outra.status).toBe(409);
    expect(ErroDaApi.parse(outra.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.tarefaEmAndamento, detalhe: { tarefaId, estado: 'aguardando_confirmacao' } });
    expect(ListaDeDocumentos.parse((await A.get('/api/documentos')).body).itens.find((d) => d.id === peca.id)?.tarefa).toEqual({ id: tarefaId, estado: 'aguardando_confirmacao' });
    expect(ListaDeTarefas.parse((await A.get(`/api/documentos/${peca.id}/tarefas`)).body)).toMatchObject({ viva: tarefaId, itens: [{ id: tarefaId }] });
    // nada na fila, nada rodando: a espera não custa
    expect(api.fila.publicados).toHaveLength(1);
  });

  it('o fluxo de eventos de uma tarefa parada entrega o que houve, a fotografia, e fecha com "fim"', async () => {
    const quadros = await fluxo(A, tarefaId);
    const eventos = quadros.filter((q) => q.id !== undefined);
    expect(eventos.map((q) => q.id)).toEqual(eventos.map((_, i) => i));
    expect(eventos.map((q) => q.evento)).toEqual(expect.arrayContaining(['direcao', 'plano']));
    expect(quadros.at(-2)?.evento).toBe('tarefa');
    expect(Tarefa.parse(quadros.at(-2)?.dados).estado).toBe('aguardando_confirmacao');
    expect(quadros.at(-1)).toEqual({ evento: 'fim', dados: { estado: 'aguardando_confirmacao' } });
  });

  it('com o "pode", a segunda parte roda: cada lote entra com autoria do Otto e a tarefa vai para revisão', async () => {
    const r = await A.post(`/api/tarefas/${tarefaId}/aprovar`).send({});
    expect(r.status).toBe(200);
    expect((await A.post(`/api/tarefas/${tarefaId}/aprovar`).send({})).status).toBe(409);
    await api.fila.ociosa();

    const t = await tarefaDe(A, tarefaId);
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 5, versaoFinal: 5, conferida: true });
    expect(t.pranchetasNovas).toHaveLength(2);
    expect(t.resumo?.length).toBeGreaterThan(0);
    const aberta = await abrir(A, peca.id);
    expect(aberta.arvore.pranchetas.map((p) => [p.nome, p.largura, p.altura])).toEqual([
      ['Feed', 1080, 1350],
      ['Story', 1080, 1920],
    ]);
    expect(aberta.conjuntoPendente).toMatchObject({ tarefaId, versaoInicial: 0 });
    const historico = Historico.parse((await A.get(`/api/documentos/${peca.id}/historico`)).body);
    expect(historico.itens.map((l) => [l.autoria, l.tarefaId])).toEqual(Array.from({ length: 5 }, () => ['agente', tarefaId]));
  }, 120_000);

  it('cada chamada ao modelo deixou uma linha de custo, e a tarefa soma o que as linhas dizem', async () => {
    const { chamadas, tarefa } = await comoMigrador(async (c) => {
      // RLS com FORCE vale também para o dono das tabelas: sem a conta, nenhuma linha
      await c.query("SELECT set_config('app.conta_id', $1, false)", [api.contaA.contaId]);
      return {
        chamadas: (await c.query('SELECT papel, tokens_de_cache_lidos, tokens_de_saida, resultado FROM chamadas_ao_modelo WHERE tarefa_id = $1 ORDER BY sequencia', [tarefaId])).rows as Record<
          string,
          unknown
        >[],
        tarefa: (await c.query('SELECT chamadas, tokens_de_cache_lidos, tokens_de_saida FROM tarefas_do_agente WHERE id = $1', [tarefaId])).rows[0] as Record<string, unknown>,
      };
    });
    // o roteiro tem 13 passos: 1 do diretor, 11 do agente e 1 do revisor
    expect(chamadas.map((c) => c.papel)).toEqual(['diretor', ...Array.from({ length: 8 }, () => 'agente'), 'revisor', 'agente', 'agente', 'agente']);
    expect(Number(tarefa.chamadas)).toBe(13);
    const soma = (campo: string) => chamadas.reduce((s, c) => s + Number(c[campo]), 0);
    expect(Number(tarefa.tokens_de_cache_lidos)).toBe(soma('tokens_de_cache_lidos'));
    expect(Number(tarefa.tokens_de_saida)).toBe(soma('tokens_de_saida'));
    expect(new Set(chamadas.map((c) => c.resultado))).toEqual(new Set(['ok']));
  });

  it('reconectar com Last-Event-ID entrega exatamente o que faltava; a leitura em JSON dá o mesmo', async () => {
    const tudo = (await fluxo(A, tarefaId)).filter((q) => q.id !== undefined);
    expect(tudo.map((q) => q.id)).toEqual(tudo.map((_, i) => i));
    expect(tudo.at(-1)?.evento).toBe('entrega');
    const meio = Math.floor(tudo.length / 2);
    const resto = await fluxo(A, tarefaId, meio);
    expect(resto.filter((q) => q.id !== undefined)).toEqual(tudo.slice(meio + 1));
    expect(resto.at(-1)).toEqual({ evento: 'fim', dados: { estado: 'em_revisao' } });
    const emJson = EventosDaTarefa.parse((await A.get(`/api/tarefas/${tarefaId}/eventos?depoisDe=${meio}`)).body);
    expect(emJson.eventos.map((e) => e.sequencia)).toEqual(tudo.slice(meio + 1).map((q) => q.id));
    expect(emJson.tarefa.ultimoEvento).toBe(tudo.length - 1);
  });

  it('em revisão a peça continua somente leitura (com outro código), e "antes" devolve a peça de antes da tarefa', async () => {
    const edicao = await A.post(`/api/documentos/${peca.id}/lotes`).send({ id: randomUUID(), versaoBase: 5, descricao: 'x', operacoes: [{ op: 'mover', alvo: 'Feed/Título', x: 1, y: 1 }] });
    expect(edicao.status).toBe(409);
    expect(ErroDaApi.parse(edicao.body).codigo).toBe(CODIGOS_DE_ERRO.revisaoPendente);
    const antes = (await A.get(`/api/tarefas/${tarefaId}/antes`)).body as { versao: number; arvore: { pranchetas: unknown[] } };
    expect(antes.versao).toBe(0);
    expect(antes.arvore.pranchetas).toEqual([]);
  });

  it('descartar uma prancheta que a tarefa criou tira só ela; aceitar o resto fecha como aceita em parte', async () => {
    const story = (await abrir(A, peca.id)).arvore.pranchetas.find((p) => p.nome === 'Story')?.id as string;
    const naoDela = await A.post(`/api/tarefas/${tarefaId}/descartar`).send({ pranchetaId: 'p-que-nao-existe' });
    expect(naoDela.status).toBe(422);
    const r = await A.post(`/api/tarefas/${tarefaId}/descartar`).send({ pranchetaId: story });
    expect(r.status).toBe(200);
    const resposta = RespostaDeDesfazerTarefa.parse(r.body);
    expect(resposta.versao).toBe(6);
    expect((await abrir(A, peca.id)).arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
    expect(resposta.tarefa.estado).toBe('em_revisao');

    const aceita = Tarefa.parse((await A.post(`/api/tarefas/${tarefaId}/aceitar`).send({})).body);
    expect(aceita.estado).toBe('aceita');
    expect(api.log.find((l) => l.evento === 'tarefa_decidida')).toMatchObject({ tarefaId, resultado: 'aceita_em_parte' });
    expect((await abrir(A, peca.id)).tarefaAtiva).toBeUndefined();
  });

  it('"voltar para antes desta tarefa": a peça volta ao que era, num lote de reversão; nada é apagado do histórico', async () => {
    const r = await A.post(`/api/tarefas/${tarefaId}/desfazer`).send({});
    expect(r.status).toBe(200);
    const resposta = RespostaDeDesfazerTarefa.parse(r.body);
    expect(resposta.tarefa.estado).toBe('desfeita');
    expect((resposta.arvore as { pranchetas: unknown[] }).pranchetas).toEqual([]);
    expect(resposta.versao).toBe(7);
    const historico = Historico.parse((await A.get(`/api/documentos/${peca.id}/historico`)).body);
    expect(historico.itens).toHaveLength(7);
    expect((await A.post(`/api/tarefas/${tarefaId}/desfazer`).send({})).status).toBe(409);
  });
});

describe('ajuste pontual: sem "pode", com pendência, e o desfazer depois de editar', () => {
  let api: ApiDeTeste;
  let A: ClienteDeTeste;
  let peca: DocumentoAberto;
  let tarefaId: string;

  beforeAll(async () => {
    api = await subirApi();
    A = api.como('A');
    peca = await novaPeca(A, 'Promoção da semana', PECA_PARA_O_AJUSTE);
    tarefaId = Tarefa.parse((await A.post(`/api/documentos/${peca.id}/tarefas`).send(AJUSTE)).body).id;
    await api.fila.ociosa();
  }, 60_000);
  afterAll(async () => {
    await api?.fechar();
  });

  it('o ajuste roda direto, num trabalho só, e a alteração está na peça com autoria do Otto', async () => {
    const t = await tarefaDe(A, tarefaId);
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 1, versaoInicial: 1, versaoFinal: 2 });
    expect(t.confirmacao?.plano.pontual).toBe(true);
    const titulo = (await abrir(A, peca.id)).arvore.pranchetas[0]?.filhos[0] as { cor?: string; tamanho?: number };
    // o roteiro põe em azul a primeira camada de texto da peça, qualquer que seja
    expect(titulo).toMatchObject({ cor: '#1F5FBF', tamanho: 120 });
    expect(api.fila.publicados.filter((p) => p.fila === 'tarefa-do-otto')).toHaveLength(1);
  });

  it('o custo do ajuste está gravado por chamada e somado na tarefa, com o preço que o modelo declara', async () => {
    const { chamadas, tarefa } = await comoMigrador(async (c) => {
      await c.query("SELECT set_config('app.conta_id', $1, false)", [api.contaA.contaId]);
      return {
        chamadas: (
          await c.query('SELECT tokens_de_entrada, tokens_de_cache_lidos, tokens_de_cache_criados, tokens_de_saida FROM chamadas_ao_modelo WHERE tarefa_id = $1 ORDER BY sequencia', [tarefaId])
        ).rows as Record<string, unknown>[],
        tarefa: (await c.query('SELECT chamadas, tokens_de_cache_lidos, tokens_de_cache_criados, tokens_de_saida, duracao_ms, resultado FROM tarefas_do_agente WHERE id = $1', [tarefaId]))
          .rows[0] as Record<string, unknown>,
      };
    });
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0]).toMatchObject({ tokens_de_entrada: 2, tokens_de_cache_lidos: 8329, tokens_de_cache_criados: 3630, tokens_de_saida: 284 });
    expect(Number(tarefa.chamadas)).toBe(2);
    expect(Number(tarefa.tokens_de_cache_lidos)).toBe(chamadas.reduce((s, c) => s + Number(c.tokens_de_cache_lidos), 0));
    const terminada = api.log.find((l) => l.evento === 'tarefa_terminada' && l.tarefaId === tarefaId);
    expect(terminada).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 1, chamadas: 2, conferida: expect.any(Boolean) });
    expect(terminada?.microDolares).toBeGreaterThan(0);
  });

  it('o que o Otto não resolveu vira pendência da peça: lista, dispensa e reabre', async () => {
    const lista = ListaDePendencias.parse((await A.get(`/api/documentos/${peca.id}/pendencias`)).body);
    expect(lista.itens.length).toBeGreaterThan(0);
    const [primeira] = lista.itens;
    expect(primeira).toMatchObject({ tarefaId, estado: 'aberta' });
    const dispensada = await A.post(`/api/pendencias/${primeira?.id}/dispensar`).send({});
    expect(dispensada.body).toMatchObject({ estado: 'dispensada' });
    expect(ListaDePendencias.parse((await A.get(`/api/documentos/${peca.id}/pendencias`)).body).itens).toHaveLength(lista.itens.length - 1);
    expect(ListaDePendencias.parse((await A.get(`/api/documentos/${peca.id}/pendencias?estado=dispensada`)).body).itens).toHaveLength(1);
    expect((await A.post(`/api/pendencias/${primeira?.id}/reabrir`).send({})).body).toMatchObject({ estado: 'aberta' });
    expect((await A.get(`/api/documentos/${peca.id}/pendencias?estado=qualquer`)).status).toBe(400);
  });

  it('o desfazer do editor trata a tarefa como uma unidade só depois de aceita; antes, é recusado', async () => {
    expect((await A.post(`/api/documentos/${peca.id}/desfazer`).send({ versaoBase: 2 })).status).toBe(409);
  });

  it('desfazer a tarefa aceita é recusado se o designer editou depois, dizendo quantas edições iriam junto; confirmando, volta tudo', async () => {
    expect((await A.post(`/api/tarefas/${tarefaId}/aceitar`).send({})).status).toBe(200);
    expect((await A.post(`/api/documentos/${peca.id}/lotes`).send(mover(2))).status).toBe(200);
    expect((await tarefaDe(A, tarefaId)).edicoesDepois).toBe(1);
    const recusa = await A.post(`/api/tarefas/${tarefaId}/desfazer`).send({});
    expect(recusa.status).toBe(409);
    expect(ErroDaApi.parse(recusa.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.editadoDepois, detalhe: { edicoes: 1 } });
    expect((await abrir(A, peca.id)).versao).toBe(3);
    const r = await A.post(`/api/tarefas/${tarefaId}/desfazer`).send({ incluirEdicoesPosteriores: true });
    expect(r.status).toBe(200);
    expect(RespostaDeDesfazerTarefa.parse(r.body).arvore).toEqual(peca.arvore);
    expect(ListaDePendencias.parse((await A.get(`/api/documentos/${peca.id}/pendencias`)).body).itens).toEqual([]);
  });
});

describe('fila, limites e cancelamento, com o worker parado', () => {
  let api: ApiDeTeste;
  let A: ClienteDeTeste;
  let peca: DocumentoAberto;

  beforeAll(async () => {
    api = await subirApi({ TAREFAS_POR_DIA_POR_CONTA: '4', TAREFAS_NA_FILA_POR_CONTA: '2' }, { consumirTarefas: false });
    A = api.como('A');
    peca = await novaPeca(A, 'Promoção da semana', PECA_PARA_O_AJUSTE);
  }, 60_000);
  afterAll(async () => {
    await api?.fechar();
  });

  it('na fila: a peça é somente leitura, cancelar é na hora e nada foi alterado; "tentar de novo" cria outra com a mesma entrada', async () => {
    const criada = Tarefa.parse((await A.post(`/api/documentos/${peca.id}/tarefas`).send(AJUSTE)).body);
    expect(criada.estado).toBe('na_fila');
    expect((await A.post(`/api/documentos/${peca.id}/lotes`).send(mover(1))).status).toBe(409);
    const cancelada = Tarefa.parse((await A.post(`/api/tarefas/${criada.id}/cancelar`).send({})).body);
    expect(cancelada).toMatchObject({ estado: 'cancelada', lotes: 0 });
    expect((await A.post(`/api/tarefas/${criada.id}/cancelar`).send({})).status).toBe(409);
    expect((await abrir(A, peca.id)).tarefaAtiva).toBeUndefined();

    const r = await A.post(`/api/tarefas/${criada.id}/tentar-de-novo`).send({});
    expect(r.status).toBe(202);
    const nova = Tarefa.parse(r.body);
    expect(nova.id).not.toBe(criada.id);
    expect(nova).toMatchObject({ estado: 'na_fila', entrada: AJUSTE });
    await A.post(`/api/tarefas/${nova.id}/cancelar`).send({});
  });

  it('trabalho na fila com a conta trocada não é processado: a tarefa de B não roda como se fosse de A', async () => {
    const B = api.como('B');
    const pecaDeB = await novaPeca(B, 'De B', PECA_PARA_O_AJUSTE);
    const deB = Tarefa.parse((await B.post(`/api/documentos/${pecaDeB.id}/tarefas`).send(AJUSTE)).body);
    // alguém põe na fila a tarefa de B com a conta de A: o worker relê sob a conta do trabalho e não acha
    expect(await api.app.get(CasosDeUsoDeTarefa).trabalhar(api.contaA, deB.id)).toBe('ignorada');
    expect((await tarefaDe(B, deB.id)).estado).toBe('na_fila');
    expect((await abrir(B, pecaDeB.id)).versao).toBe(1);
    await B.post(`/api/tarefas/${deB.id}/cancelar`).send({});
  });

  it('a entrega repetida de um trabalho cancelado não roda nada', async () => {
    const antes = (await abrir(A, peca.id)).versao;
    await api.ligarTarefas();
    await api.fila.ociosa();
    expect((await abrir(A, peca.id)).versao).toBe(antes);
    expect(ListaDeTarefas.parse((await A.get(`/api/documentos/${peca.id}/tarefas`)).body).itens.map((t) => t.estado)).toEqual(['cancelada', 'cancelada']);
  });

  it('o limite de tarefas por dia da conta responde 429, e a consulta de limites avisa antes', async () => {
    // já foram 2 hoje nesta conta
    for (const _ of [3, 4]) {
      const t = Tarefa.parse((await A.post(`/api/documentos/${peca.id}/tarefas`).send(AJUSTE)).body);
      await api.fila.ociosa();
      expect((await A.post(`/api/tarefas/${t.id}/desfazer`).send({})).status).toBe(200);
    }
    const limites = LimitesDeTarefa.parse((await A.get('/api/tarefas/limites')).body);
    expect(limites).toMatchObject({ podeEnviar: false, motivo: 'limite_da_conta', tarefasHoje: 4, tarefasPorDia: 4 });
    const outraPeca = await novaPeca(A, 'Outra');
    const r = await A.post(`/api/documentos/${outraPeca.id}/tarefas`).send(AJUSTE);
    expect(r.status).toBe(429);
    expect(ErroDaApi.parse(r.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.limiteDeTarefas, detalhe: { motivo: 'limite_da_conta', limite: 4 } });
  });
});
