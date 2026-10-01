import { describe, expect, it } from 'vitest';
import { documentoVazio, type Documento, type NoGrupo, type NoVisual, todasAsCamadas } from '../esquema';
import { acharNo, aplicarLote } from '../operacoes';

const designer = { tipo: 'designer' } as const;
const agente = { tipo: 'agente', tarefaId: 't' } as const;

function doc(): Documento {
  const r = aplicarLote(documentoVazio('g'), [
    { op: 'criarPrancheta', nome: 'P', largura: 1000, altura: 1000, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'A', x: 100, y: 100, largura: 100, altura: 100, preenchimento: '#000000' } },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'B', x: 300, y: 300, largura: 100, altura: 100, preenchimento: '#000000' } },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'C', x: 500, y: 500, largura: 100, altura: 100, preenchimento: '#000000' } },
  ], designer);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

describe('grupos', () => {
  it('agrupa irmãs na posição da mais alta, mantendo a ordem', () => {
    const r = aplicarLote(doc(), [{ op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco', modoDeMesclagem: 'multiplicacao' }], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const filhos = r.doc.pranchetas[0]!.filhos;
    expect(filhos.map((n) => n.nome)).toEqual(['Bloco', 'C']);
    const g = filhos[0] as NoGrupo;
    expect(g.filhos.map((n) => n.nome)).toEqual(['A', 'B']);
    expect(g.modoDeMesclagem).toBe('multiplicacao');
  });

  it('cria dentro de grupo e acha pelo caminho de nome', () => {
    const r = aplicarLote(doc(), [
      { op: 'agrupar', alvos: ['P/A'], nome: 'Bloco' },
      { op: 'criarNo', prancheta: 'P', grupo: 'P/Bloco', no: { tipo: 'ajuste', nome: 'Curvas', ajuste: { tipo: 'curvas', rgb: [[0, 0], [128, 150], [255, 255]] } } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const achado = acharNo(r.doc, 'P/Curvas');
    expect(achado.pai?.nome).toBe('Bloco');
    expect(achado.no.tipo).toBe('ajuste');
  });

  it('mover o grupo move tudo dentro, com a máscara de forma junto', () => {
    const r = aplicarLote(doc(), [
      { op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco' },
      { op: 'alterar', alvo: 'P/Bloco', props: { mascara: { tipo: 'forma', forma: 'elipse', x: 100, y: 100, largura: 300, altura: 300 } } },
      { op: 'mover', alvo: 'P/Bloco', x: 150, y: 100 },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const g = r.doc.pranchetas[0]!.filhos[0] as NoGrupo;
    expect((g.filhos[0] as NoVisual).x).toBe(150);
    expect((g.filhos[1] as NoVisual).x).toBe(350);
    expect(g.mascara).toMatchObject({ tipo: 'forma', x: 150 });
  });

  it('desagrupa no mesmo lugar', () => {
    const r = aplicarLote(doc(), [{ op: 'agrupar', alvos: ['P/A', 'P/B'], nome: 'Bloco' }, { op: 'desagrupar', alvo: 'P/Bloco' }], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(r.doc.pranchetas[0]!.filhos.map((n) => n.nome)).toEqual(['A', 'B', 'C']);
  });

  it('grupo com camada bloqueada dentro é intocável para o agente', () => {
    const r1 = aplicarLote(doc(), [{ op: 'alterar', alvo: 'P/A', props: { bloqueado: true } }, { op: 'agrupar', alvos: ['P/B', 'P/C'], nome: 'Livre' }], designer);
    if (!r1.ok) throw new Error(r1.erro.mensagem);
    expect(aplicarLote(r1.doc, [{ op: 'agrupar', alvos: ['P/A', 'P/Livre'], nome: 'X' }], agente).ok).toBe(false);
  });

  it('nome é único em toda a prancheta, inclusive dentro de grupo', () => {
    const r = aplicarLote(doc(), [{ op: 'agrupar', alvos: ['P/A'], nome: 'Bloco' }, { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'elipse', nome: 'A', x: 0, y: 0, largura: 10, altura: 10, preenchimento: '#000000' } }], designer);
    expect(r.ok).toBe(false);
  });

  it('aceita a máscara antiga da foto, sem tipo, como degradê', () => {
    const r = aplicarLote(doc(), [{ op: 'alterar', alvo: 'P/A', props: { mascara: { angulo: 90, inicio: 0, fim: 0.5 } } }], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(todasAsCamadas(r.doc.pranchetas[0]!.filhos)[0]!.mascara).toMatchObject({ tipo: 'degrade' });
  });
});
