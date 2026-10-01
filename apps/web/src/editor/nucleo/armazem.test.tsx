// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { criarArmazem, useArmazem } from './armazem';

describe('armazém', () => {
  it('guarda o estado e avisa quem assinou quando ele muda', () => {
    const armazem = criarArmazem({ zoom: 1 });
    const ouvinte = vi.fn();
    armazem.assinar(ouvinte);

    armazem.definir({ zoom: 2 });

    expect(armazem.obter()).toEqual({ zoom: 2 });
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('aceita uma função que recebe o estado anterior', () => {
    const armazem = criarArmazem({ zoom: 1 });
    armazem.definir((anterior) => ({ zoom: anterior.zoom * 2 }));
    expect(armazem.obter().zoom).toBe(2);
  });

  it('não avisa ninguém quando o estado novo é o mesmo objeto', () => {
    const estado = { zoom: 1 };
    const armazem = criarArmazem(estado);
    const ouvinte = vi.fn();
    armazem.assinar(ouvinte);

    armazem.definir(estado);
    armazem.definir((anterior) => anterior);

    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('para de avisar depois de cancelar a assinatura', () => {
    const armazem = criarArmazem(0);
    const ouvinte = vi.fn();
    const cancelar = armazem.assinar(ouvinte);
    cancelar();
    armazem.definir(1);
    expect(ouvinte).not.toHaveBeenCalled();
  });
});

describe('useArmazem', () => {
  it('só renderiza de novo quando muda o pedaço que o seletor lê', () => {
    const armazem = criarArmazem({ zoom: 1, ferramenta: 'mover' });
    let renderizacoes = 0;
    function Zoom() {
      renderizacoes++;
      const zoom = useArmazem(armazem, (e) => e.zoom);
      return <output>{zoom}</output>;
    }
    render(<Zoom />);
    expect(renderizacoes).toBe(1);

    act(() => armazem.definir((e) => ({ ...e, ferramenta: 'mao' })));
    expect(renderizacoes).toBe(1);

    act(() => armazem.definir((e) => ({ ...e, zoom: 2 })));
    expect(renderizacoes).toBe(2);
    expect(screen.getByRole('status').textContent).toBe('2');
  });
});
