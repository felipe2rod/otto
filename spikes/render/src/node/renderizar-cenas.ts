// Renderiza as cenas de paridade no Node e grava os pixels crus (para comparar) e um PNG (para olhar).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cenasDeParidade } from '../cenas/cenas.ts';
import { renderizarPrancheta } from '../motor/compositor.ts';
import { criarSessao, MOTOR } from '../motor/sessao.ts';
import { canvasKit, carregarFontes, carregarImagens, RAIZ } from './carregar.ts';

const pasta = path.join(RAIZ, 'saida/node');
await mkdir(pasta, { recursive: true });
const ck = await canvasKit();
const sessao = criarSessao(ck, { fontes: await carregarFontes(), imagens: await carregarImagens() });
const tempos: Record<string, { largura: number; altura: number; ms: number }> = {};
for (const cena of cenasDeParidade()) {
  const t0 = performance.now();
  const r = renderizarPrancheta(sessao, cena.prancheta);
  const ms = performance.now() - t0;
  tempos[cena.nome] = { largura: r.largura, altura: r.altura, ms: Math.round(ms * 10) / 10 };
  await writeFile(path.join(pasta, `${cena.nome}.rgba`), r.rgba);
  const img = ck.MakeImage({ width: r.largura, height: r.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }, r.rgba, r.largura * 4)!;
  await writeFile(path.join(pasta, `${cena.nome}.png`), img.encodeToBytes(ck.ImageFormat.PNG, 100)!);
  img.delete();
  console.log(cena.nome.padEnd(20), `${r.largura} × ${r.altura}`.padEnd(12), `${ms.toFixed(1)} ms`);
}
await writeFile(path.join(pasta, 'fim.json'), JSON.stringify({ motor: MOTOR, node: process.version, cenas: tempos }, null, 2));
sessao.destruir();
