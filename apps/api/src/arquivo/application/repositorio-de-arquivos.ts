// Porta: o registro dos arquivos da conta. A linha aqui é a autorização; o hash não é (ADR 023).
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export type EspecieDeArquivo = 'imagem' | 'vetor' | 'mascara';

export interface ArquivoRegistrado {
  sha256: string;
  tipoMime: string;
  bytes: number;
  largura: number | null;
  altura: number | null;
  especie: EspecieDeArquivo;
  chaveDoObjeto: string;
  /** O nome com que foi enviado. É conteúdo: nunca vai para log. */
  nomeOriginal?: string;
  /** Presente só no arquivo que veio de um banco de imagens ou da biblioteca do Otto. */
  origem?: OrigemDoArquivo;
}

export interface OrigemDoArquivo {
  banco: string;
  /** O id da imagem no banco de onde veio. */
  idExterno?: string;
  autor: string;
  licenca: string;
  /** A página da imagem no banco (para mostrar a origem). Nunca o endereço do arquivo. */
  url: string;
}

export interface NovoArquivo extends ArquivoRegistrado {
  id: string;
}

export abstract class RepositorioDeArquivos {
  /** undefined se a conta não tem arquivo com este conteúdo. */
  abstract buscar(escopo: EscopoDaConta, sha256: string): Promise<ArquivoRegistrado | undefined>;
  /** Dos hashes pedidos, os que a conta tem. */
  abstract quaisExistem(escopo: EscopoDaConta, sha256s: readonly string[]): Promise<Set<string>>;
  /** Registra. Se a conta já tem este conteúdo, devolve o registro que já existe, sem alterar. */
  abstract registrar(escopo: EscopoDaConta, novo: NovoArquivo): Promise<ArquivoRegistrado>;
  /**
   * Quantos arquivos trazidos de banco de imagens (os que têm o id do banco na origem) a conta registrou desde
   * `desde`. É o limite diário. Textura do Otto tem origem e não tem id de banco: não conta.
   */
  abstract contarTrazidosDesde(escopo: EscopoDaConta, desde: Date): Promise<number>;
}
