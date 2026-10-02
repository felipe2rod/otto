// Regras puras da biblioteca de fontes.

// A regra do peso mais próximo mora em @otto/shared: é a mesma no servidor e no editor.
export { pesoMaisProximo } from '@otto/shared';

/**
 * Um texto da tabela "name" do próprio arquivo TTF ou OTF, pelo número do registro.
 * Arquivo que não é fonte, ou cortado: undefined, nunca exceção.
 */
function textoDaTabelaDeNomes(arquivo: Uint8Array, registro: number): string | undefined {
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
        if (b.readUInt16BE(r + 6) !== registro) continue;
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

/**
 * Nome PostScript (registro 6 da tabela "name") lido do próprio arquivo TTF ou OTF.
 * É o que o Photoshop procura para a camada de texto continuar editável (ADR 028).
 */
export function nomePostScript(arquivo: Uint8Array): string | undefined {
  return textoDaTabelaDeNomes(arquivo, 6);
}

/**
 * A licença que o próprio arquivo declara: a descrição (registro 13) e, na falta dela, o endereço da licença
 * (registro 14). É o que decide se a fonte pode ir num pacote de exportação (licenca-de-fonte.ts).
 */
export function licencaDoArquivo(arquivo: Uint8Array): string | undefined {
  const texto = [textoDaTabelaDeNomes(arquivo, 13), textoDaTabelaDeNomes(arquivo, 14)].filter(Boolean).join(' ');
  return texto.replace(/\s+/g, ' ').trim().slice(0, 400) || undefined;
}

/** O arquivo começa como TrueType ou OpenType? (Não aceita coleção nem WOFF: o motor e o PSD pedem um arquivo por peso.) */
export function pareceFonte(arquivo: Uint8Array): boolean {
  if (arquivo.byteLength < 12) return false;
  const marca = Buffer.from(arquivo.buffer, arquivo.byteOffset, 4).toString('latin1');
  return marca === '\u0000\u0001\u0000\u0000' || marca === 'OTTO' || marca === 'true';
}
