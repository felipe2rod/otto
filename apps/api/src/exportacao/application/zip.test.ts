// O .zip do pacote de exportação, conferido por um leitor independente (fflate), não pelo nosso código.
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { montarZip } from './zip';

const texto = (s: string) => new TextEncoder().encode(s);
const QUANDO = new Date('2026-10-02T15:30:10.000Z');

describe('montarZip', () => {
  it('guarda cada arquivo com o nome e os bytes exatos, inclusive nome com acento, espaço e pasta', () => {
    const binario = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) % 251);
    const zip = montarZip(
      [
        { nome: 'Promoção de verão - Feed.psd', bytes: binario },
        { nome: 'Fontes/Anton-Regular.ttf', bytes: Uint8Array.from([0, 1, 0, 0, 9]) },
        { nome: 'Relatório de exportação.md', bytes: texto('# Relatório\n') },
        { nome: 'vazio.txt', bytes: new Uint8Array() },
      ],
      QUANDO,
    );
    const lido = unzipSync(zip);
    expect(Object.keys(lido)).toEqual(['Promoção de verão - Feed.psd', 'Fontes/Anton-Regular.ttf', 'Relatório de exportação.md', 'vazio.txt']);
    expect(Buffer.from(lido['Promoção de verão - Feed.psd'] as Uint8Array).equals(Buffer.from(binario))).toBe(true);
    expect(Array.from(lido['Fontes/Anton-Regular.ttf'] as Uint8Array)).toEqual([0, 1, 0, 0, 9]);
    expect(new TextDecoder().decode(lido['Relatório de exportação.md'])).toBe('# Relatório\n');
    expect(lido['vazio.txt']).toHaveLength(0);
  });

  it('diz-se feito no Unix, com permissão de arquivo comum: é o que faz o unzip do Linux ler o nome com acento e extrair com permissão', () => {
    const zip = Buffer.from(montarZip([{ nome: 'Praça.txt', bytes: texto('x') }], QUANDO));
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(zip.readUInt16LE(central + 4) >> 8).toBe(3);
    expect((zip.readUInt32LE(central + 38) >>> 16).toString(8)).toBe('100644');
    // e o nome vai marcado como UTF-8, nos dois cabeçalhos
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.readUInt16LE(central + 8) & 0x0800).toBe(0x0800);
  });

  it('comprime o que comprime, e é determinístico: mesma entrada, mesmos bytes', () => {
    const repetitivo = new Uint8Array(200_000).fill(7);
    const um = montarZip([{ nome: 'a.bin', bytes: repetitivo }], QUANDO);
    const dois = montarZip([{ nome: 'a.bin', bytes: repetitivo }], QUANDO);
    expect(um.byteLength).toBeLessThan(5_000);
    expect(Buffer.from(um).equals(Buffer.from(dois))).toBe(true);
    // assinatura de arquivo local no começo, fim do diretório central no fim
    expect(Buffer.from(um.subarray(0, 4)).toString('latin1')).toBe('PK\x03\x04');
    expect(Buffer.from(um.subarray(um.byteLength - 22, um.byteLength - 18)).toString('latin1')).toBe('PK\x05\x06');
  });

  it('nome que sairia da pasta ao extrair, absoluto, vazio ou repetido é recusado', () => {
    for (const nome of ['../fora.txt', 'Fontes/../../fora.ttf', '/etc/passwd', 'C:\\Windows\\x', '', 'pasta/']) {
      expect(() => montarZip([{ nome, bytes: texto('x') }], QUANDO), nome).toThrow();
    }
    expect(() =>
      montarZip(
        [
          { nome: 'a.txt', bytes: texto('1') },
          { nome: 'a.txt', bytes: texto('2') },
        ],
        QUANDO,
      ),
    ).toThrow();
  });

  it('recusa o que não cabe num .zip sem a extensão de 64 bits', () => {
    const grande = { byteLength: 0xffff_ffff + 1 } as Uint8Array;
    expect(() => montarZip([{ nome: 'enorme.psb', bytes: grande }], QUANDO)).toThrow(/grande demais/);
  });
});
