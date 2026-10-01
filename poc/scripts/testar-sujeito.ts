import { writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { lerArquivo } from '../src/servidor/armazenamento';
import { detectarSujeito } from '../src/servidor/sujeito';

const hash = process.argv[2]!;
const t0 = performance.now();
const s = await detectarSujeito(hash);
console.log(`sujeito em ${Math.round(performance.now() - t0)} ms`, s);
const foto = await loadImage((await lerArquivo(hash))!);
const mascara = await loadImage((await lerArquivo(s.arquivo))!);
// prova visual: sujeito sobre fundo magenta
const c = createCanvas(foto.width, foto.height);
const x = c.getContext('2d');
x.drawImage(mascara, 0, 0);
x.globalCompositeOperation = 'source-in';
x.drawImage(foto, 0, 0);
x.globalCompositeOperation = 'destination-over';
x.fillStyle = '#d0237a';
x.fillRect(0, 0, foto.width, foto.height);
await writeFile(`dados/amostras/sujeito-${hash.slice(0, 8)}.png`, await c.encode('png'));
