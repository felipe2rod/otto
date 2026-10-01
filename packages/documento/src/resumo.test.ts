import { describe, expect, it } from 'vitest';
import { aplicar, medidorDeMentira, novoDocumento } from './apoio-de-teste';
import { resumirDocumento } from './resumo';

describe('resumo estruturado', () => {
  const doc = novoDocumento([
    { op: 'definirToken', nome: 'primaria', valor: '#0F3B2C' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'texto', nome: 'Título', x: 80, y: 80, largura: 900, altura: 200, conteudo: 'Promoção', fonte: 'Anton', tamanho: 120, cor: 'token:primaria' } },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', forma: 'retangulo', nome: 'Botão', x: 80, y: 900, largura: 300, altura: 80, preenchimento: '#000000' } },
    { op: 'agrupar', alvos: ['Feed/Botão'], nome: 'Chamada' },
  ]);

  it('traz id, nome, tipo, caixa, texto e tokens, de baixo para cima', () => {
    const r = resumirDocumento(doc) as { tokens: Record<string, string>; pranchetas: { nome: string; tamanho: number[]; camadasDeBaixoParaCima: Record<string, unknown>[] }[] };
    expect(r.tokens).toEqual({ primaria: '#0f3b2c' });
    const feed = r.pranchetas[0];
    expect(feed?.tamanho).toEqual([1080, 1350]);
    expect(feed?.camadasDeBaixoParaCima[0]).toMatchObject({ nome: 'Título', tipo: 'texto', caixa: [80, 80, 900, 200], conteudo: 'Promoção', cor: 'token:primaria' });
    expect(feed?.camadasDeBaixoParaCima[1]).toMatchObject({ nome: 'Chamada', tipo: 'grupo', filhosDeBaixoParaCima: [{ nome: 'Botão' }] });
  });

  it('com medidor, mostra a tinta do texto; o nome da peça entra por fora, quando quem chama passa', () => {
    const r = resumirDocumento(doc, { medidor: medidorDeMentira, nome: 'Campanha de inverno' }) as { nome?: string; pranchetas: { camadasDeBaixoParaCima: Record<string, unknown>[] }[] };
    expect(r.nome).toBe('Campanha de inverno');
    expect(r.pranchetas[0]?.camadasDeBaixoParaCima[0]?.tinta).toEqual([80, 104, 480, 84]);
    expect('nome' in (resumirDocumento(doc) as object)).toBe(false);
  });

  it('filtra por prancheta', () => {
    const d = aplicar(doc, [{ op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' }]);
    expect((resumirDocumento(d, { prancheta: 'Story' }) as { pranchetas: unknown[] }).pranchetas).toHaveLength(1);
  });
});
