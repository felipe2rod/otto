'use client';

// O que os painéis recebem do editor: os armazéns para ler e UM caminho para escrever (`aplicar`,
// que manda o lote pela sessão do documento). O objeto é criado uma vez por editor e nunca muda,
// então pô-lo em contexto não faz ninguém renderizar de novo: quem renderiza é o seletor de cada
// painel, quando o pedaço que ele lê muda.
import type { Documento, No } from '@otto/documento';
import { createContext, type ReactNode, useContext } from 'react';
import type { FaltasDoRender } from './casca/AvisosDoRender';
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
  /** Diz ao designer por que um comando não foi feito (a frase já vem de textos/). */
  avisar(texto: string): void;
  /** O que o canvas deixou de mostrar (fonte ou imagem que não chegou). */
  faltas: Pick<Armazem<FaltasDoRender>, 'obter' | 'assinar'>;
  /** Envia o arquivo e troca a imagem da camada de foto, por operação do catálogo. */
  trocarImagem(no: Pick<No, 'id' | 'nome'>, arquivo: File): Promise<void>;
  /** Envia imagens e SVGs e cria uma camada para cada um, por operação do catálogo. */
  inserirArquivos(arquivos: File[], onde?: { pranchetaId?: string; x: number; y: number }): Promise<void>;
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
