// Gera as imagens de teste do spike com o próprio motor. Rodar uma vez; a saída fica versionada em recursos/.
// São sintéticas de propósito: nenhuma foto de banco nem de cliente entra no repositório.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanvasKit } from 'canvaskit-wasm';
import { carregarCanvasKit, PASTA_IMAGENS } from '../src/node/carregar.ts';

function paisagem(ck: CanvasKit, largura: number, altura: number, semente: number): Uint8Array {
  const s = ck.MakeSurface(largura, altura)!;
  const c = s.getCanvas();
  const p = new ck.Paint();
  p.setAntiAlias(true);
  // céu
  const ceu = ck.Shader.MakeLinearGradient([0, 0], [0, altura], [ck.Color(24, 44, 92, 1), ck.Color(226, 122, 63, 1), ck.Color(248, 214, 150, 1)], [0, 0.62, 1], ck.TileMode.Clamp);
  p.setShader(ceu);
  c.drawPaint(p);
  // textura de nuvem e de grão: é o que dá à imagem a entropia de uma foto
  const ruido = ck.Shader.MakeFractalNoise(0.004, 0.009, 5, semente, 0, 0);
  p.setShader(ruido);
  p.setBlendMode(ck.BlendMode.SoftLight);
  c.drawPaint(p);
  const grao = ck.Shader.MakeTurbulence(0.6, 0.6, 2, semente + 7, 0, 0);
  p.setShader(grao);
  p.setAlphaf(0.18);
  p.setBlendMode(ck.BlendMode.Overlay);
  c.drawPaint(p);
  p.setShader(null);
  p.setAlphaf(1);
  p.setBlendMode(ck.BlendMode.SrcOver);
  // sol
  const sol = ck.Shader.MakeRadialGradient([largura * 0.68, altura * 0.58], altura * 0.22, [ck.Color(255, 244, 200, 1), ck.Color(255, 190, 90, 0.6), ck.Color(255, 160, 60, 0)], [0, 0.4, 1], ck.TileMode.Clamp);
  p.setShader(sol);
  c.drawPaint(p);
  p.setShader(null);
  // serras em três planos
  const tons: [number, number, number][] = [[70, 62, 96], [44, 40, 70], [20, 20, 38]];
  tons.forEach(([r, g, b], k) => {
    const serra = new ck.PathBuilder();
    const base = altura * (0.62 + k * 0.1);
    serra.moveTo(0, altura);
    serra.lineTo(0, base);
    const passos = 9 + k * 3;
    for (let i = 1; i <= passos; i++) {
      const x = (largura * i) / passos;
      const y = base - Math.abs(Math.sin(i * (1.7 + k) + semente)) * altura * (0.16 - k * 0.04);
      serra.quadTo(x - largura / passos / 2, y - altura * 0.05, x, base - Math.abs(Math.cos(i * 2.3 + k)) * altura * 0.05);
    }
    serra.lineTo(largura, altura);
    serra.close();
    const caminho = serra.detachAndDelete();
    p.setColor(ck.Color(r, g, b, 1));
    c.drawPath(caminho, p);
    caminho.delete();
  });
  const img = s.makeImageSnapshot();
  const bytes = img.encodeToBytes(ck.ImageFormat.JPEG, 88)!;
  for (const o of [ceu, ruido, grao, sol, p, img, s]) o.delete();
  return bytes;
}

function recorteComAlfa(ck: CanvasKit): Uint8Array {
  const s = ck.MakeSurface(600, 800)!;
  const c = s.getCanvas();
  c.clear(ck.TRANSPARENT);
  const p = new ck.Paint();
  p.setAntiAlias(true);
  const corpo = ck.Shader.MakeLinearGradient([150, 80], [450, 760], [ck.Color(240, 196, 90, 1), ck.Color(196, 86, 44, 1), ck.Color(92, 34, 60, 1)], [0, 0.55, 1], ck.TileMode.Clamp);
  p.setShader(corpo);
  // silhueta orgânica com borda suave: testa imagem com alfa parcial
  const borda = ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, 3, true);
  p.setMaskFilter(borda);
  c.drawOval(ck.XYWHRect(170, 60, 260, 300), p);
  c.drawRRect(ck.RRectXY(ck.XYWHRect(90, 300, 420, 470), 150, 170), p);
  p.setMaskFilter(null);
  const brilho = ck.Shader.MakeTurbulence(0.02, 0.03, 3, 3, 0, 0);
  p.setShader(brilho);
  p.setBlendMode(ck.BlendMode.SrcATop);
  p.setAlphaf(0.35);
  c.drawPaint(p);
  const img = s.makeImageSnapshot();
  const bytes = img.encodeToBytes(ck.ImageFormat.PNG, 100)!;
  for (const o of [corpo, borda, brilho, p, img, s]) o.delete();
  return bytes;
}

// a variante padrão do CanvasKit não codifica JPEG; a completa codifica
const ck = await carregarCanvasKit('completa');
const arquivos: [string, Uint8Array][] = [
  ['foto-paisagem.jpg', paisagem(ck, 1280, 853, 11)],
  ['foto-retrato.jpg', paisagem(ck, 853, 1280, 29)],
  ['recorte-com-alfa.png', recorteComAlfa(ck)],
];
for (const [nome, bytes] of arquivos) {
  await writeFile(path.join(PASTA_IMAGENS, nome), bytes);
  console.log(nome, bytes.length, 'bytes');
}
