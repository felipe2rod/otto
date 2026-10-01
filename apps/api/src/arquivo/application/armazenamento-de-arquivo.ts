// Porta ArmazenamentoDeArquivo (ADR 020): imagens, vetores, fontes e, depois, exportações.
// O contrato é do núcleo; cada adaptador traduz. A porta recebe o escopo e a chave montada por
// nós (chave-de-objeto.ts), nunca texto do cliente.
//
// Fatia 0: guardar, ler, existir, remover. O link assinado de curta duração entra na fatia de
// exportação, que é quem precisa dele; a imagem do editor sai pela API (docs/mvp/README.md).
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export abstract class ArmazenamentoDeArquivo {
  /** Grava (ou regrava) o objeto. Chave de outra conta: EscopoDivergente. */
  abstract guardar(escopo: EscopoDaConta, chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void>;
  /** Os bytes do objeto, ou undefined se não existe. Chave de outra conta: EscopoDivergente. */
  abstract ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined>;
  abstract existe(escopo: EscopoDaConta, chave: string): Promise<boolean>;
  /** Apaga. Apagar o que não existe não é erro. */
  abstract remover(escopo: EscopoDaConta, chave: string): Promise<void>;
  /**
   * O que é do Otto e igual para todas as contas (fontes, texturas). Só chave que começa por
   * "biblioteca/": esta entrada não alcança arquivo de conta. Quem chama é semeadura ou worker,
   * nunca uma rota com chave vinda do cliente.
   */
  abstract guardarNaBiblioteca(chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void>;
  abstract lerDaBiblioteca(chave: string): Promise<Uint8Array | undefined>;
  /** Para a rota de prontidão. Nunca lança. */
  abstract responde(): Promise<boolean>;
}
