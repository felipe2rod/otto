// Tabela de atalhos do editor (docs/mvp/experiencia.md, seção 4.3). Função pura: tecla → ação.
// Entram aqui só os atalhos que já têm o que fazer. Duplicar (Ctrl+J) e agrupar (Ctrl+G) entram
// com a seleção múltipla.
import type { Ferramenta } from './interface';

export interface Tecla {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface Contexto {
  /** Foco em campo de texto: nenhum atalho vale. */
  emCampoDeTexto: boolean;
  /** Foco na área do canvas ou em lugar nenhum. Só aí o Tab esconde os painéis. */
  focoNoCanvas: boolean;
}

export type Acao =
  | { tipo: 'ferramenta'; ferramenta: Ferramenta }
  | { tipo: 'alternar-paineis' }
  | { tipo: 'enquadrar' }
  | { tipo: 'zoom-em-cem' }
  | { tipo: 'zoom'; sentido: 1 | -1 }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  /** Setas: move a seleção, em unidades do documento. */
  | { tipo: 'mover'; dx: number; dy: number }
  | { tipo: 'remover' }
  | { tipo: 'duplicar' }
  /** Um passo na pilha: 1 traz para a frente, -1 envia para trás. */
  | { tipo: 'reordenar'; sentido: 1 | -1 }
  /** Tecla que no Photoshop é ferramenta e aqui não é. Não faz nada; serve para o evento de uso. */
  | { tipo: 'sem-ferramenta'; tecla: string };

const SETAS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FERRAMENTAS: Readonly<Record<string, Ferramenta>> = { v: 'mover', h: 'mao', z: 'zoom' };
/** Texto, forma, caneta, pincel, laço, conta-gotas, corte: a mão do designer procura, o Otto ainda não tem. */
const SEM_FERRAMENTA: ReadonlySet<string> = new Set(['t', 'u', 'p', 'b', 'l', 'i', 'c', 'm']);

export function resolverAtalho(tecla: Tecla, contexto: Contexto): Acao | null {
  if (contexto.emCampoDeTexto) return null;
  const comando = tecla.ctrlKey || tecla.metaKey;
  const letra = tecla.key.toLowerCase();

  if (comando) {
    if (tecla.key === '0') return { tipo: 'enquadrar' };
    if (tecla.key === '1') return { tipo: 'zoom-em-cem' };
    if (tecla.key === '+' || tecla.key === '=') return { tipo: 'zoom', sentido: 1 };
    if (tecla.key === '-') return { tipo: 'zoom', sentido: -1 };
    if (letra === 'z') return tecla.shiftKey ? { tipo: 'refazer' } : { tipo: 'desfazer' };
    if (letra === 'j') return { tipo: 'duplicar' };
    if (tecla.key === ']') return { tipo: 'reordenar', sentido: 1 };
    if (tecla.key === '[') return { tipo: 'reordenar', sentido: -1 };
    return null;
  }
  if (tecla.altKey) return null;

  if (tecla.key === 'Delete' || tecla.key === 'Backspace') return { tipo: 'remover' };
  // Na árvore de camadas a seta navega; no canvas, move a seleção.
  const seta = SETAS[tecla.key];
  if (seta) return contexto.focoNoCanvas ? { tipo: 'mover', dx: seta[0] * (tecla.shiftKey ? 10 : 1), dy: seta[1] * (tecla.shiftKey ? 10 : 1) } : null;

  if (tecla.shiftKey) return tecla.code === 'Digit1' ? { tipo: 'enquadrar' } : null;

  // Tab continua sendo navegação por teclado dentro dos painéis; só o canvas o usa como no Photoshop.
  if (tecla.key === 'Tab') return contexto.focoNoCanvas ? { tipo: 'alternar-paineis' } : null;

  const ferramenta = FERRAMENTAS[letra];
  if (ferramenta) return { tipo: 'ferramenta', ferramenta };
  if (SEM_FERRAMENTA.has(letra)) return { tipo: 'sem-ferramenta', tecla: letra.toUpperCase() };
  return null;
}
