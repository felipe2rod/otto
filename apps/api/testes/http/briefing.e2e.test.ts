// Fatia 4 de ponta a ponta (docs/mvp/backend.md, 17.12): marcas, briefings salvos, tarefa pelo formulário,
// banco de imagens, fontes sob demanda, texturas e o retorno útil de arquivo. Rota, banco e armazenamento de
// verdade (o de memória); banco de imagens, catálogo de fontes e modelo são os falsos: nada vai à rede.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  BriefingSalvo,
  briefingDaTarefa,
  CODIGOS_DE_ERRO,
  DadosDoArquivo,
  DocumentoAberto,
  ErroDaApi,
  type FormularioDeBriefing,
  ImagemTrazida,
  LimitesDeTarefa,
  ListaDeBriefings,
  ListaDeDocumentos,
  ListaDeFontes,
  ListaDeMarcas,
  ListaDeTexturas,
  Marca,
  PecaComTarefa,
  ResultadoDaBuscaDeImagens,
  Tarefa,
  TexturaTrazida,
  VetorImportado,
} from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspecionarImagem } from '../../src/arquivo/domain/inspecionar-imagem';
import { semearFontes } from '../../src/biblioteca/application/semear-fontes';
import { type ApiDeTeste, type ClienteDeTeste, ENTRADA_DE_BRIEFING, PNG, subirApi } from './subir';

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><path d="M0 0 L120 0 L120 60 Z" fill="#0F3B2C"/><text>Aurora</text></svg>';
// os dois formatos que o roteiro gravado produz
const FORMATOS = [
  { nome: 'Feed', largura: 1080, altura: 1350 },
  { nome: 'Story', largura: 1080, altura: 1920 },
];

let api: ApiDeTeste;
let A: ClienteDeTeste;
const novaPeca = async (nome = 'Nova') => DocumentoAberto.parse((await A.post('/api/documentos').send({ nome })).body);
const enviarLogo = async (cliente = A) => VetorImportado.parse((await cliente.post('/api/vetores?nome=logo.svg').set('Content-Type', 'image/svg+xml').send(LOGO)).body);

beforeAll(async () => {
  api = await subirApi();
  A = api.como('A');
  await semearFontes(api.fontes, path.resolve(import.meta.dirname, '../../recursos/fontes'));
}, 60_000);
afterAll(async () => {
  await api?.fechar();
});

describe('marcas', () => {
  it('cria com identidade, logo e ícones por referência; lista, abre, troca e apaga', async () => {
    const logo = await enviarLogo();
    const criada = await A.post('/api/marcas').send({
      nome: 'Café Aurora',
      cores: { primaria: '#0F3B2C', destaque: '#F4C430' },
      fonteDeTitulo: 'DM Serif Display',
      logo: { arquivo: logo.no.origem.arquivo },
      rodape: '@cafeaurora',
      restricoes: ['nunca foto de pessoa'],
    });
    expect(criada.status).toBe(201);
    const marca = Marca.parse(criada.body);
    // a cor volta em minúsculas, como o documento guarda
    expect(marca.cores).toEqual({ primaria: '#0f3b2c', destaque: '#f4c430' });
    expect(ListaDeMarcas.parse((await A.get('/api/marcas')).body).itens.map((m) => m.id)).toContain(marca.id);
    expect(Marca.parse((await A.get(`/api/marcas/${marca.id}`)).body)).toEqual(marca);
    const trocada = await A.put(`/api/marcas/${marca.id}`).send({ nome: 'Aurora Cafés' });
    expect(trocada.status).toBe(200);
    expect(Marca.parse(trocada.body)).not.toHaveProperty('cores');
    expect((await A.delete(`/api/marcas/${marca.id}`)).status).toBe(204);
    expect((await A.get(`/api/marcas/${marca.id}`)).status).toBe(404);
  });

  it('corpo fora do contrato é 400 com o campo; logo que a conta não tem é 422 sem dizer qual', async () => {
    const torta = await A.post('/api/marcas').send({ nome: 'x', cores: { primaria: 'verde' }, contaId: 'outra' });
    expect(torta.status).toBe(400);
    expect(ErroDaApi.parse(torta.body)).toMatchObject({ codigo: CODIGOS_DE_ERRO.pedidoInvalido });
    const semArquivo = await A.post('/api/marcas').send({ nome: 'x', logo: { arquivo: 'f'.repeat(64) } });
    expect(semArquivo.status).toBe(422);
    expect(ErroDaApi.parse(semArquivo.body)).toEqual({ codigo: CODIGOS_DE_ERRO.arquivoDesconhecido, detalhe: { quantos: 1 } });
    expect((await A.get('/api/marcas/nao-e-uuid')).status).toBe(404);
  });
});

describe('arquivo enviado: retorno útil', () => {
  it('o vetor volta com os avisos e a miniatura do que foi entendido, e é lido de novo pelo hash', async () => {
    const logo = await enviarLogo();
    expect(logo.avisos.length).toBeGreaterThan(0);
    expect(logo.miniatura).toMatch(/^<svg xmlns=/);
    expect(logo.miniatura).not.toMatch(/Aurora|<text/);
    const lido = await A.get(`/api/vetores/${logo.no.origem.arquivo}`);
    expect(lido.status).toBe(200);
    expect(VetorImportado.parse(lido.body)).toEqual(logo);
  });

  it('os dados de uma imagem enviada trazem as medidas, para o formulário avisar da ampliação por formato', async () => {
    const enviada = (await A.post('/api/arquivos').set('Content-Type', 'image/png').set('X-Otto-Nome-Do-Arquivo', encodeURIComponent('produto.png')).send(PNG)).body as {
      sha256: string;
      largura: number;
      altura: number;
    };
    const dados = DadosDoArquivo.parse((await A.get(`/api/arquivos/${enviada.sha256}/dados`)).body);
    expect(dados).toMatchObject({ especie: 'imagem', tipo: 'image/png', largura: enviada.largura, altura: enviada.altura, nome: 'produto.png' });
    expect((await A.get(`/api/arquivos/${'e'.repeat(64)}/dados`)).status).toBe(404);
  });
});

describe('banco de imagens', () => {
  // o cache de busca é da plataforma e fica no banco de teste: cada execução busca um termo que ninguém buscou
  const TERMO = `café coado ${randomUUID().slice(0, 8)}`;

  it('a busca mostra a origem e devolve prévias por rota nossa; a segunda busca igual não chama o banco', async () => {
    const r = await A.get(`/api/imagens/busca?q=${encodeURIComponent(TERMO.toUpperCase())}&orientacao=todas`);
    expect(r.status).toBe(200);
    const busca = ResultadoDaBuscaDeImagens.parse(r.body);
    expect(busca.banco.nome).toBe('Banco de mentira');
    expect(busca.itens).toHaveLength(2);
    expect(JSON.stringify(r.body)).not.toMatch(/\/get\//);
    await A.get(`/api/imagens/busca?q=${encodeURIComponent(`  ${TERMO.replace(' ', '   ')} `)}`);
    expect(api.banco.buscas).toEqual([{ consulta: TERMO, orientacao: 'todas' }]);
    expect((await A.get('/api/imagens/busca?q=')).status).toBe(400);
    expect((await A.get('/api/imagens/busca?q=x&orientacao=diagonal')).status).toBe(400);
  });

  it('a prévia sai pelo servidor, só de resultado que veio de busca', async () => {
    const [primeira] = ResultadoDaBuscaDeImagens.parse((await A.get(`/api/imagens/busca?q=${encodeURIComponent(TERMO)}`)).body).itens;
    const previa = await A.get(primeira?.previa as string);
    expect(previa.status).toBe(200);
    expect(previa.headers['content-type']).toBe('image/jpeg');
    expect(previa.headers['cache-control']).toBe('private, max-age=86400');
    expect(previa.headers['x-content-type-options']).toBe('nosniff');
    expect((await A.get('/api/imagens/banco-de-mentira/9999/previa')).status).toBe(404);
    expect((await A.get('/api/imagens/outro/1001/previa')).status).toBe(404);
  });

  it('trazer baixa para o armazenamento da conta, guarda a origem, e o documento que usa a imagem não tem endereço do banco', async () => {
    const r = await A.post('/api/imagens/trazer').send({ banco: 'banco-de-mentira', id: '1001' });
    expect(r.status).toBe(201);
    const trazida = ImagemTrazida.parse(r.body);
    expect(trazida.origem).toEqual({ banco: 'Banco de mentira', autor: 'fulana', licenca: 'Licença de mentira', pagina: 'https://banco-de-mentira.invalid/fotos/1001/' });
    // é um arquivo da conta como qualquer outro: sai pela rota de arquivos, e os dados dizem de onde veio
    expect((await A.get(`/api/arquivos/${trazida.sha256}`)).status).toBe(200);
    expect(DadosDoArquivo.parse((await A.get(`/api/arquivos/${trazida.sha256}/dados`)).body).origem?.banco).toBe('Banco de mentira');

    const peca = await novaPeca('Com foto de banco');
    const lote = await A.post(`/api/documentos/${peca.id}/lotes`).send({
      id: randomUUID(),
      versaoBase: 0,
      descricao: 'foto',
      operacoes: [
        { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
        { op: 'criarNo', prancheta: 'Feed', no: { ...trazida.no, nome: 'Foto', x: 0, y: 0, largura: 1080, altura: 720 } },
      ],
    });
    expect(lote.status).toBe(200);
    const aberta = await A.get(`/api/documentos/${peca.id}`);
    expect(JSON.stringify(aberta.body)).not.toMatch(/https?:\/\/|banco-de-mentira\.invalid/);
    expect(JSON.stringify(aberta.body)).toContain('Banco de mentira');
  });

  it('trazer com id que não veio de busca é recusado, e endereço no pedido nem é aceito', async () => {
    const baixados = api.banco.baixados.length;
    const semBusca = await A.post('/api/imagens/trazer').send({ banco: 'banco-de-mentira', id: '424242' });
    expect(semBusca.status).toBe(422);
    expect(ErroDaApi.parse(semBusca.body).codigo).toBe(CODIGOS_DE_ERRO.imagemNaoBuscada);
    expect((await A.post('/api/imagens/trazer').send({ banco: 'banco-de-mentira', id: '1001', url: 'http://169.254.169.254/' })).status).toBe(400);
    expect((await A.post('/api/imagens/trazer').send({ url: 'https://exemplo.com/foto.jpg' })).status).toBe(400);
    expect(api.banco.baixados).toHaveLength(baixados);
  });
});

describe('fontes sob demanda e texturas', () => {
  it('a busca com o catálogo mostra o que ainda não foi baixado; pedir a fonte a traz e ela passa a ser da biblioteca', async () => {
    const antes = ListaDeFontes.parse((await A.get('/api/fontes?q=lilita&catalogo=1')).body);
    expect(antes.itens).toEqual([{ familia: 'Lilita One', pesos: [400], categoria: 'display', naBiblioteca: false }]);
    expect(ListaDeFontes.parse((await A.get('/api/fontes?q=lilita')).body).itens).toEqual([]);

    const detalhe = await A.get('/api/fontes/Lilita%20One/400');
    expect(detalhe.status).toBe(200);
    expect(detalhe.body).toMatchObject({ familia: 'Lilita One', peso: 400, nomePostScript: 'Anton-Regular' });
    const arquivo = await A.get('/api/fontes/Lilita%20One/400/arquivo');
    expect(arquivo.status).toBe(200);
    expect(arquivo.headers['content-type']).toBe('font/ttf');
    expect(api.catalogo.baixados).toEqual(['Lilita One|400']);
    expect(ListaDeFontes.parse((await A.get('/api/fontes?q=lilita')).body).itens).toEqual([{ familia: 'Lilita One', pesos: [400] }]);
    expect((await A.get('/api/fontes/Familia%20Inventada/400')).status).toBe(404);
  });

  it('um lote que usa fonte do catálogo a traz antes de medir, e a peça aberta já lista os pesos dela', async () => {
    const peca = await novaPeca('Com fonte nova');
    const r = await A.post(`/api/documentos/${peca.id}/lotes`).send({
      id: randomUUID(),
      versaoBase: 0,
      descricao: 'título',
      operacoes: [
        { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
        {
          op: 'criarNo',
          prancheta: 'Feed',
          no: { tipo: 'texto', nome: 'Título', x: 0, y: 0, largura: 800, altura: 200, conteudo: 'Oi', fonte: 'Playfair Display', peso: 500, tamanho: 80, cor: '#111111' },
        },
      ],
    });
    expect(r.status).toBe(200);
    expect(api.catalogo.baixados).toEqual(expect.arrayContaining(['Playfair Display|400', 'Playfair Display|500', 'Playfair Display|600', 'Playfair Display|700']));
    expect(DocumentoAberto.parse((await A.get(`/api/documentos/${peca.id}`)).body).fontes).toEqual([{ familia: 'Playfair Display', pesos: [400, 500, 600, 700] }]);
  });

  it('as texturas são listadas e entram na conta como arquivo, com o modo e a opacidade de costume', async () => {
    const lista = ListaDeTexturas.parse((await A.get('/api/texturas')).body);
    expect(lista.itens.map((t) => t.nome)).toEqual(['papel', 'papel-amassado', 'reticula', 'grao-de-filme', 'poeira-e-arranhoes', 'concreto']);
    const r = await A.post('/api/texturas/papel/trazer').send({});
    expect(r.status).toBe(201);
    const trazida = TexturaTrazida.parse(r.body);
    expect(trazida.no).toMatchObject({ modoDeMesclagem: 'multiplicacao', opacidade: 0.6 });
    expect((await A.get(`/api/arquivos/${trazida.sha256}`)).status).toBe(200);
    expect((await A.post('/api/texturas/inventada/trazer').send({})).status).toBe(404);
  });
});

describe('tarefa pelo formulário de briefing, com marca e briefing salvo', () => {
  let marca: Marca;
  let salvo: BriefingSalvo;
  let peca: DocumentoAberto;
  let tarefaId: string;
  let logo: VetorImportado;
  const formulario = (): FormularioDeBriefing => ({
    versao: 1,
    nome: 'Novo horário',
    marcaId: marca.id,
    objetivo: 'informar',
    formatos: FORMATOS,
    textos: { titulo: 'Abrimos às 7h', subtitulo: 'Café coado na hora' },
    imagens: { fonte: 'nenhuma' },
    estilo: ['acolhedor'],
  });

  beforeAll(async () => {
    logo = await enviarLogo();
    marca = Marca.parse(
      (
        await A.post('/api/marcas').send({
          nome: 'Café Aurora',
          cores: { primaria: '#0f3b2c', destaque: '#f4c430', fundo: '#f4efe3', texto: '#17171c' },
          fonteDeTitulo: 'DM Serif Display',
          fonteDeTexto: 'IBM Plex Sans',
          logo: { arquivo: logo.no.origem.arquivo },
          rodape: '@cafeaurora',
          restricoes: ['nunca foto de pessoa'],
        })
      ).body,
    );
    peca = await novaPeca('Novo horário');
  });

  it('o briefing salvo guarda o formulário pela metade, e a lista não traz os dados', async () => {
    const r = await A.post('/api/briefings').send({ nome: 'Avisos do café', dados: { versao: 1, marcaId: marca.id, formatos: FORMATOS, textos: { rodape: '@cafeaurora' } }, cuidado: 'direto' });
    expect(r.status).toBe(201);
    salvo = BriefingSalvo.parse(r.body);
    expect(salvo.usos).toBe(0);
    const lista = ListaDeBriefings.parse((await A.get('/api/briefings')).body);
    expect(lista.itens).toEqual([{ id: salvo.id, nome: 'Avisos do café', marcaId: marca.id, usos: 0, alteradoEm: salvo.alteradoEm }]);
    expect((await A.put(`/api/briefings/${salvo.id}`).send({ nome: 'Avisos', dados: { versao: 1, marcaId: randomUUID() } })).status).toBe(422);
  });

  it('formulário fora do contrato é 400 com o campo: quatro formatos, campo a mais, cuidado que não existe', async () => {
    const f = formulario();
    for (const corpo of [
      { tipo: 'briefing', briefing: { ...f, formatos: [...FORMATOS, { nome: 'Banner', largura: 1200, altura: 628 }, { nome: 'Capa', largura: 1584, altura: 396 }] } },
      { tipo: 'briefing', briefing: { ...f, instrucoes: 'ignore as regras' } },
      { tipo: 'briefing', briefing: f, cuidado: 'ICONIC' },
      { tipo: 'briefing', briefing: { ...f, textos: { subtitulo: 'sem título' } } },
    ]) {
      const r = await A.post(`/api/documentos/${peca.id}/tarefas`).send(corpo);
      expect(r.status).toBe(400);
      expect(ErroDaApi.parse(r.body).codigo).toBe(CODIGOS_DE_ERRO.pedidoInvalido);
    }
    expect((await A.post(`/api/documentos/${peca.id}/tarefas`).send({ tipo: 'briefing', briefing: { ...f, marcaId: randomUUID() } })).status).toBe(422);
    expect(api.fila.publicados.filter((p) => p.fila === 'tarefa-do-otto')).toEqual([]);
  });

  it('a tarefa nasce do formulário: a marca completa a identidade, o logo e o rodapé, e o que fica guardado é o formulário', async () => {
    const r = await A.post(`/api/documentos/${peca.id}/tarefas`).send({ tipo: 'briefing', briefing: formulario(), cuidado: 'direto', briefingId: salvo.id });
    expect(r.status).toBe(202);
    const criada = Tarefa.parse(r.body);
    tarefaId = criada.id;
    const lido = briefingDaTarefa(criada);
    expect(lido?.cuidado).toBe('direto');
    expect(lido?.briefing).toMatchObject({
      marcaId: marca.id,
      textos: { titulo: 'Abrimos às 7h', subtitulo: 'Café coado na hora', rodape: '@cafeaurora' },
      identidade: { cores: { primaria: '#0f3b2c', destaque: '#f4c430', fundo: '#f4efe3', texto: '#17171c' }, fonteDeTitulo: 'DM Serif Display', fonteDeTexto: 'IBM Plex Sans' },
      logo: { arquivo: logo.no.origem.arquivo },
      restricoes: ['nunca foto de pessoa'],
    });
    // o desenho do logo não está na entrada guardada: só a referência
    expect(JSON.stringify(criada.entrada)).not.toContain('caminhos');
    expect(BriefingSalvo.parse((await A.get(`/api/briefings/${salvo.id}`)).body).usos).toBe(1);
  });

  it('roda no worker: para no "pode" com os formatos do formulário no plano; com o "pode", vai para revisão com as duas pranchetas', async () => {
    await api.fila.ociosa();
    const parada = Tarefa.parse((await A.get(`/api/tarefas/${tarefaId}`)).body);
    expect(parada.estado).toBe('aguardando_confirmacao');
    expect(parada.confirmacao?.plano.criar).toEqual(FORMATOS);
    expect((await A.post(`/api/tarefas/${tarefaId}/aprovar`).send({})).status).toBe(200);
    await api.fila.ociosa();
    const t = Tarefa.parse((await A.get(`/api/tarefas/${tarefaId}`)).body);
    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', lotes: 5 });
    const aberta = DocumentoAberto.parse((await A.get(`/api/documentos/${peca.id}`)).body);
    expect(aberta.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story']);
    expect(aberta.tarefaAtiva).toEqual({ id: tarefaId, estado: 'em_revisao', fim: 'entregue' });
  }, 120_000);

  it('"nova peça com este briefing": a tarefa devolve o formulário como foi enviado, pronto para outra peça', async () => {
    expect((await A.post(`/api/tarefas/${tarefaId}/aceitar`).send({})).status).toBe(200);
    const anterior = briefingDaTarefa(Tarefa.parse((await A.get(`/api/tarefas/${tarefaId}`)).body));
    if (!anterior) throw new Error('a tarefa não devolveu o formulário');
    const outra = await novaPeca('Novo horário, de novo');
    const r = await A.post(`/api/documentos/${outra.id}/tarefas`).send({ tipo: 'briefing', briefing: anterior.briefing, cuidado: anterior.cuidado });
    expect(r.status).toBe(202);
    await A.post(`/api/tarefas/${Tarefa.parse(r.body).id}/cancelar`).send({});
    await api.fila.ociosa();
  });

  it('apagar a marca não quebra o briefing salvo nem a tarefa que já foi criada com ela', async () => {
    expect((await A.delete(`/api/marcas/${marca.id}`)).status).toBe(204);
    expect(BriefingSalvo.parse((await A.get(`/api/briefings/${salvo.id}`)).body).dados).not.toHaveProperty('marcaId');
    expect(briefingDaTarefa(Tarefa.parse((await A.get(`/api/tarefas/${tarefaId}`)).body))?.briefing.identidade?.fonteDeTitulo).toBe('DM Serif Display');
    expect((await A.delete(`/api/briefings/${salvo.id}`)).status).toBe(204);
    expect((await A.get(`/api/tarefas/${tarefaId}`)).status).toBe(200);
  });

  it('o briefing solto do roteiro gravado continua entrando fora de produção, com o mesmo teto de formatos', async () => {
    const livre = await novaPeca('Do roteiro');
    const r = await A.post(`/api/documentos/${livre.id}/tarefas`).send(ENTRADA_DE_BRIEFING);
    expect(r.status).toBe(202);
    await A.post(`/api/tarefas/${Tarefa.parse(r.body).id}/cancelar`).send({});
    await api.fila.ociosa();
    const quatro = {
      ...ENTRADA_DE_BRIEFING,
      briefing: { ...ENTRADA_DE_BRIEFING.briefing, formatos: [...FORMATOS, { nome: 'Banner', largura: 1200, altura: 628 }, { nome: 'Capa', largura: 1584, altura: 396 }] },
    };
    expect((await A.post(`/api/documentos/${(await novaPeca()).id}/tarefas`).send(quatro)).status).toBe(400);
  });
});

describe('em produção só entra briefing pelo formulário', () => {
  it('o briefing solto é recusado com 400', async () => {
    const producao = await subirApi({ AMBIENTE: 'producao', MODELO_DO_AGENTE: 'claude', MODELO_CHAVE: 'chave-de-mentira-123' }, { consumirTarefas: false });
    try {
      const cliente = producao.como('A');
      const peca = DocumentoAberto.parse((await cliente.post('/api/documentos').send({ nome: 'x' })).body);
      const r = await cliente.post(`/api/documentos/${peca.id}/tarefas`).send(ENTRADA_DE_BRIEFING);
      expect(r.status).toBe(400);
      expect(ErroDaApi.parse(r.body)).toEqual({ codigo: CODIGOS_DE_ERRO.pedidoInvalido, detalhe: { campos: ['briefing'] } });
      const pelaPorta = await cliente
        .post(`/api/documentos/${peca.id}/tarefas`)
        .send({ tipo: 'briefing', briefing: { versao: 1, formatos: FORMATOS, textos: { titulo: 'x' }, imagens: { fonte: 'nenhuma' } } });
      expect(pelaPorta.status).toBe(202);
    } finally {
      await producao.fechar();
    }
  }, 60_000);
});

describe('rodada de adoção: marca na lista, o que está na frente, peça e tarefa numa chamada, miniatura', () => {
  const FORMULARIO = { versao: 1, nome: 'Aviso de inverno', formatos: FORMATOS, textos: { titulo: 'Abrimos às 7h' }, imagens: { fonte: 'nenhuma' } };

  it('POST /api/documentos/com-tarefa cria a peça e a tarefa; a peça vem com a marca e a lista filtra por ela', async () => {
    const marca = Marca.parse((await A.post('/api/marcas').send({ nome: 'Padaria Fermento' })).body);
    const r = await A.post('/api/documentos/com-tarefa').send({ tarefa: { tipo: 'briefing', briefing: { ...FORMULARIO, marcaId: marca.id } } });
    expect(r.status).toBe(202);
    const criada = PecaComTarefa.parse(r.body);
    expect(criada.documento.nome).toBe('Aviso de inverno');
    expect(criada.tarefa).toMatchObject({ documentoId: criada.documento.id, tipo: 'briefing' });

    // enquanto a tarefa está viva, a consulta de limites diz que esta peça está na frente
    const limites = LimitesDeTarefa.parse((await A.get('/api/tarefas/limites')).body);
    expect(limites.naFrente?.map((n) => n.documentoId)).toContain(criada.documento.id);
    expect(limites.naFrente?.find((n) => n.documentoId === criada.documento.id)?.nome).toBe('Aviso de inverno');

    const daMarca = ListaDeDocumentos.parse((await A.get(`/api/documentos?marca=${marca.id}`)).body);
    expect(daMarca.itens.map((d) => [d.id, d.marcaId])).toEqual([[criada.documento.id, marca.id]]);
    expect(ListaDeDocumentos.parse((await A.get(`/api/documentos?marca=${randomUUID()}`)).body).itens).toEqual([]);
    expect(ListaDeDocumentos.parse((await A.get('/api/documentos?marca=nao-e-id')).body).itens).toEqual([]);
    await api.fila.ociosa();
    await A.post(`/api/tarefas/${criada.tarefa.id}/cancelar`).send({});
  });

  it('se o formulário é recusado, ou o corpo não é de peça nova, nenhuma peça é criada', async () => {
    const antes = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.length;
    for (const [corpo, status] of [
      [{ tarefa: { tipo: 'briefing', briefing: { ...FORMULARIO, marcaId: randomUUID() } } }, 422],
      [{ tarefa: { tipo: 'briefing', briefing: { ...FORMULARIO, logo: { arquivo: 'f'.repeat(64) } } } }, 422],
      [{ tarefa: { tipo: 'briefing', briefing: { ...FORMULARIO, textos: {} } } }, 400],
      [{ tarefa: { tipo: 'ajuste', pedido: 'aumenta o título' } }, 400],
      [{ tarefa: { tipo: 'pedido', pedido: 'faz um banner' } }, 400],
      [{ nome: '', tarefa: { tipo: 'criar', pedido: 'x' } }, 400],
      [{ tarefa: { tipo: 'criar', pedido: 'x' }, documentoId: randomUUID() }, 400],
      [{}, 400],
    ] as const) {
      expect((await A.post('/api/documentos/com-tarefa').send(corpo)).status).toBe(status);
    }
    expect(ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens).toHaveLength(antes);
  });

  it('o pedido livre de criar também nasce com a peça, e ao fim da tarefa a peça ganha miniatura', async () => {
    const r = await A.post('/api/documentos/com-tarefa').send({ nome: 'Aviso do café', tarefa: { tipo: 'criar', pedido: 'Aviso para o Café Aurora, só com tipografia: "Abrimos às 7h".' } });
    expect(r.status).toBe(202);
    const criada = PecaComTarefa.parse(r.body);
    // o roteiro de criar não pede o "pode": vai direto para a revisão
    await api.fila.ociosa();
    expect(Tarefa.parse((await A.get(`/api/tarefas/${criada.tarefa.id}`)).body)).toMatchObject({ estado: 'em_revisao', fim: 'entregue' });
    await api.fila.ociosa();
    const item = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.find((d) => d.id === criada.documento.id);
    expect(item?.pranchetas).toBe(1);
    expect(item?.miniatura).toBe(`/api/documentos/${criada.documento.id}/miniatura?v=${item?.versao}`);
    const imagem = await A.get(item?.miniatura as string);
    expect(imagem.status).toBe(200);
    expect(imagem.headers['content-type']).toBe('image/jpeg');
    expect(imagem.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect([...(imagem.body as Buffer).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // o lado maior tem 480 px
    expect(inspecionarImagem(imagem.body as Buffer)).toMatchObject({ ok: true, tipo: 'image/jpeg' });
    const medidas = inspecionarImagem(imagem.body as Buffer) as { largura: number; altura: number };
    expect(Math.max(medidas.largura, medidas.altura)).toBe(480);
    // sem a versão (ou com versão velha) serve a atual, sem cache
    expect((await A.get(`/api/documentos/${criada.documento.id}/miniatura`)).headers['cache-control']).toBe('private, no-cache');
    await A.post(`/api/tarefas/${criada.tarefa.id}/aceitar`).send({});
  }, 120_000);

  it('peça sem miniatura responde 404, e a de outra conta não existe', async () => {
    const vazia = await novaPeca('Sem miniatura');
    expect((await A.get(`/api/documentos/${vazia.id}/miniatura`)).status).toBe(404);
    const comMiniatura = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.find((d) => d.miniatura);
    expect((await api.como('B').get(comMiniatura?.miniatura as string)).status).toBe(404);
  });

  it('depois de uma edição do designer a miniatura é pedida com atraso, uma vez só para várias edições', async () => {
    const peca = await novaPeca('Editada à mão');
    const agendadosAntes = api.fila.agendados.length;
    for (let versaoBase = 0; versaoBase < 3; versaoBase++) {
      const operacoes =
        versaoBase === 0
          ? [{ op: 'criarPrancheta', nome: 'Feed', largura: 400, altura: 500, fundo: '#fff7e6' }]
          : [{ op: 'alterarPrancheta', prancheta: 'Feed', props: { fundo: versaoBase === 1 ? '#000000' : '#ff0000' } }];
      expect((await A.post(`/api/documentos/${peca.id}/lotes`).send({ id: randomUUID(), versaoBase, descricao: 'x', operacoes })).status).toBe(200);
    }
    const dela = api.fila.agendados.slice(agendadosAntes).filter((a) => a.fila === 'miniatura-da-peca' && a.trabalho.id === peca.id);
    expect(dela).toHaveLength(1);
    // chegada a hora, o worker renderiza a versão que estiver valendo
    api.fila.adiantar();
    await api.fila.ociosa();
    const item = ListaDeDocumentos.parse((await A.get('/api/documentos?limite=100')).body).itens.find((d) => d.id === peca.id);
    expect(item?.miniatura).toBe(`/api/documentos/${peca.id}/miniatura?v=3`);
  }, 60_000);
});
