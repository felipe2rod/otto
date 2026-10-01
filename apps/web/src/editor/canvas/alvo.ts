// Geometria da seleção no plano do editor. O teste de alvo (que camada está sob o ponteiro) é de
// @otto/documento (`acharEm`, com rotação, elipse e canto arredondado); aqui fica o que é da tela:
// a caixa de cada camada selecionada e qual camada tem alças.
import { type Caixa, caixaDe, type Documento, disporPranchetas, type No, todasAsCamadas } from '@otto/documento';
import type { Selecao } from '../nucleo/interface';
import type { PreviaDeGesto } from './motor';

/** Caixa de cada camada selecionada, no plano do editor, já deslocada pela prévia do arraste. */
export function caixasDaSelecao(doc: Documento, selecao: Selecao, previa: PreviaDeGesto | null): Caixa[] {
  if (selecao?.tipo !== 'camadas') return [];
  const ids = new Set(selecao.ids);
  const posicoes = disporPranchetas(doc.pranchetas);
  const caixas: Caixa[] = [];
  for (const prancheta of doc.pranchetas) {
    const origem = posicoes.get(prancheta.id);
    if (!origem) continue;
    for (const no of todasAsCamadas(prancheta.filhos)) {
      if (!ids.has(no.id)) continue;
      const caixa = caixaDe(no);
      if (!caixa) continue;
      const movida = previa?.ids.includes(no.id) ? previa : undefined;
      caixas.push({ x: origem.x + caixa.x + (movida?.dx ?? 0), y: origem.y + caixa.y + (movida?.dy ?? 0), w: caixa.w, h: caixa.h });
    }
  }
  return caixas;
}

export interface NoComAlcas {
  no: No;
  /** A caixa da camada, em coordenadas da prancheta: é o que o lote de redimensionar altera. */
  caixa: Caixa;
  /** A mesma caixa no plano do editor (com a posição da prancheta): é onde as alças aparecem. */
  caixaNoPlano: Caixa;
}

/**
 * A camada que mostra alças de redimensionar: UMA camada selecionada, visual, sem rotação, visível
 * e desbloqueada. Grupo e camada girada não têm alça nesta fatia.
 */
export function noDaAlca(doc: Documento, selecao: Selecao): NoComAlcas | undefined {
  if (selecao?.tipo !== 'camadas' || selecao.ids.length !== 1) return undefined;
  const posicoes = disporPranchetas(doc.pranchetas);
  for (const prancheta of doc.pranchetas) {
    const no = todasAsCamadas(prancheta.filhos).find((n) => n.id === selecao.ids[0]);
    const origem = posicoes.get(prancheta.id);
    if (!no || !origem) continue;
    if (no.tipo === 'grupo' || no.tipo === 'ajuste' || no.rotacao !== 0 || no.bloqueado || !no.visivel) return undefined;
    const caixa = { x: no.x, y: no.y, w: no.largura, h: no.altura };
    return { no, caixa, caixaNoPlano: { ...caixa, x: origem.x + no.x, y: origem.y + no.y } };
  }
  return undefined;
}
