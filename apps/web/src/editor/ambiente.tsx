'use client';

// O que os painéis recebem do editor: os armazéns para ler e UM caminho para escrever (`aplicar`,
// que manda o lote pela sessão do documento). O objeto é criado uma vez por editor e nunca muda,
// então pô-lo em contexto não faz ninguém renderizar de novo: quem renderiza é o seletor de cada
// painel, quando o pedaço que ele lê muda.
import type { Documento, No } from '@otto/documento';
import type { ImagemTrazida } from '@otto/shared';
import { createContext, type ReactNode, useContext } from 'react';
import type { FaltasDoRender } from './casca/AvisosDoRender';
import type { LoteParaAplicar } from './nucleo/acoes';
import type { Armazem } from './nucleo/armazem';
import type { Interface } from './nucleo/interface';

export interface FamiliaDeFonte {
  familia: string;
  pesos: number[];
  /** Falso: família do catálogo que ainda não foi baixada. Ausente: está na biblioteca. */
  naBiblioteca?: boolean | undefined;
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
  /** Camadas e pranchetas tocadas pela tarefa do Otto que está viva: ganham a marca em âmbar até a revisão acabar. */
  tocadosPeloOtto: Pick<Armazem<ReadonlySet<string>>, 'obter' | 'assinar'>;
  /** O que o canvas deixou de mostrar (fonte ou imagem que não chegou). */
  faltas: Pick<Armazem<FaltasDoRender>, 'obter' | 'assinar'>;
  /** Envia o arquivo e troca a imagem da camada de foto, por operação do catálogo. */
  trocarImagem(no: Pick<No, 'id' | 'nome'>, arquivo: File): Promise<void>;
  /** Envia imagens e SVGs e cria uma camada para cada um, por operação do catálogo. */
  inserirArquivos(arquivos: File[], onde?: { pranchetaId?: string; x: number; y: number }): Promise<void>;
  /** As famílias da biblioteca de fontes e as do catálogo que ainda não foram baixadas. */
  listarFontes(): Promise<FamiliaDeFonte[]>;
  /** Traz uma família do catálogo para a biblioteca (segundos, na primeira vez). Verdadeiro se chegou. */
  trazerFonte(familia: string, peso: number): Promise<boolean>;
  /** A imagem do banco, que já é arquivo da conta, vira camada (com a origem), por operação do catálogo. */
  inserirImagemTrazida(imagem: ImagemTrazida, nome: string): boolean;
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
