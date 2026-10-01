// Empacota a API e o worker para produção: um arquivo por ponto de entrada.
// O código do app e os pacotes do workspace (@otto/*, consumidos pelo código-fonte TypeScript)
// entram no arquivo. Toda dependência de terceiro fica de fora e vem de node_modules na imagem:
// assim nada com binário nativo, com arquivo .wasm ao lado ou com import opcional é reescrito.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const raiz = path.resolve(import.meta.dirname, '..');
const manifesto = JSON.parse(readFileSync(path.join(raiz, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
const deTerceiros = Object.keys(manifesto.dependencies).filter((nome) => !nome.startsWith('@otto/'));

await build({
  absWorkingDir: raiz,
  // main e worker são os processos; semear-biblioteca é o comando que roda depois da migração
  entryPoints: { main: 'src/main.ts', worker: 'src/worker.ts', 'semear-biblioteca': 'src/comandos/semear-biblioteca.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: 'linked',
  external: deTerceiros.flatMap((nome) => [nome, `${nome}/*`]),
  tsconfig: 'tsconfig.json',
  logLevel: 'info',
});
