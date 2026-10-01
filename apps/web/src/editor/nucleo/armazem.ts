// Armazém mínimo de estado, fora do React. O canvas assina direto; os painéis leem por seletor
// (docs/mvp/frontend.md, seção 3). É a "store leve": cabe em um arquivo e não pede dependência.
import { useSyncExternalStore } from 'react';

export interface Armazem<E> {
  obter(): E;
  definir(novo: E | ((anterior: E) => E)): void;
  /** Devolve a função que cancela a assinatura. */
  assinar(ouvinte: () => void): () => void;
}

export function criarArmazem<E>(inicial: E): Armazem<E> {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  return {
    obter: () => estado,
    definir(novo) {
      const proximo = typeof novo === 'function' ? (novo as (anterior: E) => E)(estado) : novo;
      if (Object.is(proximo, estado)) return;
      estado = proximo;
      for (const ouvinte of [...ouvintes]) ouvinte();
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

/**
 * Lê um pedaço do armazém. O componente só renderiza de novo quando esse pedaço muda.
 * O seletor precisa devolver valor primitivo ou uma referência que já mora no estado:
 * montar objeto novo dentro do seletor faz renderizar sempre.
 */
export function useArmazem<E, P>(armazem: Pick<Armazem<E>, 'obter' | 'assinar'>, seletor: (estado: E) => P): P {
  const ler = () => seletor(armazem.obter());
  return useSyncExternalStore(armazem.assinar, ler, ler);
}
