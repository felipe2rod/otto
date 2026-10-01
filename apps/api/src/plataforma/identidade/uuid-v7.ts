// UUID versão 7 (RFC 9562): 48 bits de instante, depois aleatório. Ordena por tempo como texto.
// Os ids do Otto são gerados na aplicação, não no banco (ADR 023, decisão 1).
import { randomBytes } from 'node:crypto';

export function uuidV7(agora: () => number = Date.now): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(agora(), 0, 6);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
