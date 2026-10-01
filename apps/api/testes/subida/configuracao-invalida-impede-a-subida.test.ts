// Configuração inválida impede a subida: o processo sai com erro antes de abrir porta,
// e diz qual variável falta sem imprimir valor de nenhuma (docs/mvp/backend.md, seção 5.5).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ_DA_API = path.resolve(import.meta.dirname, '../..');

function subir(entrada: 'src/main.ts' | 'src/worker.ts', env: Record<string, string>) {
  return spawnSync('pnpm', ['exec', 'tsx', entrada], {
    cwd: RAIZ_DA_API,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', COREPACK_HOME: process.env.COREPACK_HOME ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe.each(['src/main.ts', 'src/worker.ts'] as const)('%s', (entrada) => {
  it('sem configuração nenhuma: sai com código diferente de zero e lista o que falta', () => {
    const r = subir(entrada, {});
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BANCO_URL_APP');
    expect(r.stderr).toContain('CONTA_FIXA_ID');
  });

  it('com valor inválido: sai com erro e não imprime o valor', () => {
    const r = subir(entrada, {
      AMBIENTE: 'teste',
      BANCO_URL_APP: 'http://usuario:senha-super-secreta@host/base',
      CONTA_FIXA_ID: '01990000-0000-7000-8000-000000000001',
      ARMAZENAMENTO_ADAPTADOR: 'disco-local',
      ARMAZENAMENTO_PASTA: '/tmp/x',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('BANCO_URL_APP');
    expect(`${r.stdout}${r.stderr}`).not.toContain('senha-super-secreta');
  });
});
