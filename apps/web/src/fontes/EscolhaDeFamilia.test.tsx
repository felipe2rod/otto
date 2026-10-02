// @vitest-environment jsdom
import type { FonteDaLista } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fontes as textos } from '../textos/briefing';
import { EscolhaDeFamilia } from './EscolhaDeFamilia';

afterEach(cleanup);

const CATALOGO: FonteDaLista[] = [
  { familia: 'Anton', pesos: [400], naBiblioteca: true },
  { familia: 'Bitter', pesos: [400, 700], naBiblioteca: false },
  { familia: 'Oswald', pesos: [300, 700] },
];

function montar(opcoes: { valor?: string; trazer?: (familia: string, peso: number) => Promise<boolean>; permiteVazio?: boolean; catalogo?: FonteDaLista[] | null } = {}) {
  const aoEscolher = vi.fn();
  const trazer = vi.fn(opcoes.trazer ?? (async () => true));
  render(
    <EscolhaDeFamilia
      rotulo="Fonte"
      valor={opcoes.valor ?? 'Anton'}
      catalogo={opcoes.catalogo === undefined ? CATALOGO : opcoes.catalogo}
      aoEscolher={aoEscolher}
      trazer={trazer}
      peso={700}
      permiteVazio={opcoes.permiteVazio ?? false}
    />,
  );
  return { aoEscolher, trazer, campo: screen.getByRole('combobox', { name: 'Fonte' }) as HTMLSelectElement };
}

describe('escolha de família de fonte', () => {
  it('separa o que está na biblioteca do que o catálogo ainda vai baixar (sem o campo, vale como na biblioteca)', () => {
    montar();
    const grupo = (nome: string) => [...(screen.getByRole('group', { name: nome }) as HTMLOptGroupElement).querySelectorAll('option')].map((o) => o.value);
    expect(grupo(textos.naBiblioteca)).toEqual(['Anton', 'Oswald']);
    expect(grupo(textos.doCatalogo)).toEqual(['Bitter']);
  });

  it('família da biblioteca: escolhe na hora, sem pedir nada', () => {
    const { aoEscolher, trazer, campo } = montar();
    fireEvent.change(campo, { target: { value: 'Oswald' } });
    expect(aoEscolher).toHaveBeenCalledWith('Oswald');
    expect(trazer).not.toHaveBeenCalled();
  });

  it('família do catálogo: diz que está baixando, trava o campo, e só escolhe quando ela chega', async () => {
    let chegar: ((ok: boolean) => void) | undefined;
    const { aoEscolher, trazer, campo } = montar({ trazer: () => new Promise((seguir) => (chegar = seguir)) });
    fireEvent.change(campo, { target: { value: 'Bitter' } });
    expect(trazer).toHaveBeenCalledWith('Bitter', 700);
    expect(screen.getByRole('status').textContent).toBe(textos.baixando('Bitter'));
    expect(campo.disabled).toBe(true);
    expect(aoEscolher).not.toHaveBeenCalled();

    await act(async () => chegar?.(true));
    expect(aoEscolher).toHaveBeenCalledWith('Bitter');
    expect(screen.queryByRole('status')).toBeNull();
    expect(campo.disabled).toBe(false);
    // dali em diante ela é da biblioteca: escolher de novo não baixa outra vez
    fireEvent.change(campo, { target: { value: 'Bitter' } });
    expect(trazer).toHaveBeenCalledTimes(1);
  });

  it('se a família não chega, a escolha não vale e a tela diz', async () => {
    const { aoEscolher, campo } = montar({ trazer: async () => false });
    await act(async () => fireEvent.change(campo, { target: { value: 'Bitter' } }));
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(textos.naoBaixou('Bitter'));
    expect(campo.value).toBe('Anton');
  });

  it('a família em uso aparece mesmo fora do catálogo; "não definida" só onde é permitido', () => {
    const { campo } = montar({ valor: 'Didot' });
    expect(campo.value).toBe('Didot');
    expect(screen.getByRole('option', { name: textos.foraDoCatalogo('Didot') })).toBeDefined();
    expect(screen.queryByRole('option', { name: textos.semFonte })).toBeNull();
    cleanup();
    const vazio = montar({ valor: '', permiteVazio: true });
    expect(vazio.campo.value).toBe('');
    fireEvent.change(vazio.campo, { target: { value: 'Anton' } });
    expect(vazio.aoEscolher).toHaveBeenCalledWith('Anton');
  });

  it('enquanto o catálogo não responde, o campo mostra a família em uso, sem dizer que ela falta', () => {
    const { campo } = montar({ valor: 'Didot', catalogo: null });
    expect(campo.value).toBe('Didot');
    expect(screen.getByRole('option', { name: 'Didot' })).toBeDefined();
  });
});
