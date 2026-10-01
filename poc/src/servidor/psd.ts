// Porta FormatoDeArquivoEmCamadas, adaptador ag-psd (ADR 028).
// Grava sempre: a composta, o pixel de cada camada, os dados editáveis e um relatório.
import { type AdjustmentLayer, type BezierKnot, type BlendMode, type Filter, type Layer, type LayerEffectsInfo, type LinkedFile, type Psd, type VectorContent, writePsd } from 'ag-psd';
import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Ajuste, coresDoNo, type Documento, type Filtro, MODOS_DE_MESCLAGEM, type ModoDoGrupo, type No, type NoImagem, type NoVetor, type NoVisual, type Prancheta, type Preenchimento, resolverCor, todasAsCamadas } from '../documento/esquema';
import { subcaminhosNormalizados } from './svg';
import { hexParaRgb } from '../documento/lint';
import { acharFonte } from '../render/fontes';
import { cantosDaFoto, type Ctx, mascaraEmAlfa, renderizarPrancheta } from '../render/render';
import { sementeDe } from '../render/pixel';
import { lerArquivo, lerMetaDeArquivo } from './armazenamento';
import { carregarImagens, criarCanvasNode, fonteDeImagens, novoCanvas, PASTA_FONTES } from './canvas-node';

export type Destino = 'Nativo editável' | 'Nativo (pixel)' | 'Raster com aviso';

export interface LinhaDoRelatorio {
  prancheta: string;
  camada: string;
  tipo: string;
  destino: Destino;
  observacao?: string;
}

export interface RelatorioDeExportacao {
  arquivos: string[];
  camadas: LinhaDoRelatorio[];
  tokens: { nome: string; valor: string; usadoEm: string[] }[];
  fontes: { familia: string; peso: number; postScript: string; arquivo: string }[];
  imagens: { camada: string; banco: string; autor: string; licenca: string; url: string }[];
  avisos: string[];
}

const MESCLAGEM: Record<ModoDoGrupo, BlendMode> = {
  atravessar: 'pass through',
  normal: 'normal',
  escurecer: 'darken',
  multiplicacao: 'multiply',
  'subexposicao-de-cores': 'color burn',
  'subexposicao-linear': 'linear burn',
  'cor-mais-escura': 'darker color',
  clarear: 'lighten',
  tela: 'screen',
  'superexposicao-de-cores': 'color dodge',
  'superexposicao-linear': 'linear dodge',
  'cor-mais-clara': 'lighter color',
  sobrepor: 'overlay',
  'luz-suave': 'soft light',
  'luz-direta': 'hard light',
  'luz-intensa': 'vivid light',
  'luz-linear': 'linear light',
  'luz-do-ponto': 'pin light',
  'mistura-solida': 'hard mix',
  diferenca: 'difference',
  exclusao: 'exclusion',
  subtrair: 'subtract',
  dividir: 'divide',
  matiz: 'hue',
  saturacao: 'saturation',
  cor: 'color',
  luminosidade: 'luminosity',
};
const K = 0.5522847498;

const rgb = (doc: Documento, cor: string) => {
  const [r, g, b] = hexParaRgb(resolverCor(doc, cor));
  return { r, g, b };
};

function knot(xi: number, yi: number, x: number, y: number, xo: number, yo: number): BezierKnot {
  return { linked: true, points: [xi, yi, x, y, xo, yo] };
}

function caminhoDaForma(forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number): BezierKnot[] {
  if (forma === 'elipse') {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    return [
      knot(cx - rx * K, cy - ry, cx, cy - ry, cx + rx * K, cy - ry),
      knot(cx + rx, cy - ry * K, cx + rx, cy, cx + rx, cy + ry * K),
      knot(cx + rx * K, cy + ry, cx, cy + ry, cx - rx * K, cy + ry),
      knot(cx - rx, cy + ry * K, cx - rx, cy, cx - rx, cy - ry * K),
    ];
  }
  const r = Math.min(raio, w / 2, h / 2);
  if (r <= 0) return [knot(x, y, x, y, x, y), knot(x + w, y, x + w, y, x + w, y), knot(x + w, y + h, x + w, y + h, x + w, y + h), knot(x, y + h, x, y + h, x, y + h)];
  const c = r * K;
  return [
    knot(x + r - c, y, x + r, y, x + r, y),
    knot(x + w - r, y, x + w - r, y, x + w - r + c, y),
    knot(x + w, y + r - c, x + w, y + r, x + w, y + r),
    knot(x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + c),
    knot(x + w - r + c, y + h, x + w - r, y + h, x + w - r, y + h),
    knot(x + r, y + h, x + r, y + h, x + r - c, y + h),
    knot(x, y + h - r + c, x, y + h - r, x, y + h - r),
    knot(x, y + r, x, y + r, x, y + r - c),
  ];
}

function pixelDoNo(doc: Documento, p: Prancheta, no: NoVisual): ReturnType<typeof novoCanvas> {
  const canvas = novoCanvas(p.largura, p.altura);
  // opacidade, mesclagem, máscara e recorte ficam na camada do PSD, não no pixel;
  // sombra e traço viram efeitos de camada (senão o Photoshop desenharia duas vezes);
  // ajuste de cor da foto vira camada de ajuste presa a ela
  const limpo = { ...no, opacidade: 1, modoDeMesclagem: 'normal', visivel: true, recortadaNaDeBaixo: false } as NoVisual;
  delete limpo.sombra;
  delete limpo.efeitos;
  delete limpo.mascara;
  if (limpo.tipo === 'forma') delete limpo.traco;
  if (limpo.tipo === 'imagem') {
    delete limpo.recorte;
    delete limpo.ajusteDeCor;
  }
  const so: Prancheta = { ...p, filhos: [limpo] };
  renderizarPrancheta(canvas.getContext('2d') as unknown as Ctx, doc, so, fonteDeImagens, { apenas: new Set([no.id]), criarCanvas: criarCanvasNode });
  return canvas;
}

/** Máscara de camada do PSD: cinza opaco (branco mostra, preto esconde). */
function mascaraDoPsd(doc: Documento, p: Prancheta, no: No, dx = 0, dy = 0): Layer['mask'] | undefined {
  const alfa = mascaraEmAlfa(doc, p, no, fonteDeImagens, criarCanvasNode);
  if (!alfa) return undefined;
  const cinza = novoCanvas(p.largura, p.altura);
  const c = cinza.getContext('2d') as unknown as Ctx;
  c.fillStyle = '#000000';
  c.fillRect(0, 0, p.largura, p.altura);
  const branco = novoCanvas(p.largura, p.altura);
  const b = branco.getContext('2d') as unknown as Ctx;
  b.drawImage(alfa as unknown as CanvasImageSource, 0, 0);
  b.globalCompositeOperation = 'source-in';
  b.fillStyle = '#ffffff';
  b.fillRect(0, 0, p.largura, p.altura);
  c.drawImage(branco as unknown as CanvasImageSource, 0, 0);
  return { canvas: cinza as unknown as HTMLCanvasElement, top: dy, left: dx, bottom: dy + p.altura, right: dx + p.largura, defaultColor: 0 };
}

function descreverMascara(no: No): string {
  const m = no.mascara;
  if (!m) return '';
  return m.tipo === 'degrade' ? `máscara em degradê (${m.angulo}°)` : m.tipo === 'forma' ? `máscara de ${m.forma}${m.suavizar ? ' suavizada' : ''}${m.inverter ? ' invertida' : ''}` : `máscara do sujeito${m.inverter ? ' invertida' : ''}`;
}

function ajusteDoPsd(doc: Documento, a: Ajuste): AdjustmentLayer {
  const curva = (c: [number, number][] | undefined) => c?.map(([input, output]) => ({ input, output }));
  const cb = (v: [number, number, number]) => ({ cyanRed: v[0], magentaGreen: v[1], yellowBlue: v[2] });
  switch (a.tipo) {
    case 'curvas':
      return { type: 'curves', ...(a.rgb ? { rgb: curva(a.rgb)! } : {}), ...(a.vermelho ? { red: curva(a.vermelho)! } : {}), ...(a.verde ? { green: curva(a.verde)! } : {}), ...(a.azul ? { blue: curva(a.azul)! } : {}) };
    case 'niveis':
      return { type: 'levels', rgb: { shadowInput: a.pretoDeEntrada, highlightInput: a.brancoDeEntrada, shadowOutput: a.pretoDeSaida, highlightOutput: a.brancoDeSaida, midtoneInput: a.gama } };
    case 'matiz-saturacao':
      return { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: a.matiz, saturation: a.saturacao, lightness: a.luminosidade } };
    case 'brilho-contraste':
      return { type: 'brightness/contrast', brightness: a.brilho, contrast: a.contraste, useLegacy: false };
    case 'vibracao':
      return { type: 'vibrance', vibrance: a.vibracao, saturation: a.saturacao };
    case 'equilibrio-de-cor':
      return { type: 'color balance', shadows: cb(a.sombras), midtones: cb(a.meiosTons), highlights: cb(a.realces), preserveLuminosity: true };
    case 'filtro-de-foto':
      return { type: 'photo filter', color: rgb(doc, a.cor), density: a.densidade, preserveLuminosity: true };
    case 'preto-e-branco':
      return { type: 'black & white', reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, useTint: false };
    case 'mapa-de-degrade':
      return {
        type: 'gradient map',
        gradientType: 'solid',
        colorStops: [...a.paradas].sort((x, y) => x.posicao - y.posicao).map((q) => ({ color: rgb(doc, q.cor), location: q.posicao, midpoint: 0.5 })),
        opacityStops: [
          { opacity: 1, location: 0, midpoint: 0.5 },
          { opacity: 1, location: 1, midpoint: 0.5 },
        ],
      };
  }
}

const NOME_DO_AJUSTE: Record<Ajuste['tipo'], string> = {
  curvas: 'curvas',
  niveis: 'níveis',
  'matiz-saturacao': 'matiz/saturação',
  'brilho-contraste': 'brilho/contraste',
  vibracao: 'vibração',
  'equilibrio-de-cor': 'equilíbrio de cor',
  'filtro-de-foto': 'filtro de foto',
  'preto-e-branco': 'preto e branco',
  'mapa-de-degrade': 'mapa de degradê',
};

/** Filtro do Otto → filtro inteligente do Photoshop, no objeto inteligente da foto. */
function filtroInteligente(f: Filtro, semente: number): Filter {
  const comum = { opacity: 1, blendMode: 'normal' as const, enabled: true, hasOptions: true, foregroundColor: { r: 0, g: 0, b: 0 }, backgroundColor: { r: 255, g: 255, b: 255 } };
  switch (f.tipo) {
    case 'desfoque':
      return { ...comum, name: 'Gaussian Blur', type: 'gaussian blur', filter: { radius: { units: 'Pixels', value: f.raio } } };
    case 'desfoque-de-movimento':
      return { ...comum, name: 'Motion Blur', type: 'motion blur', filter: { angle: f.angulo, distance: { units: 'Pixels', value: f.distancia } } };
    case 'ruido':
      return { ...comum, name: 'Add Noise', type: 'add noise', filter: { amount: f.quantidade, distribution: 'gaussian', monochromatic: f.monocromatico, randomSeed: semente } };
    case 'nitidez':
      return { ...comum, name: 'Unsharp Mask', type: 'unsharp mask', filter: { amount: f.quantidade, radius: { units: 'Pixels', value: f.raio }, threshold: 0 } };
  }
}

interface ContextoDoPsd {
  doc: Documento;
  p: Prancheta;
  rel: RelatorioDeExportacao;
  arquivosVinculados: LinkedFile[];
  bytes: Map<string, { dados: Uint8Array; tipo: string }>;
  /** posição da prancheta dentro do PSD (artboards num arquivo só) */
  dx: number;
  dy: number;
}

/** Leva um ponto da prancheta para o PSD: gira em torno do centro da camada e desloca pela prancheta. */
function mapeador(no: NoVisual | undefined, cx: ContextoDoPsd): (x: number, y: number) => [number, number] {
  const graus = no?.rotacao ?? 0;
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const ox = no ? no.x + no.largura / 2 : 0;
  const oy = no ? no.y + no.altura / 2 : 0;
  return (x, y) => (graus ? [ox + (x - ox) * cos - (y - oy) * sin + cx.dx, oy + (x - ox) * sin + (y - oy) * cos + cx.dy] : [x + cx.dx, y + cx.dy]);
}

function mapearNos(knots: BezierKnot[], f: (x: number, y: number) => [number, number]): BezierKnot[] {
  return knots.map((k) => {
    const p = k.points;
    return { ...k, points: [...f(p[0]!, p[1]!), ...f(p[2]!, p[3]!), ...f(p[4]!, p[5]!)] };
  });
}

/** Subcaminho normalizado (M/C/Z) → nós de Bézier do PSD (controle de chegada, âncora, controle de saída). */
function nosDoSubcaminho(sub: ReturnType<typeof subcaminhosNormalizados>[number], f: (x: number, y: number) => [number, number]): { knots: BezierKnot[]; open: boolean } {
  const segs = sub.segmentos;
  const ultimo = segs.at(-1)![2];
  const fechaSozinho = Math.hypot(ultimo[0] - sub.inicio[0], ultimo[1] - sub.inicio[1]) < 0.01;
  const ancoras = [sub.inicio, ...segs.map((g) => g[2])];
  if (fechaSozinho) ancoras.pop();
  const knots = ancoras.map((a, i): BezierKnot => {
    const chegada = i === 0 ? (fechaSozinho ? segs.at(-1)![1] : a) : segs[i - 1]![1];
    const saida = i < segs.length ? segs[i]![0] : a;
    return { linked: false, points: [...f(chegada[0], chegada[1]), ...f(a[0], a[1]), ...f(saida[0], saida[1])] };
  });
  return { knots, open: !sub.fechado };
}

function camadasDoNo(no: No, cx: ContextoDoPsd): Layer[] {
  const { doc, p, rel } = cx;
  const linha = (destino: Destino, observacao?: string) => rel.camadas.push({ prancheta: p.nome, camada: no.nome, tipo: no.tipo, destino, ...(observacao ? { observacao } : {}) });
  const comum: Layer = { name: no.nome, opacity: no.opacidade, blendMode: MESCLAGEM[no.modoDeMesclagem], hidden: !no.visivel };
  if (no.recortadaNaDeBaixo) comum.clipping = true;
  if (no.bloqueado) comum.protected = { transparency: true, composite: true, position: true };
  const mascara = mascaraDoPsd(doc, p, no, cx.dx, cx.dy);
  if (mascara) comum.mask = mascara;
  const extras = [descreverMascara(no), no.recortadaNaDeBaixo ? 'máscara de recorte na camada de baixo' : '', no.modoDeMesclagem !== 'normal' && no.modoDeMesclagem !== 'atravessar' ? `modo ${MESCLAGEM[no.modoDeMesclagem]}` : ''].filter(Boolean);

  if (no.tipo === 'grupo') {
    linha('Nativo editável', ['grupo', ...extras].join('; '));
    return [{ ...comum, opened: true, children: no.filhos.flatMap((f) => camadasDoNo(f, cx)) }];
  }
  if (no.tipo === 'ajuste') {
    linha('Nativo editável', [`camada de ajuste de ${NOME_DO_AJUSTE[no.ajuste.tipo]}`, ...extras].join('; '));
    return [{ ...comum, adjustment: ajusteDoPsd(doc, no.ajuste) }];
  }

  const visual: Layer = { ...comum, canvas: pixelDoNo(doc, p, no) as unknown as HTMLCanvasElement, top: cx.dy, left: cx.dx };
  const f = mapeador(no, cx);
  const efeitos = efeitosDoNo(doc, no);
  if (efeitos) visual.effects = efeitos;
  const notaDeEfeitos = [no.sombra ? 'sombra projetada' : '', no.tipo === 'forma' && no.traco ? 'traço interno' : '', ...nomesDosEfeitos(no)].filter(Boolean).join(', ');
  if (no.rotacao) extras.push(`girada ${no.rotacao}°`);
  const detalhe = (t: string) => [t, ...extras, notaDeEfeitos ? `${notaDeEfeitos} como efeito de camada` : ''].filter(Boolean).join('; ');

  switch (no.tipo) {
    case 'forma': {
      if (no.filtros?.length) {
        linha('Raster com aviso', detalhe(`forma com filtro (${no.filtros.map((f) => f.tipo).join(', ')}) exportada como pixel: no Photoshop, filtro inteligente só existe em objeto inteligente`));
        return [visual];
      }
      linha('Nativo editável', detalhe(`forma vetorial (${no.forma}${no.raio ? `, raio ${no.raio}` : ''})${typeof no.preenchimento === 'string' ? '' : `, preenchimento degradê ${no.preenchimento.tipo}`}`));
      return [{ ...visual, vectorFill: conteudoVetorial(doc, no.preenchimento), vectorMask: { paths: [{ open: false, knots: mapearNos(caminhoDaForma(no.forma, no.x, no.y, no.largura, no.altura, no.raio), f), fillRule: 'non-zero' }] } }];
    }
    case 'imagem':
      return camadasDaFoto(no, visual, detalhe, cx);
    case 'vetor':
      return camadasDoVetor(no, comum, detalhe, cx);
    case 'texto': {
      const fonte = acharFonte(no.fonte, no.peso);
      if (!fonte) {
        linha('Raster com aviso', detalhe(`fonte "${no.fonte}" fora da biblioteca: exportada só como pixel`));
        return [visual];
      }
      if (!rel.fontes.some((f) => f.postScript === fonte.postScript)) rel.fontes.push({ familia: fonte.familia, peso: fonte.peso, postScript: fonte.postScript, arquivo: fonte.arquivo });
      const alinh = no.alinhamento === 'esquerda' ? 'left' : no.alinhamento === 'centro' ? 'center' : 'right';
      const runs = trechosDoPsd(doc, no);
      for (const t of no.trechos ?? []) {
        const f = acharFonte(t.fonte ?? no.fonte, t.peso ?? no.peso);
        if (f && !rel.fontes.some((x) => x.postScript === f.postScript)) rel.fontes.push({ familia: f.familia, peso: f.peso, postScript: f.postScript, arquivo: f.arquivo });
      }
      linha('Nativo editável', detalhe(`texto em caixa, ${fonte.postScript} ${no.tamanho} px${runs ? `, ${runs.length} trechos de estilo` : ''}`));
      return [
        {
          ...visual,
          text: {
            text: no.conteudo.replace(/\n/g, '\r'),
            transform: (() => {
              const a = (no.rotacao * Math.PI) / 180;
              const [tx, ty] = f(no.x, no.y);
              return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), tx, ty];
            })(),
            shapeType: 'box',
            boxBounds: [0, 0, no.largura, no.altura],
            antiAlias: 'smooth',
            style: {
              font: { name: fonte.postScript },
              fontSize: no.tamanho,
              fillColor: rgb(doc, no.cor),
              autoLeading: false,
              leading: Math.round(no.tamanho * no.entrelinha * 100) / 100,
              tracking: no.espacamento,
              fontCaps: no.caixaAlta ? 2 : no.versalete ? 1 : 0,
              autoKerning: no.kerning !== 'nenhum',
            },
            paragraphStyle: { justification: alinh },
            ...(runs ? { styleRuns: runs } : {}),
          },
        },
      ];
    }
  }
}

/**
 * Foto como objeto inteligente: o arquivo original vai embutido, o enquadramento é a transformação,
 * o corte da caixa (ou o recorte em forma) é a máscara vetorial e os filtros são filtros inteligentes.
 * O ajuste de cor da foto vira camadas de ajuste presas a ela.
 */
function camadasDaFoto(no: NoImagem, visual: Layer, detalhe: (t: string) => string, cx: ContextoDoPsd): Layer[] {
  const { doc, p, rel } = cx;
  if (no.origem) rel.imagens.push({ camada: `${p.nome} / ${no.nome}`, ...no.origem });
  const original = cx.bytes.get(no.arquivo);
  const foto: Layer = { ...visual };
  const recorte = no.recorte ?? { forma: 'retangulo' as const, raio: 0 };
  const f = mapeador(no, cx);
  foto.vectorMask = { paths: [{ open: false, knots: mapearNos(caminhoDaForma(recorte.forma, no.x, no.y, no.largura, no.altura, recorte.raio), f), fillRule: 'non-zero' }] };
  const filtros = no.filtros ?? [];
  if (original) {
    const id = randomUUID();
    cx.arquivosVinculados.push({ id, name: `${no.nome}.${original.tipo === 'image/png' ? 'png' : 'jpg'}`, type: original.tipo === 'image/png' ? 'png ' : 'JPEG', data: original.dados });
    foto.placedLayer = {
      id,
      placed: randomUUID(),
      type: 'raster',
      transform: (() => {
        const c = cantosDaFoto(no.larguraOriginal, no.alturaOriginal, no);
        return [0, 2, 4, 6].flatMap((i) => f(c[i]!, c[i + 1]!));
      })(),
      width: no.larguraOriginal,
      height: no.alturaOriginal,
      ...(filtros.length ? { filter: { enabled: true, validAtPosition: true, maskEnabled: false, maskLinked: false, maskExtendWithWhite: true, list: filtros.map((f) => filtroInteligente(f, sementeDe(no.id))) } } : {}),
    };
  }
  rel.camadas.push({
    prancheta: p.nome,
    camada: no.nome,
    tipo: 'imagem',
    destino: original ? 'Nativo editável' : 'Nativo (pixel)',
    observacao: detalhe(
      `${original ? 'objeto inteligente com a foto original embutida' : 'pixel'} (${no.larguraOriginal}×${no.alturaOriginal} px), corte da caixa como máscara vetorial${no.recorte ? ` (${no.recorte.forma})` : ''}${filtros.length ? `; filtros inteligentes: ${filtros.map((f) => f.tipo).join(', ')}` : ''}`,
    ),
  });
  const ajustes: Layer[] = [];
  const a = no.ajusteDeCor;
  if (a && (a.brilho !== 0 || a.contraste !== 0)) ajustes.push({ name: `${no.nome}: brilho e contraste`, clipping: true, adjustment: { type: 'brightness/contrast', brightness: Math.round(a.brilho * 1.5), contrast: Math.round(a.contraste), useLegacy: false } });
  if (a && a.saturacao !== 0) ajustes.push({ name: `${no.nome}: saturação`, clipping: true, adjustment: { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: 0, saturation: Math.round(a.saturacao), lightness: 0 } } });
  if (a?.duotone) {
    ajustes.push({
      name: `${no.nome}: duotone`,
      clipping: true,
      adjustment: {
        type: 'gradient map',
        gradientType: 'solid',
        colorStops: [
          { color: rgb(doc, a.duotone.sombras), location: 0, midpoint: 0.5 },
          { color: rgb(doc, a.duotone.luzes), location: 1, midpoint: 0.5 },
        ],
        opacityStops: [
          { opacity: 1, location: 0, midpoint: 0.5 },
          { opacity: 1, location: 1, midpoint: 0.5 },
        ],
      },
    });
  }
  for (const aj of ajustes) rel.camadas.push({ prancheta: p.nome, camada: aj.name!, tipo: 'ajuste', destino: 'Nativo editável', observacao: 'camada de ajuste com máscara de recorte na foto' });
  return [foto, ...ajustes];
}

function conteudoVetorial(doc: Documento, pr: Preenchimento): VectorContent {
  if (typeof pr === 'string') return { type: 'color', color: rgb(doc, pr) };
  const paradas = [...pr.paradas].sort((a, b) => a.posicao - b.posicao);
  return {
    type: 'solid',
    name: 'Otto',
    style: pr.tipo,
    angle: pr.angulo,
    scale: 100,
    align: true,
    colorStops: paradas.map((q) => ({ color: rgb(doc, q.cor), location: q.posicao, midpoint: 0.5 })),
    opacityStops: paradas.map((q) => ({ opacity: q.opacidade, location: q.posicao, midpoint: 0.5 })),
  } as VectorContent;
}

function efeitosDoNo(doc: Documento, no: NoVisual): LayerEffectsInfo | undefined {
  const fx: LayerEffectsInfo = {};
  if (no.sombra) {
    fx.dropShadow = [{ present: true, showInDialog: true, enabled: true, color: rgb(doc, no.sombra.cor), opacity: no.sombra.opacidade, angle: no.sombra.angulo, distance: { units: 'Pixels', value: no.sombra.distancia }, size: { units: 'Pixels', value: no.sombra.desfoque }, blendMode: 'multiply', useGlobalLight: false }];
  }
  if (no.tipo === 'forma' && no.traco) {
    fx.stroke = [{ present: true, showInDialog: true, enabled: true, position: 'inside', fillType: 'color', color: rgb(doc, no.traco.cor), size: { units: 'Pixels', value: no.traco.espessura }, opacity: 1, blendMode: 'normal' }];
  }
  const e = no.efeitos;
  const base = { present: true, showInDialog: true, enabled: true };
  if (e?.sombraInterna) fx.innerShadow = [{ ...base, color: rgb(doc, e.sombraInterna.cor), opacity: e.sombraInterna.opacidade, angle: e.sombraInterna.angulo, distance: { units: 'Pixels', value: e.sombraInterna.distancia }, size: { units: 'Pixels', value: e.sombraInterna.desfoque }, blendMode: 'multiply', useGlobalLight: false }];
  if (e?.brilhoExterno) fx.outerGlow = { ...base, color: rgb(doc, e.brilhoExterno.cor), opacity: e.brilhoExterno.opacidade, size: { units: 'Pixels', value: e.brilhoExterno.tamanho }, blendMode: 'screen' };
  if (e?.brilhoInterno) fx.innerGlow = { ...base, color: rgb(doc, e.brilhoInterno.cor), opacity: e.brilhoInterno.opacidade, size: { units: 'Pixels', value: e.brilhoInterno.tamanho }, blendMode: 'screen', source: 'edge' };
  if (e?.sobreposicaoDeCor) fx.solidFill = [{ ...base, color: rgb(doc, e.sobreposicaoDeCor.cor), opacity: e.sobreposicaoDeCor.opacidade, blendMode: MESCLAGEM[e.sobreposicaoDeCor.modoDeMesclagem] }];
  if (e?.sobreposicaoDeDegrade) {
    const g = e.sobreposicaoDeDegrade;
    const paradas = [...g.degrade.paradas].sort((a, b) => a.posicao - b.posicao);
    fx.gradientOverlay = [
      {
        ...base,
        opacity: g.opacidade,
        blendMode: MESCLAGEM[g.modoDeMesclagem],
        type: g.degrade.tipo,
        angle: g.degrade.angulo,
        align: true,
        scale: 100,
        gradient: { name: 'Otto', type: 'solid', colorStops: paradas.map((q) => ({ color: rgb(doc, q.cor), location: q.posicao, midpoint: 0.5 })), opacityStops: paradas.map((q) => ({ opacity: q.opacidade, location: q.posicao, midpoint: 0.5 })) },
      },
    ];
  }
  return Object.keys(fx).length ? fx : undefined;
}

function nomesDosEfeitos(no: NoVisual): string[] {
  const e = no.efeitos ?? {};
  return [e.sombraInterna && 'sombra interna', e.brilhoExterno && 'brilho externo', e.brilhoInterno && 'brilho interno', e.sobreposicaoDeCor && 'sobreposição de cor', e.sobreposicaoDeDegrade && 'sobreposição de degradê'].filter((x): x is string => Boolean(x));
}

/** Vetor importado: um grupo com uma camada de forma por caminho (cor editável no Photoshop). */
function camadasDoVetor(no: NoVetor, comum: Layer, detalhe: (t: string) => string, cx: ContextoDoPsd): Layer[] {
  const { doc, p, rel } = cx;
  const sx = no.largura / no.moldura[0];
  const sy = no.altura / no.moldura[1];
  const girar = mapeador(no, cx);
  const f = (x: number, y: number) => girar(no.x + x * sx, no.y + y * sy);
  const filhos: Layer[] = no.caminhos.map((c, i) => {
    const so: NoVetor = { ...no, caminhos: [c] };
    const corPrincipal = c.preenchimento ?? c.traco!.cor;
    const camada: Layer = {
      name: `${no.nome} · ${resolverCor(doc, corPrincipal)}${no.caminhos.length > 1 ? ` (${i + 1})` : ''}`,
      canvas: pixelDoNo(doc, p, so) as unknown as HTMLCanvasElement,
      top: cx.dy,
      left: cx.dx,
      vectorFill: { type: 'color', color: rgb(doc, corPrincipal) },
      vectorMask: { paths: subcaminhosNormalizados(c.d).map((sub) => ({ ...nosDoSubcaminho(sub, f), fillRule: c.regra === 'par-impar' ? ('even-odd' as const) : ('non-zero' as const) })) },
    };
    // traço do caminho: traçado vetorial nativo da camada de forma (editável no painel Propriedades do Photoshop)
    if (c.traco)
      camada.vectorStroke = {
        strokeEnabled: true,
        fillEnabled: c.preenchimento !== undefined,
        lineWidth: { units: 'Pixels', value: c.traco.espessura * Math.sqrt(sx * sy) },
        lineCapType: ({ reta: 'butt', redonda: 'round', quadrada: 'square' } as const)[c.traco.ponta],
        lineJoinType: ({ angular: 'miter', redonda: 'round', chanfrada: 'bevel' } as const)[c.traco.juncao],
        lineAlignment: 'center',
        opacity: 1,
        content: { type: 'color', color: rgb(doc, c.traco.cor) },
      };
    return camada;
  });
  const comTraco = no.caminhos.filter((c) => c.traco).length;
  rel.camadas.push({ prancheta: p.nome, camada: no.nome, tipo: 'vetor', destino: 'Nativo editável', observacao: detalhe(`vetor${no.origem ? ` importado (${no.origem.nome})` : ' desenhado'}: grupo com ${filhos.length} camada(s) de forma${comTraco ? `, ${comTraco} com traçado vetorial` : ''}`) });
  const grupo: Layer = { ...comum, opened: true, children: filhos };
  const efeitos = efeitosDoNo(doc, no);
  if (efeitos) grupo.effects = efeitos;
  return [grupo];
}

export async function exportarPrancheta(doc: Documento, p: Prancheta, rel: RelatorioDeExportacao): Promise<Buffer> {
  await carregarImagens(doc);
  // arquivo original de cada foto, para o objeto inteligente
  const bytes = new Map<string, { dados: Uint8Array; tipo: string }>();
  for (const n of todasAsCamadas(p.filhos)) {
    if (n.tipo !== 'imagem' || bytes.has(n.arquivo)) continue;
    const dados = await lerArquivo(n.arquivo);
    const meta = await lerMetaDeArquivo(n.arquivo);
    if (dados) bytes.set(n.arquivo, { dados: new Uint8Array(dados), tipo: meta?.tipo ?? 'image/jpeg' });
  }
  const composta = novoCanvas(p.largura, p.altura);
  renderizarPrancheta(composta.getContext('2d') as unknown as Ctx, doc, p, fonteDeImagens, { criarCanvas: criarCanvasNode });
  const fundo = novoCanvas(p.largura, p.altura);
  const fctx = fundo.getContext('2d');
  fctx.fillStyle = resolverCor(doc, p.fundo);
  fctx.fillRect(0, 0, p.largura, p.altura);
  rel.camadas.push({ prancheta: p.nome, camada: 'Fundo', tipo: 'prancheta', destino: 'Nativo editável', observacao: 'camada de preenchimento sólido' });

  const cx: ContextoDoPsd = { doc, p, rel, arquivosVinculados: [], bytes, dx: 0, dy: 0 };
  const psd: Psd = {
    width: p.largura,
    height: p.altura,
    canvas: composta as unknown as HTMLCanvasElement,
    children: [
      { name: 'Fundo', vectorFill: { type: 'color', color: rgb(doc, p.fundo) }, canvas: fundo as unknown as HTMLCanvasElement, top: 0, left: 0 },
      ...p.filhos.flatMap((n) => camadasDoNo(n, cx)),
    ],
  };
  if (cx.arquivosVinculados.length) psd.linkedFiles = cx.arquivosVinculados;
  rel.arquivos.push(`${p.nome}.psd`);
  return Buffer.from(writePsd(psd, { generateThumbnail: true, trimImageData: true }));
}

async function bytesDasFotos(doc: Documento, lista: No[]): Promise<Map<string, { dados: Uint8Array; tipo: string }>> {
  const bytes = new Map<string, { dados: Uint8Array; tipo: string }>();
  for (const n of lista) {
    if (n.tipo !== 'imagem' || bytes.has(n.arquivo)) continue;
    const dados = await lerArquivo(n.arquivo);
    const meta = await lerMetaDeArquivo(n.arquivo);
    if (dados) bytes.set(n.arquivo, { dados: new Uint8Array(dados), tipo: meta?.tipo ?? 'image/jpeg' });
  }
  return bytes;
}

/** Todas as pranchetas num PSD só, como artboards do Photoshop, lado a lado. */
export async function exportarComPranchetas(doc: Documento, rel: RelatorioDeExportacao): Promise<Buffer> {
  await carregarImagens(doc);
  const VAO = 200;
  const largura = doc.pranchetas.reduce((s, p) => s + p.largura, 0) + VAO * Math.max(0, doc.pranchetas.length - 1);
  const altura = Math.max(...doc.pranchetas.map((p) => p.altura));
  const bytes = await bytesDasFotos(doc, doc.pranchetas.flatMap((p) => todasAsCamadas(p.filhos)));
  const composta = novoCanvas(largura, altura);
  const cc = composta.getContext('2d') as unknown as Ctx;
  const arquivosVinculados: LinkedFile[] = [];
  const pranchetas: Layer[] = [];
  let dx = 0;
  for (const p of doc.pranchetas) {
    cc.save();
    cc.translate(dx, 0);
    renderizarPrancheta(cc, doc, p, fonteDeImagens, { criarCanvas: criarCanvasNode });
    cc.restore();
    const fundo = novoCanvas(p.largura, p.altura);
    const fc = fundo.getContext('2d');
    fc.fillStyle = resolverCor(doc, p.fundo);
    fc.fillRect(0, 0, p.largura, p.altura);
    rel.camadas.push({ prancheta: p.nome, camada: 'Fundo', tipo: 'prancheta', destino: 'Nativo editável', observacao: 'artboard do Photoshop, com camada de preenchimento sólido' });
    const cx: ContextoDoPsd = { doc, p, rel, arquivosVinculados, bytes, dx, dy: 0 };
    pranchetas.push({
      name: p.nome,
      opened: true,
      artboard: { rect: { top: 0, left: dx, bottom: p.altura, right: dx + p.largura }, presetName: `${p.largura}×${p.altura}`, color: rgb(doc, p.fundo), backgroundType: 1 },
      children: [{ name: 'Fundo', vectorFill: { type: 'color', color: rgb(doc, p.fundo) }, canvas: fundo as unknown as HTMLCanvasElement, top: 0, left: dx }, ...p.filhos.flatMap((n) => camadasDoNo(n, cx))],
    });
    dx += p.largura + VAO;
  }
  const psd: Psd = { width: largura, height: altura, canvas: composta as unknown as HTMLCanvasElement, children: pranchetas };
  if (arquivosVinculados.length) psd.linkedFiles = arquivosVinculados;
  rel.arquivos.push(`${doc.nome} (todas as pranchetas).psd`);
  return Buffer.from(writePsd(psd, { generateThumbnail: true, trimImageData: true }));
}

export function relatorioVazio(doc: Documento): RelatorioDeExportacao {
  const usos = new Map<string, string[]>();
  for (const p of doc.pranchetas) {
    if (p.fundo.startsWith('token:')) usos.set(p.fundo.slice(6), [...(usos.get(p.fundo.slice(6)) ?? []), `${p.nome} / Fundo`]);
    for (const n of todasAsCamadas(p.filhos)) {
      for (const cor of new Set(coresDoNo(n))) if (cor.startsWith('token:')) usos.set(cor.slice(6), [...(usos.get(cor.slice(6)) ?? []), `${p.nome} / ${n.nome}`]);
    }
  }
  return {
    arquivos: [],
    camadas: [],
    tokens: Object.entries(doc.tokens.cores).map(([nome, valor]) => ({ nome, valor, usadoEm: usos.get(nome) ?? [] })),
    fontes: [],
    imagens: [],
    avisos: [
      'Ao abrir, o Photoshop avisa que as camadas de texto precisam ser atualizadas: escolha "Atualizar" para o texto continuar editável.',
      'Para editar o texto, instale as fontes da pasta "fontes" deste pacote (licença SIL Open Font License).',
      'Tokens de cor viram valor fixo: o PSD não tem variável de cor.',
      'Fotos saem como objeto inteligente com a imagem original embutida; filtros viram filtros inteligentes. Confira no Photoshop se os filtros aparecem editáveis (recurso novo, ainda sem conferência manual).',
      'Modos de mesclagem e camadas de ajuste são recalculados pelo Photoshop: luz suave e alguns ajustes podem variar levemente do render do Otto.',
    ],
  };
}

export function relatorioEmTexto(doc: Documento, rel: RelatorioDeExportacao): string {
  const l: string[] = [`# Relatório de exportação: ${doc.nome}`, '', `Arquivos: ${rel.arquivos.join(', ')}`, '', '## Avisos', ...rel.avisos.map((a) => `- ${a}`), '', '## Camadas', '', '| Prancheta | Camada | Tipo | Destino | Observação |', '|---|---|---|---|---|'];
  for (const c of rel.camadas) l.push(`| ${c.prancheta} | ${c.camada} | ${c.tipo} | ${c.destino} | ${c.observacao ?? ''} |`);
  l.push('', '## Tokens (resolvidos para valor fixo)', ...rel.tokens.map((t) => `- ${t.nome} = ${t.valor}${t.usadoEm.length ? ` (${t.usadoEm.join(', ')})` : ''}`));
  l.push('', '## Fontes', ...rel.fontes.map((f) => `- ${f.familia} ${f.peso} (${f.postScript}), arquivo fontes/${f.arquivo}`));
  l.push('', '## Imagens e licenças', ...(rel.imagens.length ? rel.imagens.map((i) => `- ${i.camada}: ${i.banco}, por ${i.autor}, ${i.licenca}, ${i.url}`) : ['- nenhuma imagem de banco']));
  return l.join('\n');
}

export async function exportarPacote(doc: Documento): Promise<{ zip: Uint8Array; relatorio: RelatorioDeExportacao }> {
  const rel = relatorioVazio(doc);
  const arquivos: Record<string, Uint8Array> = {};
  for (const p of doc.pranchetas) arquivos[`${p.nome}.psd`] = await exportarPrancheta(doc, p, rel);
  if (doc.pranchetas.length > 1) arquivos[`${doc.nome} (todas as pranchetas).psd`] = await exportarComPranchetas(doc, relatorioVazio(doc));
  for (const f of rel.fontes) arquivos[`fontes/${f.arquivo}`] = await readFile(path.join(PASTA_FONTES, f.arquivo));
  arquivos['relatorio-de-exportacao.md'] = strToU8(relatorioEmTexto(doc, rel));
  return { zip: zipSync(arquivos, { level: 6 }), relatorio: rel };
}

/** Trechos de estilo do texto no formato do Photoshop (um estilo por sequência de caracteres). */
function trechosDoPsd(doc: Documento, no: Extract<No, { tipo: 'texto' }>) {
  if (!no.trechos?.length) return undefined;
  const n = no.conteudo.length;
  const chave: string[] = [];
  const estilos: { font: { name: string }; fontSize: number; fillColor: { r: number; g: number; b: number }; tracking: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = [...no.trechos].reverse().find((x) => i >= x.inicio && i < x.fim);
    const fonte = acharFonte(t?.fonte ?? no.fonte, t?.peso ?? no.peso);
    const e = { font: { name: fonte?.postScript ?? no.fonte }, fontSize: t?.tamanho ?? no.tamanho, fillColor: rgb(doc, t?.cor ?? no.cor), tracking: t?.espacamento ?? no.espacamento };
    chave.push(JSON.stringify(e));
    estilos.push(e);
  }
  const runs: { length: number; style: (typeof estilos)[number] }[] = [];
  for (let i = 0; i < n; i++) {
    const ultimo = runs.at(-1);
    if (ultimo && chave[i] === chave[i - 1]) ultimo.length++;
    else runs.push({ length: 1, style: estilos[i]! });
  }
  return runs;
}
