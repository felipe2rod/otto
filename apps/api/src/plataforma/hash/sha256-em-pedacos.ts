// SHA-256 de um arquivo grande sem segurar o laço de eventos: o cálculo de uma vez leva 0,35 s em 83 MB (medido), e
// nesse tempo a API não responde a mais ninguém. Aqui o arquivo é lido em pedaços, cedendo a vez entre um e outro.
import { createHash } from 'node:crypto';

const PEDACO = 4 * 1024 * 1024;

export async function sha256EmPedacos(bytes: Uint8Array, pedaco = PEDACO): Promise<string> {
  const hash = createHash('sha256');
  for (let inicio = 0; inicio < bytes.byteLength; inicio += pedaco) {
    hash.update(bytes.subarray(inicio, inicio + pedaco));
    if (inicio + pedaco < bytes.byteLength) await new Promise<void>((ok) => setImmediate(ok));
  }
  return hash.digest('hex');
}
