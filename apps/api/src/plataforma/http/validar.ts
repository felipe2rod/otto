// Valida o que chega pela rede com o esquema do contrato (@otto/shared). O erro diz QUAIS campos
// foram recusados e nunca devolve o valor recebido.
import type { z } from 'zod';
import { PedidoInvalido } from '../erros/erro-da-aplicacao';

export function validar<E extends z.ZodType>(esquema: E, valor: unknown): z.infer<E> {
  const lido = esquema.safeParse(valor ?? {});
  if (lido.success) return lido.data;
  throw new PedidoInvalido([...new Set(lido.error.issues.map((problema) => String(problema.path[0] ?? '(corpo)')))]);
}
