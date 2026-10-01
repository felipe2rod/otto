// Suíte "duas-contas", parte HTTP (ADR 023, item 6). Duas contas com dados espelhados; com a sessão
// de B, tenta-se alcançar o que é de A por cada rota. O esperado é sempre o 404 de "não existe",
// com corpo idêntico ao de id inexistente (nunca 403, que confirmaria a existência), e nada alterado.
import { createHash, randomUUID } from 'node:crypto';
import { ArquivoEnviado, CODIGOS_DE_ERRO, DocumentoAberto, ErroDaApi, Exportacao, Historico, ListaDeDocumentos } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, criarForma, criarPrancheta, PNG, subirApi } from './subir';

let api: ApiDeTeste;
let A: ClienteDeTeste;
let B: ClienteDeTeste;
let docDeA: DocumentoAberto;
let docDeB: DocumentoAberto;
let inexistente: { status: number; body: unknown };
const SHA_DO_PNG = createHash('sha256').update(PNG).digest('hex');

beforeAll(async () => {
  api = await subirApi();
  A = api.como('A');
  B = api.como('B');
  docDeA = DocumentoAberto.parse((await A.post('/api/documentos').send({ nome: 'Documento de A' })).body);
  docDeB = DocumentoAberto.parse((await B.post('/api/documentos').send({ nome: 'Documento de B' })).body);
  await A.post(`/api/documentos/${docDeA.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'monta', operacoes: [criarPrancheta(), criarForma('Segredo de A')] });
  await A.post('/api/arquivos').set('Content-Type', 'image/png').send(PNG);
  const r = await B.get(`/api/documentos/${randomUUID()}`);
  inexistente = { status: r.status, body: r.body };
});
afterAll(async () => {
  await api?.fechar();
});

const estadoDeA = async () => DocumentoAberto.parse((await A.get(`/api/documentos/${docDeA.id}`)).body);

describe('com a sessão de B, o documento de A não existe', () => {
  it('o 404 de referência é o de id inexistente', () => {
    expect(inexistente).toEqual({ status: 404, body: { codigo: CODIGOS_DE_ERRO.naoEncontrado } });
  });

  it.each([
    ['GET /api/documentos/:id', () => B.get(`/api/documentos/${docDeA.id}`)],
    ['PATCH /api/documentos/:id', () => B.patch(`/api/documentos/${docDeA.id}`).send({ nome: 'tomado por B' })],
    ['DELETE /api/documentos/:id', () => B.delete(`/api/documentos/${docDeA.id}`)],
    ['POST .../duplicar', () => B.post(`/api/documentos/${docDeA.id}/duplicar`).send({})],
    ['GET .../historico', () => B.get(`/api/documentos/${docDeA.id}/historico`)],
    ['POST .../lotes', () => B.post(`/api/documentos/${docDeA.id}/lotes`).send({ id: randomUUID(), versaoBase: 1, descricao: 'invasão', operacoes: [criarPrancheta('De B')] })],
    ['POST .../desfazer', () => B.post(`/api/documentos/${docDeA.id}/desfazer`).send({ versaoBase: 1 })],
    ['POST .../refazer', () => B.post(`/api/documentos/${docDeA.id}/refazer`).send({ versaoBase: 1 })],
  ])('%s responde o mesmo 404 de id inexistente, e o documento de A não muda', async (_rota, chamar) => {
    const antes = await estadoDeA();
    const r = await chamar();
    expect({ status: r.status, body: r.body }).toEqual(inexistente);
    expect(await estadoDeA()).toEqual(antes);
  });

  it('a lista de B não tem o documento de A, e a de A não tem o de B', async () => {
    const deB = ListaDeDocumentos.parse((await B.get('/api/documentos?limite=100')).body).itens.map((i) => i.id);
    const deA = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.map((i) => i.id);
    expect(deB).toContain(docDeB.id);
    expect(deB).not.toContain(docDeA.id);
    expect(deA).toContain(docDeA.id);
    expect(deA).not.toContain(docDeB.id);
  });

  it('B não consegue ser atendido como A mandando a conta no corpo, na query ou em cabeçalho', async () => {
    const id = api.contaA.contaId;
    expect((await B.get(`/api/documentos/${docDeA.id}?contaId=${id}&conta_id=${id}`).set('X-Conta-Id', id).set('X-Otto-Conta', id)).status).toBe(404);
    const lista = ListaDeDocumentos.parse((await B.get(`/api/documentos?limite=100&contaId=${id}`).set('X-Conta-Id', id)).body);
    expect(lista.itens.map((i) => i.id)).not.toContain(docDeA.id);
  });
});

describe('com a sessão de B, o arquivo de A não existe', () => {
  it('pedir pelo hash responde o 404 de sempre, e o armazenamento nem é chamado', async () => {
    const leiturasAntes = api.armazenamento.leituras;
    const r = await B.get(`/api/arquivos/${SHA_DO_PNG}`);
    expect([r.status, r.body]).toEqual([404, { codigo: CODIGOS_DE_ERRO.naoEncontrado }]);
    expect(api.armazenamento.leituras).toBe(leiturasAntes);
    // A, que é dona, lê
    expect((await A.get(`/api/arquivos/${SHA_DO_PNG}`)).status).toBe(200);
  });

  it('o hash não é autorização: B não põe no documento dela a imagem de A só por saber o hash', async () => {
    const imagem = { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 100, altura: 100, arquivo: SHA_DO_PNG, larguraOriginal: 600, alturaOriginal: 800 } };
    const r = await B.post(`/api/documentos/${docDeB.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'usa a foto de A', operacoes: [criarPrancheta(), imagem] });
    expect(r.status).toBe(422);
    expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.arquivoDesconhecido, detalhe: { quantos: 1 } });
    expect(DocumentoAberto.parse((await B.get(`/api/documentos/${docDeB.id}`)).body).versao).toBe(0);
  });

  it('se B envia o mesmo conteúdo, passa a ter o arquivo DELA; o de A continua sendo outro objeto', async () => {
    const enviado = ArquivoEnviado.parse((await B.post('/api/arquivos').set('Content-Type', 'image/png').send(PNG)).body);
    expect(enviado.sha256).toBe(SHA_DO_PNG);
    expect((await B.get(`/api/arquivos/${SHA_DO_PNG}`)).status).toBe(200);
    expect(await api.armazenamento.existe(api.contaA, `contas/${api.contaA.contaId}/arquivos/${SHA_DO_PNG}`)).toBe(true);
    expect(await api.armazenamento.existe(api.contaB, `contas/${api.contaB.contaId}/arquivos/${SHA_DO_PNG}`)).toBe(true);
  });
});

describe('com a sessão de B, a exportação de A não existe', () => {
  let exportacaoDeA: Exportacao;

  beforeAll(async () => {
    const pedida = Exportacao.parse((await A.post(`/api/documentos/${docDeA.id}/exportacoes`).send({ formato: 'psd' })).body);
    await api.fila.ociosa();
    exportacaoDeA = Exportacao.parse((await A.get(`/api/exportacoes/${pedida.id}`)).body);
    expect(exportacaoDeA.estado).toBe('pronta');
  });

  it.each([
    ['POST /api/documentos/:id/exportacoes', () => B.post(`/api/documentos/${docDeA.id}/exportacoes`).send({ formato: 'psd' })],
    ['POST /api/documentos/:id/exportacoes/relatorio', () => B.post(`/api/documentos/${docDeA.id}/exportacoes/relatorio`).send({ formato: 'psd' })],
    ['GET /api/documentos/:id/exportacoes', () => B.get(`/api/documentos/${docDeA.id}/exportacoes`)],
    ['POST /api/documentos/:id/exportacoes (pacote)', () => B.post(`/api/documentos/${docDeA.id}/exportacoes`).send({ formato: 'svg', pacote: true })],
    ['GET /api/exportacoes/:id', () => B.get(`/api/exportacoes/${exportacaoDeA.id}`)],
    ['GET /api/exportacoes/:id/arquivos/:indice', () => B.get(`/api/exportacoes/${exportacaoDeA.id}/arquivos/0`)],
  ])('%s responde o mesmo 404 de id inexistente, sem pôr nada na fila e sem chamar o armazenamento', async (_rota, chamar) => {
    const [publicados, links, leituras] = [api.fila.publicados.length, api.armazenamento.linksPedidos, api.armazenamento.leituras];
    const r = await chamar();
    expect({ status: r.status, body: r.body }).toEqual(inexistente);
    expect([api.fila.publicados.length, api.armazenamento.linksPedidos, api.armazenamento.leituras]).toEqual([publicados, links, leituras]);
  });

  it('trabalho na fila com a conta trocada não é processado: a exportação de A não roda como se fosse de B', async () => {
    const pedida = Exportacao.parse((await A.post(`/api/documentos/${docDeA.id}/exportacoes`).send({ formato: 'png' })).body);
    await api.fila.ociosa();
    const antes = Exportacao.parse((await A.get(`/api/exportacoes/${pedida.id}`)).body);
    // alguém consegue pôr na fila o id de A com a conta de B
    await api.fila.publicar('exportacao', { contaId: api.contaB.contaId, id: pedida.id });
    await api.fila.ociosa();
    expect(Exportacao.parse((await A.get(`/api/exportacoes/${pedida.id}`)).body)).toEqual(antes);
    expect((await B.get(`/api/exportacoes/${pedida.id}`)).status).toBe(404);
  });

  it('A, que é dona, baixa', async () => {
    expect((await A.get(`/api/exportacoes/${exportacaoDeA.id}/arquivos/0`)).status).toBe(302);
  });
});

describe('o que é de cada conta continua de pé', () => {
  it('depois de todas as tentativas, o documento e o histórico de A estão intactos', async () => {
    const doc = await estadoDeA();
    expect(doc).toMatchObject({ nome: 'Documento de A', versao: 1 });
    expect(doc.arvore.pranchetas[0]?.filhos.map((n) => n.nome)).toEqual(['Segredo de A']);
    expect(Historico.parse((await A.get(`/api/documentos/${docDeA.id}/historico`)).body).itens).toHaveLength(1);
  });
});
