// Apoio dos comandos: as fontes de uma pasta, com a família e o peso lidos de cada arquivo.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { nomePostScript } from '@otto/render';
import type { FonteDaExportacao } from '../exportar';

/** Família e peso de um arquivo de fonte, lidos dele: tabela "name" (registro 16, ou 1) e OS/2 (usWeightClass). */
export function identidadeDaFonte(bytes: Uint8Array): { familia: string; peso: number } | undefined {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    let familia: string | undefined;
    let preferida: string | undefined;
    let peso: number | undefined;
    for (let i = 0; i < v.getUint16(4); i++) {
      const p = 12 + i * 16;
      const tabela = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
      const inicio = v.getUint32(p + 8);
      if (tabela === 'OS/2') peso = v.getUint16(inicio + 4);
      if (tabela !== 'name') continue;
      const textos = inicio + v.getUint16(inicio + 4);
      for (let j = 0; j < v.getUint16(inicio + 2); j++) {
        const r = inicio + 6 + j * 12;
        const id = v.getUint16(r + 6);
        if (id !== 1 && id !== 16) continue;
        const plataforma = v.getUint16(r);
        const tamanho = v.getUint16(r + 8);
        const onde = textos + v.getUint16(r + 10);
        let nome = '';
        if (plataforma === 0 || plataforma === 3) for (let k = 0; k + 1 < tamanho; k += 2) nome += String.fromCharCode(v.getUint16(onde + k));
        else for (let k = 0; k < tamanho; k++) nome += String.fromCharCode(v.getUint8(onde + k));
        if (id === 16) preferida ??= nome;
        else familia ??= nome;
      }
    }
    const nome = preferida ?? familia;
    return nome && peso ? { familia: nome, peso } : undefined;
  } catch {
    return undefined;
  }
}

/** Todas as fontes (.ttf e .otf) de uma pasta que o motor consegue identificar. Pasta que não existe: nenhuma. */
export async function fontesDaPasta(pasta: string): Promise<FonteDaExportacao[]> {
  const nomes = await readdir(pasta).catch(() => [] as string[]);
  const fontes: FonteDaExportacao[] = [];
  for (const arquivo of nomes.filter((n) => /\.(ttf|otf)$/i.test(n)).sort()) {
    const bytes = new Uint8Array(await readFile(path.join(pasta, arquivo)));
    const identidade = identidadeDaFonte(bytes);
    const postScript = nomePostScript(bytes);
    if (identidade && postScript) fontes.push({ ...identidade, bytes, arquivo, postScript });
  }
  return fontes;
}
