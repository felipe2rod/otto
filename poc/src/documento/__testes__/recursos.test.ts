import { describe, expect, it } from 'vitest';
import { caixaVisual, documentoVazio, girarCaixa, type NoTexto } from '../esquema';
import { aplicarLote, caixaDe } from '../operacoes';

const designer = { tipo: 'designer' } as const;

describe('rotação', () => {
  it('a caixa de uma camada girada 90° troca largura e altura em torno do centro', () => {
    const c = girarCaixa({ x: 0, y: 0, w: 200, h: 100 }, 100, 50, 90);
    expect(c.w).toBeCloseTo(100, 5);
    expect(c.h).toBeCloseTo(200, 5);
    expect(c.x).toBeCloseTo(50, 5);
  });
  it('mover uma camada girada leva a caixa girada ao ponto pedido', () => {
    const r = aplicarLote(documentoVazio('r'), [
      { op: 'criarPrancheta', nome: 'P', largura: 1000, altura: 1000, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'Selo', x: 100, y: 100, largura: 200, altura: 100, rotacao: 45, preenchimento: '#000000' } },
      { op: 'mover', alvo: 'P/Selo', x: 50, y: 60 },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const c = caixaDe(r.doc.pranchetas[0]!.filhos[0]!)!;
    expect(c.x).toBeCloseTo(50, 1);
    expect(c.y).toBeCloseTo(60, 1);
    expect(caixaVisual(r.doc.pranchetas[0]!.filhos[0] as never).w).toBeGreaterThan(200);
  });
});

describe('estilos de texto', () => {
  it('redefinir o estilo muda todas as camadas ligadas, em todas as pranchetas', () => {
    const texto = (nome: string) => ({ tipo: 'texto', nome, x: 0, y: 0, largura: 900, altura: 200, conteudo: 'Título', fonte: 'Anton', tamanho: 100, cor: '#000000' });
    const r = aplicarLote(documentoVazio('e'), [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'Feed', no: texto('Título do feed') },
      { op: 'criarNo', prancheta: 'Story', no: texto('Título do story') },
      { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Playfair Display', peso: 700, tamanho: 120, entrelinha: 0.95 } },
      { op: 'aplicarEstiloDeTexto', alvos: ['Feed/Título do feed', 'Story/Título do story'], estilo: 'titulo' },
      { op: 'definirEstiloDeTexto', nome: 'titulo', estilo: { fonte: 'Playfair Display', peso: 700, tamanho: 140 } },
    ], designer);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const [a, b] = r.doc.pranchetas.map((p) => p.filhos[0] as NoTexto);
    expect(a!.tamanho).toBe(140);
    expect(b!.tamanho).toBe(140);
    expect(b!.fonte).toBe('Playfair Display');
    expect(b!.estiloDeTexto).toBe('titulo');
  });
  it('aplicar estilo inexistente devolve erro legível', () => {
    const r = aplicarLote(documentoVazio('e'), [
      { op: 'criarPrancheta', nome: 'P', largura: 100, altura: 100, fundo: '#ffffff' },
      { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'T', x: 0, y: 0, largura: 90, altura: 50, conteudo: 'a', fonte: 'Anton', tamanho: 20, cor: '#000000' } },
      { op: 'aplicarEstiloDeTexto', alvos: ['P/T'], estilo: 'nada' },
    ], designer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.mensagem).toContain('definirEstiloDeTexto');
  });
});
