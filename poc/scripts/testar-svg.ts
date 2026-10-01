import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { tracarCaminho } from '../src/render/render';
import { importarSvg } from '../src/servidor/svg';

const arquivos = process.argv.slice(2);
const L = 360;
const c = createCanvas(L * arquivos.length, L);
const x = c.getContext('2d');
x.fillStyle = '#f4efe3';
x.fillRect(0, 0, c.width, c.height);
for (const [i, a] of arquivos.entries()) {
  const v = importarSvg(await readFile(a, 'utf8'));
  console.log(path.basename(a), v.moldura, `${v.caminhos.length} caminhos`, v.avisos);
  const s = Math.min((L - 40) / v.moldura[0], (L - 40) / v.moldura[1]);
  x.save();
  x.translate(i * L + (L - v.moldura[0] * s) / 2, (L - v.moldura[1] * s) / 2);
  x.scale(s, s);
  for (const cam of v.caminhos) {
    x.beginPath();
    tracarCaminho(x as never, cam.d);
    if (cam.preenchimento) {
      x.fillStyle = cam.preenchimento;
      x.fill(cam.regra === 'par-impar' ? 'evenodd' : 'nonzero');
    }
    if (cam.traco) {
      x.strokeStyle = cam.traco.cor;
      x.lineWidth = cam.traco.espessura;
      x.stroke();
    }
  }
  x.restore();
}
await writeFile('dados/amostras/svg-importados.png', await c.encode('png'));
