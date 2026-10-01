// Adaptador da porta FormatoDeArquivoEmCamadas sobre a biblioteca ag-psd (ADR 020, ADR 028).
// É o único arquivo do pacote que conhece a biblioteca: aqui só há tradução do modelo da porta para os tipos dela.
// Nenhuma decisão de mapeamento mora aqui (essas estão em montar.ts).
import type { Ajuste, Filtro, ModoDoGrupo } from '@otto/documento';
import { hexParaRgb } from '@otto/documento';
import { type AdjustmentLayer, type BezierKnot, type BlendMode, type Filter, type Layer, type LayerEffectsInfo, type Psd, type VectorContent, writePsdUint8Array } from 'ag-psd';
import {
  type ArquivoEmCamadas,
  type ArquivoGravado,
  type CamadaDoArquivo,
  type DegradeDoArquivo,
  type EfeitosDoArquivo,
  type FormatoDeArquivoEmCamadas,
  MAIOR_LADO_DO_PSD,
  type NoDeBezier,
  type PreenchimentoDoArquivo,
  type Rgb,
} from '../porta';

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

const px = (value: number) => ({ units: 'Pixels' as const, value });
const corDeHex = (hex: string): Rgb => {
  const [r, g, b] = hexParaRgb(hex);
  return { r, g, b };
};

const no = (n: NoDeBezier): BezierKnot => ({ linked: n.ligado, points: [...n.chegada, ...n.ancora, ...n.saida] });

function paradas(d: DegradeDoArquivo) {
  return {
    colorStops: d.paradas.map((q) => ({ color: q.cor, location: q.posicao, midpoint: 0.5 })),
    opacityStops: d.paradas.map((q) => ({ opacity: q.opacidade, location: q.posicao, midpoint: 0.5 })),
  };
}

function conteudoVetorial(p: PreenchimentoDoArquivo): VectorContent {
  if (p.tipo === 'cor') return { type: 'color', color: p.cor };
  return { type: 'solid', name: 'Otto', style: p.estilo, angle: p.angulo, scale: 100, align: true, ...paradas(p) } as VectorContent;
}

function ajuste(a: Ajuste): AdjustmentLayer {
  const curva = (c: [number, number][] | undefined) => c?.map(([input, output]) => ({ input, output }));
  const equilibrio = (v: [number, number, number]) => ({ cyanRed: v[0], magentaGreen: v[1], yellowBlue: v[2] });
  switch (a.tipo) {
    case 'curvas': {
      const rgb = curva(a.rgb);
      const red = curva(a.vermelho);
      const green = curva(a.verde);
      const blue = curva(a.azul);
      return { type: 'curves', ...(rgb ? { rgb } : {}), ...(red ? { red } : {}), ...(green ? { green } : {}), ...(blue ? { blue } : {}) };
    }
    case 'niveis':
      return { type: 'levels', rgb: { shadowInput: a.pretoDeEntrada, highlightInput: a.brancoDeEntrada, shadowOutput: a.pretoDeSaida, highlightOutput: a.brancoDeSaida, midtoneInput: a.gama } };
    case 'matiz-saturacao':
      return { type: 'hue/saturation', master: { a: 0, b: 0, c: 0, d: 0, hue: a.matiz, saturation: a.saturacao, lightness: a.luminosidade } };
    case 'brilho-contraste':
      return { type: 'brightness/contrast', brightness: a.brilho, contrast: a.contraste, useLegacy: false };
    case 'vibracao':
      return { type: 'vibrance', vibrance: a.vibracao, saturation: a.saturacao };
    case 'equilibrio-de-cor':
      return { type: 'color balance', shadows: equilibrio(a.sombras), midtones: equilibrio(a.meiosTons), highlights: equilibrio(a.realces), preserveLuminosity: true };
    case 'filtro-de-foto':
      return { type: 'photo filter', color: corDeHex(a.cor), density: a.densidade, preserveLuminosity: true };
    case 'preto-e-branco':
      // os pesos padrão do ajuste no Photoshop
      return { type: 'black & white', reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, useTint: false };
    case 'mapa-de-degrade':
      return {
        type: 'gradient map',
        gradientType: 'solid',
        colorStops: [...a.paradas].sort((x, y) => x.posicao - y.posicao).map((q) => ({ color: corDeHex(q.cor), location: q.posicao, midpoint: 0.5 })),
        opacityStops: [
          { opacity: 1, location: 0, midpoint: 0.5 },
          { opacity: 1, location: 1, midpoint: 0.5 },
        ],
      };
  }
}

function filtroInteligente(f: Filtro, semente: number): Filter {
  const comum = { opacity: 1, blendMode: 'normal' as const, enabled: true, hasOptions: true, foregroundColor: { r: 0, g: 0, b: 0 }, backgroundColor: { r: 255, g: 255, b: 255 } };
  switch (f.tipo) {
    case 'desfoque':
      return { ...comum, name: 'Gaussian Blur', type: 'gaussian blur', filter: { radius: px(f.raio) } };
    case 'desfoque-de-movimento':
      return { ...comum, name: 'Motion Blur', type: 'motion blur', filter: { angle: f.angulo, distance: px(f.distancia) } };
    case 'ruido':
      return { ...comum, name: 'Add Noise', type: 'add noise', filter: { amount: f.quantidade, distribution: 'uniform', monochromatic: f.monocromatico, randomSeed: semente } };
    case 'nitidez':
      return { ...comum, name: 'Unsharp Mask', type: 'unsharp mask', filter: { amount: f.quantidade, radius: px(f.raio), threshold: 0 } };
  }
}

function efeitos(e: EfeitosDoArquivo): LayerEffectsInfo {
  const fx: LayerEffectsInfo = {};
  const base = { present: true, showInDialog: true, enabled: true };
  if (e.sombraProjetada) {
    const s = e.sombraProjetada;
    fx.dropShadow = [{ ...base, color: s.cor, opacity: s.opacidade, angle: s.angulo, distance: px(s.distancia), size: px(s.tamanho), blendMode: MESCLAGEM[s.modo], useGlobalLight: false }];
  }
  if (e.tracoInterno) fx.stroke = [{ ...base, position: 'inside', fillType: 'color', color: e.tracoInterno.cor, size: px(e.tracoInterno.espessura), opacity: 1, blendMode: 'normal' }];
  if (e.sombraInterna) {
    const s = e.sombraInterna;
    fx.innerShadow = [{ ...base, color: s.cor, opacity: s.opacidade, angle: s.angulo, distance: px(s.distancia), size: px(s.tamanho), blendMode: MESCLAGEM[s.modo], useGlobalLight: false }];
  }
  if (e.brilhoExterno) fx.outerGlow = { ...base, color: e.brilhoExterno.cor, opacity: e.brilhoExterno.opacidade, size: px(e.brilhoExterno.tamanho), blendMode: MESCLAGEM[e.brilhoExterno.modo] };
  if (e.brilhoInterno)
    fx.innerGlow = { ...base, color: e.brilhoInterno.cor, opacity: e.brilhoInterno.opacidade, size: px(e.brilhoInterno.tamanho), blendMode: MESCLAGEM[e.brilhoInterno.modo], source: 'edge' };
  if (e.sobreposicaoDeCor) fx.solidFill = [{ ...base, color: e.sobreposicaoDeCor.cor, opacity: e.sobreposicaoDeCor.opacidade, blendMode: MESCLAGEM[e.sobreposicaoDeCor.modo] }];
  if (e.sobreposicaoDeDegrade) {
    const g = e.sobreposicaoDeDegrade;
    fx.gradientOverlay = [
      {
        ...base,
        opacity: g.opacidade,
        blendMode: MESCLAGEM[g.modo],
        type: g.degrade.estilo,
        angle: g.degrade.angulo,
        align: true,
        scale: 100,
        gradient: { name: 'Otto', type: 'solid', ...paradas(g.degrade) },
      },
    ];
  }
  return fx;
}

/** Pixels no formato que a biblioteca aceita sem canvas: largura, altura e RGBA. */
const imagem = (largura: number, altura: number, rgba: Uint8Array) => ({ width: largura, height: altura, data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength) });

function camada(c: CamadaDoArquivo): Layer {
  const l: Layer = { name: c.nome, opacity: c.opacidade, blendMode: MESCLAGEM[c.modo], hidden: c.oculta };
  if (c.recortadaNaDeBaixo) l.clipping = true;
  if (c.bloqueada) l.protected = { transparency: true, composite: true, position: true };
  if (c.mascara) {
    const m = c.mascara;
    // a biblioteca lê a máscara do primeiro canal de uma imagem RGBA
    const rgba = new Uint8ClampedArray(m.largura * m.altura * 4);
    for (let i = 0; i < m.cobertura.length; i++) {
      const v = m.cobertura[i] as number;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    l.mask = { imageData: { width: m.largura, height: m.altura, data: rgba }, top: m.y, left: m.x, bottom: m.y + m.altura, right: m.x + m.largura, defaultColor: m.fora };
  }
  if (c.efeitos) l.effects = efeitos(c.efeitos);
  if (c.pixels) {
    l.imageData = imagem(c.pixels.largura, c.pixels.altura, c.pixels.rgba);
    l.top = c.pixels.y;
    l.left = c.pixels.x;
  }
  if (c.filhos) {
    l.opened = true;
    l.children = c.filhos.map(camada);
  }
  if (c.prancheta) {
    const p = c.prancheta;
    l.artboard = { rect: { top: p.y, left: p.x, bottom: p.y + p.altura, right: p.x + p.largura }, presetName: `${p.largura}×${p.altura}`, color: p.fundo, backgroundType: 1 };
  }
  if (c.ajuste) l.adjustment = ajuste(c.ajuste);
  if (c.preenchimento) l.vectorFill = conteudoVetorial(c.preenchimento);
  if (c.mascaraVetorial)
    l.vectorMask = { paths: c.mascaraVetorial.map((k) => ({ open: k.aberto, knots: k.nos.map(no), fillRule: k.regra === 'par-impar' ? ('even-odd' as const) : ('non-zero' as const) })) };
  if (c.tracoVetorial) {
    const t = c.tracoVetorial;
    l.vectorStroke = {
      strokeEnabled: true,
      fillEnabled: t.comPreenchimento,
      lineWidth: px(t.espessura),
      lineCapType: ({ reta: 'butt', redonda: 'round', quadrada: 'square' } as const)[t.ponta],
      lineJoinType: ({ angular: 'miter', redonda: 'round', chanfrada: 'bevel' } as const)[t.juncao],
      lineAlignment: 'center',
      opacity: 1,
      content: { type: 'color', color: t.cor },
    };
  }
  if (c.texto) {
    const t = c.texto;
    const caixa = { normal: 0, versalete: 1, alta: 2 } as const;
    l.text = {
      // o Photoshop separa parágrafos com retorno de carro
      text: t.conteudo.replace(/\n/g, '\r'),
      transform: [...t.transformacao],
      shapeType: 'box',
      boxBounds: [0, 0, t.caixa.largura, t.caixa.altura],
      antiAlias: 'smooth',
      style: {
        font: { name: t.estilo.fonte },
        fontSize: t.estilo.tamanho,
        fillColor: t.estilo.cor,
        autoLeading: false,
        leading: t.estilo.entrelinha,
        tracking: t.estilo.espacamento,
        fontCaps: caixa[t.estilo.caixa],
        autoKerning: t.estilo.kerning,
      },
      paragraphStyle: { justification: ({ esquerda: 'left', centro: 'center', direita: 'right' } as const)[t.alinhamento] },
      ...(t.trechos
        ? {
            styleRuns: t.trechos.map((r) => ({
              length: r.comprimento,
              style: { font: { name: r.estilo.fonte }, fontSize: r.estilo.tamanho, fillColor: r.estilo.cor, tracking: r.estilo.espacamento, autoLeading: false, leading: r.estilo.entrelinha },
            })),
          }
        : {}),
    };
  }
  if (c.objetoInteligente) {
    const o = c.objetoInteligente;
    l.placedLayer = {
      id: o.embutido,
      placed: o.instancia,
      type: 'raster',
      transform: [...o.cantos],
      width: o.largura,
      height: o.altura,
      ...(o.filtros.length > 0
        ? { filter: { enabled: true, validAtPosition: true, maskEnabled: false, maskLinked: false, maskExtendWithWhite: true, list: o.filtros.map((f) => filtroInteligente(f, o.semente)) } }
        : {}),
    };
  }
  return l;
}

export function criarFormatoPsd(): FormatoDeArquivoEmCamadas {
  return {
    escrever(arquivo: ArquivoEmCamadas): ArquivoGravado {
      const psd: Psd = {
        width: arquivo.largura,
        height: arquivo.altura,
        imageData: imagem(arquivo.largura, arquivo.altura, arquivo.composta),
        children: arquivo.camadas.map(camada),
      };
      if (arquivo.embutidos.length > 0) psd.linkedFiles = arquivo.embutidos.map((e) => ({ id: e.id, name: e.nome, type: e.tipo === 'png' ? 'png ' : 'JPEG', data: e.bytes }));
      const psb = arquivo.largura > MAIOR_LADO_DO_PSD || arquivo.altura > MAIOR_LADO_DO_PSD;
      // sem miniatura (a biblioteca só a gera com canvas) e sem aparar: a área de cada camada já vem justa
      const bytes = writePsdUint8Array(psd, { generateThumbnail: false, trimImageData: false, noBackground: true, psb });
      return { bytes, extensao: psb ? 'psb' : 'psd' };
    },
  };
}
