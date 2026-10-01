// Confere um PSD exportado relendo com o ag-psd: árvore de camadas, texto editável, formas, objetos inteligentes.
// Uso: tsx scripts/conferir-psd.ts arquivo.psd [saida.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { type Canvas, createCanvas } from '@napi-rs/canvas';
import { initializeCanvas, readPsd, type Layer } from 'ag-psd';

initializeCanvas(createCanvas as never);
const [arquivo, png] = process.argv.slice(2);
if (!arquivo) throw new Error('informe o .psd');
const psd = readPsd(readFileSync(arquivo));
console.log(`${arquivo}: ${psd.width}×${psd.height}, ${psd.linkedFiles?.length ?? 0} arquivo(s) embutido(s)`);
const tipo = (l: Layer) => {
  if (l.children) return 'grupo';
  if (l.text) return `texto "${l.text.text.slice(0, 26)}" (${l.text.styleRuns?.[0]?.style.font?.name ?? l.text.style?.font?.name}${l.text.styleRuns?.length ? `, ${l.text.styleRuns.length} trechos` : ''})`;
  if (l.adjustment) return `ajuste ${l.adjustment.type}`;
  const partes: string[] = [];
  if (l.placedLayer) partes.push(`objeto inteligente${l.placedLayer.filter?.list.length ? ` + filtros inteligentes (${l.placedLayer.filter.list.map((f) => f.type).join(', ')})` : ''}`);
  else if (l.vectorFill) partes.push(l.vectorFill.type === 'color' ? 'preenchimento sólido' : 'preenchimento degradê');
  else partes.push('pixel');
  if (l.vectorMask) partes.push('máscara vetorial');
  if (l.effects?.dropShadow?.length) partes.push('sombra');
  if (l.effects?.stroke?.length) partes.push('traço');
  return partes.join(' + ');
};
const mostrar = (camadas: Layer[], nivel: number) => {
  for (const l of [...camadas].reverse()) {
    const marcas = [l.clipping ? '↳recorte' : '', l.mask ? 'máscara' : '', l.blendMode && l.blendMode !== 'normal' ? l.blendMode : '', l.opacity !== undefined && l.opacity < 1 ? `${Math.round(l.opacity * 100)}%` : ''].filter(Boolean).join(' · ');
    console.log(`${'  '.repeat(nivel + 1)}${(l.name ?? '').padEnd(22 - nivel * 2)} ${tipo(l)}${marcas ? `  [${marcas}]` : ''}`);
    if (l.children) mostrar(l.children, nivel + 1);
  }
};
mostrar(psd.children ?? [], 0);
if (png && psd.canvas) writeFileSync(png, (psd.canvas as unknown as Canvas).toBuffer('image/png'));
