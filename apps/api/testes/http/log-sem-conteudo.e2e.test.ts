// Uso sim, conteúdo não (ADR 031; docs/mvp/backend.md, seção 9). Roda um fluxo completo com frases
// sentinela em tudo que é conteúdo e procura as frases no log. Achou: o teste falha.
// Também confere o que o log TEM de ter: conta, correlação, rota como modelo, status e duração.
import { randomUUID } from 'node:crypto';
import { ArquivoEnviado } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, PNG, subirApi } from './subir';

const SENTINELAS = {
  nomeDoDocumento: 'SENTINELA-NOME-DO-DOCUMENTO-7f3a',
  nomeNovo: 'SENTINELA-NOME-NOVO-91bc',
  nomeDaCamada: 'SENTINELA-NOME-DA-CAMADA-22de',
  textoDaCamada: 'SENTINELA-TEXTO-DA-CAMADA-c0f1',
  nomeDaPrancheta: 'SENTINELA-PRANCHETA-5a5a',
  descricaoDoLote: 'SENTINELA-DESCRICAO-DO-LOTE-88aa',
  nomeDoArquivo: 'SENTINELA-FOTO-DO-CLIENTE-41c2.png',
  busca: 'SENTINELA-BUSCA-DE-FONTE-3e3e',
  alvoQueNaoExiste: 'SENTINELA-ALVO-ERRADO-0d0d',
  corDaMarca: '#a1b2c3',
} as const;

let api: ApiDeTeste;
let A: ClienteDeTeste;
let documentoId: string;
let exportacaoId: string;
let tokenDoLink: string;

beforeAll(async () => {
  api = await subirApi();
  A = api.como('A');
  const S = SENTINELAS;
  const doc = (await A.post('/api/documentos').send({ nome: S.nomeDoDocumento })).body as { id: string };
  documentoId = doc.id;
  await A.patch(`/api/documentos/${doc.id}`).send({ nome: S.nomeNovo });
  const { sha256 } = ArquivoEnviado.parse((await A.post('/api/arquivos').set('Content-Type', 'image/png').set('X-Otto-Nome-Do-Arquivo', encodeURIComponent(S.nomeDoArquivo)).send(PNG)).body);
  await A.post(`/api/documentos/${doc.id}/lotes`).send({
    id: randomUUID(),
    versaoBase: 0,
    descricao: S.descricaoDoLote,
    operacoes: [
      { op: 'criarPrancheta', nome: S.nomeDaPrancheta, largura: 1080, altura: 1350, fundo: S.corDaMarca },
      {
        op: 'criarNo',
        prancheta: S.nomeDaPrancheta,
        no: { tipo: 'texto', nome: S.nomeDaCamada, x: 0, y: 0, largura: 500, altura: 100, conteudo: S.textoDaCamada, fonte: 'Anton', tamanho: 40, cor: S.corDaMarca },
      },
      { op: 'criarNo', prancheta: S.nomeDaPrancheta, no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 200, largura: 300, altura: 400, arquivo: sha256, larguraOriginal: 600, alturaOriginal: 800 } },
      { op: 'alinhar', alvos: [`${S.nomeDaPrancheta}/${S.nomeDaCamada}`], borda: 'esquerda', referencia: 'prancheta' },
    ],
  });
  // erros também não podem vazar: lote inválido (a mensagem do catálogo cita o alvo), corpo inválido, 404
  await A.post(`/api/documentos/${doc.id}/lotes`).send({
    id: randomUUID(),
    versaoBase: 1,
    descricao: S.descricaoDoLote,
    operacoes: [{ op: 'mover', alvo: `${S.nomeDaPrancheta}/${S.alvoQueNaoExiste}`, x: 0, y: 0 }],
  });
  await A.post(`/api/documentos/${doc.id}/lotes`).send({ id: 'torto', descricao: S.descricaoDoLote, nome: S.nomeDoDocumento });
  await A.post('/api/documentos').set('Content-Type', 'application/json').send(`{"nome": "${S.nomeDoDocumento}`);
  await A.get(`/api/fontes?q=${S.busca}`);
  await A.get(`/api/documentos/${doc.id}`);
  await A.get(`/api/documentos/${doc.id}/historico`);
  await A.get('/api/documentos');
  await A.get(`/api/arquivos/${sha256}`);
  // exportação: pedido, trabalho da fila, consulta, download pelo link (o nome do arquivo é o nome do documento)
  await A.post(`/api/documentos/${doc.id}/exportacoes/relatorio`).send({ formato: 'psd' });
  const exportacao = (await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd' })).body as { id: string };
  exportacaoId = exportacao.id;
  await api.fila.ociosa();
  await A.get(`/api/exportacoes/${exportacao.id}`);
  const link = (await A.get(`/api/exportacoes/${exportacao.id}/arquivos/0`)).headers.location as string;
  tokenDoLink = link.split('/').at(-1) as string;
  await A.cru.get(link);
  await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd', pranchetas: [S.alvoQueNaoExiste] });
  await A.post(`/api/documentos/${doc.id}/desfazer`).send({ versaoBase: 1 });
  await A.post(`/api/documentos/${doc.id}/duplicar`).send({ nome: S.nomeNovo });
  await A.get(`/api/rota-que-nao-existe/${S.nomeDoDocumento}?q=${S.busca}`);
});
afterAll(async () => {
  await api?.fechar();
});

describe('o log não carrega conteúdo', () => {
  it('o fluxo rodou e gerou log', () => {
    expect(api.log.filter((l) => l.evento === 'requisicao').length).toBeGreaterThanOrEqual(14);
  });

  it.each(Object.entries(SENTINELAS))('nenhuma linha contém %s', (_nome, frase) => {
    const achadas = api.logCru.filter((linha) => linha.includes(frase) || linha.includes(encodeURIComponent(frase)));
    expect(achadas).toEqual([]);
  });

  it('nenhuma linha traz corpo de requisição, cookie, query string ou pilha', () => {
    for (const linha of api.logCru) {
      expect(linha).not.toMatch(/otto_sessao|"cookie"|"body"|"corpo"|"query"|"stack"|\?q=|\?limite=/i);
    }
  });
});

describe('o log carrega o que precisa', () => {
  it('toda requisição de negócio registra conta, correlação, método, rota como modelo, status e duração', () => {
    // rota que não existe e corpo que nem chegou a ser lido não são caminho de negócio:
    // não passam pela guarda e não têm conta. O download pelo link assinado também não tem
    // sessão: quem autoriza é o link.
    const requisicoes = api.log.filter((l) => l.evento === 'requisicao' && l.rota !== '(rota desconhecida)' && l.rota !== '/api/links/:token');
    expect(requisicoes.length).toBeGreaterThanOrEqual(12);
    for (const l of requisicoes) {
      expect(l, JSON.stringify(l)).toMatchObject({ contaId: api.contaA.contaId, servico: 'api' });
      expect(l.correlacaoId).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof l.metodo).toBe('string');
      expect(typeof l.status).toBe('number');
      expect(typeof l.duracaoMs).toBe('number');
      expect(typeof l.rota).toBe('string');
    }
  });

  it('a rota é o modelo, nunca o endereço com o que a pessoa digitou', () => {
    const rotas = new Set(api.log.filter((l) => l.evento === 'requisicao').map((l) => `${l.metodo} ${l.rota}`));
    expect(rotas).toContain('POST /api/documentos');
    expect(rotas).toContain('GET /api/documentos/:id');
    expect(rotas).toContain('POST /api/documentos/:id/lotes');
    expect(rotas).toContain('GET /api/arquivos/:sha256');
    expect(rotas).toContain('GET (rota desconhecida)');
    for (const rota of rotas) expect(rota).not.toContain(documentoId);
  });

  it('o lote aplicado registra contagem por tipo de operação e nós tocados, não as operações', () => {
    const lote = api.log.find((l) => l.evento === 'lote_aplicado');
    expect(lote).toMatchObject({ contaId: api.contaA.contaId, documentoId, autoria: 'designer', operacoesPorTipo: { criarPrancheta: 1, criarNo: 2, alinhar: 1 }, mediuTexto: true });
    expect(typeof lote?.nosTocados).toBe('number');
  });

  it('o erro de lote registra o código e o tipo da operação, não a mensagem (que cita a camada)', () => {
    const recusas = api.log.filter((l) => l.evento === 'requisicao' && l.status === 422 && l.rota === '/api/documentos/:id/lotes');
    expect(recusas.length).toBeGreaterThan(0);
    for (const l of recusas) expect(l).toMatchObject({ codigo: 'lote_invalido' });
  });

  it('a exportação registra formato, contagens, bytes, espera e duração; o link assinado e a chave do objeto não aparecem', () => {
    expect(api.log.find((l) => l.evento === 'exportacao_pedida')).toMatchObject({ contaId: api.contaA.contaId, exportacaoId, documentoId, formato: 'psd', pranchetas: 1, juntas: false });
    const terminada = api.log.find((l) => l.evento === 'exportacao_terminada');
    expect(terminada).toMatchObject({ contaId: api.contaA.contaId, exportacaoId, formato: 'psd', resultado: 'pronta', pranchetas: 1, falhas: 0, arquivos: 1 });
    expect(typeof terminada?.duracaoMs).toBe('number');
    expect(typeof terminada?.esperaMs).toBe('number');
    expect(terminada?.bytes).toBeGreaterThan(1000);
    const rotas = new Set(api.log.filter((l) => l.evento === 'requisicao').map((l) => `${l.metodo} ${l.rota}`));
    expect(rotas).toContain('POST /api/documentos/:id/exportacoes');
    expect(rotas).toContain('GET /api/exportacoes/:id/arquivos/:indice');
    expect(rotas).toContain('GET /api/links/:token');
    for (const linha of api.logCru) {
      expect(linha).not.toContain(tokenDoLink);
      expect(linha).not.toContain(`/exportacoes/${exportacaoId}/0`);
    }
  });

  it('o envio de arquivo registra tipo, bytes e medidas', () => {
    expect(api.log.find((l) => l.evento === 'arquivo_enviado')).toMatchObject({ contaId: api.contaA.contaId, tipo: 'image/png', bytes: PNG.byteLength, largura: 600, altura: 800 });
  });
});
