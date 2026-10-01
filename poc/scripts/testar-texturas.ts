import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { lerArquivo } from '../src/servidor/armazenamento';
import { texturas } from '../src/servidor/texturas';

const t0 = performance.now();
const lista = await texturas();
console.log(`${lista.length} texturas em ${Math.round(performance.now() - t0)} ms`, lista.map((t) => `${t.nome}:${t.meta.hash.slice(0, 8)}`));
const c = createCanvas(6 * 260, 260);
const x = c.getContext('2d');
for (const [i, t] of lista.entries()) x.drawImage(await loadImage((await lerArquivo(t.meta.hash))!), 0, 0, 800, 800, i * 260, 0, 260, 260);
await writeFile('dados/amostras/texturas.png', await c.encode('png'));
