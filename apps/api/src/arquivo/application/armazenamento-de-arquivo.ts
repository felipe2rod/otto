// Porta ArmazenamentoDeArquivo (ADR 020): imagens, vetores, fontes e, depois, exportações.
// O contrato é do núcleo; cada adaptador traduz. A porta recebe o escopo e a chave montada por
// nós (chave-de-objeto.ts), nunca texto do cliente.
//
// A imagem do editor sai pela API (docs/mvp/README.md). O link assinado de vida curta é para
// download de exportação: o arquivo é grande, e o link vence.
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface OpcoesDoLink {
  /** De 1 a 3600. O padrão de quem chama é 300 (5 minutos). */
  validadeEmSegundos: number;
  /** Nome com que o navegador salva. É conteúdo: nunca vai para log. */
  nomeDoArquivo: string;
  tipoMime: string;
}

export interface ArquivoDoLink {
  bytes: Uint8Array;
  nome: string;
  tipo: string;
}

/** Validade aceita num link assinado. */
export function conferirValidade(segundos: number): void {
  if (!Number.isInteger(segundos) || segundos < 1 || segundos > 3600) throw new Error('validade de link fora do intervalo de 1 a 3600 segundos');
}

export abstract class ArmazenamentoDeArquivo {
  /** Grava (ou regrava) o objeto. Chave de outra conta: EscopoDivergente. */
  abstract guardar(escopo: EscopoDaConta, chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void>;
  /** Os bytes do objeto, ou undefined se não existe. Chave de outra conta: EscopoDivergente. */
  abstract ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined>;
  abstract existe(escopo: EscopoDaConta, chave: string): Promise<boolean>;
  /** Apaga. Apagar o que não existe não é erro. */
  abstract remover(escopo: EscopoDaConta, chave: string): Promise<void>;
  /**
   * Endereço que entrega o objeto como anexo, sem outra credencial, até vencer. O LINK É CREDENCIAL:
   * nunca vai para log nem fica guardado; cada pedido de download gera um novo.
   * Não confere se o objeto existe: quem chama já leu o registro dele sob RLS.
   * Chave de outra conta: EscopoDivergente.
   */
  abstract linkAssinado(escopo: EscopoDaConta, chave: string, opcoes: OpcoesDoLink): Promise<string>;
  /**
   * Só para adaptador cujo link aponta para a própria API (GET /api/links/:token): abre o token e
   * devolve o arquivo. Adaptador com servidor de objetos próprio devolve sempre undefined.
   */
  abstract abrirLinkProprio(token: string): Promise<ArquivoDoLink | undefined>;
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
