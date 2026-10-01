// Estado de interface do editor: o que não é o documento nem a tarefa.
// A câmera fica em armazém próprio (ver Editor.tsx): ela muda a cada movimento do mouse e
// nenhum componente pode renderizar de novo por causa disso.
import { type Armazem, criarArmazem } from './armazem';

export type Ferramenta = 'mover' | 'mao' | 'zoom';

export type Selecao = { tipo: 'camadas'; ids: readonly string[] } | { tipo: 'prancheta'; id: string } | null;

export interface EstadoDeInterface {
  ferramenta: Ferramenta;
  /** Espaço apertado: a mão vale enquanto durar, sem trocar a ferramenta escolhida. */
  maoTemporaria: boolean;
  paineisVisiveis: boolean;
  selecao: Selecao;
}

export interface Interface {
  armazem: Armazem<EstadoDeInterface>;
  escolherFerramenta(ferramenta: Ferramenta): void;
  segurarMao(apertado: boolean): void;
  ferramentaEmUso(): Ferramenta;
  alternarPaineis(): void;
  selecionar(selecao: Selecao): void;
}

export const ferramentaEmUso = (estado: EstadoDeInterface): Ferramenta => (estado.maoTemporaria ? 'mao' : estado.ferramenta);

export function criarInterface(): Interface {
  const armazem = criarArmazem<EstadoDeInterface>({ ferramenta: 'mover', maoTemporaria: false, paineisVisiveis: true, selecao: null });
  return {
    armazem,
    escolherFerramenta: (ferramenta) => armazem.definir((e) => (e.ferramenta === ferramenta ? e : { ...e, ferramenta })),
    segurarMao: (apertado) => armazem.definir((e) => (e.maoTemporaria === apertado ? e : { ...e, maoTemporaria: apertado })),
    ferramentaEmUso: () => ferramentaEmUso(armazem.obter()),
    alternarPaineis: () => armazem.definir((e) => ({ ...e, paineisVisiveis: !e.paineisVisiveis })),
    selecionar: (selecao) => armazem.definir((e) => ({ ...e, selecao: selecao?.tipo === 'camadas' && selecao.ids.length === 0 ? null : selecao })),
  };
}
