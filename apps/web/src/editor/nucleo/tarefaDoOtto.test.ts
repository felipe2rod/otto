// Estado da tarefa do Otto na tela, alimentado por eventos com sequência (docs/mvp/backend.md, seção 7.5).
import { describe, expect, it } from 'vitest';
import { documentoSomenteLeitura, naoTerminou, novaTarefa, receberEvento, tarefaViva } from './tarefaDoOtto';

const base = () => novaTarefa({ id: 't1', estado: 'na_fila' });

describe('tarefa do Otto: eventos', () => {
  it('muda de estado e de etapa conforme os eventos chegam', () => {
    let t = base();
    t = receberEvento(t, { sequencia: 1, tipo: 'estado', dados: { estado: 'rodando' } });
    t = receberEvento(t, { sequencia: 2, tipo: 'etapa', dados: { etapa: 'direcao' } });

    expect(t).toMatchObject({ estado: 'rodando', etapa: 'direcao', ultimaSequencia: 2 });
  });

  it('junta as camadas tocadas de cada lote', () => {
    let t = base();
    t = receberEvento(t, { sequencia: 1, tipo: 'lote', dados: { tocados: ['a', 'b'] } });
    t = receberEvento(t, { sequencia: 2, tipo: 'lote', dados: { tocados: ['b', 'c'] } });

    expect([...t.tocados].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignora evento repetido ou atrasado: receber duas vezes não muda nada', () => {
    let t = base();
    t = receberEvento(t, { sequencia: 5, tipo: 'estado', dados: { estado: 'rodando' } });
    const depois = receberEvento(t, { sequencia: 5, tipo: 'estado', dados: { estado: 'falhou' } });
    const atrasado = receberEvento(t, { sequencia: 3, tipo: 'etapa', dados: { etapa: 'producao' } });

    expect(depois).toBe(t);
    expect(atrasado).toBe(t);
  });

  it('a entrega traz o resumo e as pendências', () => {
    let t = base();
    t = receberEvento(t, { sequencia: 1, tipo: 'entrega', dados: { resumo: 'Montei Feed e Story.', pendencias: ['Foto ampliada 140%'] } });
    t = receberEvento(t, { sequencia: 2, tipo: 'estado', dados: { estado: 'em_revisao', fim: 'entregue' } });

    expect(t).toMatchObject({ estado: 'em_revisao', fim: 'entregue', resumo: 'Montei Feed e Story.', pendencias: ['Foto ampliada 140%'] });
  });

  it('evento de tipo desconhecido só avança a sequência', () => {
    const t = receberEvento(base(), { sequencia: 1, tipo: 'render', dados: {} });
    expect(t).toMatchObject({ estado: 'na_fila', ultimaSequencia: 1 });
  });
});

describe('tarefa do Otto: o que a tela deriva', () => {
  it('a peça fica só para leitura enquanto o Otto trabalha ou espera o "pode"', () => {
    expect(documentoSomenteLeitura(novaTarefa({ id: 't', estado: 'rodando' }))).toBe(true);
    expect(documentoSomenteLeitura(novaTarefa({ id: 't', estado: 'aguardando_confirmacao' }))).toBe(true);
    expect(documentoSomenteLeitura(novaTarefa({ id: 't', estado: 'em_revisao' }))).toBe(false);
    expect(documentoSomenteLeitura(undefined)).toBe(false);
  });

  it('"não terminou" é a revisão de um trabalho que parou sem entregar', () => {
    expect(naoTerminou(novaTarefa({ id: 't', estado: 'em_revisao', fim: 'erro' }))).toBe(true);
    expect(naoTerminou(novaTarefa({ id: 't', estado: 'em_revisao', fim: 'entregue' }))).toBe(false);
    expect(naoTerminou(novaTarefa({ id: 't', estado: 'falhou' }))).toBe(true);
  });

  it('tarefa viva é qualquer uma antes de aceita ou desfeita', () => {
    expect(tarefaViva(novaTarefa({ id: 't', estado: 'na_fila' }))).toBe(true);
    expect(tarefaViva(novaTarefa({ id: 't', estado: 'em_revisao' }))).toBe(true);
    expect(tarefaViva(novaTarefa({ id: 't', estado: 'aceita' }))).toBe(false);
    expect(tarefaViva(novaTarefa({ id: 't', estado: 'desfeita' }))).toBe(false);
    expect(tarefaViva(undefined)).toBe(false);
  });
});
