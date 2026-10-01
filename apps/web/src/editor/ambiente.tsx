'use client';

// O que os painéis recebem do editor: os armazéns para ler e UM caminho para escrever (`aplicar`,
// que manda o lote pela sessão do documento). O objeto é criado uma vez por editor e nunca muda,
// então pô-lo em contexto não faz ninguém renderizar de novo: quem renderiza é o seletor de cada
// painel, quando o pedaço que ele lê muda.
import type { Documento } from '@otto/documento';
import { createContext, type ReactNode, useContext } from 'react';
import type { LoteParaAplicar } from './nucleo/acoes';
import type { Armazem } from './nucleo/armazem';
import type { Interface } from './nucleo/interface';

export interface FamiliaDeFonte {
  familia: string;
  pesos: number[];
}

export interface AmbienteDoEditor {
  interface: Interface;
  /** O documento visível: o confirmado com os lotes ainda por confirmar. */
  documento: Pick<Armazem<Documento | undefined>, 'obter' | 'assinar'>;
  /** Verdadeiro quando a peça não aceita edição (sem destino para o lote, ou o Otto trabalhando). */
  somenteLeitura: Pick<Armazem<boolean>, 'obter' | 'assinar'>;
  /** Todo gesto vira lote do catálogo e passa por aqui. Devolve false se não aplicou. */
  aplicar(lote: LoteParaAplicar | null): boolean;
  /** As famílias da biblioteca de fontes. */
  listarFontes(): Promise<FamiliaDeFonte[]>;
}

const Contexto = createContext<AmbienteDoEditor | null>(null);

export function ProvedorDoEditor({ ambiente, children }: { ambiente: AmbienteDoEditor; children: ReactNode }) {
  return <Contexto.Provider value={ambiente}>{children}</Contexto.Provider>;
}

export function useAmbiente(): AmbienteDoEditor {
  const ambiente = useContext(Contexto);
  if (!ambiente) throw new Error('useAmbiente fora do ProvedorDoEditor');
  return ambiente;
}
