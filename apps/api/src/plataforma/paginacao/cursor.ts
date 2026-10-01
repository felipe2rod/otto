// Cursor opaco de paginação: o cliente devolve o que recebeu, sem interpretar.
export class CursorInvalido extends Error {
  constructor() {
    super('cursor de paginação inválido');
    this.name = 'CursorInvalido';
  }
}

export function codificarCursor(posicao: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(posicao), 'utf8').toString('base64url');
}

export function lerCursor(cursor: string): Record<string, unknown> {
  let lido: unknown;
  try {
    lido = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new CursorInvalido();
  }
  if (typeof lido !== 'object' || lido === null || Array.isArray(lido) || Object.keys(lido).length === 0) throw new CursorInvalido();
  return lido as Record<string, unknown>;
}
