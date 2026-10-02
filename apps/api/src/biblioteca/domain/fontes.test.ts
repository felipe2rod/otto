import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { licencaDoArquivo, nomePostScript, pareceFonte, pesoMaisProximo } from './fontes';
import { situacaoDaLicenca } from './licenca-de-fonte';

const FONTES = path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/fontes');

describe('pesoMaisProximo', () => {
  it('devolve o próprio peso quando existe', () => {
    expect(pesoMaisProximo([300, 400, 700], 400)).toBe(400);
  });
  it('devolve o mais perto; no empate, o mais pesado', () => {
    expect(pesoMaisProximo([400, 700], 600)).toBe(700);
    expect(pesoMaisProximo([400, 700], 500)).toBe(400);
    expect(pesoMaisProximo([400, 600], 500)).toBe(600);
  });
  it('sem peso nenhum, undefined', () => {
    expect(pesoMaisProximo([], 400)).toBeUndefined();
  });
});

describe('nomePostScript', () => {
  it('lê o nome PostScript do próprio arquivo (é o que o Photoshop procura)', () => {
    expect(nomePostScript(readFileSync(path.join(FONTES, 'Anton-Regular.ttf')))).toBe('Anton-Regular');
    expect(nomePostScript(readFileSync(path.join(FONTES, 'IBMPlexSans-Bold.ttf')))).toBe('IBMPlexSans-Bold');
  });
  it('arquivo que não é fonte, ou cortado, devolve undefined em vez de lançar', () => {
    expect(nomePostScript(Buffer.from('não sou uma fonte'))).toBeUndefined();
    expect(nomePostScript(Buffer.alloc(0))).toBeUndefined();
    expect(nomePostScript(readFileSync(path.join(FONTES, 'Anton-Regular.ttf')).subarray(0, 40))).toBeUndefined();
  });
});

describe('licença e formato lidos do próprio arquivo', () => {
  const ANTON = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../../../../../packages/render/recursos-de-teste/fontes/Anton-Regular.ttf')));

  it('a licença sai da tabela de nomes da fonte, e é das que deixam redistribuir', () => {
    const licenca = licencaDoArquivo(ANTON);
    expect(licenca).toMatch(/Open Font License|OFL/);
    expect(situacaoDaLicenca(licenca ?? null)).toBe('permite');
  });

  it('arquivo que não é fonte não tem licença nem passa por fonte', () => {
    expect(licencaDoArquivo(new TextEncoder().encode('<html>não sou fonte</html>'))).toBeUndefined();
    expect(pareceFonte(new TextEncoder().encode('<html>não sou fonte</html>'))).toBe(false);
    expect(pareceFonte(new Uint8Array(3))).toBe(false);
    expect(pareceFonte(ANTON)).toBe(true);
  });
});
