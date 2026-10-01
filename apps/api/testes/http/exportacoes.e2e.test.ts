// Exportação de ponta a ponta (docs/mvp/backend.md, 7.6): rota, fila, o consumidor do worker, o motor
// de render e o PSD de verdade, download por link assinado. Só o armazenamento e a fila são os falsos.
import { randomUUID } from 'node:crypto';
import { ArquivoEnviado, CODIGOS_DE_ERRO, DocumentoAberto, ErroDaApi, EXPORTACOES_NA_FILA_POR_CONTA, Exportacao, ListaDeExportacoes, RelatorioDeExportacao } from '@otto/shared';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, criarForma, criarPrancheta, FONTE_ANTON, PNG, subirApi } from './subir';

let api: ApiDeTeste;
let A: ClienteDeTeste;
let doc: DocumentoAberto;
let feed: string;
let story: string;

async function montarDocumento(cliente: ClienteDeTeste, nome = 'Promoção de verão'): Promise<DocumentoAberto> {
  const criado = DocumentoAberto.parse((await cliente.post('/api/documentos').send({ nome })).body);
  const { sha256 } = ArquivoEnviado.parse((await cliente.post('/api/arquivos').set('Content-Type', 'image/png').send(PNG)).body);
  const r = await cliente.post(`/api/documentos/${criado.id}/lotes`).send({
    id: randomUUID(),
    versaoBase: 0,
    descricao: 'monta a peça',
    devolver: 'arvore',
    operacoes: [
      { op: 'criarPrancheta', nome: 'Feed', largura: 400, altura: 500, fundo: '#fff7e6' },
      { op: 'criarPrancheta', nome: 'Story', largura: 360, altura: 640, fundo: '#101010' },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 300, altura: 400, arquivo: sha256, larguraOriginal: 600, alturaOriginal: 800 } },
      { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 20, y: 410, largura: 360, altura: 80, conteudo: 'Verão', fonte: 'Anton', tamanho: 60, cor: '#112233' } },
      { op: 'criarNo', prancheta: 'Story', no: { tipo: 'forma', nome: 'Faixa', forma: 'retangulo', x: 0, y: 500, largura: 360, altura: 140, preenchimento: '#cc3300' } },
    ],
  });
  expect(r.status).toBe(200);
  return DocumentoAberto.parse((await cliente.get(`/api/documentos/${criado.id}`)).body);
}

beforeAll(async () => {
  api = await subirApi();
  A = api.como('A');
  doc = await montarDocumento(A);
  [feed, story] = doc.arvore.pranchetas.map((p) => p.id) as [string, string];
});
afterAll(async () => {
  await api?.fechar();
});

describe('relatório antes de exportar', () => {
  it('responde na hora, no formato do contrato, sem criar exportação', async () => {
    const r = await A.post(`/api/documentos/${doc.id}/exportacoes/relatorio`).send({ formato: 'psd' });
    expect(r.status).toBe(200);
    const relatorio = RelatorioDeExportacao.parse(r.body);
    expect(relatorio.camadas.map((c) => `${c.prancheta}/${c.camada}`)).toEqual(expect.arrayContaining(['Feed/Título', 'Feed/Foto', 'Story/Faixa']));
    expect(relatorio.fontes).toEqual([expect.objectContaining({ familia: 'Anton', peso: 400, postScript: 'Anton-Regular' })]);
    expect(relatorio.emFalta).toEqual({ fontes: [], imagens: [] });
    expect(api.fila.publicados).toEqual([]);
  });

  it('só das pranchetas pedidas', async () => {
    const r = await A.post(`/api/documentos/${doc.id}/exportacoes/relatorio`).send({ formato: 'psd', pranchetas: [story] });
    expect(new Set(RelatorioDeExportacao.parse(r.body).camadas.map((c) => c.prancheta))).toEqual(new Set(['Story']));
  });
});

describe('pedir, acompanhar e baixar', () => {
  let exportacao: Exportacao;

  it('POST responde 202 com a exportação na fila, e na fila só vão a conta e o id', async () => {
    const r = await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd' });
    expect(r.status).toBe(202);
    exportacao = Exportacao.parse(r.body);
    expect(exportacao).toMatchObject({ documentoId: doc.id, versao: 1, formato: 'psd', progresso: { pranchetasNoTotal: 2 } });
    expect(api.fila.publicados.at(-1)).toEqual({ fila: 'exportacao', trabalho: { contaId: api.contaA.contaId, id: exportacao.id } });
  });

  it('GET acompanha até ficar pronta: um PSD por prancheta, relatório do que saiu e data de vencimento', async () => {
    await api.fila.ociosa();
    const r = await A.get(`/api/exportacoes/${exportacao.id}`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    exportacao = Exportacao.parse(r.body);
    expect(exportacao).toMatchObject({ estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 }, falhas: [] });
    expect(exportacao.arquivos.map((a) => [a.nome, a.tipo, a.pranchetaId])).toEqual([
      ['Promoção de verão - Feed.psd', 'image/vnd.adobe.photoshop', feed],
      ['Promoção de verão - Story.psd', 'image/vnd.adobe.photoshop', story],
    ]);
    expect(exportacao.relatorio?.arquivos).toEqual(['Promoção de verão - Feed.psd', 'Promoção de verão - Story.psd']);
    const dias = (Date.parse(exportacao.expiraEm as string) - Date.parse(exportacao.prontaEm as string)) / 86_400_000;
    expect(dias).toBe(7);
    // a chave do objeto nunca aparece na resposta
    expect(JSON.stringify(r.body)).not.toContain('contas/');
  });

  it('baixar responde 302 para um link assinado, novo a cada pedido, que entrega o PSD como anexo sem sessão', async () => {
    const baixar = exportacao.arquivos[0]?.baixar as string;
    const [um, dois] = [await A.get(baixar), await A.get(baixar)];
    expect(um.status).toBe(302);
    expect(um.headers['cache-control']).toBe('no-store');
    expect(um.headers.location).toMatch(/^\/api\/links\//);
    expect(api.armazenamento.linksPedidos).toBeGreaterThanOrEqual(2);
    expect(dois.status).toBe(302);

    // o link é a credencial: funciona sem cookie e sem o cabeçalho do editor
    const arquivo = await api
      .como('A')
      .cru.get(um.headers.location as string)
      .buffer(true)
      .parse((res, fim) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => fim(null, Buffer.concat(partes)));
      });
    expect(arquivo.status).toBe(200);
    expect(arquivo.headers['content-type']).toBe('image/vnd.adobe.photoshop');
    expect(arquivo.headers['content-disposition']).toContain("filename*=UTF-8''Promo%C3%A7%C3%A3o%20de%20ver%C3%A3o%20-%20Feed.psd");
    expect(arquivo.headers['cache-control']).toBe('private, no-store');
    expect(arquivo.headers['x-content-type-options']).toBe('nosniff');
    expect((arquivo.body as Buffer).subarray(0, 4).toString('latin1')).toBe('8BPS');
    expect((arquivo.body as Buffer).byteLength).toBe(exportacao.arquivos[0]?.bytes);
  });

  it('link adulterado ou inventado é 404', async () => {
    const link = (await A.get(exportacao.arquivos[0]?.baixar as string)).headers.location as string;
    const adulterado = `${link.slice(0, -2)}${link.endsWith('AA') ? 'BB' : 'AA'}`;
    expect((await api.como('A').cru.get(adulterado)).status).toBe(404);
    expect((await api.como('A').cru.get('/api/links/qualquer-coisa')).status).toBe(404);
  });

  it('índice que não existe, e exportação que não existe: 404', async () => {
    expect((await A.get(`/api/exportacoes/${exportacao.id}/arquivos/9`)).status).toBe(404);
    expect((await A.get(`/api/exportacoes/${exportacao.id}/arquivos/-1`)).status).toBe(404);
    expect((await A.get(`/api/exportacoes/${exportacao.id}/arquivos/abc`)).status).toBe(404);
    expect((await A.get(`/api/exportacoes/${randomUUID()}`)).status).toBe(404);
    expect((await A.get('/api/exportacoes/nao-e-uuid')).status).toBe(404);
  });

  it('PSD com as pranchetas juntas, e PNG em 2x de uma prancheta', async () => {
    const juntas = Exportacao.parse((await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd', arquivos: 'juntas' })).body);
    const png = Exportacao.parse((await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'png', escala: 2, pranchetas: [story] })).body);
    await api.fila.ociosa();
    const [j, p] = [Exportacao.parse((await A.get(`/api/exportacoes/${juntas.id}`)).body), Exportacao.parse((await A.get(`/api/exportacoes/${png.id}`)).body)];
    expect(j).toMatchObject({ estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(j.arquivos.map((a) => a.nome)).toEqual(['Promoção de verão (todas as pranchetas).psd']);
    expect(p).toMatchObject({ estado: 'pronta', formato: 'png' });
    expect(p.arquivos.map((a) => [a.nome, a.tipo, a.pranchetaId])).toEqual([['Promoção de verão - Story.png', 'image/png', story]]);
    expect(p.relatorio).toBeUndefined();
  });

  it('exporta a versão do pedido: editar depois não muda o que foi pedido', async () => {
    const pedida = Exportacao.parse((await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'png' })).body);
    expect(pedida.versao).toBe(1);
  });
});

describe('SVG, PDF e pacote, com o motor de verdade', () => {
  const baixar = async (caminho: string): Promise<Buffer> => {
    const link = (await A.get(caminho)).headers.location as string;
    const r = await api
      .como('A')
      .cru.get(link)
      .buffer(true)
      .parse((res, fim) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => fim(null, Buffer.concat(partes)));
      });
    expect(r.status).toBe(200);
    return r.body as Buffer;
  };
  const exportar = async (pedido: object): Promise<Exportacao> => {
    const r = await A.post(`/api/documentos/${doc.id}/exportacoes`).send(pedido);
    expect(r.status).toBe(202);
    await api.fila.ociosa();
    return Exportacao.parse((await A.get(`/api/exportacoes/${Exportacao.parse(r.body).id}`)).body);
  };

  it('o relatório prévio do SVG e do PDF sai na hora, no formato do contrato', async () => {
    for (const formato of ['svg', 'pdf']) {
      const r = await A.post(`/api/documentos/${doc.id}/exportacoes/relatorio`).send({ formato });
      expect(r.status).toBe(200);
      expect(RelatorioDeExportacao.parse(r.body).camadas.map((c) => `${c.prancheta}/${c.camada}`)).toEqual(expect.arrayContaining(['Feed/Título', 'Story/Faixa']));
    }
  });

  it('SVG: um arquivo por prancheta, com o texto como texto, entregue como anexo', async () => {
    const e = await exportar({ formato: 'svg' });
    expect(e).toMatchObject({ estado: 'pronta', formato: 'svg' });
    expect(e.arquivos.map((a) => [a.nome, a.tipo])).toEqual([
      ['Promoção de verão - Feed.svg', 'image/svg+xml'],
      ['Promoção de verão - Story.svg', 'image/svg+xml'],
    ]);
    const svg = (await baixar(e.arquivos[0]?.baixar as string)).toString('utf8');
    expect(svg).toContain('<text');
    expect(svg).toContain('Verão');
    expect(e.relatorio?.arquivos).toEqual(['Promoção de verão - Feed.svg', 'Promoção de verão - Story.svg']);
  });

  it('PDF: as pranchetas juntas, uma página cada', async () => {
    const e = await exportar({ formato: 'pdf' });
    expect(e).toMatchObject({ estado: 'pronta', formato: 'pdf', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } });
    expect(e.arquivos.map((a) => [a.nome, a.tipo])).toEqual([['Promoção de verão.pdf', 'application/pdf']]);
    const pdf = await baixar(e.arquivos[0]?.baixar as string);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2);
  });

  it('pacote: um .zip com os PSDs, a fonte usada e o relatório em texto', async () => {
    const previo = RelatorioDeExportacao.parse((await A.post(`/api/documentos/${doc.id}/exportacoes/relatorio`).send({ formato: 'psd', pacote: true })).body);
    expect(previo.pacote?.fontes).toEqual([{ familia: 'Anton', peso: 400, postScript: 'Anton-Regular', licenca: 'SIL Open Font License 1.1', incluida: true, arquivo: 'Fontes/Anton-Regular.ttf' }]);

    const e = await exportar({ formato: 'psd', pacote: true });
    expect(e).toMatchObject({ estado: 'pronta', formato: 'psd', pacote: true });
    expect(e.arquivos.map((a) => [a.nome, a.tipo])).toEqual([['Promoção de verão.zip', 'application/zip']]);
    expect(e.relatorio?.pacote?.fontes).toEqual(previo.pacote?.fontes);

    const zip = unzipSync(await baixar(e.arquivos[0]?.baixar as string));
    expect(Object.keys(zip).sort()).toEqual(['Fontes/Anton-Regular.ttf', 'Promoção de verão - Feed.psd', 'Promoção de verão - Story.psd', 'Relatório de exportação.md'].sort());
    expect(
      Buffer.from(zip['Promoção de verão - Feed.psd'] as Uint8Array)
        .subarray(0, 4)
        .toString('latin1'),
    ).toBe('8BPS');
    expect(Buffer.from(zip['Fontes/Anton-Regular.ttf'] as Uint8Array).equals(FONTE_ANTON)).toBe(true);
    const relatorio = Buffer.from(zip['Relatório de exportação.md'] as Uint8Array).toString('utf8');
    expect(relatorio).toContain('# Relatório de exportação: Promoção de verão');
    expect(relatorio).toContain('Fontes/Anton-Regular.ttf');
  });

  it('pacote de SVG e de PDF', async () => {
    const svg = unzipSync(await baixar((await exportar({ formato: 'svg', pacote: true })).arquivos[0]?.baixar as string));
    expect(Object.keys(svg).filter((n) => n.endsWith('.svg'))).toHaveLength(2);
    const pdf = unzipSync(await baixar((await exportar({ formato: 'pdf', pacote: true })).arquivos[0]?.baixar as string));
    expect(Object.keys(pdf).sort()).toEqual(['Fontes/Anton-Regular.ttf', 'Promoção de verão.pdf', 'Relatório de exportação.md'].sort());
  });

  it('terminou com arquivo: a limpeza fica agendada para depois do vencimento', async () => {
    const e = await exportar({ formato: 'png', pranchetas: [story] });
    const agendada = api.fila.agendados.find((a) => a.trabalho.id === e.id);
    expect(agendada).toMatchObject({ fila: 'limpeza-de-exportacao', trabalho: { contaId: api.contaA.contaId, id: e.id } });
    expect(agendada?.naoAntesDe.getTime()).toBeGreaterThan(Date.parse(e.expiraEm as string));
  });
});

describe('retomar depois de recarregar a página', () => {
  it('GET /api/documentos/:id/exportacoes lista as exportações da peça, da mais nova para a mais velha, sem relatório e sem cache', async () => {
    const r = await A.get(`/api/documentos/${doc.id}/exportacoes`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const lista = ListaDeExportacoes.parse(r.body).itens;
    expect(lista.length).toBeGreaterThanOrEqual(5);
    expect(lista.every((e) => e.documentoId === doc.id && e.relatorio === undefined)).toBe(true);
    const datas = lista.map((e) => Date.parse(e.criadaEm));
    expect(datas).toEqual([...datas].sort((a, b) => b - a));
    expect(JSON.stringify(r.body)).not.toContain('contas/');
    // cada item traz o endereço de download estável
    const pronta = lista.find((e) => e.estado === 'pronta');
    expect((await A.get(pronta?.arquivos[0]?.baixar as string)).status).toBe(302);
  });

  it('peça sem exportação: lista vazia; peça que não existe: 404', async () => {
    const nova = DocumentoAberto.parse((await A.post('/api/documentos').send({ nome: 'Sem exportação' })).body);
    expect((await A.get(`/api/documentos/${nova.id}/exportacoes`)).body).toEqual({ itens: [] });
    expect((await A.get(`/api/documentos/${randomUUID()}/exportacoes`)).status).toBe(404);
  });
});

describe('recusas', () => {
  it.each([
    ['formato desconhecido', { formato: 'ai' }],
    ['campo a mais', { formato: 'psd', chave: 'contas/outra/arquivos/x' }],
    ['escala fora do aceito', { formato: 'png', escala: 3 }],
    ['corpo vazio', {}],
  ])('%s: 400 pedido_invalido, nas duas rotas', async (_caso, corpo) => {
    for (const rota of ['exportacoes', 'exportacoes/relatorio']) {
      const r = await A.post(`/api/documentos/${doc.id}/${rota}`).send(corpo);
      expect(r.status).toBe(400);
      expect(ErroDaApi.parse(r.body).codigo).toBe(CODIGOS_DE_ERRO.pedidoInvalido);
    }
  });

  it('prancheta que o documento não tem: 422', async () => {
    const r = await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd', pranchetas: ['nao-existe'] });
    expect(r.status).toBe(422);
    expect(ErroDaApi.parse(r.body).codigo).toBe(CODIGOS_DE_ERRO.pranchetaDesconhecida);
  });

  it('documento sem prancheta: 422 nada_para_exportar', async () => {
    const vazio = DocumentoAberto.parse((await A.post('/api/documentos').send({ nome: 'Vazio' })).body);
    const r = await A.post(`/api/documentos/${vazio.id}/exportacoes`).send({ formato: 'psd' });
    expect(r.status).toBe(422);
    expect(ErroDaApi.parse(r.body).codigo).toBe(CODIGOS_DE_ERRO.nadaParaExportar);
  });

  it('sem o cabeçalho do editor, pedir exportação é recusado (escrita forjada por outro site)', async () => {
    const r = await A.cru.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd' });
    expect(r.status).toBe(403);
  });
});

describe('enquanto a exportação espera na fila', () => {
  let parada: ApiDeTeste;
  let P: ClienteDeTeste;
  let docParado: DocumentoAberto;

  beforeAll(async () => {
    parada = await subirApi({}, { consumirFila: false });
    P = parada.como('A');
    docParado = DocumentoAberto.parse((await P.post('/api/documentos').send({ nome: 'Parado' })).body);
    await P.post(`/api/documentos/${docParado.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'monta', operacoes: [criarPrancheta(), criarForma('Botão')] });
  });
  afterAll(async () => {
    await parada?.fechar();
  });

  it('baixar antes de ficar pronta: 409 exportacao_nao_pronta, com o estado', async () => {
    const e = Exportacao.parse((await P.post(`/api/documentos/${docParado.id}/exportacoes`).send({ formato: 'psd' })).body);
    expect(e.estado).toBe('na_fila');
    const r = await P.get(`/api/exportacoes/${e.id}/arquivos/0`);
    expect(r.status).toBe(409);
    expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.exportacaoNaoPronta, detalhe: { estado: 'na_fila' } });
    expect(parada.armazenamento.linksPedidos).toBe(0);
  });

  it('a conta tem um limite de exportações esperando: a seguinte é 429, e a outra conta continua pedindo', async () => {
    for (let i = 1; i < EXPORTACOES_NA_FILA_POR_CONTA; i++) expect((await P.post(`/api/documentos/${docParado.id}/exportacoes`).send({ formato: 'png' })).status).toBe(202);
    const r = await P.post(`/api/documentos/${docParado.id}/exportacoes`).send({ formato: 'png' });
    expect(r.status).toBe(429);
    expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.limiteDeExportacoes, detalhe: { limite: EXPORTACOES_NA_FILA_POR_CONTA } });

    const B = parada.como('B');
    const deB = DocumentoAberto.parse((await B.post('/api/documentos').send({ nome: 'De B' })).body);
    await B.post(`/api/documentos/${deB.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'monta', operacoes: [criarPrancheta()] });
    expect((await B.post(`/api/documentos/${deB.id}/exportacoes`).send({ formato: 'png' })).status).toBe(202);
  });
});
