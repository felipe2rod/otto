// A tarefa do Otto na tela: fotografia, eventos, etapas e os estados que mudam o que o designer pode fazer.
import type { EventoDaTarefa, Tarefa } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { emAndamento, etapasNaTela, inicioDoTempo, naoTerminou, novaTarefaNaTela, receberEvento, receberFotografia, tarefaViva } from './tarefaDoOtto';

const tarefa = (extra: Partial<Tarefa> = {}): Tarefa => ({
  id: '0199a000-0000-7000-8000-0000000000a1',
  documentoId: '0199a000-0000-7000-8000-000000000001',
  tipo: 'criar',
  estado: 'rodando',
  entrada: { tipo: 'criar', pedido: 'cartaz do novo horário' },
  etapas: [],
  versaoInicial: 0,
  lotes: 0,
  tocados: [],
  pendencias: [],
  ultimoEvento: -1,
  criadaEm: '2026-10-02T12:00:00.000Z',
  ...extra,
});
const lote = (tocados: string[]): EventoDaTarefa => ({ tipo: 'lote', loteId: 'l1', descricao: 'Feed', tocados, operacoes: [] });

describe('eventos do fluxo', () => {
  it('etapa e etapas previstas atualizam a tarefa; as previstas não entram no registro', () => {
    let t = novaTarefaNaTela(tarefa());
    t = receberEvento(t, 0, { tipo: 'etapas', previstas: [{ etapa: 'leitura' }, { etapa: 'producao', prancheta: { nome: 'Feed' } }] });
    t = receberEvento(t, 1, { tipo: 'etapa', etapa: 'producao', prancheta: { nome: 'Feed' } });
    expect(t.tarefa.etapas).toHaveLength(2);
    expect(t.tarefa.etapa).toEqual({ etapa: 'producao', prancheta: { nome: 'Feed' } });
    expect(t.registro.map((l) => l.evento.tipo)).toEqual(['etapa']);
    expect(t.ultimaSequencia).toBe(1);
  });

  it('lote junta as camadas tocadas e entra no registro, com o que o Otto disse', () => {
    let t = novaTarefaNaTela(tarefa({ tocados: ['a'] }));
    t = receberEvento(t, 0, { tipo: 'mensagem', texto: 'Monto o Feed.' });
    t = receberEvento(t, 1, lote(['b', 'c']));
    expect([...t.tocados].sort()).toEqual(['a', 'b', 'c']);
    expect(t.registro.map((l) => l.evento.tipo)).toEqual(['mensagem', 'lote']);
  });

  it('entrega traz o resumo e as pendências', () => {
    const t = receberEvento(novaTarefaNaTela(tarefa()), 0, { tipo: 'entrega', resumo: 'Feed pronto.', pendencias: [{ tipo: 'outro', texto: 'rodapé pequeno', camadas: ['x'], origem: 'otto' }] });
    expect(t.tarefa.resumo).toBe('Feed pronto.');
    expect(t.tarefa.pendencias).toHaveLength(1);
  });

  it('evento repetido ou atrasado devolve a MESMA tarefa: reconectar não duplica nada', () => {
    const t = receberEvento(novaTarefaNaTela(tarefa()), 3, lote(['a']));
    expect(receberEvento(t, 3, lote(['z']))).toBe(t);
    expect(receberEvento(t, 1, lote(['z']))).toBe(t);
  });
});

describe('fotografia', () => {
  it('troca o estado e mantém o registro e as camadas que os eventos já trouxeram', () => {
    let t = receberEvento(novaTarefaNaTela(tarefa()), 0, lote(['a']));
    t = receberFotografia(t, tarefa({ estado: 'em_revisao', fim: 'entregue', tocados: ['b'], lotes: 1 }));
    expect(t.tarefa.estado).toBe('em_revisao');
    expect([...t.tocados].sort()).toEqual(['a', 'b']);
    expect(t.registro).toHaveLength(1);
  });

  it('fotografia de OUTRA tarefa (tentar de novo) começa do zero', () => {
    const t = receberEvento(novaTarefaNaTela(tarefa()), 5, lote(['a']));
    const outra = receberFotografia(t, tarefa({ id: '0199a000-0000-7000-8000-0000000000a2', estado: 'na_fila' }));
    expect(outra.registro).toEqual([]);
    expect(outra.ultimaSequencia).toBe(-1);
    expect(outra.tocados.size).toBe(0);
  });
});

describe('etapas na tela', () => {
  const previstas = [
    { etapa: 'leitura' },
    { etapa: 'direcao' },
    { etapa: 'producao', prancheta: { nome: 'Feed' } },
    { etapa: 'producao', prancheta: { nome: 'Story' } },
    { etapa: 'conferencia' },
    { etapa: 'conferencia', rodada: 2 },
    { etapa: 'entrega' },
  ] as const;
  const situacoes = (atual: Tarefa['etapa']) => etapasNaTela({ etapas: [...previstas], ...(atual ? { etapa: atual } : {}) }).map((e) => e.situacao);

  it('as de antes da atual estão feitas, a atual é a atual e as outras estão por vir', () => {
    expect(situacoes({ etapa: 'producao', prancheta: { nome: 'Story' } })).toEqual(['feita', 'feita', 'feita', 'atual', 'por-vir', 'por-vir', 'por-vir']);
  });

  it('a segunda conferência é outra linha, não a primeira de novo', () => {
    expect(situacoes({ etapa: 'conferencia', rodada: 2 })).toEqual(['feita', 'feita', 'feita', 'feita', 'feita', 'atual', 'por-vir']);
  });

  it('o ciclo pode voltar da conferência para a produção: a lista mostra onde ele está', () => {
    expect(situacoes({ etapa: 'conferencia' })[4]).toBe('atual');
    expect(situacoes({ etapa: 'producao', prancheta: { id: 'p2', nome: 'Story' } })).toEqual(['feita', 'feita', 'feita', 'atual', 'por-vir', 'por-vir', 'por-vir']);
  });

  it('sem etapa em curso, todas estão por vir; etapa fora da previsão entra no fim, como a atual', () => {
    expect(situacoes(undefined).every((s) => s === 'por-vir')).toBe(true);
    const comAjustes = etapasNaTela({ etapas: [{ etapa: 'leitura' }], etapa: { etapa: 'ajustes' } });
    expect(comAjustes).toEqual([
      { etapa: { etapa: 'leitura' }, situacao: 'feita' },
      { etapa: { etapa: 'ajustes' }, situacao: 'atual' },
    ]);
  });
});

describe('o que o estado permite', () => {
  it('a peça fica somente leitura enquanto a tarefa vive, inclusive na espera do "pode" e na revisão', () => {
    for (const estado of ['na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao'] as const) expect(tarefaViva({ estado })).toBe(true);
    for (const estado of ['aceita', 'desfeita', 'cancelada', 'falhou'] as const) expect(tarefaViva({ estado })).toBe(false);
    expect(tarefaViva(undefined)).toBe(false);
  });

  it('o fluxo de eventos fica aberto só enquanto o Otto trabalha ou está na fila', () => {
    expect(['na_fila', 'preparando', 'rodando'].every((estado) => emAndamento({ estado: estado as Tarefa['estado'] }))).toBe(true);
    expect(emAndamento({ estado: 'aguardando_confirmacao' })).toBe(false);
    expect(emAndamento({ estado: 'em_revisao' })).toBe(false);
  });

  it('"não terminou": falhou, ou está em revisão com um fim que não é entrega', () => {
    expect(naoTerminou({ estado: 'falhou' })).toBe(true);
    expect(naoTerminou({ estado: 'em_revisao', fim: 'interrompida' })).toBe(true);
    expect(naoTerminou({ estado: 'em_revisao', fim: 'limite_de_tempo' })).toBe(true);
    expect(naoTerminou({ estado: 'em_revisao', fim: 'entregue' })).toBe(false);
    expect(naoTerminou({ estado: 'rodando' })).toBe(false);
  });

  it('o tempo que o designer vê conta do começo da produção; antes dela, do pedido', () => {
    expect(inicioDoTempo({ criadaEm: '2026-10-02T12:00:00.000Z' })).toBe(Date.parse('2026-10-02T12:00:00.000Z'));
    expect(inicioDoTempo({ criadaEm: '2026-10-02T12:00:00.000Z', iniciadaEm: '2026-10-02T12:05:00.000Z' })).toBe(Date.parse('2026-10-02T12:05:00.000Z'));
  });
});
