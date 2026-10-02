// A tabela em código e docs/tecnico/psd.md andam juntas (ADR 028, item 1): este teste é o "CI confere".
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODOS_DE_MESCLAGEM } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { linhaEmMarkdown, MAPEAMENTO } from './mapeamento';
import { IMPORTACAO_DO_PSD, linhaDeImportacaoEmMarkdown } from './mapeamento-de-importacao';

const DOCUMENTO = path.resolve(import.meta.dirname, '../../../docs/tecnico/psd.md');
const texto = readFileSync(DOCUMENTO, 'utf8');
/** Linhas de tabela do documento que começam por uma chave entre crases. */
const linhasDoDocumento = new Map(
  texto
    .split('\n')
    .map((linha) => [/^\| `([^`]+)` \|/.exec(linha)?.[1], linha] as const)
    .filter((par): par is [string, string] => par[0] !== undefined),
);

describe('mapeamento Otto → PSD', () => {
  it('toda linha do código está em docs/tecnico/psd.md, igual', () => {
    const divergentes = Object.entries(MAPEAMENTO)
      .filter(([chave, linha]) => linhasDoDocumento.get(chave) !== linhaEmMarkdown(chave, linha))
      .map(([chave, linha]) => `esperado em psd.md:\n${linhaEmMarkdown(chave, linha)}\nestá:\n${linhasDoDocumento.get(chave) ?? '(sem linha)'}`);
    expect(divergentes).toEqual([]);
  });

  it('toda linha com chave em docs/tecnico/psd.md existe no código', () => {
    expect([...linhasDoDocumento.keys()].filter((chave) => !(chave in MAPEAMENTO) && !(chave in IMPORTACAO_DO_PSD))).toEqual([]);
  });

  it('importação: toda linha do que só existe no PSD está em docs/tecnico/psd.md, igual', () => {
    const divergentes = Object.entries(IMPORTACAO_DO_PSD)
      .filter(([chave, linha]) => linhasDoDocumento.get(chave) !== linhaDeImportacaoEmMarkdown(chave, linha))
      .map(([chave, linha]) => `esperado em psd.md:\n${linhaDeImportacaoEmMarkdown(chave, linha)}\nestá:\n${linhasDoDocumento.get(chave) ?? '(sem linha)'}`);
    expect(divergentes).toEqual([]);
  });

  it('importação: todo recurso que não é bloqueado diz como volta de um PSD, e o bloqueado não diz', () => {
    for (const [chave, linha] of Object.entries(MAPEAMENTO)) {
      if (linha.destino === 'Bloqueado') expect(linha.importacao, chave).toBeUndefined();
      else expect(['Editável', 'Imagem', '—'], chave).toContain(linha.importacao?.destino);
    }
    // o que a exportação grava como pixel volta como imagem; o que grava editável volta editável
    for (const [chave, linha] of Object.entries(MAPEAMENTO)) if (linha.destino === 'Raster') expect(linha.importacao?.destino, chave).toBe('Imagem');
    for (const linha of Object.values(IMPORTACAO_DO_PSD)) expect(['Editável', 'Imagem', 'Aproximado', 'Ignorado', 'Recusado']).toContain(linha.destino);
  });

  it('não há chave repetida no documento', () => {
    const chaves = texto.split('\n').flatMap((linha) => /^\| `([^`]+)` \|/.exec(linha)?.[1] ?? []);
    expect(chaves.length).toBe(new Set(chaves).size);
  });

  it('todo modo de mesclagem do esquema tem linha, e o destino é um dos três do ADR 028', () => {
    for (const modo of MODOS_DE_MESCLAGEM) expect(MAPEAMENTO[`modo:${modo}`]?.destino).toBe('Nativo');
    for (const linha of Object.values(MAPEAMENTO)) expect(['Nativo', 'Raster', 'Bloqueado']).toContain(linha.destino);
  });

  it('toda linha que não é bloqueada tem destino vetorial (Nativo, Raster ou Omitido), e a bloqueada não tem', () => {
    for (const [chave, linha] of Object.entries(MAPEAMENTO)) {
      if (linha.destino === 'Bloqueado') expect(linha.vetorial, chave).toBeUndefined();
      else expect(['Nativo', 'Raster', 'Omitido'], chave).toContain(linha.vetorial?.destino);
    }
    // os 15 modos que o SVG e o PDF têm, mais normal e atravessar
    expect(Object.entries(MAPEAMENTO).filter(([chave, l]) => chave.startsWith('modo:') && l.vetorial?.destino === 'Nativo')).toHaveLength(17);
    // camada de ajuste: achata (decisão do Felipe, 2026-10-02). Nada mais fica de fora do arquivo vetorial
    expect(Object.entries(MAPEAMENTO).filter(([chave, l]) => chave.startsWith('ajuste:') && l.vetorial?.destino === 'Raster')).toHaveLength(9);
    expect(Object.values(MAPEAMENTO).filter((l) => l.vetorial?.destino === 'Omitido')).toEqual([]);
  });

  it('o que o Otto bloqueia não tem representação no arquivo', () => {
    for (const linha of Object.values(MAPEAMENTO)) if (linha.destino === 'Bloqueado') expect(linha.psd).toBe('—');
  });
});
