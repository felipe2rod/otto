import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BibliotecaDeFontesEmMemoria } from '../infrastructure/memoria/biblioteca-de-fontes-em-memoria';
import { semearFontes } from './semear-fontes';

const FONTES = path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/fontes');
let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), 'otto-fontes-'));
  await writeFile(path.join(pasta, 'Anton-Regular.ttf'), await readFile(path.join(FONTES, 'Anton-Regular.ttf')));
  await writeFile(path.join(pasta, 'IBMPlexSans-Bold.ttf'), await readFile(path.join(FONTES, 'IBMPlexSans-Bold.ttf')));
});
afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const indice = (fontes: object[]) => writeFile(path.join(pasta, 'indice.json'), JSON.stringify({ licenca: 'de teste', fontes }));

describe('semearFontes', () => {
  it('registra cada fonte do índice, com o nome PostScript lido do arquivo', async () => {
    await indice([
      { familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf' },
      { familia: 'IBM Plex Sans', peso: 700, arquivo: 'IBMPlexSans-Bold.ttf' },
    ]);
    const biblioteca = new BibliotecaDeFontesEmMemoria();
    expect(await semearFontes(biblioteca, pasta)).toEqual({ registradas: 2, problemas: [] });
    expect((await biblioteca.pesosDa('Anton'))[0]).toMatchObject({ peso: 400, nomePostScript: 'Anton-Regular' });
    expect((await biblioteca.pesosDa('IBM Plex Sans'))[0]).toMatchObject({ peso: 700, nomePostScript: 'IBMPlexSans-Bold' });
  });

  it('rodar duas vezes não duplica', async () => {
    await indice([{ familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf' }]);
    const biblioteca = new BibliotecaDeFontesEmMemoria();
    await semearFontes(biblioteca, pasta);
    await semearFontes(biblioteca, pasta);
    expect(await biblioteca.listar()).toEqual([{ familia: 'Anton', pesos: [400] }]);
  });

  it('arquivo que falta ou que não é fonte vira problema relatado; as outras entram', async () => {
    await writeFile(path.join(pasta, 'nao-e-fonte.ttf'), 'texto qualquer');
    await indice([
      { familia: 'Sumida', peso: 400, arquivo: 'sumida.ttf' },
      { familia: 'Falsa', peso: 400, arquivo: 'nao-e-fonte.ttf' },
      { familia: 'Anton', peso: 400, arquivo: 'Anton-Regular.ttf' },
    ]);
    const biblioteca = new BibliotecaDeFontesEmMemoria();
    const r = await semearFontes(biblioteca, pasta);
    expect(r.registradas).toBe(1);
    expect(r.problemas.map((p) => p.arquivo)).toEqual(['sumida.ttf', 'nao-e-fonte.ttf']);
  });

  it('índice que aponta para fora da pasta é recusado', async () => {
    await indice([{ familia: 'Fora', peso: 400, arquivo: '../../etc/passwd' }]);
    const r = await semearFontes(new BibliotecaDeFontesEmMemoria(), pasta);
    expect(r).toMatchObject({ registradas: 0 });
    expect(r.problemas).toHaveLength(1);
  });
});
