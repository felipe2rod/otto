import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lerContaId } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { EscopoDaConta } from '../../../../plataforma/escopo/escopo-da-conta';
import { contratoDoArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo.contrato';
import { chaveDeArquivoDaConta } from '../../../application/chave-de-objeto';
import { ArmazenamentoEmDiscoLocal } from './armazenamento-em-disco-local';

contratoDoArmazenamentoDeArquivo('disco local', async () => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'otto-armazenamento-'));
  return {
    armazenamento: new ArmazenamentoEmDiscoLocal(pasta),
    limpar: () => rm(pasta, { recursive: true, force: true }),
  };
});

describe('ArmazenamentoEmDiscoLocal', () => {
  it('não responde quando a pasta não existe nem pode ser criada', async () => {
    // um arquivo no lugar onde deveria haver uma pasta
    const base = await mkdtemp(path.join(tmpdir(), 'otto-armazenamento-'));
    try {
      await writeFile(path.join(base, 'arquivo'), '');
      expect(await new ArmazenamentoEmDiscoLocal(path.join(base, 'arquivo', 'pasta')).responde()).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('não deixa arquivo temporário para trás depois de gravar', async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), 'otto-armazenamento-'));
    try {
      const escopo = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
      const chave = chaveDeArquivoDaConta(escopo, 'c'.repeat(64));
      await new ArmazenamentoEmDiscoLocal(pasta).guardar(escopo, chave, new Uint8Array([1, 2]), 'image/png');
      expect(await readdir(path.join(pasta, path.dirname(chave)))).toEqual(['c'.repeat(64)]);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});
