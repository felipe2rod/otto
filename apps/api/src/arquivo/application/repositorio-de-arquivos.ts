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
}

export interface OrigemDoArquivo {
  banco: string;
  autor: string;
  licenca: string;
  url: string;
}

export interface NovoArquivo extends ArquivoRegistrado {
  id: string;
  nomeOriginal?: string;
  origem?: OrigemDoArquivo;
}

export abstract class RepositorioDeArquivos {
  /** undefined se a conta não tem arquivo com este conteúdo. */
  abstract buscar(escopo: EscopoDaConta, sha256: string): Promise<ArquivoRegistrado | undefined>;
  /** Dos hashes pedidos, os que a conta tem. */
  abstract quaisExistem(escopo: EscopoDaConta, sha256s: readonly string[]): Promise<Set<string>>;
  /** Registra. Se a conta já tem este conteúdo, devolve o registro que já existe, sem alterar. */
  abstract registrar(escopo: EscopoDaConta, novo: NovoArquivo): Promise<ArquivoRegistrado>;
}
