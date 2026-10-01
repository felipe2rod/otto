// Envio de imagem e importação de SVG (docs/mvp/backend.md, seções 7.4 e 17.3).
// A imagem vai como bytes no corpo; o documento passa a referenciá-la pelo sha256 que a API devolve.
// O SVG vai como texto; a API devolve o nó de vetor pronto para `criarNo` e os avisos do importador.
import { ArquivoEnviado, VetorImportado } from '@otto/shared';
import type { ImagemEnviada } from '../editor/nucleo/acoes';
import type { Cliente } from './cliente';

type Recusa = { ok: false; codigo: string; detalhe?: Record<string, unknown> };

export type ResultadoDeImagem = { ok: true; arquivo: ImagemEnviada } | Recusa;
export type ResultadoDeVetor = { ok: true; no: VetorImportado['no']; avisos: string[] } | Recusa;

export interface ApiDeArquivos {
  enviarImagem(arquivo: Blob): Promise<ResultadoDeImagem>;
  importarSvg(arquivo: File): Promise<ResultadoDeVetor>;
}

export function criarApiDeArquivos(cliente: Cliente): ApiDeArquivos {
  return {
    async enviarImagem(arquivo) {
      const r = await cliente.enviarBytes(ArquivoEnviado, '/api/arquivos', arquivo, arquivo.type);
      if (r.ok) return { ok: true, arquivo: { sha256: r.dados.sha256, largura: r.dados.largura, altura: r.dados.altura } };
      return { ok: false, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) };
    },
    async importarSvg(arquivo) {
      const r = await cliente.enviarBytes(VetorImportado, `/api/vetores?nome=${encodeURIComponent(arquivo.name)}`, arquivo, 'image/svg+xml');
      if (r.ok) return { ok: true, no: r.dados.no, avisos: r.dados.avisos };
      return { ok: false, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) };
    },
  };
}
