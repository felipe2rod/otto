// Site público: estático, gerado no build (ADR 019, item 1).
// 'error' faz o build QUEBRAR se uma página daqui ler cookie, cabeçalho ou buscar sem cache,
// em vez de virar renderização por requisição em silêncio. Vale para todas as rotas do grupo.
import type { ReactNode } from 'react';

export const dynamic = 'error';

export default function LayoutDoSite({ children }: { children: ReactNode }) {
  return children;
}
