import { createCanvas } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import '../src/servidor/canvas-node';
import { buscarFontes, garantirFonte } from '../src/servidor/googleFonts';
import { FONTES } from '../src/render/fontes';

console.log('catálogo:', (await buscarFontes('', undefined, 5000)).length, 'famílias; serifadas "playfair":', (await buscarFontes('playfair')).map((f) => f.familia));
const t0 = performance.now();
const pedidos: [string, number][] = [['Playfair Display', 700], ['Fraunces', 600], ['Space Grotesk', 500], ['Anton', 700], ['Caveat', 400]];
for (const [f, p] of pedidos) console.log(f, p, '→', await garantirFonte(f, p));
console.log(`em ${Math.round(performance.now() - t0)} ms; registro com ${FONTES.length} arquivos`);
const c = createCanvas(1200, 360);
const x = c.getContext('2d');
x.fillStyle = '#f4efe3';
x.fillRect(0, 0, 1200, 360);
x.fillStyle = '#1b1f4b';
pedidos.forEach(([f, p], i) => {
  x.font = `${p} 54px "${f}"`;
  x.fillText(`${f} ${p} — Ação & Praça`, 30, 70 + i * 64);
});
await writeFile('dados/amostras/google-fonts.png', await c.encode('png'));
