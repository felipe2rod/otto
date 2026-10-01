import { describe, expect, it } from 'vitest';
import { criarInterface } from './interface';

describe('estado de interface', () => {
  it('começa com a ferramenta de mover, painéis à vista e nada selecionado', () => {
    const i = criarInterface();
    expect(i.armazem.obter()).toEqual({ ferramenta: 'mover', maoTemporaria: false, paineisVisiveis: true, selecao: null });
  });

  it('troca de ferramenta', () => {
    const i = criarInterface();
    i.escolherFerramenta('zoom');
    expect(i.armazem.obter().ferramenta).toBe('zoom');
  });

  it('a ferramenta em uso é a mão enquanto o espaço está apertado, e volta ao soltar', () => {
    const i = criarInterface();
    i.segurarMao(true);
    expect(i.ferramentaEmUso()).toBe('mao');
    i.segurarMao(false);
    expect(i.ferramentaEmUso()).toBe('mover');
  });

  it('esconde e mostra os painéis', () => {
    const i = criarInterface();
    i.alternarPaineis();
    expect(i.armazem.obter().paineisVisiveis).toBe(false);
    i.alternarPaineis();
    expect(i.armazem.obter().paineisVisiveis).toBe(true);
  });

  it('seleciona camadas ou uma prancheta, e limpa a seleção', () => {
    const i = criarInterface();
    i.selecionar({ tipo: 'camadas', ids: ['a', 'b'] });
    expect(i.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: ['a', 'b'] });
    i.selecionar({ tipo: 'prancheta', id: 'p1' });
    expect(i.armazem.obter().selecao).toEqual({ tipo: 'prancheta', id: 'p1' });
    i.selecionar(null);
    expect(i.armazem.obter().selecao).toBeNull();
  });

  it('seleção de camadas vazia vira seleção nenhuma', () => {
    const i = criarInterface();
    i.selecionar({ tipo: 'camadas', ids: [] });
    expect(i.armazem.obter().selecao).toBeNull();
  });
});
