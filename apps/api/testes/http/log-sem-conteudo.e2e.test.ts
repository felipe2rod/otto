// Uso sim, conteúdo não (ADR 031; docs/mvp/backend.md, seção 9). Roda um fluxo completo com frases
// sentinela em tudo que é conteúdo e procura as frases no log. Achou: o teste falha.
// Também confere o que o log TEM de ter: conta, correlação, rota como modelo, status e duração.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ArquivoEnviado, Importacao, TIPO_DO_PSD } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, type ClienteDeTeste, ENTRADA_DE_BRIEFING, PNG, subirApi } from './subir';

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
  // a tarefa do Otto: o pedido é dado de uso (vai para a tabela de acesso restrito), mas NÃO para o log
  pedidoAoOtto: 'SENTINELA-PEDIDO-AO-OTTO-6b6b',
  nomeDoBriefing: 'SENTINELA-NOME-DO-BRIEFING-19ad',
  tituloDoBriefing: 'SENTINELA-TITULO-DO-BRIEFING-77c0',
  observacoesDoBriefing: 'SENTINELA-OBSERVACOES-e4e4',
  ajusteDoPlano: 'SENTINELA-AJUSTE-DO-PLANO-0a1b',
  // o que o Otto escreveu na peça e disse ao designer (vem do roteiro gravado): conteúdo também
  textoQueOOttoEscreveu: 'Abrimos às 7h',
  camadaQueOOttoCriou: 'Subtítulo',
  fonteQueOOttoUsou: 'DM Serif Display',
  // fatia 4: cadastros da conta, formulário de briefing e buscas
  nomeDaMarca: 'SENTINELA-NOME-DA-MARCA-3c3c',
  siteDaMarca: 'sentinela-site-da-marca.example',
  rodapeDaMarca: 'SENTINELA-RODAPE-DA-MARCA-d2d2',
  restricaoDaMarca: 'SENTINELA-RESTRICAO-DA-MARCA-9f9f',
  corDaIdentidade: '#c0ffee',
  nomeDoBriefingSalvo: 'SENTINELA-BRIEFING-SALVO-5e5e',
  tituloDoFormulario: 'SENTINELA-TITULO-DO-FORMULARIO-a7a7',
  publicoDoFormulario: 'SENTINELA-PUBLICO-b8b8',
  observacoesDoFormulario: 'SENTINELA-OBSERVACOES-DO-FORMULARIO-c9c9',
  // o cache de busca é da plataforma e fica no banco de teste: o termo muda a cada execução
  buscaDeImagem: `SENTINELA-BUSCA-DE-IMAGEM-${randomUUID().slice(0, 8)}`,
  nomeDoLogo: 'SENTINELA-LOGO-DO-CLIENTE-2e2e.svg',
  autorDaImagem: 'fulana',
  paginaDaImagem: 'banco-de-mentira.invalid/fotos',
  enderecoDoArquivoNoBanco: '/get/1001',
  buscaDeFonte: 'SENTINELA-BUSCA-NO-CATALOGO-4f4f',
  // importação de PSD: o nome do arquivo e o nome dado à peça (os nomes de camada e o texto de dentro do PSD são
  // os sentinelas da peça exportada, lá em cima)
  nomeDoPsd: 'SENTINELA-PSD-DO-CLIENTE-8d8d.psd',
  nomeDaPecaImportada: 'SENTINELA-PECA-IMPORTADA-6c6c',
  nomeDoPsdRecusado: 'SENTINELA-PSD-RECUSADO-1b1b.psd',
} as const;

const PSD_EM_TONS_DE_CINZA = readFileSync(path.resolve(import.meta.dirname, '../../../../packages/psd/recursos-de-teste/psd-de-fora/grayscale.psd'));

let api: ApiDeTeste;
let A: ClienteDeTeste;
let documentoId: string;
let exportacaoId: string;
let tokenDoLink: string;
let tarefaId: string;
let tarefaRecusadaId: string;
let tarefaDoFormularioId: string;
let marcaId: string;
let importacaoId: string;
let pecaImportadaId: string;

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
  // o PSD que o Otto exportou, com os sentinelas nos nomes de camada e no texto: é ele que volta pela importação
  const baixado = await A.cru
    .get(link)
    .buffer(true)
    .parse((res, fim) => {
      const partes: Buffer[] = [];
      res.on('data', (parte: Buffer) => partes.push(parte));
      res.on('end', () => fim(null, Buffer.concat(partes)));
    });
  const psdDoOtto = baixado.body as Buffer;
  const enviarPsd = (bytes: Buffer, nome: string) => A.post('/api/importacoes').set('Content-Type', TIPO_DO_PSD).set('X-Otto-Nome-Do-Arquivo', encodeURIComponent(nome)).send(bytes);
  const enviada = Importacao.parse((await enviarPsd(psdDoOtto, S.nomeDoPsd)).body);
  importacaoId = enviada.id;
  // o texto do PSD pede a Anton: a escolha de fonte também cita nome de fonte, e não pode ir para o log
  await A.post(`/api/importacoes/${enviada.id}/importar`).send({
    nome: S.nomeDaPecaImportada,
    fontes: enviada.fontes.map((f) => ({ postScript: f.postScript, fazer: 'substituir', por: { familia: 'Anton', peso: 400 } })),
  });
  await api.fila.ociosa();
  pecaImportadaId = Importacao.parse((await A.get(`/api/importacoes/${enviada.id}`)).body).documentoId as string;
  await A.get(`/api/documentos/${pecaImportadaId}`);
  await A.get(`/api/documentos/${pecaImportadaId}/importacao`);
  await A.get('/api/importacoes');
  // recusas: o arquivo que a v1 não importa (a resposta leva a frase; o log, só o código), pedido torto, e desistência
  await enviarPsd(PSD_EM_TONS_DE_CINZA, S.nomeDoPsdRecusado);
  const desistida = Importacao.parse((await enviarPsd(psdDoOtto, S.nomeDoPsd)).body);
  await A.post(`/api/importacoes/${desistida.id}/importar`).send({ nome: S.nomeDaPecaImportada, fontes: [{ postScript: S.alvoQueNaoExiste, fazer: 'imagem' }] });
  await A.delete(`/api/importacoes/${desistida.id}`);
  await A.post(`/api/documentos/${doc.id}/exportacoes`).send({ formato: 'psd', pranchetas: [S.alvoQueNaoExiste] });
  await A.post(`/api/documentos/${doc.id}/desfazer`).send({ versaoBase: 1 });
  await A.post(`/api/documentos/${doc.id}/duplicar`).send({ nome: S.nomeNovo });
  await A.get(`/api/rota-que-nao-existe/${S.nomeDoDocumento}?q=${S.busca}`);

  // a tarefa do Otto, do pedido ao desfazer: briefing com sentinelas, o "pode" com ajuste, revisão, fluxo de eventos
  const peca = (await A.post('/api/documentos').send({ nome: S.nomeDoDocumento })).body as { id: string };
  const briefing = { ...ENTRADA_DE_BRIEFING.briefing, nome: S.nomeDoBriefing, textos: { ...ENTRADA_DE_BRIEFING.briefing.textos, titulo: S.tituloDoBriefing }, observacoes: S.observacoesDoBriefing };
  const tarefa = (await A.post(`/api/documentos/${peca.id}/tarefas`).send({ ...ENTRADA_DE_BRIEFING, briefing })).body as { id: string };
  tarefaId = tarefa.id;
  await api.fila.ociosa();
  await A.post(`/api/tarefas/${tarefa.id}/ajustar`).send({ texto: S.ajusteDoPlano });
  await api.fila.ociosa();
  await A.post(`/api/tarefas/${tarefa.id}/aprovar`).send({});
  await api.fila.ociosa();
  await A.get(`/api/tarefas/${tarefa.id}`);
  await A.get(`/api/tarefas/${tarefa.id}/eventos?depoisDe=2`);
  await A.get(`/api/tarefas/${tarefa.id}/eventos`).set('Accept', 'text/event-stream').set('Last-Event-ID', '1');
  await A.get(`/api/tarefas/${tarefa.id}/antes`);
  await A.get(`/api/documentos/${peca.id}/tarefas`);
  await A.get(`/api/documentos/${peca.id}/pendencias`);
  await A.post(`/api/tarefas/${tarefa.id}/aceitar`).send({});
  await A.post(`/api/tarefas/${tarefa.id}/desfazer`).send({});
  // e a que dá errado: ajuste numa peça sem camada de texto (o roteiro de ajuste precisa de uma). A falha cita a peça por dentro.
  const semTexto = (await A.post('/api/documentos').send({ nome: S.nomeDoDocumento })).body as { id: string };
  await A.post(`/api/documentos/${semTexto.id}/lotes`).send({
    id: randomUUID(),
    versaoBase: 0,
    descricao: S.descricaoDoLote,
    operacoes: [
      { op: 'criarPrancheta', nome: S.nomeDaPrancheta, largura: 1080, altura: 1350, fundo: S.corDaMarca },
      { op: 'criarNo', prancheta: S.nomeDaPrancheta, no: { tipo: 'forma', forma: 'retangulo', nome: S.nomeDaCamada, x: 0, y: 0, largura: 100, altura: 100, preenchimento: S.corDaMarca } },
    ],
  });
  const recusada = (await A.post(`/api/documentos/${semTexto.id}/tarefas`).send({ tipo: 'ajuste', pedido: S.pedidoAoOtto })).body as { id: string };
  tarefaRecusadaId = recusada.id;
  await api.fila.ociosa();
  await A.post(`/api/documentos/${documentoId}/tarefas`).send({ tipo: 'tipo-que-nao-existe', pedido: S.pedidoAoOtto });

  // fatia 4: marca, briefing salvo, busca e imagem trazida, fonte do catálogo, textura, tarefa pelo formulário
  const logo = (
    await A.post(`/api/vetores?nome=${encodeURIComponent(S.nomeDoLogo)}`)
      .set('Content-Type', 'image/svg+xml')
      .send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10 Z" fill="#c0ffee"/></svg>')
  ).body as { no: { origem: { arquivo: string } } };
  const marca = (
    await A.post('/api/marcas').send({
      nome: S.nomeDaMarca,
      site: S.siteDaMarca,
      cores: { primaria: S.corDaIdentidade },
      fonteDeTitulo: S.fonteQueOOttoUsou,
      logo: { arquivo: logo.no.origem.arquivo },
      rodape: S.rodapeDaMarca,
      restricoes: [S.restricaoDaMarca],
    })
  ).body as { id: string };
  marcaId = marca.id;
  await A.put(`/api/marcas/${marca.id}`).send({ nome: S.nomeDaMarca, rodape: S.rodapeDaMarca, cores: { primaria: S.corDaIdentidade }, restricoes: [S.restricaoDaMarca] });
  await A.post('/api/marcas').send({ nome: S.nomeDaMarca, cores: { primaria: 'cor-torta' }, [S.restricaoDaMarca]: true });
  await A.get('/api/marcas');
  await A.get(`/api/marcas/${marca.id}`);
  await A.get(`/api/vetores/${logo.no.origem.arquivo}`);
  await A.get(`/api/arquivos/${logo.no.origem.arquivo}/dados`);
  const salvo = (await A.post('/api/briefings').send({ nome: S.nomeDoBriefingSalvo, dados: { versao: 1, marcaId: marca.id, publico: S.publicoDoFormulario, textos: { rodape: S.rodapeDaMarca } } }))
    .body as { id: string };
  await A.get('/api/briefings');
  await A.get(`/api/briefings/${salvo.id}`);
  const busca = (await A.get(`/api/imagens/busca?q=${encodeURIComponent(S.buscaDeImagem)}&orientacao=todas`)).body as { itens: { id: string; previa: string }[] };
  await A.get(busca.itens[0]?.previa as string);
  await A.post('/api/imagens/trazer').send({ banco: 'banco-de-mentira', id: busca.itens[0]?.id });
  await A.post('/api/imagens/trazer').send({ banco: 'banco-de-mentira', id: 'nunca-buscado', [S.buscaDeImagem]: 1 });
  await A.get(`/api/fontes?q=${encodeURIComponent(S.buscaDeFonte)}&catalogo=1`);
  await A.get('/api/fontes/Lilita%20One/400');
  await A.post('/api/texturas/concreto/trazer').send({});
  const pecaDoFormulario = (await A.post('/api/documentos').send({ nome: S.nomeDoDocumento })).body as { id: string };
  const doFormulario = (
    await A.post(`/api/documentos/${pecaDoFormulario.id}/tarefas`).send({
      tipo: 'briefing',
      cuidado: 'autoral',
      briefingId: salvo.id,
      briefing: {
        versao: 1,
        nome: S.nomeDoBriefing,
        marcaId: marca.id,
        publico: S.publicoDoFormulario,
        formatos: ENTRADA_DE_BRIEFING.briefing.formatos,
        textos: { titulo: S.tituloDoFormulario },
        imagens: { fonte: 'banco', termos: S.buscaDeImagem },
        observacoes: S.observacoesDoFormulario,
      },
    })
  ).body as { id: string };
  tarefaDoFormularioId = doFormulario.id;
  await api.fila.ociosa();
  await A.post(`/api/tarefas/${doFormulario.id}/cancelar`).send({});
  // formulário recusado: marca que não existe, e campo a mais
  await A.post(`/api/documentos/${pecaDoFormulario.id}/tarefas`).send({
    tipo: 'briefing',
    briefing: { versao: 1, formatos: [], textos: { titulo: S.tituloDoFormulario }, imagens: { fonte: 'nenhuma' }, [S.observacoesDoFormulario]: 1 },
  });
  await A.delete(`/api/briefings/${salvo.id}`);
  await A.delete(`/api/marcas/${marca.id}`);
}, 120_000);
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

describe('a importação de PSD no log: uso sim, conteúdo não (ADR 031)', () => {
  it('a peça importada tem mesmo os sentinelas por dentro (senão este teste não provaria nada)', async () => {
    const peca = JSON.stringify((await A.get(`/api/documentos/${pecaImportadaId}`)).body);
    expect(peca).toContain(SENTINELAS.nomeDaCamada);
    expect(peca).toContain(SENTINELAS.textoDaCamada);
    expect(peca).toContain(SENTINELAS.nomeDaPecaImportada);
    const importacao = JSON.stringify((await A.get(`/api/importacoes/${importacaoId}`)).body);
    expect(importacao).toContain(SENTINELAS.nomeDoPsd);
    expect(importacao).toContain(SENTINELAS.nomeDaCamada);
  });

  it('o envio registra formato, bytes, medidas e contagens; o pedido, só o que foi escolhido em números', () => {
    const enviado = api.log.find((l) => l.evento === 'psd_enviado');
    expect(enviado).toMatchObject({ contaId: api.contaA.contaId, importacaoId, formato: 'psd', largura: 1080, altura: 1350, fontes: 1, fontesEmFalta: 0 });
    expect(enviado?.bytes).toBeGreaterThan(1000);
    expect(api.log.find((l) => l.evento === 'importacao_pedida')).toMatchObject({ importacaoId, comNome: true, comMarca: false, viramImagem: 0, baixadas: 0, substituidas: 1 });
  });

  it('o fim registra resultado, tentativa, contagens de camada e de imagem, espera e duração', () => {
    const fim = api.log.find((l) => l.evento === 'importacao_terminada');
    expect(fim).toMatchObject({ contaId: api.contaA.contaId, importacaoId, documentoId: pecaImportadaId, resultado: 'pronta', tentativa: 1, formato: 'psd', pranchetas: 1, fontesEmFalta: 0 });
    for (const campo of ['camadasEditaveis', 'camadasComoImagem', 'camadasIgnoradas', 'imagens', 'bytesDasImagens', 'avisos', 'esperaMs', 'duracaoMs']) expect(typeof fim?.[campo]).toBe('number');
    // só os campos declarados: nenhum texto livre
    for (const valor of Object.values(fim ?? {})) expect(['string', 'number', 'boolean']).toContain(typeof valor);
  });

  it('a recusa registra o código, não a frase nem o nome do arquivo; a desistência registra o motivo e os bytes', () => {
    const recusas = api.log.filter((l) => l.evento === 'requisicao' && l.rota === '/api/importacoes' && l.status === 422);
    expect(recusas.length).toBe(1);
    expect(recusas[0]).toMatchObject({ codigo: 'psd_recusado' });
    expect(api.log.find((l) => l.evento === 'importacao_descartada')).toMatchObject({ motivo: 'desistencia' });
  });

  it('as rotas aparecem como modelo, e a chave do objeto do arquivo enviado não aparece', () => {
    const rotas = new Set(api.log.filter((l) => l.evento === 'requisicao').map((l) => `${l.metodo} ${l.rota}`));
    for (const rota of [
      'POST /api/importacoes',
      'POST /api/importacoes/:id/importar',
      'GET /api/importacoes/:id',
      'GET /api/importacoes',
      'DELETE /api/importacoes/:id',
      'GET /api/documentos/:id/importacao',
    ]) {
      expect(rotas).toContain(rota);
    }
    for (const linha of api.logCru) expect(linha).not.toMatch(/\/importacoes\/[0-9a-f-]{36}\/original/);
  });
});

describe('a tarefa do Otto no log: uso sim, conteúdo não (ADR 031)', () => {
  const linhasDaTarefa = (id: string) => api.log.filter((l) => l.tarefaId === id);

  it('o pedido registra tipo e identificadores; o texto do pedido e o briefing não', () => {
    const pedida = api.log.find((l) => l.evento === 'tarefa_pedida' && l.tarefaId === tarefaId);
    expect(pedida).toMatchObject({ contaId: api.contaA.contaId, tipo: 'briefing' });
    expect(Object.keys(pedida ?? {}).sort()).toEqual(expect.arrayContaining(['documentoId', 'evento', 'tarefaId', 'tipo']));
    expect(JSON.stringify(pedida)).not.toMatch(/"(pedido|briefing|entrada|selecao)":/);
  });

  it('o fim da tarefa registra estado, contagens, tokens, duração e custo: só números e códigos', () => {
    const terminada = api.log.find((l) => l.evento === 'tarefa_terminada' && l.tarefaId === tarefaId && l.estado === 'em_revisao');
    // 2 chamadas do diretor (a direção foi refeita no ajuste) e 12 da execução
    expect(terminada).toMatchObject({ tipo: 'briefing', fim: 'entregue', lotes: 5, chamadas: 14, conferida: true });
    for (const [chave, valor] of Object.entries(terminada ?? {})) expect(['string', 'number', 'boolean'], chave).toContain(typeof valor);
    for (const campo of ['tokensDeEntrada', 'tokensDeCacheLidos', 'tokensDeCacheCriados', 'tokensDeSaida', 'imagens', 'voltasDeConferencia', 'duracaoMs', 'lotesRecusados'])
      expect(typeof terminada?.[campo]).toBe('number');
    // resumo da entrega, pendências, plano e direção não entram em evento de uso
    expect(Object.keys(terminada ?? {})).not.toEqual(expect.arrayContaining(['resumo']));
    expect(JSON.stringify(linhasDaTarefa(tarefaId))).not.toMatch(/"(resumo|pendencias|plano|cartao|direcao|entrega|operacoes|arvore|mensagem)"/);
  });

  it('as respostas ao "pode" e a decisão da revisão registram só o que foi escolhido', () => {
    expect(
      linhasDaTarefa(tarefaId)
        .filter((l) => l.evento === 'tarefa_confirmacao')
        .map((l) => l.resposta),
    ).toEqual(['ajustar', 'pode']);
    expect(
      linhasDaTarefa(tarefaId)
        .filter((l) => l.evento === 'tarefa_decidida')
        .map((l) => l.resultado),
    ).toEqual(['aceita', 'desfeita']);
  });

  it('a tarefa que deu errado registra o estado e o código do erro, e não a mensagem dele', () => {
    const terminada = api.log.find((l) => l.evento === 'tarefa_terminada' && l.tarefaId === tarefaRecusadaId);
    expect(terminada).toMatchObject({ estado: 'falhou', fim: 'erro', erro: 'resposta_invalida', lotes: 0 });
    expect(JSON.stringify(linhasDaTarefa(tarefaRecusadaId))).not.toMatch(/roteiro|camada de texto|mensagem/);
  });

  it('o fluxo de eventos aparece no log como rota modelo, sem o corpo que ele transmitiu', () => {
    const fluxos = api.log.filter((l) => l.evento === 'requisicao' && l.rota === '/api/tarefas/:id/eventos');
    expect(fluxos).toHaveLength(2);
    expect(fluxos.every((l) => l.status === 200)).toBe(true);
  });
});

describe('fatia 4 no log: cadastros, formulário e buscas', () => {
  it('a marca registra o que ela tem em contagens; nome, site, cor, rodapé e restrição não aparecem', () => {
    const salvas = api.log.filter((l) => l.evento === 'marca_salva' && l.marcaId === marcaId);
    expect(salvas).toHaveLength(2);
    expect(salvas[0]).toMatchObject({ nova: true, cores: 1, fontes: 1, comLogo: true, icones: 0, restricoes: 1 });
    expect(api.log.some((l) => l.evento === 'marca_apagada' && l.marcaId === marcaId)).toBe(true);
  });

  it('a tarefa do formulário registra que veio do formulário, os formatos e o cuidado', () => {
    const pedida = api.log.find((l) => l.evento === 'tarefa_pedida' && l.tarefaId === tarefaDoFormularioId);
    expect(pedida).toMatchObject({ tipo: 'briefing', porFormulario: true, formatos: 2, cuidado: 'autoral', deBriefingSalvo: true, esforco: 'CONCEPTUAL' });
    for (const valor of Object.values(pedida ?? {})) expect(['string', 'number', 'boolean']).toContain(typeof valor);
  });

  it('a busca de imagem registra banco, contagem e se veio do cache; a imagem trazida, bytes e medidas', () => {
    expect(api.log.find((l) => l.evento === 'imagens_buscadas')).toMatchObject({ banco: 'banco-de-mentira', origem: 'editor', resultados: 2, doCache: false });
    expect(api.log.find((l) => l.evento === 'imagem_trazida')).toMatchObject({ banco: 'banco-de-mentira', origem: 'editor', jaTinha: false });
    expect(api.log.find((l) => l.evento === 'textura_trazida')).toMatchObject({ textura: 'concreto' });
  });

  it('a fonte baixada do catálogo registra quantos pesos e bytes, não qual família', () => {
    const baixada = api.log.find((l) => l.evento === 'fonte_baixada');
    expect(baixada).toMatchObject({ pesos: 1 });
    expect(JSON.stringify(baixada)).not.toMatch(/Lilita/);
  });

  it('as rotas novas aparecem como modelo, sem o que a pessoa digitou na busca', () => {
    const rotas = new Set(api.log.filter((l) => l.evento === 'requisicao').map((l) => l.rota));
    for (const rota of [
      '/api/marcas',
      '/api/marcas/:id',
      '/api/briefings/:id',
      '/api/imagens/busca',
      '/api/imagens/:banco/:id/previa',
      '/api/imagens/trazer',
      '/api/texturas/:nome/trazer',
      '/api/vetores/:sha256',
      '/api/arquivos/:sha256/dados',
    ])
      expect(rotas, rota).toContain(rota);
  });
});
