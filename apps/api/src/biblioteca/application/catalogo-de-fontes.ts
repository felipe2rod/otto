// Porta: um catálogo de fontes de licença aberta, de onde a biblioteca do Otto traz uma família na primeira
// vez em que ela é usada. A biblioteca (BibliotecaDeFontes) continua sendo de onde tudo lê: o catálogo só
// diz o que existe e entrega o arquivo. O nome do fornecedor só aparece no adaptador (ADR 020).
import type { CATEGORIAS_DE_FONTE } from '@otto/shared';

export type CategoriaDeFonte = (typeof CATEGORIAS_DE_FONTE)[number];

export interface FamiliaDoCatalogo {
  familia: string;
  categoria: CategoriaDeFonte;
  /** Pesos que o catálogo tem (100 a 900), em ordem. */
  pesos: number[];
  /** Posição no uso geral do catálogo: 1 é a mais usada. Ordena a busca. */
  popularidade: number;
}

/** O catálogo não respondeu, ou devolveu o que não era esperado. `motivo` é código. */
export class CatalogoIndisponivel extends Error {
  constructor(readonly motivo: 'rede' | 'resposta' | 'endereco' | 'tamanho') {
    super(`catálogo de fontes indisponível: ${motivo}`);
    this.name = 'CatalogoIndisponivel';
  }
}

export abstract class CatalogoDeFontes {
  /** O catálogo inteiro, da mais usada para a menos. Quem implementa guarda: não vai à rede a cada chamada. */
  abstract familias(): Promise<FamiliaDoCatalogo[]>;
  /** O arquivo (TTF ou OTF) de um peso que a família tem. undefined se o catálogo não tem essa família ou esse peso. */
  abstract baixar(familia: string, peso: number): Promise<Uint8Array | undefined>;
}
