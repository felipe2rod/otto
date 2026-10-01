// Teste de alvo provisório: que camada está sob o ponteiro. O definitivo (com rotação de verdade e
// forma da camada) é de @otto/documento e ainda não veio.
import { aplicarLote, type Documento, disporPranchetas, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { acharEm, caixasDaSelecao } from './alvo';

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
const nome = (alvo: ReturnType<typeof acharEm>) => alvo?.no?.nome ?? alvo?.prancheta.nome ?? null;

describe('teste de alvo', () => {
  it('acha a camada sob o ponto', () => {
    expect(nome(acharEm(doc, { x: 110, y: 110 }))).toBe('Baixo');
  });

  it('onde duas se sobrepõem, vale a de cima', () => {
    expect(nome(acharEm(doc, { x: 250, y: 180 }))).toBe('Cima');
  });

  it('ponto na prancheta, fora de qualquer camada, acha a prancheta', () => {
    const alvo = acharEm(doc, { x: 900, y: 1200 });
    expect(alvo?.no).toBeUndefined();
    expect(alvo?.prancheta.nome).toBe('Feed');
  });

  it('camada bloqueada ou oculta não é alvo no canvas', () => {
    expect(nome(acharEm(doc, { x: 650, y: 150 }))).toBe('Feed');
    expect(nome(acharEm(doc, { x: 650, y: 450 }))).toBe('Feed');
  });

  it('desconta a posição da prancheta no plano do editor', () => {
    const story = doc.pranchetas[1];
    const origem = story && disporPranchetas(doc.pranchetas).get(story.id);
    if (!origem) throw new Error('falta o story');
    expect(nome(acharEm(doc, { x: origem.x + 60, y: 60 }))).toBe('No story');
  });

  it('ponto fora de toda prancheta não acha nada', () => {
    expect(acharEm(doc, { x: -50, y: -50 })).toBeUndefined();
    expect(acharEm(doc, { x: 1100, y: 100 })).toBeUndefined();
  });
});

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
