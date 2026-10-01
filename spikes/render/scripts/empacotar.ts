// Empacota as páginas do spike. O CanvasKit NÃO entra no pacote: as páginas só importam os tipos dele,
// e o JavaScript e o WebAssembly do motor são buscados em tempo de execução (ADR 019).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { RAIZ } from '../src/node/carregar.ts';

const saida = path.join(RAIZ, 'publico/pacote');
const r = await build({
  entryPoints: [path.join(RAIZ, 'src/web/paridade.ts'), path.join(RAIZ, 'src/web/bancada.ts')],
  outdir: saida,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  metafile: true,
  logLevel: 'warning',
});
for (const [arquivo, info] of Object.entries(r.metafile.outputs)) {
  if (arquivo.endsWith('.map')) continue;
  const texto = await readFile(path.resolve(arquivo), 'utf8');
  // prova do ADR 019 no spike: nada do motor dentro do pacote da página
  const temMotor = /canvaskit\.wasm"|WebAssembly\.instantiate|_emscripten/.test(texto);
  console.log(path.basename(arquivo).padEnd(16), `${(info.bytes / 1024).toFixed(1)} kB`, temMotor ? 'CONTÉM código do motor' : 'sem código do motor');
}
