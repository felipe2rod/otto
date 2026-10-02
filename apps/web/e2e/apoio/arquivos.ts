// Arquivos de teste feitos na hora, sem nada guardado no repositório: PNG de uma cor só, SVG de
// formas, SVG só de texto (recusado pelo importador) e um PNG quebrado.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

function pedaco(tipo: string, dados: Buffer): Buffer {
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const soma = Buffer.alloc(4);
  soma.writeUInt32BE(crc32(corpo) >>> 0);
  return Buffer.concat([tamanho, corpo, soma]);
}

/** PNG RGB de uma cor só. */
export function png(largura: number, altura: number, cor: readonly [number, number, number]): Buffer {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho.set([8, 2, 0, 0, 0], 8);
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(largura * 3, Buffer.from(cor))]);
  const pixels = Buffer.concat(Array.from({ length: altura }, () => linha));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', cabecalho), pedaco('IDAT', deflateSync(pixels)), pedaco('IEND', Buffer.alloc(0))]);
}

export const SVG_DE_FORMAS = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="80" height="80" fill="#c0392b"/><circle cx="150" cy="50" r="40" fill="#2c3e50"/></svg>',
);
export const SVG_SO_DE_TEXTO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="10" y="50">Olá</text></svg>');
export const PNG_QUEBRADO = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('lixo')]);

/** O que o começo de um arquivo diz que ele é, pelos bytes e não pelo nome. */
export function tipoPelosBytes(bytes: Buffer): 'psd' | 'pdf' | 'svg' | 'png' | 'zip' | 'desconhecido' {
  if (bytes.subarray(0, 4).toString('latin1') === '8BPS') return 'psd';
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'zip';
  // declaração XML, DOCTYPE e comentários podem vir antes da raiz
  if (/^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(bytes.subarray(0, 1200).toString('utf8'))) return 'svg';
  return 'desconhecido';
}

/** Os nomes dos arquivos de um .zip, lidos do diretório central (nomes em UTF-8). */
export function nomesNoZip(bytes: Buffer): string[] {
  const nomes: string[] = [];
  for (let i = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); i >= 0 && i + 46 <= bytes.length; ) {
    if (bytes.readUInt32LE(i) !== 0x02014b50) break;
    const nome = bytes.readUInt16LE(i + 28);
    const extra = bytes.readUInt16LE(i + 30);
    const comentario = bytes.readUInt16LE(i + 32);
    nomes.push(bytes.subarray(i + 46, i + 46 + nome).toString('utf8'));
    i += 46 + nome + extra + comentario;
  }
  return nomes;
}

/** Um PNG de 8 bits (RGB ou RGBA, sem entrelaçamento) aberto em pixels RGBA. É o que a captura de tela do Playwright produz. */
export function lerPng(bytes: Buffer): { largura: number; altura: number; pixel(x: number, y: number): [number, number, number, number] } {
  let largura = 0;
  let altura = 0;
  let canais = 4;
  const dados: Buffer[] = [];
  for (let i = 8; i < bytes.length; ) {
    const tamanho = bytes.readUInt32BE(i);
    const tipo = bytes.subarray(i + 4, i + 8).toString('latin1');
    const corpo = bytes.subarray(i + 8, i + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = corpo.readUInt32BE(0);
      altura = corpo.readUInt32BE(4);
      if (corpo[8] !== 8 || (corpo[9] !== 2 && corpo[9] !== 6) || corpo[12] !== 0) throw new Error('PNG fora do que este leitor conhece (8 bits, RGB ou RGBA, sem entrelaçamento)');
      canais = corpo[9] === 6 ? 4 : 3;
    } else if (tipo === 'IDAT') dados.push(corpo);
    i += 12 + tamanho;
  }
  const bruto = inflateSync(Buffer.concat(dados));
  const passo = largura * canais;
  const pixels = Buffer.alloc(altura * passo);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (passo + 1)] ?? 0;
    for (let x = 0; x < passo; x++) {
      const valor = bruto[y * (passo + 1) + 1 + x] ?? 0;
      const a = x >= canais ? (pixels[y * passo + x - canais] ?? 0) : 0;
      const b = y > 0 ? (pixels[(y - 1) * passo + x] ?? 0) : 0;
      const c = x >= canais && y > 0 ? (pixels[(y - 1) * passo + x - canais] ?? 0) : 0;
      let previsto = 0;
      if (filtro === 1) previsto = a;
      else if (filtro === 2) previsto = b;
      else if (filtro === 3) previsto = (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        previsto = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * passo + x] = (valor + previsto) & 0xff;
    }
  }
  return {
    largura,
    altura,
    pixel: (x, y) => {
      const i = y * passo + x * canais;
      return [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0, canais === 4 ? (pixels[i + 3] ?? 255) : 255];
    },
  };
}
