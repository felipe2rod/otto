// As rotas de documento de ponta a ponta: HTTP, guarda, casos de uso, PostgreSQL com RLS.
// Toda resposta é validada pelo esquema de @otto/shared: é o contrato que o editor consome.
import { randomUUID } from 'node:crypto';
import { aplicarLote, documentoVazio, VERSAO_DO_CATALOGO, VERSAO_DO_FORMATO } from '@otto/documento';
import {
  CABECALHOS,
  CODIGOS_DE_ERRO,
  DetalheDeLoteInvalido,
  DocumentoAberto,
  DocumentoRenomeado,
  ErroDaApi,
  Historico,
  LIMITES,
  ListaDeDocumentos,
  RespostaDeDesfazer,
  RespostaDeLote,
} from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, criarForma, criarPrancheta, subirApi } from './subir';

let api: ApiDeTeste;
let A: ClienteDeTeste;

beforeAll(async () => {
  api = await subirApi();
  A = api.como('A');
});
afterAll(async () => {
  await api?.fechar();
});

const novoDocumento = async (nome?: string) => DocumentoAberto.parse((await A.post('/api/documentos').send(nome ? { nome } : {})).body);
const lote = (versaoBase: number, operacoes: unknown[], extra: object = {}) => ({ id: randomUUID(), versaoBase, descricao: 'teste', operacoes, ...extra });

describe('criar, listar, abrir', () => {
  it('POST /api/documentos cria na versão 0 e responde 201 com o documento aberto', async () => {
    const r = await A.post('/api/documentos').send({ nome: 'Promoção da semana' });
    expect(r.status).toBe(201);
    expect(DocumentoAberto.parse(r.body)).toMatchObject({ nome: 'Promoção da semana', versao: 0, arvore: documentoVazio() });
  });

  it('GET /api/documentos lista os da conta, do mais recente para o mais antigo, e pagina', async () => {
    const um = await novoDocumento('lista um');
    const dois = await novoDocumento('lista dois');
    const p1 = await A.get('/api/documentos?limite=1');
    expect(p1.status).toBe(200);
    const lista = ListaDeDocumentos.parse(p1.body);
    expect(lista.itens.map((i) => i.id)).toEqual([dois.id]);
    expect(lista.itens[0]).toMatchObject({ nome: 'lista dois', pranchetas: 0, versao: 0, miniatura: null });
    const p2 = ListaDeDocumentos.parse((await A.get(`/api/documentos?limite=1&cursor=${lista.proximoCursor}`)).body);
    expect(p2.itens.map((i) => i.id)).toEqual([um.id]);
  });

  it('GET /api/documentos/:id devolve o documento; com If-None-Match igual, 304', async () => {
    const d = await novoDocumento('abrir');
    const r = await A.get(`/api/documentos/${d.id}`);
    expect(r.status).toBe(200);
    expect(DocumentoAberto.parse(r.body)).toEqual(d);
    expect(r.headers.etag).toBeTruthy();
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await A.get(`/api/documentos/${d.id}`).set('If-None-Match', r.headers.etag as string)).status).toBe(304);
    // renomear muda o ETag mesmo sem mudar a versão
    await A.patch(`/api/documentos/${d.id}`).send({ nome: 'abrir, renomeado' });
    expect((await A.get(`/api/documentos/${d.id}`).set('If-None-Match', r.headers.etag as string)).status).toBe(200);
  });

  it('id inexistente e id que não é UUID respondem o mesmo 404', async () => {
    const inexistente = await A.get(`/api/documentos/${randomUUID()}`);
    const torto = await A.get('/api/documentos/nao-sou-uuid');
    expect(inexistente.status).toBe(404);
    expect(ErroDaApi.parse(inexistente.body)).toEqual({ codigo: CODIGOS_DE_ERRO.naoEncontrado });
    expect([torto.status, torto.body]).toEqual([inexistente.status, inexistente.body]);
  });
});

describe('renomear, duplicar, arquivar', () => {
  it('PATCH renomeia sem criar versão', async () => {
    const d = await novoDocumento('antes');
    const r = await A.patch(`/api/documentos/${d.id}`).send({ nome: '  depois  ' });
    expect(r.status).toBe(200);
    expect(DocumentoRenomeado.parse(r.body)).toEqual({ id: d.id, nome: 'depois' });
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body)).toMatchObject({ nome: 'depois', versao: 0 });
  });

  it('POST .../duplicar cria uma cópia independente, 201', async () => {
    const d = await novoDocumento('original');
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta()]));
    const r = await A.post(`/api/documentos/${d.id}/duplicar`).send({});
    expect(r.status).toBe(201);
    const copia = DocumentoAberto.parse(r.body);
    expect(copia).toMatchObject({ versao: 0 });
    expect(copia.id).not.toBe(d.id);
    expect(copia.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('DELETE arquiva: 204, depois 404, e some da lista', async () => {
    const d = await novoDocumento('para arquivar');
    expect((await A.delete(`/api/documentos/${d.id}`)).status).toBe(204);
    expect((await A.get(`/api/documentos/${d.id}`)).status).toBe(404);
    expect((await A.delete(`/api/documentos/${d.id}`)).status).toBe(404);
    expect(ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.some((i) => i.id === d.id)).toBe(false);
  });
});

describe('lotes', () => {
  it('aplica o lote, responde a versão nova e o resultado é o mesmo de aplicar no navegador', async () => {
    const d = await novoDocumento();
    const pedido = lote(0, [criarPrancheta(), criarForma('Botão')], { devolver: 'arvore' });
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(pedido);
    expect(r.status).toBe(200);
    const resposta = RespostaDeLote.parse(r.body);
    expect(resposta).toMatchObject({ versao: 1, lote: { id: pedido.id } });
    const local = aplicarLote(documentoVazio(), pedido.operacoes, { autoria: { tipo: 'designer' }, idDoLote: pedido.id });
    expect(local.ok && local.doc).toEqual(resposta.arvore);
    expect(local.ok && [...local.tocados].sort()).toEqual([...resposta.lote.tocados].sort());
  });

  it('sem `devolver`, a resposta não traz a árvore', async () => {
    const d = await novoDocumento();
    expect((await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta()]))).body).not.toHaveProperty('arvore');
  });

  it('versão base velha: 409 com a versão atual, e nada é gravado', async () => {
    const d = await novoDocumento();
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta()]));
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta('Story')]));
    expect(r.status).toBe(409);
    expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.versaoDesatualizada, detalhe: { versaoAtual: 1 } });
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body).arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
  });

  it('lote inválido: 422 com a operação e o campo, e nada do lote entra', async () => {
    const d = await novoDocumento();
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta(), { op: 'mover', alvo: 'Feed/Não existe', x: 0, y: 0 }]));
    expect(r.status).toBe(422);
    const erro = ErroDaApi.parse(r.body);
    expect(erro.codigo).toBe(CODIGOS_DE_ERRO.loteInvalido);
    expect(DetalheDeLoteInvalido.parse(erro.detalhe)).toMatchObject({ indice: 1, op: 'mover' });
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body)).toMatchObject({ versao: 0, arvore: documentoVazio() });
    expect(Historico.parse((await A.get(`/api/documentos/${d.id}/historico`)).body).itens).toEqual([]);
  });

  it('reenviar o mesmo lote devolve o mesmo resultado e não cria versão', async () => {
    const d = await novoDocumento();
    const pedido = lote(0, [criarPrancheta()]);
    const um = await A.post(`/api/documentos/${d.id}/lotes`).send(pedido);
    const dois = await A.post(`/api/documentos/${d.id}/lotes`).send(pedido);
    expect([dois.status, dois.body]).toEqual([um.status, um.body]);
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body).versao).toBe(1);
  });

  it('dois lotes ao mesmo tempo na mesma versão base: um 200, um 409, uma versão só', async () => {
    const d = await novoDocumento();
    const respostas = await Promise.all([
      A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta('Feed')])),
      A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta('Story')])),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body).versao).toBe(1);
  });

  it('lote que mede texto usa o medidor de verdade e a fonte da biblioteca', async () => {
    const d = await novoDocumento();
    const texto = (nome: string, x: number) => ({
      op: 'criarNo',
      prancheta: 'Feed',
      no: { tipo: 'texto', nome, x, y: 100, largura: 600, altura: 200, conteudo: 'Otto', fonte: 'Anton', tamanho: 80, cor: '#000000' },
    });
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta(), texto('Título', 100), criarForma('Caixa', { x: 400 })]));
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(lote(1, [{ op: 'alinhar', alvos: ['Feed/Caixa', 'Feed/Título'], borda: 'esquerda' }], { devolver: 'arvore' }));
    expect(r.status).toBe(200);
    const titulo = RespostaDeLote.parse(r.body).arvore?.pranchetas[0]?.filhos.find((n) => n.nome === 'Título');
    // alinhado pela TINTA: a caixa do texto fica um pouco à esquerda de 400, porque a letra não encosta na borda da caixa
    expect(titulo && 'x' in titulo && titulo.x).toBeLessThanOrEqual(400);
    expect(titulo && 'x' in titulo && titulo.x).toBeGreaterThan(380);
  });
});

describe('desfazer, refazer, histórico', () => {
  it('desfazer e refazer acrescentam lotes de reversão; o histórico só cresce', async () => {
    const d = await novoDocumento();
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta()]));
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(1, [criarForma('A')]));
    const desfeito = await A.post(`/api/documentos/${d.id}/desfazer`).send({ versaoBase: 2 });
    expect(desfeito.status).toBe(200);
    expect(RespostaDeDesfazer.parse(desfeito.body)).toMatchObject({ versao: 3 });
    expect(RespostaDeDesfazer.parse(desfeito.body).arvore.pranchetas[0]?.filhos).toEqual([]);
    const refeito = RespostaDeDesfazer.parse((await A.post(`/api/documentos/${d.id}/refazer`).send({ versaoBase: 3 })).body);
    expect(refeito.versao).toBe(4);
    expect(refeito.arvore.pranchetas[0]?.filhos.map((n) => n.nome)).toEqual(['A']);
    const h = Historico.parse((await A.get(`/api/documentos/${d.id}/historico`)).body);
    expect(h.itens.map((i) => [i.versao, i.tipo, i.desfeito])).toEqual([
      [4, 'reversao', false],
      [3, 'reversao', false],
      [2, 'edicao', false],
      [1, 'edicao', false],
    ]);
  });

  it('nada para desfazer e nada para refazer são 409 com código próprio', async () => {
    const d = await novoDocumento();
    const semDesfazer = await A.post(`/api/documentos/${d.id}/desfazer`).send({ versaoBase: 0 });
    const semRefazer = await A.post(`/api/documentos/${d.id}/refazer`).send({ versaoBase: 0 });
    expect([semDesfazer.status, semDesfazer.body]).toEqual([409, { codigo: CODIGOS_DE_ERRO.nadaParaDesfazer }]);
    expect([semRefazer.status, semRefazer.body]).toEqual([409, { codigo: CODIGOS_DE_ERRO.nadaParaRefazer }]);
  });

  it('histórico paginado, sem as operações', async () => {
    const d = await novoDocumento();
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [criarPrancheta()]));
    await A.post(`/api/documentos/${d.id}/lotes`).send(lote(1, [criarForma('A')]));
    const p1 = Historico.parse((await A.get(`/api/documentos/${d.id}/historico?limite=1`)).body);
    expect(p1.itens.map((i) => i.versao)).toEqual([2]);
    const p2 = Historico.parse((await A.get(`/api/documentos/${d.id}/historico?limite=1&cursor=${p1.proximoCursor}`)).body);
    expect(p2.itens[0]).toMatchObject({ versao: 1, autoria: 'designer', quantidadeDeOperacoes: 1 });
    expect(p2.itens[0]).not.toHaveProperty('operacoes');
  });
});

describe('borda: cabeçalhos, validação e limites', () => {
  it('toda resposta traz a versão do catálogo e um id de correlação', async () => {
    const r = await A.get('/api/documentos');
    // é a versão do CATÁLOGO de operações, não a do formato da árvore: operação nova muda uma e não a outra
    expect(VERSAO_DO_CATALOGO).not.toBe(VERSAO_DO_FORMATO);
    expect(r.headers[CABECALHOS.catalogo.toLowerCase()]).toBe(String(VERSAO_DO_CATALOGO));
    expect(r.headers[CABECALHOS.correlacao.toLowerCase()]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('escrita sem o cabeçalho X-Otto-Cliente é recusada com 403 e nada é criado (requisição forjada de outro site)', async () => {
    const antes = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.length;
    const r = await A.cru.post('/api/documentos').set('Cookie', 'otto_sessao=A').set('Content-Type', 'text/plain').send('{"nome":"forjado"}');
    expect([r.status, r.body]).toEqual([403, { codigo: CODIGOS_DE_ERRO.clienteNaoIdentificado }]);
    const comJson = await A.cru.post('/api/documentos').set('Cookie', 'otto_sessao=A').send({ nome: 'forjado' });
    expect(comJson.status).toBe(403);
    expect(ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.length).toBe(antes);
  });

  it('leitura não exige o cabeçalho', async () => {
    expect((await A.cru.get('/api/documentos').set('Cookie', 'otto_sessao=A')).status).toBe(200);
  });

  it('editor com catálogo diferente do servidor: 409 catalogo_desatualizado na escrita, com a versão do servidor', async () => {
    // a versão do formato (1) não serve mais de catálogo: o editor que ainda a manda é recusado
    for (const velho of [String(VERSAO_DO_FORMATO), String(VERSAO_DO_CATALOGO - 1), String(VERSAO_DO_CATALOGO + 1)]) {
      const r = await A.post('/api/documentos').set(CABECALHOS.catalogo, velho).send({});
      expect([r.status, r.body]).toEqual([409, { codigo: CODIGOS_DE_ERRO.catalogoDesatualizado, detalhe: { catalogoDoServidor: VERSAO_DO_CATALOGO } }]);
    }
    expect((await A.post('/api/documentos').set(CABECALHOS.catalogo, String(VERSAO_DO_CATALOGO)).send({})).status).toBe(201);
  });

  it('o servidor aplica as operações do catálogo que anuncia (duplicar e transferir)', async () => {
    const doc = DocumentoAberto.parse((await A.post('/api/documentos').send({ nome: 'Catálogo 2' })).body);
    const montar = await A.post(`/api/documentos/${doc.id}/lotes`).send({
      id: randomUUID(),
      versaoBase: 0,
      descricao: 'monta',
      operacoes: [criarPrancheta(), criarPrancheta('Story'), criarForma('Botão')],
    });
    expect(montar.status).toBe(200);
    const r = await A.post(`/api/documentos/${doc.id}/lotes`)
      .set(CABECALHOS.catalogo, String(VERSAO_DO_CATALOGO))
      .send({ id: randomUUID(), versaoBase: 1, descricao: 'duplica', devolver: 'arvore', operacoes: [{ op: 'duplicar', alvo: 'Feed/Botão' }] });
    expect(r.status).toBe(200);
    expect(RespostaDeLote.parse(r.body).arvore?.pranchetas[0]?.filhos).toHaveLength(2);
  });

  it('corpo fora do esquema: 400 com os campos recusados, sem ecoar o valor', async () => {
    const d = await novoDocumento();
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send({ id: 'não-uuid', versaoBase: -1, descricao: 'valor-que-nao-deve-voltar', operacoes: [] });
    expect(r.status).toBe(400);
    const erro = ErroDaApi.parse(r.body);
    expect(erro.codigo).toBe(CODIGOS_DE_ERRO.pedidoInvalido);
    expect([...((erro.detalhe?.campos ?? []) as string[])].sort()).toEqual(['id', 'operacoes', 'versaoBase']);
    expect(JSON.stringify(r.body)).not.toContain('valor-que-nao-deve-voltar');
  });

  it('não existe campo de conta nem de árvore: são recusados, não ignorados', async () => {
    expect((await A.post('/api/documentos').send({ nome: 'x', contaId: api.contaB.contaId })).status).toBe(400);
    expect((await A.post('/api/documentos').send({ nome: 'x', arvore: documentoVazio() })).status).toBe(400);
    const d = await novoDocumento();
    expect((await A.patch(`/api/documentos/${d.id}`).send({ nome: 'x', arvore: documentoVazio() })).status).toBe(400);
  });

  it('JSON malformado é 400, não 500', async () => {
    const r = await A.post('/api/documentos').set('Content-Type', 'application/json').send('{"nome": ');
    expect([r.status, r.body]).toEqual([400, { codigo: CODIGOS_DE_ERRO.pedidoInvalido }]);
  });

  it('paginação fora do limite e cursor inventado são 400', async () => {
    expect((await A.get('/api/documentos?limite=0')).status).toBe(400);
    expect((await A.get(`/api/documentos?limite=${LIMITES.itensPorPaginaNoMaximo + 1}`)).status).toBe(400);
    expect((await A.get('/api/documentos?cursor=inventado')).status).toBe(400);
  });

  it('lote com operações demais é recusado antes de aplicar', async () => {
    const d = await novoDocumento();
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(
      lote(
        0,
        Array.from({ length: LIMITES.operacoesPorLote + 1 }, () => criarPrancheta()),
      ),
    );
    expect(r.status).toBe(400);
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${d.id}`)).body).versao).toBe(0);
  });

  it('corpo acima do limite é 413 com código, não erro interno', async () => {
    const d = await novoDocumento();
    const r = await A.post(`/api/documentos/${d.id}/lotes`).send(lote(0, [{ op: 'x', lixo: 'x'.repeat(LIMITES.bytesDoLote + 10) }]));
    expect(r.status).toBe(413);
    expect(ErroDaApi.parse(r.body).codigo).toBe(CODIGOS_DE_ERRO.corpoGrandeDemais);
  });
});
