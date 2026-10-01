// Tipo pelo conteúdo e medidas pelo cabeçalho, SEM decodificar (docs/mvp/backend.md, seção 10).
// Uma imagem pode ter poucos KB e declarar bilhões de pixels: decodificar dentro da requisição
// derruba a API. Aqui só se leem os primeiros bytes; quem decodifica é o worker, com limite de memória.
import type { TipoDeImagem } from '@otto/shared';

export type Inspecao = { ok: true; tipo: TipoDeImagem; largura: number; altura: number } | { ok: false; motivo: 'tipo_nao_aceito' | 'imagem_ilegivel' };

const ILEGIVEL: Inspecao = { ok: false, motivo: 'imagem_ilegivel' };

export function inspecionarImagem(conteudo: Uint8Array): Inspecao {
  const b = Buffer.from(conteudo.buffer, conteudo.byteOffset, conteudo.byteLength);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return comMedidas('image/png', png(b));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return comMedidas('image/jpeg', jpeg(b));
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return comMedidas('image/webp', webp(b));
  return { ok: false, motivo: 'tipo_nao_aceito' };
}

function comMedidas(tipo: TipoDeImagem, medidas: [number, number] | undefined): Inspecao {
  if (!medidas) return ILEGIVEL;
  const [largura, altura] = medidas;
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura <= 0 || altura <= 0) return ILEGIVEL;
  return { ok: true, tipo, largura, altura };
}

function png(b: Buffer): [number, number] | undefined {
  // assinatura (8), tamanho do bloco (4), "IHDR" (4), largura (4), altura (4)
  if (b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return undefined;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

function jpeg(b: Buffer): [number, number] | undefined {
  let i = 2;
  // cada segmento: FF, marcador, tamanho (2, inclui os dois bytes do tamanho), dados
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return undefined;
    const marcador = b[i + 1] as number;
    if (marcador === 0xff) {
      i++; // preenchimento
      continue;
    }
    const tamanho = b.readUInt16BE(i + 2);
    if (tamanho < 2) return undefined;
    // SOF0 a SOF15 trazem as medidas; C4 (tabela), C8 (reservado) e CC (aritmética) não são quadro
    const ehQuadro = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (ehQuadro) {
      if (i + 9 > b.length) return undefined;
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    if (marcador === 0xda || marcador === 0xd9) return undefined; // começou o pixel, ou acabou, sem quadro
    i += 2 + tamanho;
  }
  return undefined;
}

function webp(b: Buffer): [number, number] | undefined {
  if (b.length < 30) return undefined;
  const bloco = b.toString('latin1', 12, 16);
  if (bloco === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (bloco === 'VP8L') {
    if (b[20] !== 0x2f) return undefined;
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (bloco === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return undefined;
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  return undefined;
}
