// Biblioteca de texturas do Otto: geradas aqui, determinísticas e sem licença de terceiros.
// Cada uma vem com o modo de mesclagem e a opacidade com que costuma ser usada.
import { createCanvas } from '@napi-rs/canvas';
import type { ModoDeMesclagem } from '../documento/esquema';
import { adicionarRuido, desfoqueGaussiano } from '../render/pixel';
import { guardarArquivo, type MetaDeArquivo } from './armazenamento';

export interface Textura {
  nome: string;
  descricao: string;
  modoDeMesclagem: ModoDeMesclagem;
  opacidade: number;
  meta: MetaDeArquivo;
}

const LADO = 1600;

function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruído de baixa frequência: pontos aleatórios numa grade pequena, ampliados e desfocados. */
function manchas(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, escala: number, forca: number, semente: number): void {
  const n = Math.ceil(LADO / escala);
  const pequeno = createCanvas(n, n);
  const pc = pequeno.getContext('2d');
  const img = pc.createImageData(n, n);
  const r = aleatorio(semente);
  for (let i = 0; i < n * n; i++) {
    const v = 128 + (r() - 0.5) * 2 * forca;
    img.data.set([v, v, v, 255], i * 4);
  }
  pc.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(pequeno, 0, 0, LADO, LADO);
  ctx.restore();
}

function gerar(nome: string): Buffer | Promise<Buffer> {
  const c = createCanvas(LADO, LADO);
  const x = c.getContext('2d');
  const r = aleatorio([...nome].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const pixels = (f: (d: Uint8ClampedArray) => void) => {
    const img = x.getImageData(0, 0, LADO, LADO);
    f(img.data);
    x.putImageData(img, 0, 0);
  };
  switch (nome) {
    case 'papel': {
      x.fillStyle = '#ecebe6';
      x.fillRect(0, 0, LADO, LADO);
      manchas(x, 80, 18, 3);
      manchas(x, 12, 10, 4);
      // fibras curtas, claras e escuras
      for (let i = 0; i < 9000; i++) {
        const px = r() * LADO;
        const py = r() * LADO;
        const a = r() * Math.PI;
        const l = 4 + r() * 18;
        x.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(90,85,75,0.18)';
        x.lineWidth = 0.6 + r() * 0.8;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
        x.stroke();
      }
      pixels((d) => adicionarRuido(d, 0.04, true, 11));
      break;
    }
    case 'papel-amassado': {
      x.fillStyle = '#e9e7e1';
      x.fillRect(0, 0, LADO, LADO);
      manchas(x, 220, 60, 5);
      manchas(x, 60, 30, 6);
      // vincos: faixa clara ao lado de faixa escura, desfocadas
      for (let i = 0; i < 26; i++) {
        const x0 = r() * LADO;
        const y0 = r() * LADO;
        const a = r() * Math.PI;
        const l = 300 + r() * 900;
        for (const [cor, off] of [['rgba(255,255,255,0.55)', -1.5], ['rgba(60,55,45,0.35)', 1.5]] as const) {
          x.strokeStyle = cor;
          x.lineWidth = 2 + r() * 2;
          x.beginPath();
          x.moveTo(x0 + off, y0 + off);
          x.lineTo(x0 + Math.cos(a) * l + off, y0 + Math.sin(a) * l + off);
          x.stroke();
        }
      }
      pixels((d) => desfoqueGaussiano(d, LADO, LADO, 2.2));
      pixels((d) => adicionarRuido(d, 0.03, true, 12));
      break;
    }
    case 'reticula': {
      // meio-tom a 45°, tamanho do ponto variando com uma mancha suave
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, LADO, LADO);
      const passo = 14;
      x.fillStyle = '#000000';
      x.save();
      x.translate(LADO / 2, LADO / 2);
      x.rotate(Math.PI / 4);
      for (let gy = -LADO; gy < LADO; gy += passo) {
        for (let gx = -LADO; gx < LADO; gx += passo) {
          const t = 0.5 + 0.5 * Math.sin(gx / 260 + 1.3) * Math.cos(gy / 330);
          x.beginPath();
          x.arc(gx, gy, (passo / 2) * (0.25 + 0.7 * t), 0, Math.PI * 2);
          x.fill();
        }
      }
      x.restore();
      break;
    }
    case 'grao-de-filme': {
      x.fillStyle = '#808080';
      x.fillRect(0, 0, LADO, LADO);
      pixels((d) => adicionarRuido(d, 0.22, true, 21));
      pixels((d) => desfoqueGaussiano(d, LADO, LADO, 0.6));
      break;
    }
    case 'poeira-e-arranhoes': {
      x.fillStyle = '#000000';
      x.fillRect(0, 0, LADO, LADO);
      for (let i = 0; i < 1400; i++) {
        x.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`;
        x.beginPath();
        x.arc(r() * LADO, r() * LADO, 0.5 + r() ** 3 * 4, 0, Math.PI * 2);
        x.fill();
      }
      for (let i = 0; i < 60; i++) {
        const x0 = r() * LADO;
        const y0 = r() * LADO;
        x.strokeStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`;
        x.lineWidth = 0.6 + r();
        x.beginPath();
        x.moveTo(x0, y0);
        x.bezierCurveTo(x0 + (r() - 0.5) * 200, y0 + r() * 200, x0 + (r() - 0.5) * 300, y0 + r() * 400, x0 + (r() - 0.5) * 100, y0 + 150 + r() * 500);
        x.stroke();
      }
      break;
    }
    case 'concreto': {
      x.fillStyle = '#9a9893';
      x.fillRect(0, 0, LADO, LADO);
      manchas(x, 300, 40, 31);
      manchas(x, 70, 30, 32);
      manchas(x, 14, 24, 33);
      // poros
      for (let i = 0; i < 5000; i++) {
        x.fillStyle = `rgba(40,38,35,${0.2 + r() * 0.4})`;
        x.beginPath();
        x.arc(r() * LADO, r() * LADO, 0.5 + r() ** 4 * 3, 0, Math.PI * 2);
        x.fill();
      }
      pixels((d) => adicionarRuido(d, 0.05, true, 34));
      break;
    }
  }
  return c.encode('jpeg', 90);
}

const CATALOGO: Omit<Textura, 'meta'>[] = [
  { nome: 'papel', descricao: 'papel de algodão com fibras; dá cara de impresso', modoDeMesclagem: 'multiplicacao', opacidade: 0.6 },
  { nome: 'papel-amassado', descricao: 'papel amassado com vincos; editorial, artesanal, retrô', modoDeMesclagem: 'multiplicacao', opacidade: 0.5 },
  { nome: 'reticula', descricao: 'meio-tom de impressão a 45°; pop, cartaz, quadrinho', modoDeMesclagem: 'sobrepor', opacidade: 0.25 },
  { nome: 'grao-de-filme', descricao: 'grão fino de filme; une foto e tipografia', modoDeMesclagem: 'sobrepor', opacidade: 0.4 },
  { nome: 'poeira-e-arranhoes', descricao: 'poeira e riscos claros; analógico, vintage, música', modoDeMesclagem: 'tela', opacidade: 0.35 },
  { nome: 'concreto', descricao: 'concreto com poros; urbano, arquitetura, esporte', modoDeMesclagem: 'multiplicacao', opacidade: 0.45 },
];

let pronto: Promise<Textura[]> | undefined;

/** Gera (na primeira vez) e devolve a biblioteca. O conteúdo é determinístico: o hash não muda entre execuções. */
export function texturas(): Promise<Textura[]> {
  pronto ??= Promise.all(
    CATALOGO.map(async (t) => {
      const bytes = await gerar(t.nome);
      const meta = await guardarArquivo(bytes, { tipo: 'image/jpeg', largura: LADO, altura: LADO, origem: { banco: 'Texturas do Otto', autor: 'Otto', licenca: 'livre para uso nas peças', url: '' } });
      return { ...t, meta };
    }),
  );
  return pronto;
}
