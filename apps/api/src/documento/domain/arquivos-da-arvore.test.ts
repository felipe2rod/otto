import { Documento } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { arquivosDaArvore } from './arquivos-da-arvore';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

const imagem = (id: string, arquivo: string, extra: object = {}) => ({ id, nome: id, tipo: 'imagem', x: 0, y: 0, largura: 10, altura: 10, arquivo, larguraOriginal: 10, alturaOriginal: 10, ...extra });

describe('arquivosDaArvore', () => {
  it('documento vazio não cita arquivo', () => {
    expect(arquivosDaArvore(Documento.parse({ versaoDoFormato: 1, tokens: { cores: {} }, pranchetas: [] }))).toEqual(new Set());
  });

  it('acha imagem solta, imagem dentro de grupo e máscara de sujeito, sem repetir', () => {
    const doc = Documento.parse({
      versaoDoFormato: 1,
      tokens: { cores: {} },
      pranchetas: [
        {
          id: 'p1',
          nome: 'Feed',
          tipo: 'prancheta',
          largura: 100,
          altura: 100,
          fundo: '#ffffff',
          filhos: [imagem('i1', A), { id: 'g', nome: 'grupo', tipo: 'grupo', filhos: [imagem('i2', B, { mascara: { tipo: 'sujeito', arquivo: C } }), imagem('i3', A)] }],
        },
      ],
    });
    expect(arquivosDaArvore(doc)).toEqual(new Set([A, B, C]));
  });
});
