import { describe, expect, it } from 'vitest';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { documentoVazio, type Documento, type NoVisual } from '../esquema';
import { aplicarLote } from '../operacoes';
import { FONTES } from '../../render/fontes';
import { criarMedidor } from '../../render/medidas';

for (const f of FONTES) GlobalFonts.registerFromPath(fileURLToPath(new URL(`../../../fontes/${f.arquivo}`, import.meta.url)), f.familia);
const medidor = criarMedidor(createCanvas(8, 8).getContext('2d') as unknown as CanvasRenderingContext2D);
const designer = { tipo: 'designer' } as const;

function doc(): Documento {
  const r = aplicarLote(documentoVazio('t'), [
    { op: 'criarPrancheta', nome: 'P', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'Sobretítulo', x: 80, y: 100, largura: 900, altura: 40, conteudo: 'SOBRE', fonte: 'IBM Plex Sans', peso: 600, tamanho: 26, cor: '#000000' } },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'texto', nome: 'Título', x: 90, y: 300, largura: 900, altura: 200, conteudo: 'Jazz', fonte: 'Abril Fatface', tamanho: 180, cor: '#000000' } },
    { op: 'criarNo', prancheta: 'P', no: { tipo: 'forma', forma: 'retangulo', nome: 'Botão', x: 120, y: 700, largura: 300, altura: 80, preenchimento: '#000000' } },
  ], designer);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.doc;
}
const no = (d: Documento, nome: string) => d.pranchetas[0]!.filhos.find((n) => n.nome === nome) as NoVisual;

describe('distribuir', () => {
  it('põe espaço exato entre as tintas, na ordem dada, sem mover o primeiro', () => {
    const r = aplicarLote(doc(), [{ op: 'distribuir', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], eixo: 'vertical', espaco: 24 }], designer, medidor);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const [a, b, c] = ['Sobretítulo', 'Título', 'Botão'].map((n) => medidor.tinta(no(r.doc, n)));
    expect(no(r.doc, 'Sobretítulo').y).toBe(100);
    expect(Math.round(b!.y - (a!.y + a!.h))).toBe(24);
    expect(Math.round(c!.y - (b!.y + b!.h))).toBe(24);
  });
});

describe('alinhar', () => {
  it('alinha a borda esquerda da tinta à do primeiro alvo', () => {
    const r = aplicarLote(doc(), [{ op: 'alinhar', alvos: ['P/Sobretítulo', 'P/Título', 'P/Botão'], borda: 'esquerda' }], designer, medidor);
    if (!r.ok) throw new Error(r.erro.mensagem);
    const esq = ['Sobretítulo', 'Título', 'Botão'].map((n) => Math.round(medidor.tinta(no(r.doc, n)).x));
    expect(new Set(esq).size).toBe(1);
  });

  it('centraliza na prancheta', () => {
    const r = aplicarLote(doc(), [{ op: 'alinhar', alvos: ['P/Botão'], borda: 'centro-horizontal', referencia: 'prancheta' }], designer, medidor);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(no(r.doc, 'Botão').x).toBe(390);
  });

  it('alinha a um valor dado', () => {
    const r = aplicarLote(doc(), [{ op: 'alinhar', alvos: ['P/Título'], borda: 'topo', valor: 400 }], designer, medidor);
    if (!r.ok) throw new Error(r.erro.mensagem);
    expect(Math.round(medidor.tinta(no(r.doc, 'Título')).y)).toBe(400);
  });
});
