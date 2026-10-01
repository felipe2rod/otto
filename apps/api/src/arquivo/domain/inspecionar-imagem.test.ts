// Tipo pelo conteúdo e medidas pelo cabeçalho, SEM decodificar (docs/mvp/backend.md, seção 10).
// Decodificar é trabalho do worker; a API só lê os primeiros bytes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspecionarImagem } from './inspecionar-imagem';

const RECURSOS = path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/imagens');

function png(largura: number, altura: number): Uint8Array {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(largura, 16);
  b.writeUInt32BE(altura, 20);
  return b;
}

function webp(tipo: 'VP8X' | 'VP8L' | 'VP8 ', largura: number, altura: number): Uint8Array {
  const b = Buffer.alloc(40);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(32, 4);
  b.write('WEBP', 8, 'latin1');
  b.write(tipo, 12, 'latin1');
  if (tipo === 'VP8X') {
    b.writeUIntLE(largura - 1, 24, 3);
    b.writeUIntLE(altura - 1, 27, 3);
  } else if (tipo === 'VP8L') {
    b[20] = 0x2f;
    b.writeUInt32LE(((altura - 1) << 14) | (largura - 1), 21);
  } else {
    Buffer.from([0x9d, 0x01, 0x2a]).copy(b, 23);
    b.writeUInt16LE(largura, 26);
    b.writeUInt16LE(altura, 28);
  }
  return b;
}

describe('inspecionarImagem', () => {
  it('lê um JPEG de verdade', () => {
    const r = inspecionarImagem(readFileSync(path.join(RECURSOS, 'foto-paisagem.jpg')));
    expect(r).toMatchObject({ ok: true, tipo: 'image/jpeg' });
    if (r.ok) expect(r.largura > 0 && r.altura > 0).toBe(true);
  });

  it('lê um PNG de verdade', () => {
    expect(inspecionarImagem(readFileSync(path.join(RECURSOS, 'recorte-com-alfa.png')))).toMatchObject({ ok: true, tipo: 'image/png' });
  });

  it('lê as medidas do cabeçalho do PNG, mesmo quando o arquivo declara uma imagem gigante em poucos bytes', () => {
    expect(inspecionarImagem(png(50_000, 40_000))).toEqual({ ok: true, tipo: 'image/png', largura: 50_000, altura: 40_000 });
  });

  it('lê WebP nas três formas do contêiner', () => {
    expect(inspecionarImagem(webp('VP8X', 4000, 3000))).toEqual({ ok: true, tipo: 'image/webp', largura: 4000, altura: 3000 });
    expect(inspecionarImagem(webp('VP8L', 800, 600))).toEqual({ ok: true, tipo: 'image/webp', largura: 800, altura: 600 });
    expect(inspecionarImagem(webp('VP8 ', 640, 480))).toEqual({ ok: true, tipo: 'image/webp', largura: 640, altura: 480 });
  });

  it('o tipo vem do conteúdo: texto, SVG, GIF e PDF não são aceitos', () => {
    for (const conteudo of ['<svg xmlns="http://www.w3.org/2000/svg"/>', 'GIF89a\x01\x00\x01\x00', '%PDF-1.7', 'só texto', '']) {
      expect(inspecionarImagem(Buffer.from(conteudo, 'latin1')), conteudo).toEqual({ ok: false, motivo: 'tipo_nao_aceito' });
    }
  });

  it('assinatura de imagem com cabeçalho cortado ou zerado é ilegível', () => {
    expect(inspecionarImagem(png(10, 10).subarray(0, 18))).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
    expect(inspecionarImagem(png(0, 10))).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
    expect(inspecionarImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]))).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
    expect(inspecionarImagem(webp('VP8X', 10, 10).subarray(0, 20))).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
  });

  it('JPEG com segmento de tamanho mentiroso não trava nem lê fora do arquivo', () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00, 0x00, 0xff, 0xc0]);
    expect(inspecionarImagem(b)).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
    const zero = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0xff, 0xe1, 0x00, 0x00]);
    expect(inspecionarImagem(zero)).toEqual({ ok: false, motivo: 'imagem_ilegivel' });
  });
});
