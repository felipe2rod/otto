// Importação de PSD de ponta a ponta (docs/mvp/backend.md, 17.14): rota, conferência do envio, fila, o consumidor
// do worker, o motor de verdade (@otto/psd sobre o CanvasKit), a peça criada, o relatório e a miniatura.
// Só o armazenamento, a fila, a biblioteca de fontes e o catálogo são os falsos.
import { readFileSync } from 'node:fs';
import { request as pedirPorHttp, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { CODIGOS_DE_ERRO, DocumentoAberto, ErroDaApi, Exportacao, IMPORTACOES_ABERTAS_POR_CONTA, Importacao, ListaDeDocumentos, ListaDeImportacoes, TIPO_DO_PSD } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, PECA_PARA_O_AJUSTE, subirApi } from './subir';

const PSD = path.resolve(import.meta.dirname, '../../../../packages/psd');
const golden = (nome: string) => readFileSync(path.join(PSD, 'goldens', `${nome}.psd`));
const deFora = (nome: string) => readFileSync(path.join(PSD, 'recursos-de-teste/psd-de-fora', nome));
const PLEX_BOLD = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/render/recursos-de-teste/fontes/IBMPlexSans-Bold.ttf'));

let api: ApiDeTeste;
let A: ClienteDeTeste;

const enviar = (cliente: ClienteDeTeste, bytes: Buffer, nome = 'Campanha de verão.psd') =>
  cliente.post('/api/importacoes').set('Content-Type', TIPO_DO_PSD).set('X-Otto-Nome-Do-Arquivo', encodeURIComponent(nome)).send(bytes);

async function importar(cliente: ClienteDeTeste, bytes: Buffer, nome: string, pedido: object = {}): Promise<Importacao> {
  const enviada = Importacao.parse((await enviar(cliente, bytes, nome)).body);
  const pedida = await cliente.post(`/api/importacoes/${enviada.id}/importar`).send(pedido);
  expect(pedida.status).toBe(202);
  await api.fila.ociosa();
  return Importacao.parse((await cliente.get(`/api/importacoes/${enviada.id}`)).body);
}

/** Um envio em pedaços, sem tamanho declarado, por uma conexão de verdade (o supertest sempre declara o tamanho). */
async function enviarEmPedacos(bytes: Buffer, pedaco = 256 * 1024): Promise<{ status: number; corpo: unknown }> {
  const servidor = api.app.getHttpServer() as Server;
  if (!servidor.listening) await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  return new Promise((resolver, rejeitar) => {
    const req = pedirPorHttp(
      { host: '127.0.0.1', port, method: 'POST', path: '/api/importacoes', headers: { 'Content-Type': TIPO_DO_PSD, Cookie: 'otto_sessao=A', 'X-Otto-Cliente': 'editor' } },
      (res) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => resolver({ status: res.statusCode ?? 0, corpo: JSON.parse(Buffer.concat(partes).toString('utf8') || 'null') }));
      },
    );
    req.on('error', rejeitar);
    for (let i = 0; i < bytes.byteLength; i += pedaco) req.write(bytes.subarray(i, i + pedaco));
    req.end();
  });
}

beforeAll(async () => {
  api = await subirApi({ PSD_BYTES_MAXIMOS: String(2 * 1024 * 1024) });
  A = api.como('A');
  await api.fontes.registrar({ familia: 'IBM Plex Sans', peso: 700, nomePostScript: 'IBMPlexSans-Bold', licenca: 'SIL Open Font License 1.1', conteudo: PLEX_BOLD });
});
afterAll(async () => {
  await api?.fechar();
});

describe('enviar o PSD', () => {
  it('201 com o que a conferência viu e a situação das fontes; nada vai para a fila de importação, e a chave do objeto não sai', async () => {
    const bytes = golden('peca');
    const r = await enviar(A, bytes);
    expect(r.status).toBe(201);
    const enviada = Importacao.parse(r.body);
    expect(enviada).toMatchObject({ estado: 'enviada', arquivo: { nome: 'Campanha de verão.psd', bytes: bytes.byteLength, formato: 'psd' } });
    expect(enviada.fontes).toEqual([
      { postScript: 'Anton-Regular', situacao: 'na_biblioteca', familia: 'Anton', peso: 400 },
      { postScript: 'IBMPlexSans-Bold', situacao: 'na_biblioteca', familia: 'IBM Plex Sans', peso: 700 },
    ]);
    expect(JSON.stringify(r.body)).not.toMatch(/contas\/|chave/i);
    expect(api.fila.publicados.filter((p) => p.fila === 'importacao')).toEqual([]);
    expect((await A.delete(`/api/importacoes/${enviada.id}`)).status).toBe(204);
  });

  it('o tipo é conferido pelos bytes: imagem, SVG e lixo com o cabeçalho de PSD são recusados com 422 e o motivo', async () => {
    for (const corpo of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), Buffer.alloc(64, 7)]) {
      const r = await enviar(A, corpo, 'inocente.psd');
      expect(r.status).toBe(422);
      expect(ErroDaApi.parse(r.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.psdRecusado, detalhe: { motivo: 'nao-e-psd' } });
      expect(r.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('recusa o que a v1 não importa (tons de cinza) e o arquivo cortado, com a frase de @otto/psd no detalhe', async () => {
    const cinza = await enviar(A, deFora('grayscale.psd'));
    expect(cinza.status).toBe(422);
    expect(cinza.body).toMatchObject({ codigo: 'psd_recusado', detalhe: { motivo: 'modo-de-cor' } });
    expect(typeof cinza.body.detalhe.mensagem).toBe('string');
    const cortado = await enviar(A, golden('peca').subarray(0, 3000));
    expect(cortado.status).toBe(422);
    expect(['arquivo-truncado', 'arquivo-malformado']).toContain(cortado.body.detalhe.motivo);
  });

  it('acima do teto de bytes: 413 com o limite, pelo tamanho declarado e pelo tamanho de verdade, sem guardar nada', async () => {
    const antes = api.armazenamento.chaves().length;
    const grande = Buffer.concat([golden('forma'), Buffer.alloc(2 * 1024 * 1024)]);
    const declarado = await enviar(A, grande);
    expect(declarado.status).toBe(413);
    expect(ErroDaApi.parse(declarado.body)).toEqual({ codigo: CODIGOS_DE_ERRO.arquivoGrandeDemais, detalhe: { limiteEmBytes: 2 * 1024 * 1024 } });
    // sem tamanho declarado (envio em pedaços): o leitor conta os bytes e para no teto
    const emPedacos = await enviarEmPedacos(grande);
    expect(emPedacos).toEqual({ status: 413, corpo: { codigo: CODIGOS_DE_ERRO.arquivoGrandeDemais, detalhe: { limiteEmBytes: 2 * 1024 * 1024 } } });
    expect(api.armazenamento.chaves()).toHaveLength(antes);
    // e o envio em pedaços que cabe no teto entra
    const cabe = await enviarEmPedacos(golden('forma'), 1000);
    expect(cabe.status).toBe(201);
    expect((await A.delete(`/api/importacoes/${(cabe.corpo as { id: string }).id}`)).status).toBe(204);
  });

  it('tipo declarado que não é de PSD: 415; corpo em JSON não é arquivo', async () => {
    const texto = await A.post('/api/importacoes').set('Content-Type', 'text/plain').send('8BPS');
    expect(texto.status).toBe(415);
    const json = await A.post('/api/importacoes').send({ arquivo: 'x' });
    expect(json.status).toBe(415);
  });

  it('sem o cabeçalho de escrita, como faria um site qualquer: 403', async () => {
    const r = await A.cru.post('/api/importacoes').set('Cookie', 'otto_sessao=A').set('Content-Type', TIPO_DO_PSD).send(golden('forma'));
    expect(r.status).toBe(403);
  });

  it('o limite de importações abertas da conta responde 429', async () => {
    const B = api.como('B');
    const ids: string[] = [];
    for (let i = 0; i < IMPORTACOES_ABERTAS_POR_CONTA; i++) ids.push(Importacao.parse((await enviar(B, golden('forma'))).body).id);
    const r = await enviar(B, golden('forma'));
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ codigo: CODIGOS_DE_ERRO.limiteDeImportacoes, detalhe: { limite: IMPORTACOES_ABERTAS_POR_CONTA } });
    for (const id of ids) expect((await B.delete(`/api/importacoes/${id}`)).status).toBe(204);
    expect((await enviar(B, golden('forma'))).status).toBe(201);
  });
});

describe('envios ao mesmo tempo', () => {
  it('o servidor lê dois envios de cada vez; o terceiro é recusado na hora, sem ler o corpo, e entra quando um dos dois termina', async () => {
    const servidor = api.app.getHttpServer() as Server;
    if (!servidor.listening) await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address() as AddressInfo;
    const bytes = golden('forma');
    const abrir = () => {
      let resolver: (r: { status: number; corpo: { id?: string; codigo?: string; detalhe?: unknown } }) => void = () => {};
      const resposta = new Promise<{ status: number; corpo: { id?: string; codigo?: string; detalhe?: unknown } }>((ok) => (resolver = ok));
      const req = pedirPorHttp(
        { host: '127.0.0.1', port, method: 'POST', path: '/api/importacoes', headers: { 'Content-Type': TIPO_DO_PSD, Cookie: 'otto_sessao=A', 'X-Otto-Cliente': 'editor' } },
        (res) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => resolver({ status: res.statusCode ?? 0, corpo: JSON.parse(Buffer.concat(partes).toString('utf8') || '{}') }));
        },
      );
      req.on('error', () => undefined);
      // manda a primeira metade e segura o resto
      req.write(bytes.subarray(0, 1000));
      return { resposta, terminar: () => req.end(bytes.subarray(1000)) };
    };
    const [primeiro, segundo] = [abrir(), abrir()];
    await new Promise((ok) => setTimeout(ok, 100));
    const terceiro = abrir();
    terceiro.terminar();
    expect(await terceiro.resposta).toEqual({ status: 429, corpo: { codigo: CODIGOS_DE_ERRO.limiteDeImportacoes, detalhe: { motivo: 'envios_ao_mesmo_tempo', limite: 2 } } });
    primeiro.terminar();
    segundo.terminar();
    const feitos = [await primeiro.resposta, await segundo.resposta];
    expect(feitos.map((f) => f.status)).toEqual([201, 201]);
    // e a vaga volta
    const quarto = abrir();
    quarto.terminar();
    const ultimo = await quarto.resposta;
    expect(ultimo.status).toBe(201);
    for (const f of [...feitos, ultimo]) expect((await A.delete(`/api/importacoes/${f.corpo.id}`)).status).toBe(204);
  });
});

describe('PSD exportado pelo Otto, importado de volta', () => {
  let pronta: Importacao;
  let peca: DocumentoAberto;

  it('pedir responde 202 na fila; depois do worker, a importação está pronta com a peça e o relatório', async () => {
    const enviada = Importacao.parse((await enviar(A, golden('peca'))).body);
    const pedida = await A.post(`/api/importacoes/${enviada.id}/importar`).send({});
    expect(pedida.status).toBe(202);
    expect(Importacao.parse(pedida.body)).toMatchObject({ id: enviada.id, estado: 'na_fila' });
    expect(api.fila.publicados.at(-1)).toEqual({ fila: 'importacao', trabalho: { contaId: api.contaA.contaId, id: enviada.id } });
    await api.fila.ociosa();
    const r = await A.get(`/api/importacoes/${enviada.id}`);
    expect(r.headers['cache-control']).toBe('no-store');
    pronta = Importacao.parse(r.body);
    expect(pronta.estado).toBe('pronta');
    expect(pronta.relatorio?.arquivo).toMatchObject({ formato: 'psd' });
    expect(pronta.relatorio?.emFalta.fontes).toEqual([]);
    expect(pronta.relatorio?.camadas.some((c) => c.tipo === 'texto' && c.destino === 'editavel')).toBe(true);
    expect(pronta.duracaoMs).toBeGreaterThan(0);
  });

  it('a peça abre como qualquer outra: versão 0, sem histórico, com as pranchetas, o texto editável e de onde veio', async () => {
    const r = await A.get(`/api/documentos/${pronta.documentoId}`);
    expect(r.status).toBe(200);
    peca = DocumentoAberto.parse(r.body);
    expect(peca).toMatchObject({ nome: 'Campanha de verão', versao: 0, importacaoId: pronta.id, podeDesfazer: false });
    expect(peca.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story']);
    expect(peca.arvore.pranchetas.flatMap((p) => p.filhos).some((n) => n.tipo === 'texto')).toBe(true);
    expect(peca.fontes.map((f) => f.familia).sort()).toEqual(['Anton', 'IBM Plex Sans']);
    expect((await A.get(`/api/documentos/${peca.id}/historico`)).body.itens).toEqual([]);
    const naLista = ListaDeDocumentos.parse((await A.get('/api/documentos')).body).itens.find((d) => d.id === peca.id);
    expect(naLista?.importacaoId).toBe(pronta.id);
  });

  it('as imagens da peça são arquivos da conta: saem pela rota de arquivo, e só para a conta dona', async () => {
    const citadas = [...JSON.stringify(peca.arvore).matchAll(/"arquivo":"([0-9a-f]{64})"/g)].map((m) => m[1] as string);
    expect(citadas.length).toBeGreaterThan(0);
    for (const sha256 of new Set(citadas)) {
      expect((await A.get(`/api/arquivos/${sha256}`)).status).toBe(200);
      expect((await api.como('B').get(`/api/arquivos/${sha256}`)).status).toBe(404);
    }
  });

  it('o arquivo enviado foi apagado do armazenamento; o relatório continua consultável pela peça', async () => {
    expect(api.armazenamento.chaves().filter((c) => c.includes(`/importacoes/${pronta.id}/`))).toEqual([]);
    const r = await A.get(`/api/documentos/${peca.id}/importacao`);
    expect(r.status).toBe(200);
    expect(Importacao.parse(r.body)).toEqual(pronta);
  });

  it('a miniatura da peça importada é feita logo depois', async () => {
    const naLista = ListaDeDocumentos.parse((await A.get('/api/documentos')).body).itens.find((d) => d.id === peca.id);
    expect(naLista?.miniatura).toBe(`/api/documentos/${peca.id}/miniatura?v=0`);
    const miniatura = await A.get(naLista?.miniatura as string);
    expect(miniatura.status).toBe(200);
    expect(miniatura.headers['content-type']).toBe('image/jpeg');
  });

  it('a peça importada edita, exporta e recebe tarefa do Otto pelo mesmo caminho de qualquer peça', async () => {
    const feed = peca.arvore.pranchetas[0];
    const lote = await A.post(`/api/documentos/${peca.id}/lotes`).send({
      id: crypto.randomUUID(),
      versaoBase: 0,
      descricao: 'uma forma por cima',
      operacoes: [{ op: 'criarNo', prancheta: feed?.id, no: { tipo: 'forma', nome: 'Selo novo', forma: 'retangulo', x: 5, y: 5, largura: 20, altura: 20, preenchimento: '#00ff00' } }],
    });
    expect(lote.status).toBe(200);
    const exportacao = await A.post(`/api/documentos/${peca.id}/exportacoes`).send({ formato: 'psd', arquivos: 'juntas' });
    expect(exportacao.status).toBe(202);
    await api.fila.ociosa();
    expect(Exportacao.parse((await A.get(`/api/exportacoes/${exportacao.body.id}`)).body).estado).toBe('pronta');
    // o Otto lê a peça importada pela mesma bancada: o nome e o texto das camadas chegam a ele como material
    const tarefa = await A.post(`/api/documentos/${peca.id}/tarefas`).send({ tipo: 'ajuste', pedido: 'deixe o título em azul' });
    expect(tarefa.status).toBe(202);
    await api.fila.ociosa();
    const depois = DocumentoAberto.parse((await A.get(`/api/documentos/${peca.id}`)).body);
    expect(depois.conjuntoPendente?.tarefaId).toBe(tarefa.body.id);
  });

  it('pedir de novo a mesma importação: 409; a lista traz a importação sem o relatório', async () => {
    const de_novo = await A.post(`/api/importacoes/${pronta.id}/importar`).send({});
    expect(de_novo.status).toBe(409);
    expect(de_novo.body).toEqual({ codigo: CODIGOS_DE_ERRO.importacaoForaDoEstado, detalhe: { estado: 'pronta' } });
    const lista = ListaDeImportacoes.parse((await A.get('/api/importacoes')).body);
    const item = lista.itens.find((i) => i.id === pronta.id);
    expect(item).toMatchObject({ estado: 'pronta', documentoId: peca.id });
    expect(item?.relatorio).toBeUndefined();
  });
});

describe('PSD de fora do Otto', () => {
  it('com texto em fonte que o Otto não tem: por padrão o texto vem como imagem e o relatório diz qual fonte faltou', async () => {
    const pronta = await importar(A, deFora('text-simple.psd'), 'de fora.psd');
    expect(pronta.estado).toBe('pronta');
    expect(pronta.fontes.every((f) => f.situacao === 'em_falta')).toBe(true);
    expect(pronta.relatorio?.emFalta.fontes.length).toBeGreaterThan(0);
    expect(pronta.relatorio?.avisos.map((a) => a.codigo)).toContain('fonte-em-falta');
    const peca = DocumentoAberto.parse((await A.get(`/api/documentos/${pronta.documentoId}`)).body);
    expect(peca.nome).toBe('de fora');
    expect(peca.arvore.pranchetas.flatMap((p) => p.filhos).some((n) => n.tipo === 'texto')).toBe(false);
  });

  it('com a troca de fonte escolhida pelo designer, o texto vem editável e a troca aparece no relatório', async () => {
    const enviada = Importacao.parse((await enviar(A, deFora('text-simple.psd'), 'trocada.psd')).body);
    const fontes = enviada.fontes.map((f) => ({ postScript: f.postScript, fazer: 'substituir', por: { familia: 'Anton', peso: 400 } }));
    expect((await A.post(`/api/importacoes/${enviada.id}/importar`).send({ nome: 'Com a fonte trocada', fontes })).status).toBe(202);
    await api.fila.ociosa();
    const pronta = Importacao.parse((await A.get(`/api/importacoes/${enviada.id}`)).body);
    expect(pronta.estado).toBe('pronta');
    expect(pronta.relatorio?.substituicoes.map((s) => s.usada.postScript)).toContain('Anton-Regular');
    const peca = DocumentoAberto.parse((await A.get(`/api/documentos/${pronta.documentoId}`)).body);
    expect(peca.nome).toBe('Com a fonte trocada');
    expect(peca.arvore.pranchetas.flatMap((p) => p.filhos).some((n) => n.tipo === 'texto' && n.fonte === 'Anton')).toBe(true);
  });

  it('fonte que o catálogo tem é baixada por padrão, antes de importar', async () => {
    // o catálogo falso entrega o mesmo arquivo para qualquer família: aqui basta ver que a família foi trazida
    const enviada = Importacao.parse((await enviar(A, deFora('text-simple.psd'), 'catalogo.psd')).body);
    const antes = api.catalogo.baixados.length;
    expect(
      (
        await A.post(`/api/importacoes/${enviada.id}/importar`).send({
          fontes: enviada.fontes.map((f) => ({ postScript: f.postScript, fazer: 'substituir', por: { familia: 'Lilita One', peso: 400 } })),
        })
      ).status,
    ).toBe(202);
    await api.fila.ociosa();
    expect(api.catalogo.baixados.slice(antes)).toEqual(['Lilita One|400']);
    expect(Importacao.parse((await A.get(`/api/importacoes/${enviada.id}`)).body).estado).toBe('pronta');
  });

  it('vários arquivos gravados pelo Photoshop: grupos, máscara, efeitos, vetor, pranchetas e PSB viram peça que abre', async () => {
    for (const nome of ['groups.psd', 'layer-mask.psd', 'effects.psd', 'vector-layer.psd', 'artboards.psd', 'psb.psb']) {
      const pronta = await importar(A, deFora(nome), nome);
      expect([nome, pronta.estado]).toEqual([nome, 'pronta']);
      const peca = await A.get(`/api/documentos/${pronta.documentoId}`);
      expect(peca.status).toBe(200);
      expect(DocumentoAberto.parse(peca.body).arvore.pranchetas.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('escolha de fonte que o arquivo não pede: 400; troca por família que não existe: 422; marca que a conta não tem: 422', async () => {
    const enviada = Importacao.parse((await enviar(A, deFora('text-simple.psd'), 'recusas.psd')).body);
    const url = `/api/importacoes/${enviada.id}/importar`;
    expect((await A.post(url).send({ fontes: [{ postScript: 'Inventada-Bold', fazer: 'imagem' }] })).status).toBe(400);
    const troca = await A.post(url).send({ fontes: [{ postScript: enviada.fontes[0]?.postScript, fazer: 'substituir', por: { familia: 'Não Existe', peso: 400 } }] });
    expect([troca.status, troca.body.codigo]).toEqual([422, CODIGOS_DE_ERRO.fonteDesconhecida]);
    const marca = await A.post(url).send({ marcaId: crypto.randomUUID() });
    expect([marca.status, marca.body.codigo]).toEqual([422, CODIGOS_DE_ERRO.marcaDesconhecida]);
    expect((await A.post(url).send({ chaveDoObjeto: 'contas/x/importacoes/y/original.psd' })).status).toBe(400);
    expect((await A.delete(`/api/importacoes/${enviada.id}`)).status).toBe(204);
  });

  it('a peça importada com marca aparece no filtro da marca', async () => {
    const marca = await A.post('/api/marcas').send({ nome: 'Padaria', cores: {}, icones: [], restricoes: [] });
    expect(marca.status).toBe(201);
    const pronta = await importar(A, golden('forma'), 'com marca.psd', { marcaId: marca.body.id });
    const daMarca = ListaDeDocumentos.parse((await A.get(`/api/documentos?marca=${marca.body.id}`)).body).itens;
    expect(daMarca.map((d) => d.id)).toEqual([pronta.documentoId]);
  });
});

describe('peça que não veio de PSD', () => {
  it('não tem importação: 404, o mesmo de peça inexistente', async () => {
    const comum = DocumentoAberto.parse((await A.post('/api/documentos').send({ nome: 'comum' })).body);
    await A.post(`/api/documentos/${comum.id}/lotes`).send({ id: crypto.randomUUID(), versaoBase: 0, descricao: 'x', operacoes: PECA_PARA_O_AJUSTE });
    expect(comum.importacaoId).toBeUndefined();
    const [dela, deNinguem] = [await A.get(`/api/documentos/${comum.id}/importacao`), await A.get(`/api/documentos/${crypto.randomUUID()}/importacao`)];
    expect(dela.status).toBe(404);
    expect(dela.body).toEqual(deNinguem.body);
  });
});
