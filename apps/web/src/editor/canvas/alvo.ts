// Geometria da seleção no plano do editor. O teste de alvo (que camada está sob o ponteiro) é de
// @otto/documento (`acharEm`); aqui fica o que é da tela: o contorno de cada camada selecionada e o
// que as alças de redimensionar e girar pegam.
import { type Documento, disporPranchetas, ehVisual, type No, type NoVisual } from '@otto/documento';
import type { Ponto } from '../nucleo/camera';
import type { Selecao } from '../nucleo/interface';
import type { PreviaDeGesto } from './motor';
import { type Quadro, quadroDaSelecao } from './transformacao';

/** Uma camada visual da seleção. Grupo selecionado entra pelas camadas de dentro. */
export interface Folha {
  no: NoVisual;
  /** O quadro da camada, em coordenadas da prancheta: é o que o lote altera. */
  quadro: Quadro;
}

interface FolhaAchada extends Folha {
  pranchetaId: string;
  origem: Ponto;
  /** O id selecionado de onde ela veio: ela mesma, ou o grupo. */
  raiz: string;
  /** Ela, ou um grupo acima dela, está bloqueada ou oculta. */
  presa: boolean;
}

const quadroDe = (no: NoVisual): Quadro => ({ x: no.x, y: no.y, w: no.largura, h: no.altura, rotacao: no.rotacao });

function folhasDaSelecao(doc: Documento, selecao: Selecao): FolhaAchada[] {
  if (selecao?.tipo !== 'camadas') return [];
  const ids = new Set(selecao.ids);
  const posicoes = disporPranchetas(doc.pranchetas);
  const folhas: FolhaAchada[] = [];
  for (const prancheta of doc.pranchetas) {
    const origem = posicoes.get(prancheta.id);
    if (!origem) continue;
    const andar = (nos: readonly No[], raiz: string | undefined, presa: boolean) => {
      for (const no of nos) {
        const daqui = raiz ?? (ids.has(no.id) ? no.id : undefined);
        const presaAqui = presa || no.bloqueado || !no.visivel;
        if (no.tipo === 'grupo') andar(no.filhos, daqui, presaAqui);
        else if (daqui !== undefined && ehVisual(no)) folhas.push({ no, quadro: quadroDe(no), pranchetaId: prancheta.id, origem, raiz: daqui, presa: presaAqui });
      }
    };
    andar(prancheta.filhos, undefined, false);
  }
  return folhas;
}

/** O contorno de cada camada selecionada, no plano do editor, já como a prévia do gesto a mostra. */
export function contornosDaSelecao(doc: Documento, selecao: Selecao, previa: PreviaDeGesto | null): Quadro[] {
  return folhasDaSelecao(doc, selecao).map((f) => {
    const caixa = previa?.caixas?.[f.no.id];
    if (caixa) return { x: f.origem.x + caixa.x, y: f.origem.y + caixa.y, w: caixa.largura, h: caixa.altura, rotacao: caixa.rotacao ?? f.quadro.rotacao };
    const movida = previa && (previa.ids.includes(f.no.id) || previa.ids.includes(f.raiz)) ? previa : undefined;
    return { ...f.quadro, x: f.origem.x + f.quadro.x + (movida?.dx ?? 0), y: f.origem.y + f.quadro.y + (movida?.dy ?? 0) };
  });
}

export interface AlvoDeTransformar {
  folhas: Folha[];
  /** O quadro das alças, em coordenadas da prancheta: o da camada, ou a caixa reta que cobre todas. */
  quadro: Quadro;
  /** Onde a prancheta fica no plano do editor. */
  origem: Ponto;
}

/**
 * O que as alças pegam: as camadas visuais da seleção, se TODAS podem mudar (nenhuma bloqueada nem
 * oculta) e estão na mesma prancheta (a prévia do motor cobre uma prancheta por gesto).
 */
export function alvoDeTransformar(doc: Documento, selecao: Selecao): AlvoDeTransformar | undefined {
  const folhas = folhasDaSelecao(doc, selecao);
  const [primeira] = folhas;
  if (!primeira || folhas.some((f) => f.presa || f.pranchetaId !== primeira.pranchetaId)) return undefined;
  return { folhas: folhas.map(({ no, quadro }) => ({ no, quadro })), quadro: quadroDaSelecao(folhas.map((f) => f.quadro)), origem: primeira.origem };
}

/** O mesmo quadro, no plano do editor: é onde as alças aparecem e onde o ponteiro as pega. */
export const noPlano = (quadro: Quadro, origem: Ponto): Quadro => ({ ...quadro, x: quadro.x + origem.x, y: quadro.y + origem.y });
