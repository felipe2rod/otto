// A imagem do documento de exemplo, desenhada no navegador: nenhuma foto de terceiro entra no
// repositório. O motor a recebe como bytes de PNG, pelo hash do conteúdo, como qualquer imagem.
// Só roda no navegador (Canvas 2D e crypto.subtle): não tem teste em jsdom.
import type { ImagemGerada } from './fonteDeExemplo';

const LARGURA = 1200;
const ALTURA = 800;

export async function gerarImagemDeExemplo(): Promise<ImagemGerada> {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('o navegador não entregou Canvas 2D para desenhar a imagem de exemplo');

  const ceu = ctx.createLinearGradient(0, 0, LARGURA, ALTURA);
  ceu.addColorStop(0, '#0f3b2c');
  ceu.addColorStop(0.55, '#2f7a5c');
  ceu.addColorStop(1, '#f4c430');
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  // discos concêntricos: detalhe fino o bastante para ver se o motor amostra bem a imagem ao dar zoom
  for (let i = 9; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(LARGURA * 0.68, ALTURA * 0.46, i * 38, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 239, 227, 0.22)' : 'rgba(255, 91, 31, 0.3)';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(15, 15, 14, 0.5)';
  ctx.lineWidth = 2;
  for (let x = -ALTURA; x < LARGURA; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, ALTURA);
    ctx.lineTo(x + ALTURA, 0);
    ctx.stroke();
  }

  const png = await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('o navegador não gerou o PNG da imagem de exemplo'))), 'image/png'));
  const bytes = await png.arrayBuffer();
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { bytes, hash: [...resumo].map((b) => b.toString(16).padStart(2, '0')).join(''), largura: LARGURA, altura: ALTURA };
}
