// Indexação em duas camadas (ADR 019, item 4): aqui o Disallow; no layout de /editor, o noindex,
// que é o que vale para URL descoberta por link de fora.
import type { MetadataRoute } from 'next';
import { ENDERECO_PUBLICO } from '../site/rotas';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/editor', '/api'] },
    sitemap: `${ENDERECO_PUBLICO}/sitemap.xml`,
  };
}
