// Antes dos testes: aplica as migrações na base de teste, com o papel migrador.
// É o mesmo comando do serviço "migracao" do compose, apontado para otto_teste.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { urlDoMigradorDeTeste } from './conexoes';

export default function prepararBancoDeTeste(): void {
  const r = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, BANCO_URL_MIGRADOR: urlDoMigradorDeTeste() },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`não consegui migrar a base de teste:\n${r.stdout}\n${r.stderr}`);
}
