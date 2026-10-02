// A biblioteca de texturas do Otto (veio de poc/src/servidor/texturas.ts): geradas por nós, determinísticas e
// sem licença de terceiros. Cada uma vem com o modo de mesclagem e a opacidade com que costuma ser usada.
//
// TEXTO PÚBLICO: `descricao` aparece na tela e vai para o modelo. Passa pelo guardião da marca.
import type { ModoDeMesclagem } from '@otto/documento';

export interface TexturaDoCatalogo {
  nome: string;
  descricao: string;
  modoDeMesclagem: ModoDeMesclagem;
  opacidade: number;
}

/** Lado, em pixels, de toda textura. */
export const LADO_DA_TEXTURA = 1600;

export const TEXTURAS: readonly TexturaDoCatalogo[] = [
  { nome: 'papel', descricao: 'papel de algodão com fibras; dá cara de impresso', modoDeMesclagem: 'multiplicacao', opacidade: 0.6 },
  { nome: 'papel-amassado', descricao: 'papel amassado com vincos; editorial, artesanal, retrô', modoDeMesclagem: 'multiplicacao', opacidade: 0.5 },
  { nome: 'reticula', descricao: 'meio-tom de impressão a 45°; pop, cartaz, quadrinho', modoDeMesclagem: 'sobrepor', opacidade: 0.25 },
  { nome: 'grao-de-filme', descricao: 'grão fino de filme; une foto e tipografia', modoDeMesclagem: 'sobrepor', opacidade: 0.4 },
  { nome: 'poeira-e-arranhoes', descricao: 'poeira e riscos claros; analógico, vintage, música', modoDeMesclagem: 'tela', opacidade: 0.35 },
  { nome: 'concreto', descricao: 'concreto com poros; urbano, arquitetura, esporte', modoDeMesclagem: 'multiplicacao', opacidade: 0.45 },
];

/** De onde vêm, para a origem do arquivo e o relatório de exportação. */
export const ORIGEM_DAS_TEXTURAS = { banco: 'Texturas do Otto', autor: 'Otto', licenca: 'livre para uso nas peças', url: '' } as const;

/** Porta: quem desenha a textura. É render: só o worker e a semeadura têm um; a API, não. */
export abstract class GeradorDeTexturas {
  /** Os bytes (JPEG) da textura. O mesmo nome dá sempre os mesmos bytes. */
  abstract gerar(nome: string): Promise<Uint8Array>;
}
