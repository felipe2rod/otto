// Todo gesto vira lote do catálogo (ADR 027). Aqui: os montadores de lote das ações do editor.
// Nenhum deles aplica nada: devolvem descrição e operações, e quem aplica é a sessão.
import { aplicarLote, type Documento, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { editor as textos } from '../../textos/editor';
import { acharNoPorId, loteDeAlterar, loteDeBloqueio, loteDeMoverPorSeta, loteDeRemover, loteDeRenomear, loteDeReordenar, loteDeVisibilidade } from './acoes';

function montar(): Documento {
  const forma = (nome: string, x: number, extra: Record<string, unknown> = {}) => ({
    tipo: 'forma',
    nome,
    forma: 'retangulo',
    x,
    y: 100,
    largura: 200,
    altura: 100,
    preenchimento: '#ff5b1f',
    ...extra,
  });
  const r = aplicarLote(
    documentoVazio(),
    [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: forma('A', 100) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('B', 400) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Travada', 700, { bloqueado: true }) },
      { op: 'agrupar', alvos: ['Feed/A', 'Feed/B'], nome: 'Grupo' },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'acoes' },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}
const doc = montar();
const id = (nome: string) => {
  const feed = doc.pranchetas[0];
  const todos = feed ? [...feed.filhos, ...feed.filhos.flatMap((n) => (n.tipo === 'grupo' ? n.filhos : []))] : [];
  const no = todos.find((n) => n.nome === nome);
  if (!no) throw new Error(`falta ${nome}`);
  return no.id;
};
const aplica = (lote: { operacoes: unknown[] } | null) => lote !== null && aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'x' }).ok;

describe('achar nó por id', () => {
  it('acha camada dentro de grupo, e devolve a prancheta', () => {
    expect(acharNoPorId(doc, id('A'))?.no.nome).toBe('A');
    expect(acharNoPorId(doc, id('A'))?.prancheta.nome).toBe('Feed');
    expect(acharNoPorId(doc, 'nao-existe')).toBeUndefined();
  });
});

describe('mover por seta', () => {
  it('move cada camada selecionada pela distância pedida, num lote só', () => {
    const lote = loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('A'), id('B')] }, 10, 0);
    expect(lote?.operacoes).toEqual([
      { op: 'mover', alvo: id('A'), x: 110, y: 100 },
      { op: 'mover', alvo: id('B'), x: 410, y: 100 },
    ]);
    expect(lote?.descricao).toBe(textos.historico.mover('A, B'));
    expect(aplica(lote)).toBe(true);
  });

  it('camada bloqueada fica de fora; se só há bloqueada, não há lote', () => {
    expect(loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('A'), id('Travada')] }, 1, 0)?.operacoes).toHaveLength(1);
    expect(loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: [id('Travada')] }, 1, 0)).toBeNull();
  });

  it('sem camada selecionada não há lote', () => {
    expect(loteDeMoverPorSeta(doc, null, 1, 0)).toBeNull();
    expect(loteDeMoverPorSeta(doc, { tipo: 'prancheta', id: 'p' }, 1, 0)).toBeNull();
  });
});

describe('remover', () => {
  it('remove as camadas selecionadas que não estão bloqueadas', () => {
    const lote = loteDeRemover(doc, { tipo: 'camadas', ids: [id('Grupo'), id('Travada')] });
    expect(lote?.operacoes).toEqual([{ op: 'remover', alvo: id('Grupo') }]);
    expect(lote?.descricao).toBe(textos.historico.remover('Grupo'));
    expect(aplica(lote)).toBe(true);
  });

  it('prancheta selecionada não é removida pelo Delete', () => {
    expect(loteDeRemover(doc, { tipo: 'prancheta', id: doc.pranchetas[0]?.id ?? '' })).toBeNull();
  });
});

describe('visibilidade, bloqueio e nome', () => {
  const a = acharNoPorId(doc, id('A'))?.no;
  const travada = acharNoPorId(doc, id('Travada'))?.no;
  if (!a || !travada) throw new Error('faltam camadas');

  it('ocultar e mostrar são `alterar` da propriedade visivel', () => {
    expect(loteDeVisibilidade(a)).toEqual({ descricao: textos.historico.ocultar('A'), operacoes: [{ op: 'alterar', alvo: a.id, props: { visivel: false } }] });
    expect(loteDeVisibilidade({ ...a, visivel: false }).descricao).toBe(textos.historico.mostrar('A'));
    expect(aplica(loteDeVisibilidade(a))).toBe(true);
  });

  it('desbloquear uma camada bloqueada é permitido ao designer', () => {
    const lote = loteDeBloqueio(travada);
    expect(lote).toEqual({ descricao: textos.historico.desbloquear('Travada'), operacoes: [{ op: 'alterar', alvo: travada.id, props: { bloqueado: false } }] });
    expect(aplica(lote)).toBe(true);
  });

  it('renomear apara o nome; nome vazio ou igual não vira lote', () => {
    expect(loteDeRenomear(a, '  Título ')?.operacoes).toEqual([{ op: 'alterar', alvo: a.id, props: { nome: 'Título' } }]);
    expect(loteDeRenomear(a, '   ')).toBeNull();
    expect(loteDeRenomear(a, 'A')).toBeNull();
  });

  it('alterar propriedade leva o nome da propriedade na descrição', () => {
    expect(loteDeAlterar(a, { opacidade: 0.5 }, textos.propriedades.opacidade)).toEqual({
      descricao: textos.historico.alterar(textos.propriedades.opacidade, 'A'),
      operacoes: [{ op: 'alterar', alvo: a.id, props: { opacidade: 0.5 } }],
    });
  });
});

describe('reordenar um passo', () => {
  it('sobe e desce entre as irmãs, pelo índice', () => {
    // dentro do grupo: A embaixo (0), B em cima (1)
    expect(loteDeReordenar(doc, id('A'), 1)?.operacoes).toEqual([{ op: 'reordenar', alvo: id('A'), posicao: 1 }]);
    expect(loteDeReordenar(doc, id('B'), -1)?.operacoes).toEqual([{ op: 'reordenar', alvo: id('B'), posicao: 0 }]);
    expect(aplica(loteDeReordenar(doc, id('A'), 1))).toBe(true);
  });

  it('quem já está no topo não sobe, e quem está embaixo não desce', () => {
    expect(loteDeReordenar(doc, id('B'), 1)).toBeNull();
    expect(loteDeReordenar(doc, id('A'), -1)).toBeNull();
  });
});
