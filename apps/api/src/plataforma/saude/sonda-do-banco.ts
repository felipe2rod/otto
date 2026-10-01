// Porta da rota de prontidão: o banco responde? A rota não conhece o Prisma.
export abstract class SondaDoBanco {
  /** Nunca lança. */
  abstract responde(): Promise<boolean>;
}
