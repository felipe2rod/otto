// Porta BancoDeImagens com o adaptador Pixabay (ADR 032):
// cache de busca de 24 h, download para o armazenamento próprio, nada de link direto.
import { loadImage } from '@napi-rs/canvas';
import { guardarArquivo, type MetaDeArquivo } from './armazenamento';

export interface ResultadoDeBusca {
  id: number;
  descricao: string;
  largura: number;
  altura: number;
  autor: string;
  pagina: string;
  /** Uso interno: nunca vai para o navegador nem para o documento. */
  urlGrande: string;
  urlPrevia: string;
}

export interface BancoDeImagens {
  buscar(consulta: string, orientacao?: 'horizontal' | 'vertical' | 'todas'): Promise<ResultadoDeBusca[]>;
  trazer(id: number): Promise<{ meta: MetaDeArquivo; previa: Buffer }>;
}

const DIA = 24 * 60 * 60 * 1000;

export function criarPixabay(chave: string | undefined): BancoDeImagens {
  const cache = new Map<string, { quando: number; resultados: ResultadoDeBusca[] }>();
  const vistos = new Map<number, ResultadoDeBusca>();
  return {
    async buscar(consulta, orientacao = 'todas') {
      if (!chave) throw new Error('PIXABAY_API_KEY não configurada no servidor');
      const k = `${consulta}|${orientacao}`;
      const c = cache.get(k);
      if (c && Date.now() - c.quando < DIA) return c.resultados;
      const url = new URL('https://pixabay.com/api/');
      url.search = new URLSearchParams({ key: chave, q: consulta.slice(0, 100), lang: 'pt', image_type: 'photo', orientation: orientacao, safesearch: 'true', per_page: '12' }).toString();
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Pixabay respondeu ${r.status}`);
      const j = (await r.json()) as { hits: Array<{ id: number; tags: string; imageWidth: number; imageHeight: number; user: string; pageURL: string; largeImageURL: string; webformatURL: string }> };
      const resultados = j.hits.map((h) => {
        // acesso padrão entrega no máximo 1280 px no lado maior (largeImageURL)
        const s = Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight));
        return { id: h.id, descricao: h.tags, largura: Math.round(h.imageWidth * s), altura: Math.round(h.imageHeight * s), autor: h.user, pagina: h.pageURL, urlGrande: h.largeImageURL, urlPrevia: h.webformatURL };
      });
      resultados.forEach((x) => vistos.set(x.id, x));
      cache.set(k, { quando: Date.now(), resultados });
      return resultados;
    },
    async trazer(id) {
      const r = vistos.get(id);
      if (!r) throw new Error(`a imagem ${id} não veio de uma busca desta sessão; busque antes`);
      const [grande, previa] = await Promise.all([fetch(r.urlGrande), fetch(r.urlPrevia)]);
      if (!grande.ok) throw new Error(`download falhou (${grande.status})`);
      const bytes = Buffer.from(await grande.arrayBuffer());
      const img = await loadImage(bytes);
      const meta = await guardarArquivo(bytes, {
        tipo: 'image/jpeg',
        largura: img.width,
        altura: img.height,
        origem: { banco: 'Pixabay', autor: r.autor, licenca: 'Licença de Conteúdo do Pixabay', url: r.pagina },
      });
      return { meta, previa: Buffer.from(await previa.arrayBuffer()) };
    },
  };
}
