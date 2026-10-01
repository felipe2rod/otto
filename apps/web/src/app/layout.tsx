// Layout raiz: <html>, fontes e variáveis. Componente de servidor.
// REGRA (ADR 019): nenhum provedor de cliente aqui. Provedor de cliente mora no layout de /editor,
// senão o visitante do site público baixa o que é do editor.
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '../estilos/tokens.css';
import '../estilos/base.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ENDERECO_PUBLICO } from '../site/rotas';
import { site } from '../textos/site';

export const metadata: Metadata = {
  // sem isto a URL do Open Graph sai errada atrás de proxy (ADR 019, armadilhas)
  metadataBase: new URL(ENDERECO_PUBLICO),
  title: site.tituloDaPagina,
  description: site.descricaoDaPagina,
};

export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0f0f0e' };

export default function RaizDoSite({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
