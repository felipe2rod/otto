// Geometria das sobreposições. Onde cada prancheta fica no plano do editor é convenção de
// @otto/documento, a mesma que o motor usa: se as sobreposições calculassem por conta própria,
// moldura e pixel podiam desencontrar. Aqui ficam só a ponte para os tipos da câmera e as guias da
// zona coberta pela interface do story.
import { caixaDasPranchetas, disporPranchetas, VAO_ENTRE_PRANCHETAS } from '@otto/documento';
import type { Caixa } from '../nucleo/camera';

export { disporPranchetas, VAO_ENTRE_PRANCHETAS };

export interface MedidaDaPrancheta {
  id: string;
  largura: number;
  altura: number;
}

/** A caixa de todas as pranchetas, no formato que a câmera enquadra. */
export function caixaDoConteudo(pranchetas: readonly MedidaDaPrancheta[]): Caixa | undefined {
  const caixa = caixaDasPranchetas(pranchetas);
  return caixa && { x: caixa.x, y: caixa.y, largura: caixa.w, altura: caixa.h };
}

/**
 * Faixas do story cobertas pela interface do aplicativo: texto não entra, foto e cor sim.
 * Medidas herdadas da POC (250 e 340 px num story de 1920). O catálogo de formatos com zona
 * segura é do diretor-de-arte; quando existir, estas constantes saem daqui.
 */
export function guiasDoStory(prancheta: MedidaDaPrancheta): { topo: number; base: number } | null {
  if (Math.abs(prancheta.largura / prancheta.altura - 9 / 16) >= 0.02) return null;
  return { topo: (prancheta.altura * 250) / 1920, base: (prancheta.altura * 340) / 1920 };
}
