import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { documentoVazio, type Documento, type NoVetor } from '../esquema';
import { aplicarLote } from '../operacoes';
import { type Ctx, renderizarPrancheta } from '../../render/render';

const designer = { tipo: 'designer' } as const;
const agente = { tipo: 'agente', tarefaId: 't' } as const;

const LOGO: Omit<NoVetor, 'id'> = {
  tipo: 'vetor',
  nome: 'Logo',
  x: 100,
  y: 100,
  largura: 200,
  altura: 100,
  moldura: [200, 100],
  caminhos: [
    { d: 'M0 0C0 0 100 0 100 0C100 0 100 100 100 100C100 100 0 100 0 100Z', preenchimento: '#0037a6', regra: 'nao-zero' },
    { d: 'M110 0C110 0 200 0 200 0C200 0 200 100 200 100Z', preenchimento: '#ff0000', regra: 'nao-zero' },
  ],
  origem: { arquivo: 'abc', nome: 'logo.svg' },
} as Omit<NoVetor, 'id'>;

function base(): Documento {
  const r = aplicarLote(documentoVazio('teste'), [
    { op: 'definirToken', nome: 'texto', valor: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 400, altura: 300, fundo: '#0037a6' },
    { op: 'criarNo', prancheta: 'Feed', no: LOGO },
  ], designer);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}

const logo = (doc: Documento) => doc.pranchetas[0]!.filhos[0] as NoVetor;

describe('recolorir vetor', () => {
  it('troca uma cor pelo valor atual sem tocar no desenho', () => {
    const doc = base();
    const r = aplicarLote(doc, [{ op: 'recolorir', alvo: 'Feed/Logo', cores: { '#0037A6': 'token:texto' } }], agente);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(logo(r.doc).caminhos.map((c) => c.preenchimento)).toEqual(['token:texto', '#ff0000']);
    expect(logo(r.doc).caminhos.map((c) => c.d)).toEqual(logo(doc).caminhos.map((c) => c.d));
  });

  it('"*" deixa o vetor monocromático, inclusive o traço', () => {
    const doc = base();
    const comTraco = aplicarLote(doc, [{ op: 'criarNo', prancheta: 'Feed', no: { ...LOGO, nome: 'Ícone', caminhos: [{ d: 'M0 0C0 0 50 50 50 50', traco: { cor: '#0037a6', espessura: 4 } }] } }], designer);
    if (!comTraco.ok) throw new Error(comTraco.erro.mensagem);
    const r = aplicarLote(comTraco.doc, [
      { op: 'recolorir', alvo: 'Feed/Logo', cores: { '*': 'token:texto' } },
      { op: 'recolorir', alvo: 'Feed/Ícone', cores: { '*': 'token:texto' } },
    ], agente);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const [l, i] = r.doc.pranchetas[0]!.filhos as NoVetor[];
    expect(l!.caminhos.every((c) => c.preenchimento === 'token:texto')).toBe(true);
    expect(i!.caminhos[0]!.traco!.cor).toBe('token:texto');
  });

  it('acusa cor que não existe no vetor, dizendo quais existem', () => {
    const r = aplicarLote(base(), [{ op: 'recolorir', alvo: 'Feed/Logo', cores: { '#123456': '#ffffff' } }], agente);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('#0037a6');
  });

  it('alterar não redesenha o vetor importado (logo do cliente)', () => {
    const doc = base();
    const r = aplicarLote(doc, [{ op: 'alterar', alvo: 'Feed/Logo', props: { caminhos: [{ d: 'M0 0C1 1 2 2 3 3Z', preenchimento: '#ffffff' }] } }], agente);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('recolorir');
  });

  it('alterar ainda troca a cor quando o desenho fica igual', () => {
    const doc = base();
    const caminhos = logo(doc).caminhos.map((c) => ({ ...c, preenchimento: '#ffffff' }));
    expect(aplicarLote(doc, [{ op: 'alterar', alvo: 'Feed/Logo', props: { caminhos } }], designer).ok).toBe(true);
  });
});

describe('vetor com traço', () => {
  it('desenha caminho aberto só com traço, na espessura escalada pela caixa', () => {
    const r = aplicarLote(documentoVazio('t'), [
      { op: 'criarPrancheta', nome: 'P', largura: 100, altura: 100, fundo: '#000000' },
      { op: 'criarNo', prancheta: 'P', no: { tipo: 'vetor', nome: 'Fio', x: 0, y: 40, largura: 100, altura: 20, moldura: [50, 10], caminhos: [{ d: 'M0 5C0 5 50 5 50 5', traco: { cor: '#ffffff', espessura: 5 } }] } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const c = createCanvas(100, 100);
    const ctx = c.getContext('2d');
    renderizarPrancheta(ctx as unknown as Ctx, r.doc, r.doc.pranchetas[0]!, () => undefined);
    const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    expect(px(50, 50)).toEqual([255, 255, 255]); // centro da linha
    expect(px(50, 46)).toEqual([255, 255, 255]); // espessura 5 × escala 2 = 10 px (45 a 55)
    expect(px(50, 30)).toEqual([0, 0, 0]);
  });

  it('recusa caminho sem preenchimento e sem traço', () => {
    const r = aplicarLote(base(), [{ op: 'criarNo', prancheta: 'Feed', no: { ...LOGO, nome: 'Nada', caminhos: [{ d: 'M0 0C0 0 1 1 1 1' }] } }], designer);
    expect(r.ok).toBe(false);
  });
});
