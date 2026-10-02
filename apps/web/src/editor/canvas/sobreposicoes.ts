// O que o editor desenha POR CIMA do motor: moldura e rótulo de cada prancheta, guias da zona da
// interface no story e contorno da seleção. Mora numa segunda camada, com Canvas 2D. Mudar a seleção
// não recompõe a cena, e trocar o motor não toca aqui (docs/mvp/frontend.md, seção 4).
//
// A marca em âmbar das camadas tocadas pelo Otto entra com a fatia da tarefa.
import type { Prancheta } from '@otto/documento';
import type { Area, Camera } from '../nucleo/camera';
import type { Selecao } from '../nucleo/interface';
import { disporPranchetas, guiasDoStory } from './guias';
import { cantosDe, pontoDeGirar, pontosDasAlcas, type Quadro } from './transformacao';

// O canvas não lê variável CSS: as cores repetem as de estilos/tokens.css.
const LARANJA = '#ff5b1f';
const PAPEL = '#f4efe3';
const AMBAR = '#f4c430';
const TEXTO_2 = '#a8a397';
const TEXTO_3 = '#85827a';
const MOLDURA = '#33332e';
const SANS = '"Schibsted Grotesk Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

export interface Cena {
  camera: Camera;
  area: Area;
  pixelsPorPonto: number;
  pranchetas: readonly Pick<Prancheta, 'id' | 'nome' | 'largura' | 'altura'>[];
  selecao: Selecao;
  /** O contorno de cada camada selecionada, no plano do editor, com a rotação dela (canvas/alvo.ts). */
  contornos: readonly Quadro[];
  /** O contorno de cada camada tocada pela tarefa do Otto, em âmbar, até a revisão acabar. */
  contornosDoOtto?: readonly Quadro[];
  /** O quadro que mostra as alças e a pega de girar: o da camada, ou o do conjunto. Ausente: sem alças. */
  alcas?: Quadro | undefined;
  /** A que distância do lado de cima fica a pega de girar, em pixels de tela. */
  distanciaDoGiro: number;
  /** Pranchetas e camadas tocadas pelo Otto na tarefa viva. */
  tocados: ReadonlySet<string>;
  rotuloDaZonaDaInterface: string;
}

type Contexto = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'clearRect'
  | 'strokeRect'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'closePath'
  | 'arc'
  | 'fill'
  | 'setLineDash'
  | 'save'
  | 'restore'
  | 'font'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
>;

export function desenharSobreposicoes(ctx: Contexto, cena: Cena): void {
  const { camera, area, pixelsPorPonto: dpr } = cena;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Limpa em duas metades, de propósito. Um clearRect que cobre o canvas inteiro, num quadro em que
  // nada mais é desenhado (a peça ficou sem prancheta), foi descartado pelo Chromium dos testes de
  // navegador (WebGL por software): a tela continuava mostrando rótulos e contornos do quadro anterior.
  const meio = Math.ceil((area.largura * dpr) / 2);
  ctx.clearRect(0, 0, meio, area.altura * dpr);
  ctx.clearRect(meio, 0, area.largura * dpr - meio, area.altura * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const posicoes = disporPranchetas(cena.pranchetas);
  for (const p of cena.pranchetas) {
    const origem = posicoes.get(p.id);
    if (!origem) continue;
    const x = camera.x + origem.x * camera.zoom;
    const y = camera.y + origem.y * camera.zoom;
    const largura = p.largura * camera.zoom;
    const altura = p.altura * camera.zoom;
    const selecionada = cena.selecao?.tipo === 'prancheta' && cena.selecao.id === p.id;

    ctx.lineWidth = selecionada ? 1.5 : 1;
    ctx.strokeStyle = selecionada ? LARANJA : MOLDURA;
    ctx.strokeRect(x - 0.5, y - 0.5, largura + 1, altura + 1);

    ctx.font = `500 12px ${SANS}`;
    ctx.fillStyle = selecionada ? LARANJA : cena.tocados.has(p.id) ? AMBAR : TEXTO_2;
    ctx.fillText(p.nome, x, y - 10);
    const larguraDoNome = ctx.measureText(p.nome).width;
    ctx.font = `400 11px ${MONO}`;
    ctx.fillStyle = TEXTO_3;
    ctx.fillText(`${p.largura}×${p.altura}`, x + larguraDoNome + 8, y - 10);

    const guias = guiasDoStory(p);
    if (!guias) continue;
    const topo = guias.topo * camera.zoom;
    const base = guias.base * camera.zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 91, 31, 0.07)';
    ctx.strokeStyle = 'rgba(255, 91, 31, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.fillRect(x, y, largura, topo);
    ctx.fillRect(x, y + altura - base, largura, base);
    ctx.beginPath();
    ctx.moveTo(x, y + topo + 0.5);
    ctx.lineTo(x + largura, y + topo + 0.5);
    ctx.moveTo(x, y + altura - base + 0.5);
    ctx.lineTo(x + largura, y + altura - base + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `500 10px ${SANS}`;
    ctx.fillStyle = 'rgba(255, 91, 31, 0.8)';
    ctx.fillText(cena.rotuloDaZonaDaInterface, x + 6, y + topo - 6);
    ctx.fillText(cena.rotuloDaZonaDaInterface, x + 6, y + altura - base + 14);
    ctx.restore();
  }

  const naTela = (p: { x: number; y: number }) => ({ x: camera.x + p.x * camera.zoom, y: camera.y + p.y * camera.zoom });
  const tracar = (q: Quadro) => {
    ctx.beginPath();
    cantosDe(q).forEach((canto, i) => {
      const p = naTela(canto);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  };

  // camadas tocadas pelo Otto: contorno fino em âmbar, tracejado (não depende só da cor)
  if (cena.contornosDoOtto?.length) {
    ctx.strokeStyle = AMBAR;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const q of cena.contornosDoOtto) tracar(q);
    ctx.setLineDash([]);
  }

  // contorno de cada camada selecionada, girado como ela
  ctx.strokeStyle = LARANJA;
  ctx.lineWidth = 1.5;
  for (const q of cena.contornos) tracar(q);

  if (cena.alcas) {
    const q = cena.alcas;
    ctx.lineWidth = 1;
    // com várias camadas, o quadro do conjunto ganha um traço próprio, tracejado
    if (cena.contornos.length > 1) {
      ctx.setLineDash([4, 3]);
      tracar(q);
      ctx.setLineDash([]);
    }
    // a pega de girar: uma haste a partir do meio do lado de cima, com um círculo na ponta
    const alcas = pontosDasAlcas(q);
    const haste = naTela(alcas.n);
    const giro = naTela(pontoDeGirar(q, cena.distanciaDoGiro / camera.zoom));
    ctx.beginPath();
    ctx.moveTo(haste.x, haste.y);
    ctx.lineTo(giro.x, giro.y);
    ctx.stroke();
    ctx.fillStyle = PAPEL;
    ctx.beginPath();
    ctx.arc(giro.x, giro.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // alças: quadrado claro com borda laranja, nos quatro cantos e nos quatro lados
    for (const ponto of Object.values(alcas)) {
      const p = naTela(ponto);
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
    }
  }
}
