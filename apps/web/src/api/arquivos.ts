// Envio de imagem e importação de SVG (docs/mvp/backend.md, seções 7.4 e 17.3).
// A imagem vai como bytes no corpo; o documento passa a referenciá-la pelo sha256 que a API devolve.
// O SVG vai como texto; a API devolve o nó de vetor pronto para `criarNo` e os avisos do importador.
import { ArquivoEnviado, DadosDoArquivo, VetorImportado } from '@otto/shared';
import type { ImagemEnviada } from '../editor/nucleo/acoes';
import type { Cliente } from './cliente';

type Recusa = { ok: false; codigo: string; detalhe?: Record<string, unknown> };

export type ResultadoDeImagem = { ok: true; arquivo: ImagemEnviada } | Recusa;
/** `miniatura`: o vetor como o Otto o entendeu, em SVG montado pelo servidor (só caminhos e cores). */
export type ResultadoDeVetor = { ok: true; no: VetorImportado['no']; avisos: string[]; miniatura?: string } | Recusa;

export interface ApiDeArquivos {
  enviarImagem(arquivo: Blob): Promise<ResultadoDeImagem>;
  importarSvg(arquivo: File): Promise<ResultadoDeVetor>;
  /** Medidas, espécie, nome e origem de um arquivo que a conta já enviou, sem baixar os bytes. */
  dados(sha256: string): Promise<DadosDoArquivo | undefined>;
  /** Relê um vetor já enviado (o logo de uma marca), com a miniatura. */
  vetor(sha256: string): Promise<{ no: VetorImportado['no']; avisos: string[]; miniatura?: string } | undefined>;
}

/** O que o editor da peça usa: enviar e importar. Ler o que já foi enviado é do formulário e das marcas. */
export type EnvioDeArquivos = Pick<ApiDeArquivos, 'enviarImagem' | 'importarSvg'>;

/** O endereço dos bytes de uma imagem da conta, para `<img src>`. */
export const enderecoDoArquivo = (sha256: string): string => `/api/arquivos/${sha256}`;
/** A miniatura de um vetor como `src` de `<img>`: o SVG vai inteiro no endereço, sem pedido à rede. */
export const enderecoDaMiniatura = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

export function criarApiDeArquivos(cliente: Cliente): ApiDeArquivos {
  return {
    async enviarImagem(arquivo) {
      const r = await cliente.enviarBytes(ArquivoEnviado, '/api/arquivos', arquivo, arquivo.type);
      if (r.ok) return { ok: true, arquivo: { sha256: r.dados.sha256, largura: r.dados.largura, altura: r.dados.altura } };
      return { ok: false, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) };
    },
    async importarSvg(arquivo) {
      const r = await cliente.enviarBytes(VetorImportado, `/api/vetores?nome=${encodeURIComponent(arquivo.name)}`, arquivo, 'image/svg+xml');
      if (r.ok) return { ok: true, no: r.dados.no, avisos: r.dados.avisos, ...(r.dados.miniatura ? { miniatura: r.dados.miniatura } : {}) };
      return { ok: false, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) };
    },
    async dados(sha256) {
      const r = await cliente.ler(DadosDoArquivo, `/api/arquivos/${sha256}/dados`);
      return r.ok ? r.dados : undefined;
    },
    async vetor(sha256) {
      const r = await cliente.ler(VetorImportado, `/api/vetores/${sha256}`);
      return r.ok ? { no: r.dados.no, avisos: r.dados.avisos, ...(r.dados.miniatura ? { miniatura: r.dados.miniatura } : {}) } : undefined;
    },
  };
}
