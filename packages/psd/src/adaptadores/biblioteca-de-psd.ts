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
import { lerPsd } from './leitura-de-psd';

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
  // a escala é fração: 1 é 100% (com 100 o Photoshop lia 10000% e o degradê virava uma faixa lisa)
  return { type: 'solid', name: 'Otto', style: p.estilo, angle: p.angulo, scale: 1, align: true, ...paradas(p) } as VectorContent;
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

/** Contorno linear: o padrão do Photoshop. Sem ele a biblioteca grava a sombra projetada com um contorno vazio, e o Photoshop recusa a camada. */
const CONTORNO_LINEAR = {
  name: 'Linear',
  curve: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
};

/**
 * Efeitos de camada, com TODOS os parâmetros que o Photoshop grava, nos valores neutros dele: contorno linear, sem
 * retração, sem ruído, sem suavização de serrilhado. Parâmetro que falta é parâmetro que o Photoshop preenche por conta
 * própria (ou rejeita: foi o caso do contorno da sombra projetada, "as configurações no arquivo não eram válidas").
 */
function efeitos(e: EfeitosDoArquivo): LayerEffectsInfo {
  const fx: LayerEffectsInfo = {};
  const base = { present: true, showInDialog: true, enabled: true };
  const sombra = (s: NonNullable<EfeitosDoArquivo['sombraProjetada']>) => ({
    ...base,
    color: s.cor,
    opacity: s.opacidade,
    angle: s.angulo,
    distance: px(s.distancia),
    size: px(s.tamanho),
    choke: px(0),
    blendMode: MESCLAGEM[s.modo],
    useGlobalLight: false,
    antialiased: false,
    contour: CONTORNO_LINEAR,
  });
  // brilho: técnica suave, sem retração, e o contorno linear valendo para o brilho inteiro (alcance de 100%): é o
  // desfoque puro que o motor desenha
  const brilho = (b: NonNullable<EfeitosDoArquivo['brilhoExterno']>) => ({
    ...base,
    color: b.cor,
    opacity: b.opacidade,
    size: px(b.tamanho),
    choke: px(0),
    blendMode: MESCLAGEM[b.modo],
    technique: 'softer' as const,
    antialiased: false,
    noise: 0,
    jitter: 0,
    range: 1,
    contour: CONTORNO_LINEAR,
  });
  if (e.sombraProjetada) fx.dropShadow = [{ ...sombra(e.sombraProjetada), layerConceals: true }];
  if (e.tracoInterno)
    fx.stroke = [{ ...base, position: 'inside', fillType: 'color', color: e.tracoInterno.cor, size: px(e.tracoInterno.espessura), opacity: 1, blendMode: 'normal', overprint: false }];
  if (e.sombraInterna) fx.innerShadow = [sombra(e.sombraInterna)];
  if (e.brilhoExterno) fx.outerGlow = brilho(e.brilhoExterno);
  if (e.brilhoInterno) fx.innerGlow = { ...brilho(e.brilhoInterno), source: 'edge' };
  if (e.sobreposicaoDeCor) fx.solidFill = [{ ...base, color: e.sobreposicaoDeCor.cor, opacity: e.sobreposicaoDeCor.opacidade, blendMode: MESCLAGEM[e.sobreposicaoDeCor.modo] }];
  if (e.sobreposicaoDeDegrade) {
    const g = e.sobreposicaoDeDegrade;
    fx.gradientOverlay = [
      // a escala é fração: 1 é 100%
      {
        ...base,
        opacity: g.opacidade,
        blendMode: MESCLAGEM[g.modo],
        type: g.degrade.estilo,
        angle: g.degrade.angulo,
        align: true,
        scale: 1,
        reverse: false,
        dither: false,
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
  if (c.misturaDeCanais) {
    const canal = (k: { vermelho: number; verde: number; azul: number; constante: number }) => ({ red: k.vermelho, green: k.verde, blue: k.azul, constant: k.constante });
    const m = c.misturaDeCanais;
    l.adjustment = { type: 'channel mixer', monochrome: false, red: canal(m.vermelho), green: canal(m.verde), blue: canal(m.azul), gray: { red: 0, green: 0, blue: 0, constant: 0 } };
  }
  if (c.formaViva) {
    const v = c.formaViva;
    const raio = px(v.raio);
    // tipos da forma viva no Photoshop: 1 retângulo, 2 retângulo arredondado, 5 elipse
    l.vectorOrigination = {
      keyDescriptorList: [
        {
          keyOriginType: v.forma === 'elipse' ? 5 : v.raio > 0 ? 2 : 1,
          keyOriginResolution: 72,
          keyOriginShapeBoundingBox: { top: px(v.y), left: px(v.x), bottom: px(v.y + v.altura), right: px(v.x + v.largura) },
          ...(v.forma === 'retangulo' ? { keyOriginRRectRadii: { topRight: raio, topLeft: raio, bottomLeft: raio, bottomRight: raio } } : {}),
          keyOriginBoxCorners: [
            { x: v.x, y: v.y },
            { x: v.x + v.largura, y: v.y },
            { x: v.x + v.largura, y: v.y + v.altura },
            { x: v.x, y: v.y + v.altura },
          ],
          transform: [1, 0, 0, 1, 0, 0],
        },
      ],
    };
  }
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

/**
 * Acrescenta um recurso de imagem ao arquivo já gravado. A biblioteca não grava o perfil de cor (recurso 1039), então
 * ele entra aqui, direto nos bytes: a seção de recursos vem depois do cabeçalho (26 bytes) e da seção de modo de cor,
 * e cada recurso é "8BIM", o número, um nome vazio, o tamanho e os dados, com tamanho par. Vale igual para PSD e PSB.
 */
export function comRecursoDeImagem(arquivo: Uint8Array, numero: number, dados: Uint8Array): Uint8Array {
  const v = new DataView(arquivo.buffer, arquivo.byteOffset, arquivo.byteLength);
  const inicioDosRecursos = 26 + 4 + v.getUint32(26);
  const tamanhoDosRecursos = v.getUint32(inicioDosRecursos);
  const preenchimento = dados.length % 2;
  const recurso = new Uint8Array(4 + 2 + 2 + 4 + dados.length + preenchimento);
  recurso.set([0x38, 0x42, 0x49, 0x4d], 0);
  const r = new DataView(recurso.buffer);
  r.setUint16(4, numero);
  r.setUint16(6, 0);
  r.setUint32(8, dados.length);
  recurso.set(dados, 12);
  const fim = inicioDosRecursos + 4 + tamanhoDosRecursos;
  const saida = new Uint8Array(arquivo.length + recurso.length);
  saida.set(arquivo.subarray(0, fim), 0);
  saida.set(recurso, fim);
  saida.set(arquivo.subarray(fim), fim + recurso.length);
  new DataView(saida.buffer).setUint32(inicioDosRecursos, tamanhoDosRecursos + recurso.length);
  return saida;
}

/** Número do recurso de imagem que guarda o perfil ICC. */
const RECURSO_DO_PERFIL_ICC = 1039;

export function criarFormatoPsd(): FormatoDeArquivoEmCamadas {
  return {
    ler: lerPsd,
    escrever(arquivo: ArquivoEmCamadas): ArquivoGravado {
      if (!arquivo.composta) throw new Error('O PSD precisa da imagem composta');
      const psd: Psd = {
        width: arquivo.largura,
        height: arquivo.altura,
        imageData: imagem(arquivo.largura, arquivo.altura, arquivo.composta),
        children: arquivo.camadas.map(camada),
      };
      if (arquivo.embutidos.length > 0) psd.linkedFiles = arquivo.embutidos.map((e) => ({ id: e.id, name: e.nome, type: e.tipo === 'png' ? 'png ' : 'JPEG', data: e.bytes }));
      const psb = arquivo.largura > MAIOR_LADO_DO_PSD || arquivo.altura > MAIOR_LADO_DO_PSD;
      // sem miniatura (a biblioteca só a gera com canvas) e sem aparar: a área de cada camada já vem justa
      const gravado = writePsdUint8Array(psd, { generateThumbnail: false, trimImageData: false, noBackground: true, psb });
      const bytes = arquivo.perfilDeCor ? comRecursoDeImagem(gravado, RECURSO_DO_PERFIL_ICC, arquivo.perfilDeCor) : gravado;
      return { bytes, extensao: psb ? 'psb' : 'psd' };
    },
  };
}
