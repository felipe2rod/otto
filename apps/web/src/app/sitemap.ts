import type { MetadataRoute } from 'next';
import { ENDERECO_PUBLICO, ROTAS_PUBLICAS } from '../site/rotas';

export default function sitemap(): MetadataRoute.Sitemap {
  return ROTAS_PUBLICAS.map((rota) => ({ url: `${ENDERECO_PUBLICO}${rota}` }));
}
