// Geometria da seleção na tela. O teste de alvo em si é de @otto/documento e tem os testes dele lá.
import { aplicarLote, type Documento, disporPranchetas, documentoVazio } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { alvoDeTransformar, contornosDaSelecao } from './alvo';

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
      { op: 'criarNo', prancheta: 'Story', no: forma('Par A', 300, 300) },
      { op: 'criarNo', prancheta: 'Story', no: forma('Par B', 600, 500, { rotacao: 30 }) },
      { op: 'agrupar', alvos: ['Story/Par A', 'Story/Par B'], nome: 'Par' },
    ],
    { autoria: { tipo: 'designer' }, idDoLote: 'teste-de-alvo' },
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

const doc = montar();

const feed = doc.pranchetas[0];
const story = doc.pranchetas[1];
const cima = feed?.filhos[1];
const travada = feed?.filhos[2];
const noStory = story?.filhos[0];
const par = story?.filhos[1];
if (!feed || !story || !cima || !travada || !noStory || !par || par.tipo !== 'grupo') throw new Error('faltam camadas');
const origemDoStory = disporPranchetas(doc.pranchetas).get(story.id) ?? { x: 0, y: 0 };

describe('contornos da seleção, no plano do editor', () => {
  it('um quadro por camada selecionada, somado à posição da prancheta, com a rotação dela', () => {
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [cima.id] }, null)).toEqual([{ x: 200, y: 150, w: 200, h: 100, rotacao: 0 }]);
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [noStory.id] }, null)).toEqual([{ x: origemDoStory.x + 50, y: 50, w: 200, h: 100, rotacao: 0 }]);
  });

  it('grupo selecionado: o contorno é o de cada camada de dentro', () => {
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [par.id] }, null)).toEqual([
      { x: origemDoStory.x + 300, y: 300, w: 200, h: 100, rotacao: 0 },
      { x: origemDoStory.x + 600, y: 500, w: 200, h: 100, rotacao: 30 },
    ]);
  });

  it('ao mover, acompanha o deslocamento da prévia; e o grupo movido leva as de dentro', () => {
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [cima.id] }, { ids: [cima.id], dx: 30, dy: -10 })).toEqual([{ x: 230, y: 140, w: 200, h: 100, rotacao: 0 }]);
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [par.id] }, { ids: [par.id], dx: 10, dy: 0 })[0]).toMatchObject({ x: origemDoStory.x + 310 });
  });

  it('ao redimensionar ou girar, vale a caixa da prévia', () => {
    const previa = { ids: [cima.id], dx: 0, dy: 0, caixas: { [cima.id]: { x: 210, y: 150, largura: 400, altura: 80, rotacao: 45 } } };
    expect(contornosDaSelecao(doc, { tipo: 'camadas', ids: [cima.id] }, previa)).toEqual([{ x: 210, y: 150, w: 400, h: 80, rotacao: 45 }]);
  });

  it('sem seleção de camada não há contorno', () => {
    expect(contornosDaSelecao(doc, null, null)).toEqual([]);
    expect(contornosDaSelecao(doc, { tipo: 'prancheta', id: 'x' }, null)).toEqual([]);
  });
});

describe('o que dá para redimensionar e girar', () => {
  it('uma camada: o quadro das alças é o dela, com a rotação', () => {
    const alvo = alvoDeTransformar(doc, { tipo: 'camadas', ids: [cima.id] });
    expect(alvo?.folhas.map((f) => f.no.id)).toEqual([cima.id]);
    expect(alvo?.quadro).toEqual({ x: 200, y: 150, w: 200, h: 100, rotacao: 0 });
    expect(alvo?.origem).toEqual({ x: 0, y: 0 });

    const girada = aplicarLote(doc, [{ op: 'alterar', alvo: cima.id, props: { rotacao: 30 } }], { autoria: { tipo: 'designer' }, idDoLote: 'g' });
    if (!girada.ok) throw new Error('devia girar');
    expect(alvoDeTransformar(girada.doc, { tipo: 'camadas', ids: [cima.id] })?.quadro.rotacao).toBe(30);
  });

  it('várias camadas, ou um grupo: o quadro é a caixa reta que cobre todas, em coordenadas da prancheta', () => {
    const baixo = feed.filhos[0];
    const alvo = alvoDeTransformar(doc, { tipo: 'camadas', ids: [baixo?.id ?? '', cima.id] });
    expect(alvo?.quadro).toEqual({ x: 100, y: 100, w: 300, h: 150, rotacao: 0 });

    const doGrupo = alvoDeTransformar(doc, { tipo: 'camadas', ids: [par.id] });
    expect(doGrupo?.folhas).toHaveLength(2);
    expect(doGrupo?.origem).toEqual(origemDoStory);
    expect(doGrupo?.quadro.rotacao).toBe(0);
  });

  it('camada bloqueada ou oculta na seleção, camadas de duas pranchetas, prancheta ou nada: não dá', () => {
    expect(alvoDeTransformar(doc, { tipo: 'camadas', ids: [travada.id] })).toBeUndefined();
    expect(alvoDeTransformar(doc, { tipo: 'camadas', ids: [cima.id, travada.id] })).toBeUndefined();
    expect(alvoDeTransformar(doc, { tipo: 'camadas', ids: [feed.filhos[3]?.id ?? ''] })).toBeUndefined();
    // a prévia do motor só cobre uma prancheta por gesto
    expect(alvoDeTransformar(doc, { tipo: 'camadas', ids: [cima.id, noStory.id] })).toBeUndefined();
    expect(alvoDeTransformar(doc, { tipo: 'prancheta', id: feed.id })).toBeUndefined();
    expect(alvoDeTransformar(doc, null)).toBeUndefined();
  });
});
