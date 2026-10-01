// Envio e leitura de arquivo, e fontes da biblioteca, de ponta a ponta.
import { createHash, randomUUID } from 'node:crypto';
import { ArquivoEnviado, CODIGOS_DE_ERRO, ErroDaApi, FonteDaBiblioteca, LIMITES, ListaDeFontes, RespostaDeLote, VetorImportado } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, criarPrancheta, FONTE_ANTON, JPEG, PNG, subirApi } from './subir';

let api: ApiDeTeste;
let A: ClienteDeTeste;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

beforeAll(async () => {
  api = await subirApi({ BYTES_MAXIMOS_POR_ARQUIVO: String(2 * 1024 * 1024) });
  A = api.como('A');
});
afterAll(async () => {
  await api?.fechar();
});

function pngDe(largura: number, altura: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return b;
}

const enviar = (bytes: Buffer, tipo = 'image/png') => A.post('/api/arquivos').set('Content-Type', tipo).send(bytes);

/** supertest só entrega os bytes crus se a gente pedir. */
const baixar = (caminho: string) =>
  A.get(caminho)
    .buffer(true)
    .parse((res, fim) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => fim(null, Buffer.concat(partes)));
    });

describe('POST /api/arquivos', () => {
  it('guarda a imagem e responde 201 com hash, tipo e medidas lidos do conteúdo', async () => {
    const r = await enviar(PNG);
    expect(r.status).toBe(201);
    expect(ArquivoEnviado.parse(r.body)).toEqual({ sha256: sha(PNG), tipo: 'image/png', largura: 600, altura: 800, bytes: PNG.byteLength });
  });

  it('o tipo vem do conteúdo: JPEG enviado como PNG é registrado como JPEG', async () => {
    expect(ArquivoEnviado.parse((await enviar(JPEG, 'image/png')).body).tipo).toBe('image/jpeg');
  });

  it('conteúdo que não é imagem aceita: 415', async () => {
    const r = await enviar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect([r.status, r.body]).toEqual([415, { codigo: CODIGOS_DE_ERRO.tipoNaoAceito }]);
  });

  it('imagem de poucos bytes que declara medida gigante: 422, recusada pelo cabeçalho', async () => {
    const r = await enviar(pngDe(50_000, 50_000));
    expect(r.status).toBe(422);
    expect(ErroDaApi.parse(r.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.imagemGrandeDemais, detalhe: { ladoMaximo: 12_000 } });
  });

  it('imagem com cabeçalho cortado: 422 imagem_ilegivel', async () => {
    expect((await enviar(PNG.subarray(0, 18))).body).toEqual({ codigo: CODIGOS_DE_ERRO.imagemIlegivel });
  });

  it('acima do limite de bytes: 413 com o limite', async () => {
    const r = await enviar(Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]), 'image/jpeg');
    expect(r.status).toBe(413);
    expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.arquivoGrandeDemais, detalhe: { limiteEmBytes: 2 * 1024 * 1024 } });
  });

  it('corpo vazio ou com tipo de conteúdo que não é imagem não vira arquivo', async () => {
    expect((await A.post('/api/arquivos').set('Content-Type', 'image/png').send(Buffer.alloc(0))).status).toBe(415);
    expect((await A.post('/api/arquivos').send({ arquivo: 'x' })).status).toBe(415);
  });
});

describe('GET /api/arquivos/:sha256', () => {
  it('entrega os bytes com o tipo guardado, cache imutável e privado, e sem deixar o navegador adivinhar o tipo', async () => {
    await enviar(PNG);
    const r = await baixar(`/api/arquivos/${sha(PNG)}`);
    expect(r.status).toBe(200);
    expect(sha(r.body as Buffer)).toBe(sha(PNG));
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers.etag).toBe(`"${sha(PNG)}"`);
  });

  it('com If-None-Match igual ao hash: 304 sem corpo', async () => {
    await enviar(PNG);
    expect((await A.get(`/api/arquivos/${sha(PNG)}`).set('If-None-Match', `"${sha(PNG)}"`)).status).toBe(304);
  });

  it('hash que a conta não tem e hash malformado respondem o mesmo 404', async () => {
    const inexistente = await A.get(`/api/arquivos/${'f'.repeat(64)}`);
    expect([inexistente.status, inexistente.body]).toEqual([404, { codigo: CODIGOS_DE_ERRO.naoEncontrado }]);
    for (const torto of ['abc', '..%2F..%2Fetc%2Fpasswd', 'A'.repeat(64)]) {
      const r = await A.get(`/api/arquivos/${torto}`);
      expect([r.status, r.body], torto).toEqual([404, { codigo: CODIGOS_DE_ERRO.naoEncontrado }]);
    }
  });

  it('imagem enviada pode ser usada num lote', async () => {
    const { sha256 } = ArquivoEnviado.parse((await enviar(PNG)).body);
    const doc = (await A.post('/api/documentos').send({})).body as { id: string };
    const imagem = { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 300, altura: 400, arquivo: sha256, larguraOriginal: 600, alturaOriginal: 800 } };
    const r = await A.post(`/api/documentos/${doc.id}/lotes`).send({ id: randomUUID(), versaoBase: 0, descricao: 'põe a foto', operacoes: [criarPrancheta(), imagem] });
    expect(RespostaDeLote.parse(r.body).versao).toBe(1);
  });
});

describe('POST /api/vetores', () => {
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#0037A6"/></svg>';
  const importar = (svg: string, nome = 'logo.svg') =>
    A.post(`/api/vetores?nome=${encodeURIComponent(nome)}`)
      .set('Content-Type', 'image/svg+xml')
      .send(svg);

  it('importa o SVG e devolve 201 com o nó pronto para criarNo, que entra num lote', async () => {
    const r = await importar(LOGO, 'logo do cliente.svg');
    expect(r.status).toBe(201);
    const vetor = VetorImportado.parse(r.body);
    expect(vetor.no).toMatchObject({ tipo: 'vetor', moldura: [100, 50], origem: { nome: 'logo do cliente.svg' } });
    const doc = (await A.post('/api/documentos').send({})).body as { id: string };
    const lote = {
      id: randomUUID(),
      versaoBase: 0,
      descricao: 'põe o logo',
      operacoes: [criarPrancheta(), { op: 'criarNo', prancheta: 'Feed', no: { ...vetor.no, nome: 'Logo', x: 0, y: 0, largura: 200, altura: 100 } }],
    };
    expect(RespostaDeLote.parse((await A.post(`/api/documentos/${doc.id}/lotes`).send(lote)).body).versao).toBe(1);
  });

  it('SVG com declaração de entidade: 422 svg_invalido', async () => {
    const r = await importar('<!DOCTYPE x [<!ENTITY a "aaaa">]><svg viewBox="0 0 1 1"><path d="M0 0H1V1Z"/></svg>');
    expect([r.status, r.body]).toEqual([422, { codigo: CODIGOS_DE_ERRO.svgInvalido, detalhe: { motivo: 'entidades' } }]);
  });

  it('corpo que não é texto de SVG: 422; corpo acima de 5 MB: 413', async () => {
    expect((await A.post('/api/vetores').send({ svg: LOGO })).body).toMatchObject({ codigo: CODIGOS_DE_ERRO.svgInvalido });
    const grande = await importar(`<svg viewBox="0 0 1 1"><!-- ${'x'.repeat(LIMITES.bytesDoSvg)} --><path d="M0 0H1V1Z"/></svg>`);
    expect([grande.status, grande.body.codigo]).toEqual([413, CODIGOS_DE_ERRO.corpoGrandeDemais]);
  });

  it('o SVG guardado não é servido de volta pela rota de arquivos', async () => {
    const vetor = VetorImportado.parse((await importar(LOGO)).body);
    expect((await A.get(`/api/arquivos/${vetor.no.origem.arquivo}`)).status).toBe(404);
  });
});

describe('fontes da biblioteca', () => {
  it('GET /api/fontes lista família e pesos, com busca', async () => {
    const todas = ListaDeFontes.parse((await A.get('/api/fontes')).body);
    expect(todas.itens).toContainEqual({ familia: 'Anton', pesos: [400] });
    expect(ListaDeFontes.parse((await A.get('/api/fontes?q=ANT')).body).itens.map((f) => f.familia)).toEqual(['Anton']);
    expect(ListaDeFontes.parse((await A.get('/api/fontes?q=nenhuma')).body).itens).toEqual([]);
  });

  it('GET /api/fontes/:familia/:peso devolve o peso mais próximo e o endereço dos bytes', async () => {
    const r = await A.get('/api/fontes/Anton/700');
    expect(FonteDaBiblioteca.parse(r.body)).toEqual({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', arquivo: '/api/fontes/Anton/400/arquivo' });
  });

  it('GET .../arquivo entrega os bytes da fonte, com cache e ETag pelo conteúdo', async () => {
    const r = await baixar('/api/fontes/Anton/400/arquivo');
    expect(r.status).toBe(200);
    expect(sha(r.body as Buffer)).toBe(sha(FONTE_ANTON));
    expect(r.headers['content-type']).toBe('font/ttf');
    expect(r.headers.etag).toBe(`"${sha(FONTE_ANTON)}"`);
    expect(r.headers['cache-control']).toBe('public, max-age=86400');
    expect((await A.get('/api/fontes/Anton/400/arquivo').set('If-None-Match', r.headers.etag as string)).status).toBe(304);
  });

  it('família desconhecida ou peso torto: 404', async () => {
    for (const caminho of ['/api/fontes/Comic%20Sans/400', '/api/fontes/Comic%20Sans/400/arquivo', '/api/fontes/Anton/pesado', '/api/fontes/Anton/pesado/arquivo']) {
      const r = await A.get(caminho);
      expect([r.status, r.body], caminho).toEqual([404, { codigo: CODIGOS_DE_ERRO.naoEncontrado }]);
    }
  });
});
