// Porta: o medidor de tinta para aplicar um lote que mede texto (alinhar, distribuir).
// Medir texto cabe numa requisição; renderizar não (docs/mvp/backend.md, 3.3, R3).
import type { Documento, Medidor } from '@otto/documento';

export interface MedidorAberto {
  medidor: Medidor;
  /** Devolve a memória do motor. Sempre chamado, mesmo se o lote falhar. */
  liberar(): void;
}

export abstract class MedidorDeTexto {
  /** Prepara o medidor com as fontes que o documento e as operações citam. */
  abstract abrir(doc: Documento, operacoes: readonly unknown[]): Promise<MedidorAberto>;
}
