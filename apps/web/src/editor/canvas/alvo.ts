// PROVISÓRIO: teste de alvo (que camada está sob o ponteiro) pela caixa de cada camada.
// O definitivo é de @otto/documento e ainda não veio: com a rotação de verdade (aqui a camada
// girada responde pela caixa que a envolve) e, no que couber, pela forma. Quando vier, `acharEm`
// passa a ser reexportação.
import { type Caixa, caixaDe, camadasVisuaisVisiveis, type Documento, disporPranchetas, type No, type Prancheta, todasAsCamadas } from '@otto/documento';
import type { Ponto } from '../nucleo/camera';
import type { Selecao } from '../nucleo/interface';
import type { PreviaDeGesto } from './motor';

export interface Alvo {
  prancheta: Prancheta;
  /** Ausente: o ponto está na prancheta, fora de qualquer camada que se possa pegar. */
  no?: No;
}

const contem = (c: Caixa, p: Ponto): boolean => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;

/** @param ponto no plano do editor (unidades do documento, com as pranchetas lado a lado) */
export function acharEm(doc: Documento, ponto: Ponto): Alvo | undefined {
  const posicoes = disporPranchetas(doc.pranchetas);
  for (const prancheta of doc.pranchetas) {
    const origem = posicoes.get(prancheta.id);
    if (!origem) continue;
    const local = { x: ponto.x - origem.x, y: ponto.y - origem.y };
    if (local.x < 0 || local.y < 0 || local.x > prancheta.largura || local.y > prancheta.altura) continue;

    // de cima para baixo. Camada bloqueada não se pega no canvas, só na lista (experiencia.md, 3.9)
    const visiveis = camadasVisuaisVisiveis(prancheta.filhos);
    for (let i = visiveis.length - 1; i >= 0; i--) {
      const no = visiveis[i] as No;
      if (no.bloqueado) continue;
      const caixa = caixaDe(no);
      if (caixa && contem(caixa, local)) return { prancheta, no };
    }
    return { prancheta };
  }
  return undefined;
}

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
