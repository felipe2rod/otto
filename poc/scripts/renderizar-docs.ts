// Renderiza toda prancheta de todo documento salvo em dados/amostras/, em resolução cheia.
// Uso: tsx scripts/renderizar-docs.ts [filtro-no-nome]
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Registro } from '../src/servidor/armazenamento';
import { carregarImagens, criarCanvasNode, fonteDeImagens, novoCanvas } from '../src/servidor/canvas-node';
import { type Ctx, renderizarPrancheta } from '../src/render/render';

const DADOS = path.resolve(import.meta.dirname, '../dados');
const SAIDA = path.join(DADOS, 'amostras');
await mkdir(SAIDA, { recursive: true });
const filtro = process.argv[2]?.toLowerCase();

for (const arquivo of await readdir(path.join(DADOS, 'documentos'))) {
  const r = JSON.parse(await readFile(path.join(DADOS, 'documentos', arquivo), 'utf8')) as Registro;
  if (filtro && !r.doc.nome.toLowerCase().includes(filtro)) continue;
  await carregarImagens(r.doc);
  for (const p of r.doc.pranchetas) {
    const canvas = novoCanvas(p.largura, p.altura);
    renderizarPrancheta(canvas.getContext('2d') as unknown as Ctx, r.doc, p, fonteDeImagens, { criarCanvas: criarCanvasNode });
    const nome = `${r.doc.nome}-${p.nome}`.replace(/[^\p{L}\p{N}()-]+/gu, '_');
    await writeFile(path.join(SAIDA, `${nome}.png`), await canvas.encode('png'));
    console.log(`${nome}.png`);
  }
}
