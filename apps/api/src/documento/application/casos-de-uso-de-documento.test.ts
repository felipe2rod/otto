// Regras de documento, sem NestJS e sem banco: caso de uso de verdade, repositórios em memória.
import { randomUUID } from 'node:crypto';
import { aplicarLote, caixaDe, type Documento, documentoVazio } from '@otto/documento';
import { CODIGOS_DE_ERRO, type EstadoDaTarefa, lerContaId } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { RepositorioDeArquivosEmMemoria } from '../../arquivo/infrastructure/memoria/repositorio-de-arquivos-em-memoria';
import { BibliotecaDeFontesEmMemoria } from '../../biblioteca/infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { RepositorioDeDocumentosEmMemoria } from '../infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { CasosDeUsoDeDocumento, LIMITE_DE_BYTES_DA_ARVORE, type TarefasDaPeca } from './casos-de-uso-de-documento';
import { type MedidorAberto, MedidorDeTexto } from './medidor-de-texto';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const SHA = 'a'.repeat(64);

class MedidorEspiao extends MedidorDeTexto {
  abertos = 0;
  liberados = 0;
  async abrir(): Promise<MedidorAberto> {
    this.abertos++;
    return { medidor: { tinta: (no) => caixaDe(no) ?? { x: 0, y: 0, w: 0, h: 0 } }, liberar: () => void this.liberados++ };
  }
}

const criarPrancheta = (nome = 'Feed') => ({ op: 'criarPrancheta', nome, largura: 1080, altura: 1350, fundo: '#ffffff' });
const criarForma = (nome: string, extra: object = {}) => ({
  op: 'criarNo',
  prancheta: 'Feed',
  no: { tipo: 'forma', nome, forma: 'retangulo', x: 10, y: 10, largura: 100, altura: 50, preenchimento: '#ff0000', ...extra },
});
const criarImagem = (arquivo: string) => ({
  op: 'criarNo',
  prancheta: 'Feed',
  no: { tipo: 'imagem', nome: 'Foto', x: 0, y: 0, largura: 100, altura: 100, arquivo, larguraOriginal: 100, alturaOriginal: 100 },
});

let docs: CasosDeUsoDeDocumento;
let arquivos: RepositorioDeArquivosEmMemoria;
let medidor: MedidorEspiao;
let fontes: BibliotecaDeFontesEmMemoria;

beforeEach(() => {
  arquivos = new RepositorioDeArquivosEmMemoria();
  medidor = new MedidorEspiao();
  fontes = new BibliotecaDeFontesEmMemoria();
  docs = new CasosDeUsoDeDocumento(new RepositorioDeDocumentosEmMemoria(), arquivos, medidor, randomUUID, undefined, fontes);
});

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao, e a chamada deu certo');
}

const lote = (versaoBase: number, operacoes: unknown[], extra: object = {}) => ({ id: randomUUID(), versaoBase, descricao: 'teste', operacoes, ...extra });

describe('criar, abrir, listar', () => {
  it('cria com o nome padrão, na versão 0, com a árvore vazia', async () => {
    const d = await docs.criar(contaA, {});
    expect(d).toEqual({ id: d.id, nome: 'Sem título', versao: 0, arvore: documentoVazio(), podeDesfazer: false, podeRefazer: false, fontes: [] });
    expect(await docs.abrir(contaA, d.id)).toEqual(d);
  });

  it('cria com o nome pedido', async () => {
    expect((await docs.criar(contaA, { nome: 'Promoção da semana' })).nome).toBe('Promoção da semana');
  });

  it('lista só os da conta, do alterado mais recentemente para o mais antigo', async () => {
    const um = await docs.criar(contaA, { nome: 'um' });
    const dois = await docs.criar(contaA, { nome: 'dois' });
    await docs.criar(contaB, { nome: 'de B' });
    await docs.renomear(contaA, um.id, { nome: 'um, mexido' });
    const lista = await docs.listar(contaA, { limite: 50 });
    expect(lista.itens.map((i) => i.nome)).toEqual(['um, mexido', 'dois']);
    expect(lista.itens[0]).toMatchObject({ id: um.id, pranchetas: 0, versao: 0, miniatura: null });
    expect(lista.proximoCursor).toBeNull();
    expect(dois.id).not.toBe(um.id);
  });

  it('pagina por cursor, sem repetir nem pular', async () => {
    for (let i = 0; i < 5; i++) await docs.criar(contaA, { nome: `doc ${i}` });
    const p1 = await docs.listar(contaA, { limite: 2 });
    const p2 = await docs.listar(contaA, { limite: 2, cursor: p1.proximoCursor as string });
    const p3 = await docs.listar(contaA, { limite: 2, cursor: p2.proximoCursor as string });
    expect([...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.nome)).toEqual(['doc 4', 'doc 3', 'doc 2', 'doc 1', 'doc 0']);
    expect(p3.proximoCursor).toBeNull();
  });

  it('cursor inventado é pedido inválido', async () => {
    expect((await erroDe(docs.listar(contaA, { limite: 2, cursor: 'não-é-cursor' }))).codigo).toBe(CODIGOS_DE_ERRO.pedidoInvalido);
  });

  it('documento de outra conta e id que não existe dão o mesmo erro', async () => {
    const deB = await docs.criar(contaB, {});
    const outra = await erroDe(docs.abrir(contaA, deB.id));
    const inexistente = await erroDe(docs.abrir(contaA, randomUUID()));
    expect(outra.codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect({ codigo: outra.codigo, detalhe: outra.detalhe }).toEqual({ codigo: inexistente.codigo, detalhe: inexistente.detalhe });
  });
});

describe('renomear, duplicar, arquivar', () => {
  it('renomear troca o nome e não cria versão nem passo no histórico', async () => {
    const d = await docs.criar(contaA, {});
    expect(await docs.renomear(contaA, d.id, { nome: 'Novo nome' })).toEqual({ id: d.id, nome: 'Novo nome' });
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ nome: 'Novo nome', versao: 0 });
    expect((await docs.historico(contaA, d.id, { limite: 50 })).itens).toEqual([]);
  });

  it('duplicar cria outro documento, na versão 0, com a árvore atual e nome de cópia', async () => {
    const d = await docs.criar(contaA, { nome: 'Original' });
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), criarForma('Botão')]));
    const copia = await docs.duplicar(contaA, d.id, {});
    expect(copia.id).not.toBe(d.id);
    expect(copia).toMatchObject({ nome: 'Original (cópia)', versao: 0 });
    expect(copia.arvore).toEqual((await docs.abrir(contaA, d.id)).arvore);
    // são independentes
    await docs.aplicarLote(contaA, copia.id, lote(0, [{ op: 'removerPrancheta', prancheta: 'Feed' }]));
    expect((await docs.abrir(contaA, d.id)).arvore.pranchetas).toHaveLength(1);
  });

  it('arquivar tira da lista e de abrir; não apaga', async () => {
    const d = await docs.criar(contaA, {});
    await docs.arquivar(contaA, d.id);
    expect((await docs.listar(contaA, { limite: 50 })).itens).toEqual([]);
    expect((await erroDe(docs.abrir(contaA, d.id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(docs.arquivar(contaA, d.id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('a conta A não renomeia, duplica nem arquiva documento da conta B', async () => {
    const deB = await docs.criar(contaB, { nome: 'de B' });
    for (const tentativa of [docs.renomear(contaA, deB.id, { nome: 'tomado' }), docs.duplicar(contaA, deB.id, {}), docs.arquivar(contaA, deB.id)]) {
      expect((await erroDe(tentativa)).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    }
    expect((await docs.abrir(contaB, deB.id)).nome).toBe('de B');
  });
});

describe('aplicar lote', () => {
  it('aplica, avança a versão e devolve os tocados; a árvore só quando pedida', async () => {
    const d = await docs.criar(contaA, {});
    const pedido = lote(0, [criarPrancheta()]);
    const r = await docs.aplicarLote(contaA, d.id, pedido);
    expect(r.versao).toBe(1);
    expect(r.lote.id).toBe(pedido.id);
    expect(r.lote.tocados).toHaveLength(1);
    expect(r.arvore).toBeUndefined();
    const comArvore = await docs.aplicarLote(contaA, d.id, lote(1, [criarForma('Botão')], { devolver: 'arvore' }));
    expect(comArvore.arvore?.pranchetas[0]?.filhos).toHaveLength(1);
    expect((await docs.abrir(contaA, d.id)).versao).toBe(2);
  });

  it('o resultado é o mesmo de aplicar o lote no navegador: os ids dos nós novos saem do id do lote', async () => {
    const d = await docs.criar(contaA, {});
    const pedido = lote(0, [criarPrancheta(), criarForma('Botão')]);
    await docs.aplicarLote(contaA, d.id, pedido);
    const local = aplicarLote(documentoVazio(), pedido.operacoes, { autoria: { tipo: 'designer' }, idDoLote: pedido.id });
    expect(local.ok && local.doc).toEqual((await docs.abrir(contaA, d.id)).arvore);
  });

  it('versão base desatualizada: recusa com a versão atual e não grava nada', async () => {
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta()]));
    const e = await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta('Story')])));
    expect(e).toMatchObject({ codigo: CODIGOS_DE_ERRO.versaoDesatualizada, detalhe: { versaoAtual: 1 } });
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 1 });
    expect((await docs.historico(contaA, d.id, { limite: 50 })).itens).toHaveLength(1);
  });

  it('lote inválido: diz a operação e o campo, e nada do lote entra (nem a parte que era válida)', async () => {
    const d = await docs.criar(contaA, {});
    const e = await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), { op: 'mover', alvo: 'Feed/Não existe', x: 0, y: 0 }])));
    expect(e.codigo).toBe(CODIGOS_DE_ERRO.loteInvalido);
    expect(e.detalhe).toMatchObject({ indice: 1, op: 'mover' });
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 0, arvore: documentoVazio() });
    expect((await docs.historico(contaA, d.id, { limite: 50 })).itens).toEqual([]);
  });

  it('operação que não existe no catálogo é lote inválido', async () => {
    const d = await docs.criar(contaA, {});
    const e = await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [{ op: 'gravarArvoreInteira', arvore: {} }])));
    expect(e.detalhe).toMatchObject({ indice: 0, op: 'gravarArvoreInteira' });
  });

  it('reenviar o mesmo lote devolve o mesmo resultado e não aplica duas vezes, mesmo com a versão já adiante', async () => {
    const d = await docs.criar(contaA, {});
    const pedido = lote(0, [criarPrancheta()]);
    const primeira = await docs.aplicarLote(contaA, d.id, pedido);
    await docs.aplicarLote(contaA, d.id, lote(1, [criarForma('Botão')]));
    const reenviado = await docs.aplicarLote(contaA, d.id, { ...pedido, devolver: 'arvore' });
    expect({ versao: reenviado.versao, lote: reenviado.lote }).toEqual({ versao: primeira.versao, lote: primeira.lote });
    // a árvore devolvida é a que resultou DAQUELE lote, não a atual
    expect(reenviado.arvore?.pranchetas[0]?.filhos).toEqual([]);
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 2 });
  });

  it('dois lotes ao mesmo tempo na mesma versão base: um entra, o outro é recusado por versão', async () => {
    const d = await docs.criar(contaA, {});
    const resultados = await Promise.allSettled([docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta('Feed')])), docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta('Story')]))]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const recusado = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((recusado.reason as ErroDaAplicacao).codigo).toBe(CODIGOS_DE_ERRO.versaoDesatualizada);
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 1 });
  });

  it('lote em documento de outra conta é "não encontrado", e o documento não muda', async () => {
    const deB = await docs.criar(contaB, {});
    expect((await erroDe(docs.aplicarLote(contaA, deB.id, lote(0, [criarPrancheta()])))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect(await docs.abrir(contaB, deB.id)).toMatchObject({ versao: 0 });
  });

  it('o hash não é autorização: lote que cita arquivo que a conta não tem é recusado', async () => {
    const d = await docs.criar(contaA, {});
    // o arquivo existe, mas é da conta B
    await arquivos.registrar(contaB, { id: randomUUID(), sha256: SHA, tipoMime: 'image/png', bytes: 10, largura: 1, altura: 1, especie: 'imagem', chaveDoObjeto: 'x' });
    const e = await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), criarImagem(SHA)])));
    expect(e).toMatchObject({ codigo: CODIGOS_DE_ERRO.arquivoDesconhecido, detalhe: { quantos: 1 } });
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 0 });
    // e a conta B, que tem o arquivo, consegue
    const deB = await docs.criar(contaB, {});
    expect((await docs.aplicarLote(contaB, deB.id, lote(0, [criarPrancheta(), criarImagem(SHA)]))).versao).toBe(1);
  });

  it('só confere arquivo NOVO: mexer num documento que já cita o arquivo não pede o arquivo de novo', async () => {
    await arquivos.registrar(contaA, { id: randomUUID(), sha256: SHA, tipoMime: 'image/png', bytes: 10, largura: 1, altura: 1, especie: 'imagem', chaveDoObjeto: 'x' });
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), criarImagem(SHA)]));
    expect((await docs.aplicarLote(contaA, d.id, lote(1, [{ op: 'mover', alvo: 'Feed/Foto', x: 5, y: 5 }]))).versao).toBe(2);
  });

  it('lote que mede texto abre o medidor e libera; lote que não mede, não abre', async () => {
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), criarForma('A'), criarForma('B', { y: 200 })]));
    expect(medidor.abertos).toBe(0);
    await docs.aplicarLote(contaA, d.id, lote(1, [{ op: 'alinhar', alvos: ['Feed/A', 'Feed/B'], borda: 'esquerda' }]));
    expect([medidor.abertos, medidor.liberados]).toEqual([1, 1]);
  });

  it('o medidor é liberado mesmo quando o lote falha', async () => {
    const d = await docs.criar(contaA, {});
    await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [{ op: 'alinhar', alvos: ['Feed/Não existe'], borda: 'esquerda' }])));
    expect([medidor.abertos, medidor.liberados]).toEqual([1, 1]);
  });

  it('recusa o lote que faria a árvore passar do tamanho máximo', async () => {
    const d = await docs.criar(contaA, {});
    const conteudo = 'x'.repeat(LIMITE_DE_BYTES_DA_ARVORE);
    const texto = { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Enorme', x: 0, y: 0, largura: 100, altura: 100, conteudo, fonte: 'IBM Plex Sans', tamanho: 12, cor: '#000000' } };
    expect((await erroDe(docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), texto])))).codigo).toBe(CODIGOS_DE_ERRO.documentoGrandeDemais);
    expect(await docs.abrir(contaA, d.id)).toMatchObject({ versao: 0 });
  });
});

describe('desfazer e refazer', () => {
  async function comTresLotes() {
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta()]));
    await docs.aplicarLote(contaA, d.id, lote(1, [criarForma('A')]));
    await docs.aplicarLote(contaA, d.id, lote(2, [criarForma('B')]));
    const arvores: Documento[] = [];
    return { id: d.id, arvores };
  }
  const nomes = (arvore: Documento) => arvore.pranchetas[0]?.filhos.map((n) => n.nome) ?? [];

  it('desfazer acrescenta um lote de reversão: a versão sobe, a árvore volta e o histórico cresce', async () => {
    const { id } = await comTresLotes();
    const r = await docs.desfazer(contaA, id, { versaoBase: 3 });
    expect(r.versao).toBe(4);
    expect(nomes(r.arvore)).toEqual(['A']);
    const h = await docs.historico(contaA, id, { limite: 50 });
    expect(h.itens.map((i) => [i.versao, i.tipo, i.desfeito])).toEqual([
      [4, 'reversao', false],
      [3, 'edicao', true],
      [2, 'edicao', false],
      [1, 'edicao', false],
    ]);
    expect(h.itens[0]).toMatchObject({ reverteAteVersao: 2, quantidadeDeOperacoes: 0 });
  });

  it('desfazer até o começo e depois não há mais o que desfazer', async () => {
    const { id } = await comTresLotes();
    await docs.desfazer(contaA, id, { versaoBase: 3 });
    await docs.desfazer(contaA, id, { versaoBase: 4 });
    const vazio = await docs.desfazer(contaA, id, { versaoBase: 5 });
    expect(vazio.arvore).toEqual(documentoVazio());
    expect((await erroDe(docs.desfazer(contaA, id, { versaoBase: 6 }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaDesfazer);
    expect((await docs.historico(contaA, id, { limite: 50 })).itens).toHaveLength(6);
  });

  it('refazer devolve o que o desfazer tirou e desmarca o lote', async () => {
    const { id } = await comTresLotes();
    await docs.desfazer(contaA, id, { versaoBase: 3 });
    const r = await docs.refazer(contaA, id, { versaoBase: 4 });
    expect(r.versao).toBe(5);
    expect(nomes(r.arvore)).toEqual(['A', 'B']);
    const h = await docs.historico(contaA, id, { limite: 50 });
    expect(h.itens.find((i) => i.versao === 3)?.desfeito).toBe(false);
    expect((await erroDe(docs.refazer(contaA, id, { versaoBase: 5 }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaRefazer);
  });

  it('edição nova depois de desfazer: não há mais o que refazer', async () => {
    const { id } = await comTresLotes();
    await docs.desfazer(contaA, id, { versaoBase: 3 });
    await docs.aplicarLote(contaA, id, lote(4, [criarForma('C')]));
    expect((await erroDe(docs.refazer(contaA, id, { versaoBase: 5 }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaRefazer);
    expect(nomes((await docs.abrir(contaA, id)).arvore)).toEqual(['A', 'C']);
  });

  it('desfazer e refazer conferem a versão base', async () => {
    const { id } = await comTresLotes();
    expect(await erroDe(docs.desfazer(contaA, id, { versaoBase: 2 }))).toMatchObject({ codigo: CODIGOS_DE_ERRO.versaoDesatualizada, detalhe: { versaoAtual: 3 } });
    expect((await erroDe(docs.refazer(contaA, id, { versaoBase: 2 }))).codigo).toBe(CODIGOS_DE_ERRO.versaoDesatualizada);
  });

  it('documento sem lote: nada para desfazer nem refazer', async () => {
    const d = await docs.criar(contaA, {});
    expect((await erroDe(docs.desfazer(contaA, d.id, { versaoBase: 0 }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaDesfazer);
    expect((await erroDe(docs.refazer(contaA, d.id, { versaoBase: 0 }))).codigo).toBe(CODIGOS_DE_ERRO.nadaParaRefazer);
  });

  it('numa cópia, desfazer tudo volta à árvore com que a cópia nasceu, não ao vazio', async () => {
    const { id } = await comTresLotes();
    const copia = await docs.duplicar(contaA, id, {});
    await docs.aplicarLote(contaA, copia.id, lote(0, [criarForma('C')]));
    const r = await docs.desfazer(contaA, copia.id, { versaoBase: 1 });
    expect(nomes(r.arvore)).toEqual(['A', 'B']);
  });

  it('a conta A não desfaz documento da conta B', async () => {
    const deB = await docs.criar(contaB, {});
    await docs.aplicarLote(contaB, deB.id, lote(0, [criarPrancheta()]));
    expect((await erroDe(docs.desfazer(contaA, deB.id, { versaoBase: 1 }))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
    expect((await erroDe(docs.historico(contaA, deB.id, { limite: 50 }))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });
});

describe('histórico', () => {
  it('do mais novo para o mais velho, paginado, com autoria e contagem, sem as operações', async () => {
    const d = await docs.criar(contaA, {});
    const pedido = lote(0, [criarPrancheta(), criarForma('A')], { descricao: 'monta a peça' });
    await docs.aplicarLote(contaA, d.id, pedido);
    await docs.aplicarLote(contaA, d.id, lote(1, [criarForma('B')]));
    const p1 = await docs.historico(contaA, d.id, { limite: 1 });
    expect(p1.itens.map((i) => i.versao)).toEqual([2]);
    const p2 = await docs.historico(contaA, d.id, { limite: 1, cursor: p1.proximoCursor as string });
    expect(p2.itens[0]).toMatchObject({ id: pedido.id, versao: 1, autoria: 'designer', tipo: 'edicao', descricao: 'monta a peça', quantidadeDeOperacoes: 2, desfeito: false });
    expect(p2.itens[0]).not.toHaveProperty('operacoes');
    expect(p2.proximoCursor).toBeNull();
  });
});

describe('pode desfazer, pode refazer', () => {
  const possibilidades = async (id: string) => {
    const d = await docs.abrir(contaA, id);
    return [d.podeDesfazer, d.podeRefazer];
  };

  it('acompanham o histórico em cada resposta e ao abrir', async () => {
    const d = await docs.criar(contaA, {});
    expect(await possibilidades(d.id)).toEqual([false, false]);

    const umLote = await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta()]));
    expect([umLote.podeDesfazer, umLote.podeRefazer]).toEqual([true, false]);
    await docs.aplicarLote(contaA, d.id, lote(1, [criarForma('A')]));
    expect(await possibilidades(d.id)).toEqual([true, false]);

    const desfez = await docs.desfazer(contaA, d.id, { versaoBase: 2 });
    expect([desfez.podeDesfazer, desfez.podeRefazer]).toEqual([true, true]);
    const desfezTudo = await docs.desfazer(contaA, d.id, { versaoBase: 3 });
    expect([desfezTudo.podeDesfazer, desfezTudo.podeRefazer]).toEqual([false, true]);
    expect(await possibilidades(d.id)).toEqual([false, true]);

    const refez = await docs.refazer(contaA, d.id, { versaoBase: 4 });
    expect([refez.podeDesfazer, refez.podeRefazer]).toEqual([true, true]);
    const refezTudo = await docs.refazer(contaA, d.id, { versaoBase: 5 });
    expect([refezTudo.podeDesfazer, refezTudo.podeRefazer]).toEqual([true, false]);
    expect(await possibilidades(d.id)).toEqual([true, false]);
  });

  it('edição nova depois de desfazer: não dá mais para refazer', async () => {
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta()]));
    await docs.desfazer(contaA, d.id, { versaoBase: 1 });
    const r = await docs.aplicarLote(contaA, d.id, lote(2, [criarPrancheta('Story')]));
    expect([r.podeDesfazer, r.podeRefazer]).toEqual([true, false]);
  });

  it('o lote reenviado responde como da primeira vez', async () => {
    const d = await docs.criar(contaA, {});
    const pedido = lote(0, [criarPrancheta()]);
    await docs.aplicarLote(contaA, d.id, pedido);
    const deNovo = await docs.aplicarLote(contaA, d.id, pedido);
    expect([deNovo.podeDesfazer, deNovo.podeRefazer]).toEqual([true, false]);
  });

  it('cópia nasce sem nada para desfazer', async () => {
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta()]));
    const copia = await docs.duplicar(contaA, d.id, {});
    expect([copia.podeDesfazer, copia.podeRefazer]).toEqual([false, false]);
  });
});

describe('fontes do documento aberto', () => {
  const texto = (nome: string, fonte: string, peso = 400) => ({
    op: 'criarNo',
    prancheta: 'Feed',
    no: { tipo: 'texto', nome, x: 0, y: 0, largura: 300, altura: 100, conteudo: 'Otto', fonte, peso, tamanho: 40, cor: '#000000' },
  });

  it('diz os pesos que a biblioteca tem de cada família usada; família que não existe vem com a lista vazia', async () => {
    await fontes.registrar({ familia: 'IBM Plex Sans', peso: 700, nomePostScript: 'IBMPlexSans-Bold', licenca: null, conteudo: Uint8Array.from([1]) });
    await fontes.registrar({ familia: 'IBM Plex Sans', peso: 400, nomePostScript: 'IBMPlexSans', licenca: null, conteudo: Uint8Array.from([2]) });
    await fontes.registrar({ familia: 'Anton', peso: 400, nomePostScript: 'Anton-Regular', licenca: null, conteudo: Uint8Array.from([3]) });
    const d = await docs.criar(contaA, {});
    await docs.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), texto('Título', 'IBM Plex Sans', 600), texto('Rodapé', 'Sumida')]));
    expect((await docs.abrir(contaA, d.id)).fontes).toEqual([
      { familia: 'IBM Plex Sans', pesos: [400, 700] },
      { familia: 'Sumida', pesos: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Fatia 3: a peça durante uma tarefa do Otto, o lote do agente e a tarefa como unidade do histórico.
// ---------------------------------------------------------------------------------------------
describe('a peça e a tarefa do Otto', () => {
  const TAREFA = '0199a3f0-0000-7000-8000-0000000000f1';
  let viva: { id: string; estado: EstadoDaTarefa; versaoInicial?: number; tocados?: string[] } | undefined;
  let comTarefa: CasosDeUsoDeDocumento;

  beforeEach(() => {
    viva = undefined;
    const completa = () => (viva ? { versaoInicial: 1, tocados: ['n1'], ...viva } : undefined);
    const tarefas: TarefasDaPeca = { viva: async () => completa(), vivas: async () => new Map() };
    comTarefa = new CasosDeUsoDeDocumento(new RepositorioDeDocumentosEmMemoria(), arquivos, medidor, randomUUID, undefined, fontes, tarefas);
  });

  async function pecaComBotao() {
    const d = await comTarefa.criar(contaA, { nome: 'Peça' });
    await comTarefa.aplicarLote(contaA, d.id, lote(0, [criarPrancheta(), criarForma('Botão')]));
    return d.id;
  }
  const loteDoOtto = (operacoes: unknown[]) => ({ id: randomUUID(), descricao: 'do Otto', operacoes });

  it.each([
    ['na_fila', CODIGOS_DE_ERRO.documentoEmTarefa],
    ['preparando', CODIGOS_DE_ERRO.documentoEmTarefa],
    ['aguardando_confirmacao', CODIGOS_DE_ERRO.documentoEmTarefa],
    ['rodando', CODIGOS_DE_ERRO.documentoEmTarefa],
    ['em_revisao', CODIGOS_DE_ERRO.revisaoPendente],
  ] as const)('com tarefa %s, a peça é somente leitura para o designer: editar, desfazer e refazer respondem %s, e nada muda', async (estado, codigo) => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado };
    for (const tentar of [
      () => comTarefa.aplicarLote(contaA, id, lote(1, [criarForma('Outra')])),
      () => comTarefa.desfazer(contaA, id, { versaoBase: 1 }),
      () => comTarefa.refazer(contaA, id, { versaoBase: 1 }),
    ]) {
      const erro = await erroDe(tentar());
      expect(erro.codigo).toBe(codigo);
      expect(erro.detalhe).toMatchObject({ tarefaId: TAREFA });
    }
    expect((await comTarefa.abrir(contaA, id)).versao).toBe(1);
    // abrir e listar continuam, e dizem qual tarefa está viva
    const aberta = await comTarefa.abrir(contaA, id);
    expect(aberta.tarefaAtiva).toEqual({ id: TAREFA, estado });
    // em revisão, a peça diz de que versão partiu o conjunto de alterações e o que ele tocou
    expect(aberta.conjuntoPendente).toEqual(estado === 'em_revisao' ? { tarefaId: TAREFA, versaoInicial: 1, tocados: ['n1'] } : undefined);
  });

  it('sem tarefa viva, tudo como antes, e abrir não traz tarefa', async () => {
    const id = await pecaComBotao();
    expect((await comTarefa.aplicarLote(contaA, id, lote(1, [criarForma('Outra')]))).versao).toBe(2);
    expect((await comTarefa.abrir(contaA, id)).tarefaAtiva).toBeUndefined();
  });

  it('o lote do Otto entra com autoria do agente e o id da tarefa, só enquanto essa tarefa está rodando', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    const pedido = loteDoOtto([criarForma('Selo')]);
    const r = await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, pedido);
    expect(r).toMatchObject({ ok: true, versao: 2 });
    expect(r.ok && r.arvore.pranchetas[0]?.filhos.map((n) => n.nome)).toEqual(['Botão', 'Selo']);
    const ultimo = (await comTarefa.historico(contaA, id, { limite: 1 })).itens[0];
    expect(ultimo).toMatchObject({ versao: 2, autoria: 'agente', tarefaId: TAREFA, descricao: 'do Otto', id: pedido.id });

    // de outra tarefa, ou com a tarefa fora de "rodando": recusado, sem gravar
    expect(await comTarefa.aplicarLoteDoAgente(contaA, id, randomUUID(), loteDoOtto([criarForma('X')]))).toMatchObject({ ok: false });
    viva = { id: TAREFA, estado: 'aguardando_confirmacao' };
    expect(await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarForma('X')]))).toMatchObject({ ok: false });
    viva = undefined;
    expect(await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarForma('X')]))).toMatchObject({ ok: false });
    expect((await comTarefa.abrir(contaA, id)).versao).toBe(2);
  });

  it('lote do Otto que o catálogo recusa, ou que a conferência de quem chama recusa, volta como erro e nada é gravado', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    const invalido = await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([{ op: 'mover', alvo: 'Feed/Não existe', x: 0, y: 0 }]));
    expect(invalido).toMatchObject({ ok: false, erro: { indice: 0, op: 'mover' } });
    const vetado = await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarPrancheta('Story')]), () => ({
      ok: false,
      erro: { indice: 0, op: 'criarPrancheta', mensagem: 'fora do plano' },
    }));
    expect(vetado).toEqual({ ok: false, erro: { indice: 0, op: 'criarPrancheta', mensagem: 'fora do plano' } });
    const comArquivoAlheio = await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarImagem(SHA)]));
    expect(comArquivoAlheio).toMatchObject({ ok: false, erro: { op: 'criarNo' } });
    expect((await comTarefa.abrir(contaA, id)).versao).toBe(1);
  });

  it('reenvio do mesmo lote do Otto (mesmo id) não aplica duas vezes', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    const pedido = loteDoOtto([criarForma('Selo')]);
    await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, pedido);
    expect(await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, pedido)).toMatchObject({ ok: true, versao: 2 });
    expect((await comTarefa.abrir(contaA, id)).versao).toBe(2);
  });

  it('a tarefa é uma unidade do histórico: desfazer tira os lotes dela de uma vez, e refazer os devolve de uma vez', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    for (const nome of ['Um', 'Dois', 'Três']) await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarForma(nome)]));
    viva = undefined; // aceita
    const nomes = (a: { pranchetas: { filhos: { nome: string }[] }[] }) => a.pranchetas[0]?.filhos.map((n) => n.nome);

    const desfeito = await comTarefa.desfazer(contaA, id, { versaoBase: 4 });
    expect(nomes(desfeito.arvore)).toEqual(['Botão']);
    expect(desfeito).toMatchObject({ versao: 5, podeDesfazer: true, podeRefazer: true });
    const refeito = await comTarefa.refazer(contaA, id, { versaoBase: 5 });
    expect(nomes(refeito.arvore)).toEqual(['Botão', 'Um', 'Dois', 'Três']);
    // e o passo seguinte de desfazer tira a tarefa inteira de novo, não o último lote dela
    expect(nomes((await comTarefa.desfazer(contaA, id, { versaoBase: 6 })).arvore)).toEqual(['Botão']);
    // mais um desfazer: o lote do designer que veio antes
    expect((await comTarefa.desfazer(contaA, id, { versaoBase: 7 })).arvore.pranchetas).toEqual([]);
  });

  it('voltar para antes da tarefa: restaura a versão inicial num lote de reversão, ligado à tarefa; sem lote da tarefa, não grava nada', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarForma('Um')]));
    await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarPrancheta('Story')]));
    viva = { id: TAREFA, estado: 'em_revisao' };
    const r = await comTarefa.voltarParaAntesDaTarefa(contaA, id, { id: TAREFA, versaoInicial: 1 });
    expect(r.versao).toBe(4);
    expect(r.arvore.pranchetas.map((p) => [p.nome, p.filhos.map((n) => n.nome)])).toEqual([['Feed', ['Botão']]]);
    expect((await comTarefa.historico(contaA, id, { limite: 1 })).itens[0]).toMatchObject({ tipo: 'reversao', tarefaId: TAREFA, reverteAteVersao: 1 });
  });

  it('descartar uma prancheta da tarefa é um lote comum de remover prancheta, ligado à tarefa', async () => {
    const id = await pecaComBotao();
    viva = { id: TAREFA, estado: 'rodando' };
    await comTarefa.aplicarLoteDoAgente(contaA, id, TAREFA, loteDoOtto([criarPrancheta('Story')]));
    viva = { id: TAREFA, estado: 'em_revisao' };
    const story = (await comTarefa.abrir(contaA, id)).arvore.pranchetas[1]?.id as string;
    const r = await comTarefa.removerPranchetaDaTarefa(contaA, id, TAREFA, story);
    expect(r.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed']);
    expect((await comTarefa.historico(contaA, id, { limite: 1 })).itens[0]).toMatchObject({ versao: 3, autoria: 'designer', tarefaId: TAREFA });
  });
});

describe('a lista de peças diz como a tarefa parou', () => {
  it('a tarefa em revisão que não terminou vem com o fim, para a lista não dizer "pronto para revisar"', async () => {
    const vivas = new Map<string, { id: string; estado: EstadoDaTarefa; fim?: 'interrompida' | 'entregue' }>();
    const comTarefa = new CasosDeUsoDeDocumento(new RepositorioDeDocumentosEmMemoria(), arquivos, medidor, randomUUID, undefined, fontes, {
      viva: async (_e, id) => {
        const v = vivas.get(id);
        return v ? { ...v, versaoInicial: 0, tocados: [] } : undefined;
      },
      vivas: async () => vivas,
    });
    const [parou, entregou, livre] = [await comTarefa.criar(contaA, { nome: 'parou' }), await comTarefa.criar(contaA, { nome: 'entregou' }), await comTarefa.criar(contaA, { nome: 'livre' })];
    vivas.set(parou.id, { id: randomUUID(), estado: 'em_revisao', fim: 'interrompida' });
    vivas.set(entregou.id, { id: randomUUID(), estado: 'em_revisao', fim: 'entregue' });
    const lista = (await comTarefa.listar(contaA, { limite: 10 })).itens;
    expect(lista.find((d) => d.id === parou.id)?.tarefa).toEqual({ id: vivas.get(parou.id)?.id, estado: 'em_revisao', fim: 'interrompida' });
    expect(lista.find((d) => d.id === entregou.id)?.tarefa?.fim).toBe('entregue');
    expect(lista.find((d) => d.id === livre.id)?.tarefa).toBeUndefined();
    expect((await comTarefa.abrir(contaA, parou.id)).tarefaAtiva).toEqual({ id: vivas.get(parou.id)?.id, estado: 'em_revisao', fim: 'interrompida' });
  });
});

describe('fonte sob demanda, antes do lote', () => {
  it('as famílias que o lote cita são garantidas ANTES de travar a peça e medir; as que só estão no documento, não', async () => {
    const pedidas: string[][] = [];
    const abertosNaHora: number[] = [];
    const comGarantia = new CasosDeUsoDeDocumento(new RepositorioDeDocumentosEmMemoria(), arquivos, medidor, randomUUID, undefined, fontes, undefined, {
      garantir: async (familias) => {
        // a garantia vem antes da medida deste lote
        abertosNaHora.push(medidor.abertos);
        pedidas.push([...familias]);
      },
    });
    const d = await comGarantia.criar(contaA, { nome: 'Peça' });
    await comGarantia.aplicarLote(
      contaA,
      d.id,
      lote(0, [
        criarPrancheta(),
        { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 0, y: 0, largura: 400, altura: 100, conteudo: 'Oi', fonte: 'Lilita One', tamanho: 40, cor: '#111111' } },
      ]),
    );
    await comGarantia.aplicarLote(contaA, d.id, lote(1, [{ op: 'mover', alvo: 'Feed/Título', x: 10, y: 10 }]));
    await comGarantia.aplicarLoteDoAgente(contaA, d.id, randomUUID(), { id: randomUUID(), descricao: 'x', operacoes: [{ op: 'alterar', alvo: 'Feed/Título', props: { fonte: 'Poppins' } }] });
    expect(pedidas).toEqual([['Lilita One'], ['Poppins']]);
    expect(abertosNaHora[0]).toBe(0);
  });
});

describe('peça de exemplo da conta nova', () => {
  it('semeia uma peça em camadas, válida para o catálogo, marcada como exemplo; da segunda vez não faz nada', async () => {
    const id = await docs.semearExemplo(contaA);
    expect(id).toBeDefined();
    const peca = await docs.abrir(contaA, id as string);
    expect(peca.versao).toBe(1);
    expect(peca.arvore.pranchetas).toHaveLength(1);
    expect(peca.arvore.pranchetas[0]?.filhos.length).toBeGreaterThanOrEqual(4);
    expect(peca.arvore.pranchetas[0]?.filhos.some((n) => n.tipo === 'texto')).toBe(true);
    // nasce com identidade em tokens, para o designer ver o recurso funcionando
    expect(Object.keys(peca.arvore.tokens.cores).length).toBeGreaterThanOrEqual(3);
    expect(await docs.semearExemplo(contaA)).toBeUndefined();
    expect((await docs.listar(contaA, { limite: 10 })).itens).toHaveLength(1);
  });

  it('apagada pelo designer, não volta; e cada conta tem a sua', async () => {
    const id = (await docs.semearExemplo(contaA)) as string;
    await docs.arquivar(contaA, id);
    expect(await docs.semearExemplo(contaA)).toBeUndefined();
    expect((await docs.listar(contaA, { limite: 10 })).itens).toEqual([]);
    expect(await docs.semearExemplo(contaB)).toBeDefined();
  });

  it('o evento de uso diz que foi semeada, sem o nome nem o conteúdo', async () => {
    const eventos: unknown[] = [];
    const comUso = new CasosDeUsoDeDocumento(new RepositorioDeDocumentosEmMemoria(), arquivos, medidor, randomUUID, { registrar: (_e, evento) => void eventos.push(evento) }, fontes);
    const id = await comUso.semearExemplo(contaA);
    expect(eventos.at(-1)).toEqual({ evento: 'peca_de_exemplo_semeada', documentoId: id });
  });
});
