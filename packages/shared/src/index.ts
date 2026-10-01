// Contratos que atravessam a rede e tipos comuns a API, worker e editor.
// Sem framework: só zod e tipos (ADR 019, guarda 3). A API valida o pedido com estes esquemas,
// o editor valida a resposta, e o tipo é um só (docs/mvp/backend.md, seção 7).
import { z } from 'zod';

/** Identificador de conta (ADR 023). Tipo marcado: uma string qualquer não passa no lugar dele. */
export const ContaId = z.uuid().brand<'ContaId'>();
export type ContaId = z.infer<typeof ContaId>;

/** Valida e marca um identificador de conta. Lança se não for UUID. */
export function lerContaId(valor: unknown): ContaId {
  return ContaId.parse(valor);
}

/** Resposta de GET /api/saude/vivo e /api/saude/pronto, na API e no worker. */
export const RespostaDeSaude = z.object({
  estado: z.enum(['vivo', 'pronto', 'indisponivel']),
  servico: z.enum(['api', 'worker']),
  /** Nome do pacote do núcleo carregado pelo processo: prova de que o núcleo ESM roda dentro do NestJS. */
  nucleo: z.string(),
  dependencias: z.object({ banco: z.boolean(), armazenamento: z.boolean() }).optional(),
});
export type RespostaDeSaude = z.infer<typeof RespostaDeSaude>;

/**
 * Corpo de toda resposta de erro da API. `codigo` é estável e é por ele que o editor decide;
 * a frase que a pessoa lê é montada no editor, nunca aqui.
 */
export const ErroDaApi = z.strictObject({
  codigo: z.string().regex(/^[a-z][a-z0-9_]*$/),
  detalhe: z.record(z.string(), z.unknown()).optional(),
});
export type ErroDaApi = z.infer<typeof ErroDaApi>;

export * from './contrato';
export * from './exportacao';
