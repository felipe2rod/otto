// Render no servidor com o mesmo código do editor (render.ts) sobre @napi-rs/canvas (Skia).
import { createCanvas, GlobalFonts, type Image, loadImage } from '@napi-rs/canvas';
import { initializeCanvas } from 'ag-psd';
import path from 'node:path';
import { type Documento, type Prancheta, todasAsCamadas } from '../documento/esquema';
import type { MeiosDeVerificacao } from '../documento/lint';
import { FONTES } from '../render/fontes';
import { criarMedidor } from '../render/medidas';
import { type Ctx, renderizarPrancheta } from '../render/render';
import { lerArquivo } from './armazenamento';
import { garantirFontesDoDocumento } from './googleFonts';

export const PASTA_FONTES = path.resolve(import.meta.dirname, '../../fontes');
// apelido de família: arquivos como IBMPlexSans-Light declaram família própria ("IBM Plex Sans Light")
for (const f of FONTES) GlobalFonts.registerFromPath(path.join(PASTA_FONTES, f.arquivo), f.familia);
initializeCanvas(createCanvas as never);

const imagens = new Map<string, Image>();

/** Decodifica antes do render, porque o render é síncrono. */
export async function carregarImagens(doc: Documento): Promise<void> {
  // fontes do Google usadas no documento (baixa na primeira vez)
  const textos = doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos)).filter((n) => n.tipo === 'texto');
  await garantirFontesDoDocumento(textos.flatMap((t) => [{ fonte: t.fonte, peso: t.peso }, ...(t.trechos ?? []).map((x) => ({ fonte: x.fonte ?? t.fonte, peso: x.peso ?? t.peso }))]));
  // fotos e máscaras de sujeito, em qualquer nível de grupo
  const hashes = new Set(
    doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos).flatMap((n) => [...(n.tipo === 'imagem' ? [n.arquivo] : []), ...(n.mascara?.tipo === 'sujeito' ? [n.mascara.arquivo] : [])])),
  );
  await Promise.all(
    [...hashes].filter((h) => !imagens.has(h)).map(async (h) => {
      const bytes = await lerArquivo(h);
      if (bytes) imagens.set(h, await loadImage(bytes));
    }),
  );
}

export const fonteDeImagens = (hash: string) => imagens.get(hash) as unknown as CanvasImageSource | undefined;

export function novoCanvas(largura: number, altura: number) {
  return createCanvas(Math.max(1, Math.round(largura)), Math.max(1, Math.round(altura)));
}

/** Canvas fora da tela para o render (ajuste de cor, máscara em degradê). */
export const criarCanvasNode = (w: number, h: number) => novoCanvas(w, h) as unknown as HTMLCanvasElement;

export const meiosNode: MeiosDeVerificacao = {
  criarCtx: (w, h) => novoCanvas(w, h).getContext('2d') as unknown as Ctx,
  imagens: fonteDeImagens,
  criarCanvas: (w, h) => novoCanvas(w, h) as unknown as HTMLCanvasElement,
};

export async function renderizarJpeg(doc: Documento, p: Prancheta, ladoMaximo: number, regiao?: [number, number, number, number]): Promise<{ base64: string; largura: number; altura: number }> {
  await carregarImagens(doc);
  if (regiao) {
    // recorte em 1:1 (reduz só se passar do lado máximo): para conferir detalhe
    const [rx, ry, rw, rh] = regiao.map((v) => Math.round(v)) as [number, number, number, number];
    const escala = Math.min(1, ladoMaximo / Math.max(rw, rh));
    const canvas = novoCanvas(rw * escala, rh * escala);
    const ctx = canvas.getContext('2d') as unknown as Ctx;
    ctx.scale(escala, escala);
    ctx.translate(-rx, -ry);
    renderizarPrancheta(ctx, doc, p, fonteDeImagens, { criarCanvas: criarCanvasNode });
    const buf = await canvas.encode('jpeg', 90);
    return { base64: buf.toString('base64'), largura: canvas.width, altura: canvas.height };
  }
  const escala = Math.min(1, ladoMaximo / Math.max(p.largura, p.altura));
  const canvas = novoCanvas(p.largura * escala, p.altura * escala);
  renderizarPrancheta(canvas.getContext('2d') as unknown as Ctx, doc, p, fonteDeImagens, { escala, criarCanvas: criarCanvasNode });
  const buf = await canvas.encode('jpeg', 82);
  return { base64: buf.toString('base64'), largura: canvas.width, altura: canvas.height };
}

export const medidorNode = criarMedidor(novoCanvas(8, 8).getContext('2d') as unknown as Ctx);

/** Arquivo da biblioteca reduzido para o modelo ver (captura do site, foto do cliente). */
export async function previaJpeg(hash: string, ladoMaximo: number): Promise<string | undefined> {
  const bytes = await lerArquivo(hash);
  if (!bytes) return undefined;
  const img = await loadImage(bytes);
  const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
  const canvas = novoCanvas(img.width * escala, img.height * escala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return (await canvas.encode('jpeg', 80)).toString('base64');
}
