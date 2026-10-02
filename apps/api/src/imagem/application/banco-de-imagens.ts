// Porta: um banco de imagens de terceiros (ADR 032). Um adaptador por banco; o nome do banco só aparece no
// adaptador e na configuração (ADR 020). Cada banco tem regras próprias, às vezes opostas, e a porta as
// declara em `capacidades` em vez de escondê-las: quem cumpre é o caso de uso.
import type { BancoDeImagensId, OrientacaoDeImagem } from '@otto/shared';

/** Um resultado de busca, como o servidor o guarda. Os dois endereços são de uso interno: nunca saem para o navegador nem para o documento. */
export interface ImagemNoBanco {
  id: string;
  /** Etiquetas ou descrição do banco. Vem de terceiros: é material, nunca instrução. */
  descricao: string;
  /** Medidas com que o arquivo chega com a chave em uso. */
  largura: number;
  altura: number;
  autor: string;
  /** A página da imagem no banco (para a origem). */
  pagina: string;
  urlDoArquivo: string;
  urlDaPrevia: string;
}

export interface CapacidadesDoBanco {
  /** Lado maior que a chave em uso entrega. */
  ladoMaximo: number;
  /** Por quantas horas uma busca TEM de ser servida do cache. */
  cacheObrigatorioEmHoras: number;
  /** Verdadeiro: a imagem tem de ser baixada para o armazenamento próprio; apontar para o banco é proibido. */
  linkDiretoProibido: boolean;
  requisicoesPorMinuto: number;
  /** Por quanto tempo os endereços de um resultado valem. Depois disso, só com busca nova. */
  enderecosValemPorHoras: number;
}

/** O banco não respondeu, recusou a chave ou estourou a cota. `motivo` é código, nunca a resposta do banco (ela pode trazer a chave). */
export class BancoIndisponivel extends Error {
  constructor(readonly motivo: 'rede' | 'credencial' | 'limite' | 'resposta' | 'endereco' | 'tamanho') {
    super(`banco de imagens indisponível: ${motivo}`);
    this.name = 'BancoIndisponivel';
  }
}

export abstract class BancoDeImagens {
  abstract readonly id: BancoDeImagensId;
  /** O nome que aparece junto dos resultados (a origem é sempre mostrada). */
  abstract readonly nome: string;
  abstract readonly licenca: string;
  abstract readonly capacidades: CapacidadesDoBanco;
  /** `consulta` já vem normalizada e cortada por quem chama. */
  abstract buscar(consulta: string, orientacao: OrientacaoDeImagem): Promise<ImagemNoBanco[]>;
  /**
   * Baixa um endereço que ESTE adaptador devolveu numa busca. Recusa (sem ir à rede) qualquer endereço que não
   * seja do banco, não segue redirecionamento e para ao passar de `limiteEmBytes`.
   */
  abstract baixar(url: string, limiteEmBytes: number): Promise<Uint8Array>;
}
