// Mede texto com as fontes reais do Otto. Uso: tsx scripts/medir-texto.ts '<json: [{fonte,peso,tamanho,espacamento,texto}]>'
import { createCanvas } from '@napi-rs/canvas';
import '../src/servidor/canvas-node';
import { fonteCss } from '../src/render/render';

const ctx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D & { letterSpacing: string };
for (const t of JSON.parse(process.argv[2] ?? '[]') as { fonte: string; peso?: number; tamanho: number; espacamento?: number; texto: string }[]) {
  ctx.font = fonteCss({ fonte: t.fonte, peso: (t.peso ?? 400) as 400, tamanho: t.tamanho });
  ctx.letterSpacing = `${((t.espacamento ?? 0) / 1000) * t.tamanho}px`;
  const m = ctx.measureText(t.texto);
  console.log(JSON.stringify({ texto: t.texto, largura: Math.round(m.width), tintaEsq: Math.round(m.actualBoundingBoxLeft), tintaDir: Math.round(m.actualBoundingBoxRight), ascTinta: Math.round(m.actualBoundingBoxAscent), descTinta: Math.round(m.actualBoundingBoxDescent), ascFonte: Math.round(m.fontBoundingBoxAscent), descFonte: Math.round(m.fontBoundingBoxDescent) }));
}
