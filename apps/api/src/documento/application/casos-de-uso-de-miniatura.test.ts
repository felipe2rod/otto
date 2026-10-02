import { randomUUID } from 'node:crypto';
import { type Documento, documentoVazio } from '@otto/documento';
import { CODIGOS_DE_ERRO, lerContaId } from '@otto/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { chaveDeMiniatura } from '../../arquivo/application/chave-de-objeto';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { BarramentoEmMemoria } from '../../plataforma/fila/adaptadores/memoria/barramento-em-memoria';
import { FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { RepositorioDeDocumentosEmMemoria } from '../infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { ATRASO_DEPOIS_DE_EDICAO_MS, CasosDeUsoDeMiniatura, LADO_DA_MINIATURA, RenderDeMiniatura } from './casos-de-uso-de-miniatura';

const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 1, 2, 3]);

class RenderDeMentira extends RenderDeMiniatura {
  pedidos: { conta: string; prancheta: string; ladoMaximo: number }[] = [];
  falha = false;
  async renderizar(escopo: EscopoDaConta, _peca: { nome: string; arvore: Documento }, prancheta: string, ladoMaximo: number): Promise<Uint8Array> {
    this.pedidos.push({ conta: escopo.contaId, prancheta, ladoMaximo });
    if (this.falha) throw new Error('o motor caiu');
    return JPEG;
  }
}

let documentos: RepositorioDeDocumentosEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let fila: BarramentoEmMemoria;
let render: RenderDeMentira;
let relogio: Date;
let casos: CasosDeUsoDeMiniatura;

const comPrancheta = (nome = 'Feed'): Documento => ({ ...documentoVazio(), pranchetas: [{ id: `p-${nome}`, nome, tipo: 'prancheta', largura: 1080, altura: 1350, fundo: '#ffffff', filhos: [] }] });
async function peca(arvore = comPrancheta(), versao = 0): Promise<string> {
  const d = await documentos.criar(contaA, { id: randomUUID(), nome: 'Peça', arvore });
  for (let v = 1; v <= versao; v++)
    await documentos.comTrava(contaA, d.id, (doc) => doc.gravarLote({ id: randomUUID(), versao: v, autoria: 'designer', tipo: 'edicao', descricao: 'x', operacoes: [], tocados: [], arvore }));
  return d.id;
}
async function erroDe(promessa: Promise<unknown>): Promise<ErroDaAplicacao> {
  try {
    await promessa;
  } catch (e) {
    if (e instanceof ErroDaAplicacao) return e;
    throw e;
  }
  throw new Error('esperava ErroDaAplicacao');
}

beforeEach(() => {
  documentos = new RepositorioDeDocumentosEmMemoria();
  armazenamento = new ArmazenamentoEmMemoria();
  fila = new BarramentoEmMemoria();
  render = new RenderDeMentira();
  relogio = new Date('2026-10-05T12:00:00.000Z');
  casos = new CasosDeUsoDeMiniatura({ documentos, armazenamento, fila, render, agora: () => relogio });
});

describe('pedir a miniatura', () => {
  it('depois de uma edição, o trabalho é marcado para daqui a alguns segundos, só com a conta e o id da peça', async () => {
    const id = await peca();
    await casos.pedirDepoisDeEdicao(contaA, id);
    // com hora marcada: ainda não chegou à fila
    expect(fila.publicados).toEqual([]);
    expect(fila.agendados.map((a) => ({ fila: a.fila, trabalho: a.trabalho, emMs: a.naoAntesDe.getTime() - relogio.getTime() }))).toEqual([
      { fila: FILAS.miniaturaDaPeca, trabalho: { contaId: contaA.contaId, id }, emMs: ATRASO_DEPOIS_DE_EDICAO_MS },
    ]);
    expect(render.pedidos).toEqual([]);
  });

  it('não é um render a cada tecla: dez edições seguidas pedem uma miniatura só; passado o atraso, a próxima edição pede outra', async () => {
    const id = await peca();
    for (let i = 0; i < 10; i++) {
      await casos.pedirDepoisDeEdicao(contaA, id);
      relogio = new Date(relogio.getTime() + 500);
    }
    expect(fila.agendados).toHaveLength(1);
    relogio = new Date(relogio.getTime() + ATRASO_DEPOIS_DE_EDICAO_MS);
    await casos.pedirDepoisDeEdicao(contaA, id);
    expect(fila.agendados).toHaveLength(2);
  });

  it('ao fim de uma tarefa do Otto o pedido sai na hora, mesmo com outro pedido recente', async () => {
    const id = await peca();
    await casos.pedirDepoisDeEdicao(contaA, id);
    await casos.pedirAgora(contaA, id);
    expect(fila.publicados).toEqual([{ fila: FILAS.miniaturaDaPeca, trabalho: { contaId: contaA.contaId, id } }]);
    expect(fila.agendados).toHaveLength(1);
  });

  it('pedir nunca derruba quem pediu: fila fora do ar e peça de outra conta não dão erro, e nada é publicado para a peça alheia', async () => {
    const id = await peca();
    await casos.pedirDepoisDeEdicao(contaB, id);
    await casos.pedirAgora(contaB, id);
    expect([fila.publicados, fila.agendados]).toEqual([[], []]);
    fila.publicar = async () => {
      throw new Error('fila fora do ar');
    };
    await expect(casos.pedirDepoisDeEdicao(contaA, id)).resolves.toBeUndefined();
    await expect(casos.pedirAgora(contaA, id)).resolves.toBeUndefined();
  });
});

describe('gerar a miniatura (no worker)', () => {
  it('renderiza a primeira prancheta, reduzida, guarda no armazenamento da conta e registra a versão', async () => {
    const id = await peca(comPrancheta(), 2);
    expect(await casos.gerar(contaA, id)).toBe('feita');
    expect(render.pedidos).toEqual([{ conta: contaA.contaId, prancheta: 'p-Feed', ladoMaximo: LADO_DA_MINIATURA }]);
    expect(await armazenamento.ler(contaA, chaveDeMiniatura(contaA, id, 2))).toEqual(JPEG);
    expect((await documentos.abrir(contaA, id))?.miniaturaVersao).toBe(2);
    expect(await casos.ler(contaA, id)).toEqual({ bytes: JPEG, versao: 2 });
  });

  it('a miniatura nova substitui a antiga: o arquivo da versão anterior é apagado', async () => {
    const id = await peca(comPrancheta(), 1);
    await casos.gerar(contaA, id);
    await documentos.comTrava(contaA, id, (doc) =>
      doc.gravarLote({ id: randomUUID(), versao: 2, autoria: 'designer', tipo: 'edicao', descricao: 'x', operacoes: [], tocados: [], arvore: comPrancheta() }),
    );
    await casos.gerar(contaA, id);
    expect(await armazenamento.existe(contaA, chaveDeMiniatura(contaA, id, 1))).toBe(false);
    expect(await armazenamento.existe(contaA, chaveDeMiniatura(contaA, id, 2))).toBe(true);
  });

  it('trabalho repetido, ou que chegou depois de a miniatura desta versão já existir, não renderiza de novo', async () => {
    const id = await peca();
    await casos.gerar(contaA, id);
    expect(await casos.gerar(contaA, id)).toBe('ignorada');
    expect(render.pedidos).toHaveLength(1);
  });

  it('peça sem prancheta não tem miniatura; se tinha (o Otto foi desfeito e a peça voltou a ficar vazia), deixa de ter', async () => {
    const vazia = await peca(documentoVazio());
    expect(await casos.gerar(contaA, vazia)).toBe('ignorada');
    expect(render.pedidos).toEqual([]);
    expect((await erroDe(casos.ler(contaA, vazia))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('o trabalho com a conta trocada não renderiza nem lê a peça de outra conta', async () => {
    const id = await peca();
    expect(await casos.gerar(contaB, id)).toBe('ignorada');
    expect(render.pedidos).toEqual([]);
    await casos.gerar(contaA, id);
    expect((await erroDe(casos.ler(contaB, id))).codigo).toBe(CODIGOS_DE_ERRO.naoEncontrado);
  });

  it('se o render falha, o erro sobe (a fila tenta de novo) e a miniatura anterior continua valendo', async () => {
    const id = await peca(comPrancheta(), 1);
    await casos.gerar(contaA, id);
    await documentos.comTrava(contaA, id, (doc) =>
      doc.gravarLote({ id: randomUUID(), versao: 2, autoria: 'designer', tipo: 'edicao', descricao: 'x', operacoes: [], tocados: [], arvore: comPrancheta() }),
    );
    render.falha = true;
    await expect(casos.gerar(contaA, id)).rejects.toThrow('o motor caiu');
    expect((await casos.ler(contaA, id)).versao).toBe(1);
  });
});
