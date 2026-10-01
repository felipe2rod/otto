// O que o editor desenha POR CIMA do motor: moldura e rótulo de cada prancheta, guias da zona da
// interface no story e contorno da seleção. Mora numa segunda camada, com Canvas 2D. Mudar a seleção
// não recompõe a cena, e trocar o motor não toca aqui (docs/mvp/frontend.md, seção 4).
//
// Alças de redimensionar e a marca em âmbar das camadas tocadas pelo Otto entram com as fatias
// que as usam.
import type { Caixa, Prancheta } from '@otto/documento';
import type { Area, Camera } from '../nucleo/camera';
import type { Selecao } from '../nucleo/interface';
import { disporPranchetas, guiasDoStory } from './guias';

// O canvas não lê variável CSS: as cores repetem as de estilos/tokens.css.
const LARANJA = '#ff5b1f';
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
  /** Caixa de cada camada selecionada, no plano do editor (canvas/alvo.ts). */
  caixasDaSelecao: readonly Caixa[];
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
  ctx.clearRect(0, 0, area.largura * dpr, area.altura * dpr);
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

  // contorno da seleção, com os quatro cantos marcados (ainda não são alças: não redimensionam)
  ctx.strokeStyle = LARANJA;
  ctx.fillStyle = LARANJA;
  ctx.lineWidth = 1.5;
  for (const c of cena.caixasDaSelecao) {
    const x = camera.x + c.x * camera.zoom;
    const y = camera.y + c.y * camera.zoom;
    const largura = c.w * camera.zoom;
    const altura = c.h * camera.zoom;
    ctx.strokeRect(x, y, largura, altura);
    for (const [cx, cy] of [
      [x, y],
      [x + largura, y],
      [x, y + altura],
      [x + largura, y + altura],
    ] as const)
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }
}
