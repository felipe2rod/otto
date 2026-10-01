// Geometria da seleção na tela. O teste de alvo em si é de @otto/documento e tem os testes dele lá.
import { aplicarLote, type Documento, disporPranchetas, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { caixasDaSelecao, noDaAlca } from './alvo';

function montar(): Documento {
  const forma = (nome: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
    tipo: 'forma',
    nome,
    forma: 'retangulo',
    x,
    y,
    largura: 200,
    altura: 100,
    preenchimento: '#ff5b1f',
    ...extra,
  });
  const r = aplicarLote(
    documentoVazio(),
    [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Baixo', 100, 100) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Cima', 200, 150) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Travada', 600, 100, { bloqueado: true }) },
      { op: 'criarNo', prancheta: 'Feed', no: forma('Oculta', 600, 400, { visivel: false }) },
      { op: 'criarNo', prancheta: 'Story', no: forma('No story', 50, 50) },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'teste-de-alvo' },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

const doc = montar();

describe('caixas da seleção, no plano do editor', () => {
  const cima = doc.pranchetas[0]?.filhos[1];
  const noStory = doc.pranchetas[1]?.filhos[0];
  if (!cima || !noStory) throw new Error('faltam camadas');

  it('devolve a caixa de cada camada selecionada, somada à posição da prancheta', () => {
    expect(caixasDaSelecao(doc, { tipo: 'camadas', ids: [cima.id] }, null)).toEqual([{ x: 200, y: 150, w: 200, h: 100 }]);
    const origem = disporPranchetas(doc.pranchetas).get(doc.pranchetas[1]?.id ?? '');
    expect(caixasDaSelecao(doc, { tipo: 'camadas', ids: [noStory.id] }, null)).toEqual([{ x: (origem?.x ?? 0) + 50, y: 50, w: 200, h: 100 }]);
  });

  it('durante o arraste, a caixa acompanha a prévia', () => {
    expect(caixasDaSelecao(doc, { tipo: 'camadas', ids: [cima.id] }, { ids: [cima.id], dx: 30, dy: -10 })).toEqual([{ x: 230, y: 140, w: 200, h: 100 }]);
  });

  it('sem seleção de camada não há caixa', () => {
    expect(caixasDaSelecao(doc, null, null)).toEqual([]);
    expect(caixasDaSelecao(doc, { tipo: 'prancheta', id: 'x' }, null)).toEqual([]);
  });
});

describe('qual camada tem alças', () => {
  const cima = doc.pranchetas[0]?.filhos[1];
  const travada = doc.pranchetas[0]?.filhos[2];
  const noStory = doc.pranchetas[1]?.filhos[0];
  if (!cima || !travada || !noStory) throw new Error('faltam camadas');

  it('uma camada selecionada, sem rotação: tem alças, na caixa dela e no plano do editor', () => {
    expect(noDaAlca(doc, { tipo: 'camadas', ids: [cima.id] })).toMatchObject({ caixa: { x: 200, y: 150, w: 200, h: 100 }, caixaNoPlano: { x: 200, y: 150 } });
    const origem = disporPranchetas(doc.pranchetas).get(doc.pranchetas[1]?.id ?? '');
    expect(noDaAlca(doc, { tipo: 'camadas', ids: [noStory.id] })?.caixaNoPlano.x).toBe((origem?.x ?? 0) + 50);
  });

  it('várias camadas, camada bloqueada, prancheta ou nada: sem alças', () => {
    expect(noDaAlca(doc, { tipo: 'camadas', ids: [cima.id, noStory.id] })).toBeUndefined();
    expect(noDaAlca(doc, { tipo: 'camadas', ids: [travada.id] })).toBeUndefined();
    expect(noDaAlca(doc, { tipo: 'prancheta', id: doc.pranchetas[0]?.id ?? '' })).toBeUndefined();
    expect(noDaAlca(doc, null)).toBeUndefined();
  });

  it('camada girada não tem alça nesta fatia', () => {
    const girada = aplicarLote(doc, [{ op: 'alterar', alvo: cima.id, props: { rotacao: 30 } }], { autoria: { tipo: 'designer' }, idDoLote: 'g' });
    if (!girada.ok) throw new Error('devia girar');
    expect(noDaAlca(girada.doc, { tipo: 'camadas', ids: [cima.id] })).toBeUndefined();
  });
});
