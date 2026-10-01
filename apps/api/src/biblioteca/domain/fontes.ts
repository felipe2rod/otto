// Regras puras da biblioteca de fontes.

// A regra do peso mais próximo mora em @otto/shared: é a mesma no servidor e no editor.
export { pesoMaisProximo } from '@otto/shared';

/**
 * Nome PostScript (registro 6 da tabela "name") lido do próprio arquivo TTF ou OTF.
 * É o que o Photoshop procura para a camada de texto continuar editável (ADR 028).
 * Arquivo que não é fonte, ou cortado: undefined, nunca exceção.
 */
export function nomePostScript(arquivo: Uint8Array): string | undefined {
  const b = Buffer.from(arquivo.buffer, arquivo.byteOffset, arquivo.byteLength);
  try {
    const tabelas = b.readUInt16BE(4);
    for (let i = 0; i < tabelas; i++) {
      const entrada = 12 + i * 16;
      if (b.toString('latin1', entrada, entrada + 4) !== 'name') continue;
      const inicio = b.readUInt32BE(entrada + 8);
      const registros = b.readUInt16BE(inicio + 2);
      const textos = inicio + b.readUInt16BE(inicio + 4);
      for (let j = 0; j < registros; j++) {
        const r = inicio + 6 + j * 12;
        if (b.readUInt16BE(r + 6) !== 6) continue;
        const plataforma = b.readUInt16BE(r);
        const tamanho = b.readUInt16BE(r + 8);
        const onde = textos + b.readUInt16BE(r + 10);
        if (onde + tamanho > b.length) return undefined;
        const bruto = Buffer.from(b.subarray(onde, onde + tamanho));
        const nome = plataforma === 3 || plataforma === 0 ? bruto.swap16().toString('utf16le') : bruto.toString('latin1');
        return nome || undefined;
      }
    }
  } catch {
    // leitura fora do arquivo: não é uma fonte bem formada
  }
  return undefined;
}
