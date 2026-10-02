// Porta: o que o ciclo do Otto precisa do motor de render enquanto uma tarefa roda. O caso de uso não
// conhece o motor: recebe o resumo da peça, a imagem que o modelo vai ver e os avisos da verificação.
// Quem implementa carrega fontes e imagens DEPOIS de conferir a conta (o hash não é autorização).
import type { FamiliaDeFonte, ImagemParaOModelo, PedidoDeRender } from '@otto/agente';
import type { Aviso, Documento } from '@otto/documento';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface BancadaAberta {
  /** As famílias que a conta pode usar, com os pesos. Entram no prompt. */
  readonly fontes: FamiliaDeFonte[];
  /** A árvore compacta para o modelo, com a tinta do texto medida pelo motor. */
  resumir(doc: Documento, prancheta?: string): unknown;
  /** Render de referência, na escala que cabe em `ladoMaximo`. */
  renderizar(doc: Documento, pedido: PedidoDeRender): Promise<ImagemParaOModelo>;
  verificar(doc: Documento, prancheta?: string): Promise<Aviso[]>;
  /** Prévia de uma imagem DA CONTA. undefined se a conta não tem o arquivo. */
  previaDeArquivo(arquivo: string, ladoMaximo: number): Promise<ImagemParaOModelo | undefined>;
  /** Libera a sessão do motor. */
  fechar(): void;
}

export abstract class BancadaDoOtto {
  abstract abrir(escopo: EscopoDaConta, peca: { nome: string; arvore: Documento }): Promise<BancadaAberta>;
}
