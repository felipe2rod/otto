import { describe, expect, it } from 'vitest';
import { idDe, pecaDoDesigner } from './apoio-de-teste';
import { lerPlano, motivosDoPode, planoDeCriacao, planoDoAjuste, planoDoBriefing } from './plano';

const feed = { nome: 'Feed', largura: 1080, altura: 1350 };
const story = { nome: 'Story', largura: 1080, altura: 1920 };

describe('quando o "pode" é pedido', () => {
  it('briefing com um formato: não espera', () => {
    expect(motivosDoPode(planoDoBriefing({ formatos: [feed] }), { direcao: 'ok' })).toEqual([]);
  });

  it('briefing com dois ou três formatos: espera, depois da direção', () => {
    expect(motivosDoPode(planoDoBriefing({ formatos: [feed, story] }), { direcao: 'ok' })).toEqual(['varias_pranchetas']);
  });

  it('criação por pedido livre é uma prancheta só: não espera', () => {
    const p = planoDeCriacao();
    expect(p.criar).toHaveLength(1);
    expect(motivosDoPode(p, { direcao: 'ok' })).toEqual([]);
  });

  it('a direção não saiu válida: pergunta se pode seguir só com o briefing, mesmo com um formato', () => {
    expect(motivosDoPode(planoDoBriefing({ formatos: [feed] }), { direcao: 'falhou' })).toEqual(['sem_direcao']);
  });

  it('ajuste em uma prancheta, sem remover nada: não espera', () => {
    expect(motivosDoPode(planoDoAjuste(), { direcao: 'nao-se-aplica' })).toEqual([]);
    expect(motivosDoPode({ resumo: '', criar: [], alterar: [{ prancheta: 'p1', nome: 'Feed', oQue: '' }], remover: [], pontual: false }, { direcao: 'nao-se-aplica' })).toEqual([]);
  });

  it('adaptar para um formato não espera; para dois, espera', () => {
    expect(motivosDoPode({ resumo: '', criar: [story], alterar: [], remover: [], pontual: false }, { direcao: 'nao-se-aplica' })).toEqual([]);
    expect(motivosDoPode({ resumo: '', criar: [story, { nome: 'Banner', largura: 1200, altura: 628 }], alterar: [], remover: [], pontual: false }, { direcao: 'nao-se-aplica' })).toEqual([
      'varias_pranchetas',
    ]);
  });

  it('mexer em mais de uma prancheta espera', () => {
    const p = {
      resumo: '',
      criar: [],
      alterar: [
        { prancheta: 'p1', nome: 'Feed', oQue: '' },
        { prancheta: 'p2', nome: 'Story', oQue: '' },
      ],
      remover: [],
      pontual: false,
    };
    expect(motivosDoPode(p, { direcao: 'nao-se-aplica' })).toEqual(['varias_pranchetas']);
  });

  it('qualquer remoção do que já existia espera', () => {
    const p = {
      resumo: '',
      criar: [],
      alterar: [{ prancheta: 'p1', nome: 'Feed', oQue: '' }],
      remover: [{ alvo: 'n1', nome: 'Selo', prancheta: 'Feed', tipo: 'camada' as const, motivo: '' }],
      pontual: false,
    };
    expect(motivosDoPode(p, { direcao: 'nao-se-aplica' })).toEqual(['remocao']);
  });
});

describe('plano que o modelo declara para um pedido', () => {
  const doc = pecaDoDesigner();

  it('vira plano com ids, pelo nome ou pelo id', () => {
    const r = lerPlano(
      JSON.stringify({
        resumo: 'Troco a cor do título e tiro o selo.',
        criar: [],
        alterar: [{ prancheta: 'Feed', oQue: 'cor do título' }],
        remover: [{ alvo: 'Feed/Selo', motivo: 'o pedido manda tirar' }],
      }),
      doc,
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.plano.alterar).toEqual([{ prancheta: idDe(doc, 'Feed'), nome: 'Feed', oQue: 'cor do título' }]);
    expect(r.plano.remover).toEqual([{ alvo: idDe(doc, 'Feed/Selo'), nome: 'Selo', prancheta: 'Feed', tipo: 'camada', motivo: 'o pedido manda tirar' }]);
    expect(r.plano.pontual).toBe(false);
  });

  it('remover prancheta inteira é remoção de prancheta', () => {
    const r = lerPlano(JSON.stringify({ resumo: 'Tiro o Story.', criar: [], alterar: [], remover: [{ alvo: 'Story', motivo: 'pedido' }] }), doc);
    if (!r.ok) throw new Error(r.erro);
    expect(r.plano.remover[0]).toMatchObject({ tipo: 'prancheta', nome: 'Story', alvo: idDe(doc, 'Story') });
  });

  it('prancheta ou camada que não existe volta como erro, com o que existe', () => {
    const r = lerPlano(JSON.stringify({ resumo: 'x', criar: [], alterar: [{ prancheta: 'Banner', oQue: '' }], remover: [] }), doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('Feed');
  });

  it('prancheta a remover sai da lista de alterar: remover ganha', () => {
    const r = lerPlano(JSON.stringify({ resumo: 'x', criar: [], alterar: [{ prancheta: 'Story', oQue: '' }], remover: [{ alvo: 'Story', motivo: '' }] }), doc);
    if (!r.ok) throw new Error(r.erro);
    expect(r.plano.alterar).toEqual([]);
  });

  it('"naoConsigo" é resposta válida: admite o limite antes de começar', () => {
    const r = lerPlano(JSON.stringify({ naoConsigo: 'Este editor não gera vídeo.' }), doc);
    expect(r).toEqual({ ok: true, plano: { resumo: '', criar: [], alterar: [], remover: [], pontual: false }, naoConsigo: 'Este editor não gera vídeo.' });
  });

  it('resposta sem JSON é erro', () => {
    expect(lerPlano('vou fazer', doc).ok).toBe(false);
  });
});
