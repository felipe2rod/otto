// A leitura do PSD pela biblioteca ag-psd, traduzida para o modelo da porta (ADR 020, ADR 028 item 4).
// Como na escrita (biblioteca-de-psd.ts), aqui não há decisão de mapeamento: o adaptador diz o que o arquivo tem,
// nos tipos da porta, e lista em `foraDoModelo` o que viu e não coube neles. O que fazer com cada coisa é de desmontar.ts.
//
// O pixel não é decodificado na leitura: a biblioteca guarda os canais comprimidos (vistas dos bytes do arquivo), e
// cada camada é decodificada quando quem importa pede, uma de cada vez.
import type { Ajuste, Filtro, ModoDoGrupo } from '@otto/documento';
import {
  type AdjustmentLayer,
  type BezierPath,
  type Color,
  decodeLayerPixels,
  getCompositeImageData,
  initializeCanvas,
  type Layer,
  type LayerEffectsInfo,
  type LayerTextData,
  type Psd,
  readPsd,
  type TextStyle,
  type UnitsValue,
} from 'ag-psd';
import type {
  ArquivoEmbutido,
  ArquivoLido,
  BrilhoDoArquivo,
  CamadaLida,
  CaminhoDoArquivo,
  DegradeDoArquivo,
  EfeitosDoArquivo,
  EstiloDeTextoDoArquivo,
  ForaDoModelo,
  MascaraDoArquivo,
  MascaraLida,
  OpcoesDeLeitura,
  PixelsDoArquivo,
  PreenchimentoDoArquivo,
  Rgb,
  SombraDoArquivo,
  TextoLido,
} from '../porta';

// A biblioteca pede um canvas para criar a imagem de cada camada. Aqui ela recebe só o bloco de pixels: não há canvas
// no servidor, e nada do que a importação usa precisa de um (a miniatura é pulada).
initializeCanvas(
  () => {
    throw new Error('A leitura de PSD não usa canvas');
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData,
);

const MODO: Record<string, ModoDoGrupo> = {
  'pass through': 'atravessar',
  normal: 'normal',
  darken: 'escurecer',
  multiply: 'multiplicacao',
  'color burn': 'subexposicao-de-cores',
  'linear burn': 'subexposicao-linear',
  'darker color': 'cor-mais-escura',
  lighten: 'clarear',
  screen: 'tela',
  'color dodge': 'superexposicao-de-cores',
  'linear dodge': 'superexposicao-linear',
  'lighter color': 'cor-mais-clara',
  overlay: 'sobrepor',
  'soft light': 'luz-suave',
  'hard light': 'luz-direta',
  'vivid light': 'luz-intensa',
  'linear light': 'luz-linear',
  'pin light': 'luz-do-ponto',
  'hard mix': 'mistura-solida',
  difference: 'diferenca',
  exclusion: 'exclusao',
  subtract: 'subtrair',
  divide: 'dividir',
  hue: 'matiz',
  saturation: 'saturacao',
  color: 'cor',
  luminosity: 'luminosidade',
};

type Fora = ForaDoModelo[];
const limitar = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const byte = (v: number): number => limitar(Math.round(v), 0, 255);
const px = (v: UnitsValue | undefined): number => v?.value ?? 0;
const hex = (c: Rgb): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** A cor em RGB de 8 bits. A biblioteca devolve RGB com frações, ou RGB de 0 a 1; os outros modelos de cor não vêm de arquivo RGB. */
function rgb(c: Color | undefined): Rgb | undefined {
  if (!c) return undefined;
  if ('r' in c) return { r: byte(c.r), g: byte(c.g), b: byte(c.b) };
  if ('fr' in c) return { r: byte(c.fr * 255), g: byte(c.fg * 255), b: byte(c.fb * 255) };
  return undefined;
}

function modoDe(nome: string | undefined, fora: Fora, oQue: string): ModoDoGrupo {
  const modo = MODO[nome ?? 'normal'];
  if (modo) return modo;
  fora.push({ recurso: 'modo-dissolver', detalhe: `${oQue} em modo ${nome === 'dissolve' ? 'dissolver' : `"${nome}"`}` });
  return 'normal';
}
/** Modo de efeito ou de sobreposição: "atravessar" não existe ali. */
function modoDeEfeito(nome: string | undefined, fora: Fora, oQue: string): Exclude<ModoDoGrupo, 'atravessar'> {
  const modo = modoDe(nome, fora, oQue);
  return modo === 'atravessar' ? 'normal' : modo;
}

interface ParadasDaBiblioteca {
  type?: string;
  colorStops?: { color: Color; location: number; midpoint: number }[];
  opacityStops?: { opacity: number; location: number; midpoint: number }[];
}
interface PosicaoDoDegrade {
  style?: string | undefined;
  angle?: number | undefined;
  scale?: number | undefined;
  reverse?: boolean | undefined;
  align?: boolean | undefined;
  offset?: { x: number; y: number } | undefined;
  /** como o Photoshop interpola entre as paradas: "classic" (em sRGB, como o Otto), "perceptual" (em Oklab) ou "linear" (em luz linear) */
  interpolationMethod?: string | undefined;
  method?: string | undefined;
}

// ---- interpolação de degradê do Photoshop: perceptual é em Oklab, linear é em luz linear
const paraLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const deLinear = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
function paraOklab(c: Rgb): [number, number, number] {
  const r = paraLinear(c.r / 255);
  const g = paraLinear(c.g / 255);
  const b = paraLinear(c.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function deOklab([L, A, B]: [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const canal = (v: number): number => byte(deLinear(limitar(v, 0, 1)) * 255);
  return {
    r: canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}
/** A cor a meio caminho (k de 0 a 1) entre duas, no método de interpolação do Photoshop. */
function misturarCores(a: Rgb, b: Rgb, k: number, metodo: string): Rgb {
  if (metodo === 'perceptual') {
    const x = paraOklab(a);
    const y = paraOklab(b);
    return deOklab([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
  }
  if (metodo === 'linear') {
    const canal = (p: number, q: number): number => byte(deLinear(paraLinear(p / 255) + (paraLinear(q / 255) - paraLinear(p / 255)) * k) * 255);
    return { r: canal(a.r, b.r), g: canal(a.g, b.g), b: canal(a.b, b.b) };
  }
  return { r: byte(a.r + (b.r - a.r) * k), g: byte(a.g + (b.g - a.g) * k), b: byte(a.b + (b.b - a.b) * k) };
}

/**
 * O degradê no modelo da porta, ou o motivo de não caber nele. `aproximado` vem quando o Photoshop interpola de um
 * jeito que o Otto não tem (perceptual ou linear): entram paradas a mais, até as seis do Otto, para a curva ficar perto.
 */
function degrade(g: ParadasDaBiblioteca | undefined, onde: PosicaoDoDegrade): (DegradeDoArquivo & { aproximado?: string }) | string {
  if (!g || g.type === 'noise') return 'degradê de ruído';
  const estilo = onde.style ?? 'linear';
  if (estilo !== 'linear' && estilo !== 'radial') return `degradê de estilo "${estilo}"`;
  if (onde.scale !== undefined && Math.abs(onde.scale - 1) > 0.01) return `degradê com escala de ${Math.round(onde.scale * 100)}%`;
  if (onde.offset && (Math.abs(onde.offset.x) > 0.001 || Math.abs(onde.offset.y) > 0.001)) return 'degradê deslocado';
  if (onde.align === false) return 'degradê que não acompanha a camada';
  const cores = [...(g.colorStops ?? [])].sort((a, b) => a.location - b.location);
  const opacidades = [...(g.opacityStops ?? [])].sort((a, b) => a.location - b.location);
  if (cores.length === 0) return 'degradê sem cor';
  if ([...cores, ...opacidades].some((q, i) => i > 0 && Math.abs((q.midpoint ?? 0.5) - 0.5) > 0.02)) return 'degradê com ponto médio fora do centro';
  const coresRgb = cores.map((q) => rgb(q.color));
  if (coresRgb.some((c) => !c)) return 'degradê com cor fora de RGB';
  // valor do degradê numa posição: linear entre as paradas vizinhas, constante fora delas
  const em = <T>(paradas: { location: number }[], valores: T[], t: number, misturar: (a: T, b: T, k: number) => T): T => {
    const depois = paradas.findIndex((q) => q.location >= t);
    if (depois === 0) return valores[0] as T;
    if (depois < 0) return valores[valores.length - 1] as T;
    const a = paradas[depois - 1] as { location: number };
    const b = paradas[depois] as { location: number };
    const k = b.location === a.location ? 1 : (t - a.location) / (b.location - a.location);
    return misturar(valores[depois - 1] as T, valores[depois] as T, k);
  };
  const metodo = onde.interpolationMethod ?? onde.method ?? 'classic';
  const corEm = (t: number): Rgb => em(cores, coresRgb as Rgb[], t, (a, b, k) => misturarCores(a, b, k, metodo));
  const opacidadeEm = (t: number): number =>
    opacidades.length === 0
      ? 1
      : em(
          opacidades,
          opacidades.map((q) => q.opacity),
          t,
          (a, b, k) => a + (b - a) * k,
        );
  // as paradas do Otto levam cor e opacidade juntas: valem as posições das duas listas (a de opacidade só se muda algo)
  const opaco = opacidades.every((q) => q.opacity >= 0.999);
  const posicoes = [...new Set([...cores, ...(opaco ? [] : opacidades)].map((q) => Math.round(limitar(q.location, 0, 1) * 10000) / 10000))].sort((a, b) => a - b);
  if (posicoes.length === 1) posicoes.push(posicoes[0] === 1 ? 0 : 1);
  posicoes.sort((a, b) => a - b);
  if (posicoes.length > 6) return `degradê com ${posicoes.length} paradas`;
  // interpolação que o Otto não tem: parte ao meio o trecho em que a reta do Otto mais se afasta da curva, enquanto houver parada sobrando
  let aproximado: string | undefined;
  if (metodo !== 'classic') {
    const distancia = (a: Rgb, b: Rgb): number => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    let maiorErro = 0;
    for (;;) {
      let pior = -1;
      let erro = 6;
      for (let i = 0; i + 1 < posicoes.length; i++) {
        const de = posicoes[i] as number;
        const ate = posicoes[i + 1] as number;
        const e = distancia(corEm((de + ate) / 2), misturarCores(corEm(de), corEm(ate), 0.5, 'classic'));
        if (e > erro) {
          erro = e;
          pior = i;
        }
      }
      if (pior < 0) break;
      maiorErro = Math.max(maiorErro, erro);
      if (posicoes.length >= 6) break;
      posicoes.splice(pior + 1, 0, Math.round((((posicoes[pior] as number) + (posicoes[pior + 1] as number)) / 2) * 10000) / 10000);
    }
    if (maiorErro > 0) aproximado = `degradê com interpolação ${metodo === 'perceptual' ? 'perceptual' : 'linear'} do Photoshop: veio aproximado, em ${posicoes.length} paradas`;
  }
  const paradas = posicoes.map((t) => ({ cor: corEm(t), posicao: onde.reverse ? Math.round((1 - t) * 10000) / 10000 : t, opacidade: Math.round(opacidadeEm(t) * 1000) / 1000 }));
  return { estilo, angulo: onde.angle ?? 90, paradas: paradas.sort((a, b) => a.posicao - b.posicao), ...(aproximado ? { aproximado } : {}) };
}

/** O degradê sem a nota de aproximação, e a nota em `fora`. */
function degradeComNota(d: DegradeDoArquivo & { aproximado?: string }, fora: Fora): DegradeDoArquivo {
  const { aproximado, ...resto } = d;
  if (aproximado) fora.push({ recurso: 'degrade-aproximado', detalhe: aproximado });
  return resto;
}

const contornoLinear = (c: { curve: { x: number; y: number }[] } | undefined): boolean => !c || (c.curve.length === 2 && c.curve.every((q) => Math.abs(q.x - q.y) < 1));

function efeitos(e: LayerEffectsInfo, anguloGlobal: number | undefined, fora: Fora): EfeitosDoArquivo | undefined {
  if (e.disabled) return undefined;
  const fx: EfeitosDoArquivo = {};
  const escala = e.scale ?? 1;
  const ligados = <T extends { enabled?: boolean }>(lista: T[] | undefined, nome: string): T | undefined => {
    const ativos = (lista ?? []).filter((x) => x.enabled !== false);
    if (ativos.length > 1) fora.push({ recurso: 'efeito-repetido', detalhe: `${ativos.length} efeitos de ${nome} na mesma camada: veio o primeiro` });
    return ativos[0];
  };
  const parcial = (nome: string, oQue: string[]): void => {
    if (oQue.length > 0) fora.push({ recurso: 'efeito-parcial', detalhe: `${nome} com ${oQue.join(', ')}` });
  };
  const sombra = (s: NonNullable<LayerEffectsInfo['dropShadow']>[number], nome: string): SombraDoArquivo | undefined => {
    const cor = rgb(s.color);
    if (!cor) {
      fora.push({ recurso: 'efeito-desconhecido', detalhe: `${nome} com cor fora de RGB` });
      return undefined;
    }
    parcial(nome, [px(s.choke) > 0 ? 'expansão ou retração' : '', contornoLinear(s.contour) ? '' : 'contorno próprio', (s as { noise?: number }).noise ? 'ruído' : ''].filter(Boolean));
    return {
      cor,
      opacidade: s.opacity ?? 1,
      angulo: s.useGlobalLight && anguloGlobal !== undefined ? anguloGlobal : (s.angle ?? 120),
      distancia: px(s.distance) * escala,
      tamanho: px(s.size) * escala,
      modo: modoDeEfeito(s.blendMode, fora, nome),
    };
  };
  const brilho = (b: NonNullable<LayerEffectsInfo['innerGlow']>, nome: string): BrilhoDoArquivo | undefined => {
    const cor = rgb(b.color);
    if (!cor) {
      fora.push({ recurso: 'efeito-desconhecido', detalhe: `${nome} em degradê ou com cor fora de RGB` });
      return undefined;
    }
    parcial(
      nome,
      [
        px(b.choke) > 0 ? 'expansão ou retração' : '',
        contornoLinear(b.contour) ? '' : 'contorno próprio',
        b.noise ? 'ruído' : '',
        b.technique === 'precise' ? 'técnica precisa' : '',
        b.source === 'center' ? 'origem no centro' : '',
        b.range !== undefined && Math.abs(b.range - 0.5) > 0.01 && Math.abs(b.range - 1) > 0.01 ? 'intervalo próprio' : '',
      ].filter(Boolean),
    );
    return { cor, opacidade: b.opacity ?? 1, tamanho: px(b.size) * escala, modo: modoDeEfeito(b.blendMode, fora, nome) };
  };

  const projetada = ligados(e.dropShadow, 'sombra projetada');
  if (projetada) {
    const s = sombra(projetada, 'sombra projetada');
    if (s) fx.sombraProjetada = s;
  }
  const interna = ligados(e.innerShadow, 'sombra interna');
  if (interna) {
    const s = sombra(interna, 'sombra interna');
    if (s) fx.sombraInterna = s;
  }
  if (e.outerGlow && e.outerGlow.enabled !== false) {
    const b = brilho(e.outerGlow, 'brilho externo');
    if (b) fx.brilhoExterno = b;
  }
  if (e.innerGlow && e.innerGlow.enabled !== false) {
    const b = brilho(e.innerGlow, 'brilho interno');
    if (b) fx.brilhoInterno = b;
  }
  const cor = ligados(e.solidFill, 'sobreposição de cor');
  if (cor) {
    const c = rgb(cor.color);
    if (c) fx.sobreposicaoDeCor = { cor: c, opacidade: cor.opacity ?? 1, modo: modoDeEfeito(cor.blendMode, fora, 'sobreposição de cor') };
    else fora.push({ recurso: 'efeito-desconhecido', detalhe: 'sobreposição de cor fora de RGB' });
  }
  const emDegrade = ligados(e.gradientOverlay, 'sobreposição de degradê');
  if (emDegrade) {
    const d = degrade(emDegrade.gradient, { ...emDegrade, style: emDegrade.type });
    if (typeof d === 'string') fora.push({ recurso: 'efeito-desconhecido', detalhe: `sobreposição de degradê (${d})` });
    else fx.sobreposicaoDeDegrade = { degrade: degradeComNota(d, fora), opacidade: emDegrade.opacity ?? 1, modo: modoDeEfeito(emDegrade.blendMode, fora, 'sobreposição de degradê') };
  }
  const traco = ligados(e.stroke, 'traço');
  if (traco) {
    const c = rgb(traco.color);
    const motivo = [
      traco.position !== 'inside' ? (traco.position === 'outside' ? 'por fora' : 'pelo centro') : '',
      (traco.fillType ?? 'color') !== 'color' ? (traco.fillType === 'gradient' ? 'em degradê' : 'de padrão') : '',
      !c ? 'com cor fora de RGB' : '',
    ].filter(Boolean);
    if (motivo.length > 0 || !c) fora.push({ recurso: 'efeito-desconhecido', detalhe: `traço ${motivo.join(' e ')}` });
    else {
      fx.tracoInterno = { cor: c, espessura: px(traco.size) * escala };
      parcial('traço', [(traco.opacity ?? 1) < 0.999 ? 'opacidade própria' : '', (traco.blendMode ?? 'normal') !== 'normal' ? 'modo de mesclagem próprio' : ''].filter(Boolean));
    }
  }
  if (e.bevel && e.bevel.enabled !== false) fora.push({ recurso: 'efeito-desconhecido', detalhe: 'chanfro e entalhe' });
  if (e.satin && e.satin.enabled !== false) fora.push({ recurso: 'efeito-desconhecido', detalhe: 'acetinado' });
  if (e.patternOverlay && e.patternOverlay.enabled !== false) fora.push({ recurso: 'efeito-desconhecido', detalhe: 'sobreposição de padrão' });
  return Object.keys(fx).length > 0 ? fx : undefined;
}

type MisturaDeCanais = NonNullable<CamadaLida['misturaDeCanais']>;

/** A camada de ajuste no modelo do Otto. O que não cabe vai para `fora`: desconhecido (sem ajuste) ou parcial (com ajuste, sem um parâmetro). */
function ajuste(a: AdjustmentLayer, fora: Fora): { ajuste?: Ajuste; mistura?: MisturaDeCanais } {
  const desconhecido = (nome: string): Record<string, never> => {
    fora.push({ recurso: 'ajuste-desconhecido', detalhe: nome });
    return {};
  };
  const parcial = (oQue: string): void => {
    fora.push({ recurso: 'ajuste-parcial', detalhe: oQue });
  };
  switch (a.type) {
    case 'curves': {
      const curva = (c: { input: number; output: number }[] | undefined): [number, number][] | undefined => {
        if (!c || c.length < 2) return undefined;
        const pontos = c.map((q): [number, number] => [limitar(q.input, 0, 255), limitar(q.output, 0, 255)]);
        // a curva identidade não muda nada: fica de fora
        if (pontos.length === 2 && pontos[0]?.[0] === 0 && pontos[0]?.[1] === 0 && pontos[1]?.[0] === 255 && pontos[1]?.[1] === 255) return undefined;
        if (pontos.length > 16) {
          parcial('curva com mais de 16 pontos: vieram 16');
          return pontos.filter((_, i) => i === pontos.length - 1 || i % Math.ceil(pontos.length / 15) === 0).slice(0, 16);
        }
        return pontos;
      };
      const rgbC = curva(a.rgb);
      const vermelho = curva(a.red);
      const verde = curva(a.green);
      const azul = curva(a.blue);
      return { ajuste: { tipo: 'curvas', ...(rgbC ? { rgb: rgbC } : {}), ...(vermelho ? { vermelho } : {}), ...(verde ? { verde } : {}), ...(azul ? { azul } : {}) } };
    }
    case 'levels': {
      const neutro = (c: { shadowInput: number; highlightInput: number; shadowOutput: number; highlightOutput: number; midtoneInput: number } | undefined): boolean =>
        !c || (c.shadowInput === 0 && c.highlightInput === 255 && c.shadowOutput === 0 && c.highlightOutput === 255 && Math.abs(c.midtoneInput - 1) < 0.005);
      if (!neutro(a.red) || !neutro(a.green) || !neutro(a.blue)) parcial('níveis por canal: só veio o ajuste dos três canais juntos');
      const c = a.rgb;
      return {
        ajuste: {
          tipo: 'niveis',
          pretoDeEntrada: limitar(c?.shadowInput ?? 0, 0, 253),
          brancoDeEntrada: limitar(c?.highlightInput ?? 255, 2, 255),
          gama: limitar(c?.midtoneInput ?? 1, 0.1, 9.99),
          pretoDeSaida: limitar(c?.shadowOutput ?? 0, 0, 255),
          brancoDeSaida: limitar(c?.highlightOutput ?? 255, 0, 255),
        },
      };
    }
    case 'hue/saturation': {
      const m = a.master;
      const faixas = [a.reds, a.yellows, a.greens, a.cyans, a.blues, a.magentas].some((f) => f && (f.hue !== 0 || f.saturation !== 0 || f.lightness !== 0));
      if (faixas) parcial('matiz e saturação por faixa de cor: só veio o ajuste geral');
      return { ajuste: { tipo: 'matiz-saturacao', matiz: limitar(m?.hue ?? 0, -180, 180), saturacao: limitar(m?.saturation ?? 0, -100, 100), luminosidade: limitar(m?.lightness ?? 0, -100, 100) } };
    }
    case 'brightness/contrast':
      if (a.useLegacy) parcial('brilho e contraste no modo legado: veio como o brilho e contraste comum');
      return { ajuste: { tipo: 'brilho-contraste', brilho: limitar(a.brightness ?? 0, -150, 150), contraste: limitar(a.contrast ?? 0, -50, 100) } };
    case 'vibrance':
      return { ajuste: { tipo: 'vibracao', vibracao: limitar(a.vibrance ?? 0, -100, 100), saturacao: limitar(a.saturation ?? 0, -100, 100) } };
    case 'color balance': {
      const v = (q: { cyanRed: number; magentaGreen: number; yellowBlue: number } | undefined): [number, number, number] => [q?.cyanRed ?? 0, q?.magentaGreen ?? 0, q?.yellowBlue ?? 0];
      if (a.preserveLuminosity === false) parcial('equilíbrio de cores sem preservar a luminosidade: veio preservando');
      return { ajuste: { tipo: 'equilibrio-de-cor', sombras: v(a.shadows), meiosTons: v(a.midtones), realces: v(a.highlights) } };
    }
    case 'photo filter': {
      const c = rgb(a.color);
      if (!c) return desconhecido('filtro de fotografia com cor fora de RGB');
      if (a.preserveLuminosity === false) parcial('filtro de fotografia sem preservar a luminosidade: veio preservando');
      return { ajuste: { tipo: 'filtro-de-foto', cor: hex(c), densidade: limitar(a.density ?? 25, 1, 100) } };
    }
    case 'black & white': {
      const padrao = [a.reds ?? 40, a.yellows ?? 60, a.greens ?? 40, a.cyans ?? 60, a.blues ?? 20, a.magentas ?? 80].every((v, i) => v === [40, 60, 40, 60, 20, 80][i]);
      if (!padrao) parcial('preto e branco com pesos próprios: veio com os pesos padrão');
      if (a.useTint) parcial('preto e branco com tonalidade: veio sem a tonalidade');
      return { ajuste: { tipo: 'preto-e-branco' } };
    }
    case 'gradient map': {
      const lido = degrade(
        { type: a.gradientType, ...(a.colorStops ? { colorStops: a.colorStops } : {}), ...(a.opacityStops ? { opacityStops: a.opacityStops } : {}) },
        { ...(a.reverse ? { reverse: true } : {}), method: a.method },
      );
      if (typeof lido === 'string') return desconhecido(`mapa de degradê (${lido})`);
      const d = degradeComNota(lido, fora);
      if (d.paradas.some((q) => q.opacidade < 0.999)) parcial('mapa de degradê com transparência: veio opaco');
      return { ajuste: { tipo: 'mapa-de-degrade', paradas: d.paradas.map((q) => ({ cor: hex(q.cor), posicao: q.posicao })) } };
    }
    case 'channel mixer': {
      if (a.monochrome || !a.red || !a.green || !a.blue) return desconhecido('misturador de canais monocromático');
      const canal = (c: { red: number; green: number; blue: number; constant: number }) => ({ vermelho: c.red, verde: c.green, azul: c.blue, constante: c.constant });
      return { mistura: { vermelho: canal(a.red), verde: canal(a.green), azul: canal(a.blue) } };
    }
    case 'exposure':
      return desconhecido('exposição');
    case 'color lookup':
      return desconhecido('pesquisa de cor');
    case 'invert':
      return desconhecido('inverter');
    case 'posterize':
      return desconhecido('posterizar');
    case 'threshold':
      return desconhecido('limiar');
    case 'selective color':
      return desconhecido('cor seletiva');
    default:
      return desconhecido(`ajuste "${(a as { type: string }).type}"`);
  }
}

function caminhos(lista: BezierPath[]): CaminhoDoArquivo[] {
  return lista.map((p) => ({
    aberto: p.open,
    regra: p.fillRule === 'even-odd' ? 'par-impar' : 'nao-zero',
    nos: p.knots.map((k) => ({
      chegada: [k.points[0] as number, k.points[1] as number],
      ancora: [k.points[2] as number, k.points[3] as number],
      saida: [k.points[4] as number, k.points[5] as number],
      ligado: k.linked,
    })),
  }));
}

/** O estilo de caractere que vale para um trecho: o da camada com o do trecho por cima. */
function estiloDeTexto(s: TextStyle, entrelinhaAutomatica: number, fora: Set<string>): EstiloDeTextoDoArquivo {
  const tamanho = s.fontSize ?? 12;
  if (s.fauxBold) fora.add('negrito falso');
  if (s.fauxItalic) fora.add('itálico falso');
  if (s.underline) fora.add('sublinhado');
  if (s.strikethrough) fora.add('riscado');
  if (s.horizontalScale !== undefined && Math.abs(s.horizontalScale - 1) > 0.005) fora.add('escala horizontal');
  if (s.verticalScale !== undefined && Math.abs(s.verticalScale - 1) > 0.005) fora.add('escala vertical');
  if (s.baselineShift) fora.add('deslocamento da linha de base');
  if (s.fontBaseline) fora.add('sobrescrito ou subscrito');
  if (s.strokeFlag) fora.add('contorno');
  if (s.fillFlag === false) fora.add('sem preenchimento');
  const cor = rgb(s.fillColor);
  if (s.fillColor && !cor) fora.add('cor fora de RGB');
  return {
    fonte: s.font?.name ?? '',
    tamanho,
    cor: cor ?? { r: 0, g: 0, b: 0 },
    entrelinha: s.autoLeading === false && s.leading !== undefined ? s.leading : tamanho * entrelinhaAutomatica,
    espacamento: s.tracking ?? 0,
    caixa: s.fontCaps === 2 ? 'alta' : s.fontCaps === 1 ? 'versalete' : 'normal',
    kerning: s.autoKerning !== false,
  };
}

function texto(t: LayerTextData, fora: Fora): TextoLido {
  if (t.orientation === 'vertical') fora.push({ recurso: 'texto-vertical', detalhe: 'texto na vertical' });
  if (t.warp && t.warp.style !== 'none') fora.push({ recurso: 'texto-deformado', detalhe: `texto deformado (${t.warp.style})` });
  // tipo 2: texto que segue um caminho (0 é texto de ponto, 1 é texto em caixa)
  if (t.textPath?.data.type === 2) fora.push({ recurso: 'texto-em-caminho', detalhe: 'texto em caminho' });

  const paragrafos = [t.paragraphStyle ?? {}, ...(t.paragraphStyleRuns ?? []).map((r) => ({ ...t.paragraphStyle, ...r.style }))];
  const justificacoes = new Set(paragrafos.map((p) => p.justification ?? 'left'));
  const paragrafo: string[] = [];
  if (justificacoes.size > 1 && (t.paragraphStyleRuns?.length ?? 0) > 0) {
    const dosTrechos = new Set((t.paragraphStyleRuns ?? []).map((r) => r.style.justification ?? t.paragraphStyle?.justification ?? 'left'));
    if (dosTrechos.size > 1) paragrafo.push('alinhamento diferente por parágrafo');
  }
  const justificacao = (t.paragraphStyleRuns?.[0]?.style.justification ?? t.paragraphStyle?.justification ?? 'left') as string;
  if (justificacao.startsWith('justify')) paragrafo.push('texto justificado');
  if (paragrafos.some((p) => p.firstLineIndent || p.startIndent || p.endIndent)) paragrafo.push('recuo');
  if (paragrafos.some((p) => p.spaceBefore || p.spaceAfter)) paragrafo.push('espaço antes ou depois do parágrafo');
  if (paragrafo.length > 0) fora.push({ recurso: 'paragrafo-de-texto', detalhe: paragrafo.join(', ') });

  const entrelinhaAutomatica = t.paragraphStyle?.autoLeading ?? 1.2;
  const foraDoEstilo = new Set<string>();
  const base = t.style ?? {};
  // o Photoshop separa parágrafos com retorno de carro, e quebra de linha dentro do parágrafo com o caractere 3
  const conteudo = t.text.replace(/\r\n?/g, '\n').replaceAll(String.fromCharCode(3), '\n');
  const trechos: NonNullable<TextoLido['trechos']> = [];
  let resta = conteudo.length;
  for (const r of t.styleRuns ?? []) {
    const comprimento = Math.min(r.length, resta);
    if (comprimento <= 0) break;
    resta -= comprimento;
    const e = estiloDeTexto({ ...base, ...r.style }, entrelinhaAutomatica, foraDoEstilo);
    trechos.push({ comprimento, estilo: { fonte: e.fonte, tamanho: e.tamanho, cor: e.cor, espacamento: e.espacamento, entrelinha: e.entrelinha } });
  }
  const estilos = (t.styleRuns ?? []).map((r) => ({ ...base, ...r.style }));
  if (new Set(estilos.map((s) => s.fontCaps ?? 0)).size > 1) foraDoEstilo.add('caixa alta ou versalete só em parte do texto');
  // sem trechos, o estilo é o da camada; com trechos, o do primeiro (quem importa escolhe o que cobre mais texto)
  const estilo = estiloDeTexto(estilos[0] ?? base, entrelinhaAutomatica, foraDoEstilo);
  if (foraDoEstilo.size > 0) fora.push({ recurso: 'estilo-de-texto', detalhe: [...foraDoEstilo].join(', ') });

  const m = (t.transform ?? [1, 0, 0, 1, 0, 0]) as [number, number, number, number, number, number];
  const emCaixa = t.shapeType === 'box' && t.boxBounds !== undefined;
  const [bx, by, bx1, by1] = (emCaixa ? t.boxBounds : [0, 0, 0, 0]) as [number, number, number, number];
  return {
    forma: emCaixa ? 'caixa' : 'ponto',
    conteudo,
    // a caixa pode não começar na origem do texto: o deslocamento dela entra na transformação
    transformacao: [m[0], m[1], m[2], m[3], m[4] + m[0] * bx + m[2] * by, m[5] + m[1] * bx + m[3] * by],
    caixa: { largura: bx1 - bx, altura: by1 - by },
    alinhamento: justificacao.includes('center') ? 'centro' : justificacao.includes('right') ? 'direita' : 'esquerda',
    estilo,
    ...(trechos.length > 0 ? { trechos } : {}),
  };
}

const tipoDeImagem = (b: Uint8Array | undefined): 'png' | 'jpeg' | undefined =>
  !b ? undefined : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpeg' : undefined;

/** A malha de deformação é a grade regular, isto é, não deforma nada? (É o que o Photoshop grava em todo objeto inteligente.) */
function semDeformacao(w: NonNullable<Layer['placedLayer']>['warp']): boolean {
  if (!w || w.style === 'none') return true;
  if (w.style !== 'custom' || !w.customEnvelopeWarp || !w.bounds) return false;
  const pontos = w.customEnvelopeWarp.meshPoints;
  const colunas = w.uOrder ?? 4;
  const linhas = w.vOrder ?? 4;
  if (pontos.length !== colunas * linhas) return false;
  const x0 = px(w.bounds.left);
  const y0 = px(w.bounds.top);
  const largura = px(w.bounds.right) - x0;
  const altura = px(w.bounds.bottom) - y0;
  return pontos.every((p, i) => Math.abs(p.x - (x0 + ((i % colunas) * largura) / (colunas - 1))) < 0.01 && Math.abs(p.y - (y0 + (Math.floor(i / colunas) * altura) / (linhas - 1))) < 0.01);
}

function filtroInteligente(f: NonNullable<NonNullable<Layer['placedLayer']>['filter']>['list'][number]): Filtro | string {
  const nome = f.name || f.type;
  if ((f.opacity ?? 1) < 0.999 || (f.blendMode ?? 'normal') !== 'normal') return `${nome} com opacidade ou modo próprios`;
  switch (f.type) {
    case 'gaussian blur':
      return px(f.filter.radius) <= 250 ? { tipo: 'desfoque', raio: px(f.filter.radius) } : `${nome} com raio acima de 250 px`;
    case 'motion blur':
      return px(f.filter.distance) <= 500 ? { tipo: 'desfoque-de-movimento', angulo: f.filter.angle, distancia: px(f.filter.distance) } : `${nome} com distância acima de 500 px`;
    case 'add noise':
      return f.filter.distribution === 'uniform' && f.filter.amount <= 1 ? { tipo: 'ruido', quantidade: f.filter.amount, monocromatico: f.filter.monochromatic } : `${nome} gaussiano ou acima de 100%`;
    case 'unsharp mask':
      return f.filter.threshold === 0 && f.filter.amount <= 5 && px(f.filter.radius) >= 0.1 && px(f.filter.radius) <= 50
        ? { tipo: 'nitidez', quantidade: f.filter.amount, raio: px(f.filter.radius) }
        : `${nome} com limiar, ou fora da faixa do Otto`;
    default:
      return nome;
  }
}

function camada(l: Layer, psd: Psd, embutidos: Map<string, ArquivoEmbutido>): CamadaLida {
  const fora: Fora = [];
  const area = { x: l.left ?? 0, y: l.top ?? 0, largura: Math.max(0, (l.right ?? 0) - (l.left ?? 0)), altura: Math.max(0, (l.bottom ?? 0) - (l.top ?? 0)) };
  // com máscara vetorial e máscara de pixels na mesma camada, `mask` é a soma das duas e `realMask` é a de pixels
  const daBiblioteca = l.mask?.fromVectorData ? l.realMask : l.mask;
  const temMascara = daBiblioteca && (daBiblioteca.right ?? 0) > (daBiblioteca.left ?? 0) && (daBiblioteca.bottom ?? 0) > (daBiblioteca.top ?? 0);
  const fundoDaMascara: 0 | 255 = (daBiblioteca?.defaultColor ?? 0) >= 128 ? 255 : 0;
  let mascara: MascaraLida | undefined;
  if (daBiblioteca && temMascara) {
    mascara = {
      x: daBiblioteca.left ?? 0,
      y: daBiblioteca.top ?? 0,
      largura: (daBiblioteca.right ?? 0) - (daBiblioteca.left ?? 0),
      altura: (daBiblioteca.bottom ?? 0) - (daBiblioteca.top ?? 0),
      fora: fundoDaMascara,
      desativada: daBiblioteca.disabled === true,
    };
    const parcial = [daBiblioteca.userMaskDensity !== undefined && daBiblioteca.userMaskDensity < 255 ? 'densidade' : '', daBiblioteca.userMaskFeather ? 'difusão' : ''].filter(Boolean);
    if (parcial.length > 0) fora.push({ recurso: 'mascara-parcial', detalhe: `máscara com ${parcial.join(' e ')} próprias` });
  } else if (daBiblioteca && fundoDaMascara === 0 && !daBiblioteca.disabled && !l.mask?.fromVectorData) {
    // máscara sem área e com fundo preto: esconde a camada inteira
    mascara = { x: 0, y: 0, largura: 0, altura: 0, fora: 0, desativada: false };
  }
  if ((l.vectorMask?.paths.length ?? 0) > 0 && (l.mask?.vectorMaskFeather || (l.mask?.vectorMaskDensity !== undefined && l.mask.vectorMaskDensity < 255)))
    fora.push({ recurso: 'mascara-parcial', detalhe: 'máscara vetorial com densidade ou difusão próprias' });

  const faixas = l.blendingRanges;
  const neutra = (f: number[] | undefined): boolean => !f || (f[0] === 0 && f[1] === 0 && f[2] === 255 && f[3] === 255);
  if (faixas && !(neutra(faixas.compositeGrayBlendSource) && neutra(faixas.compositeGraphBlendDestinationRange) && faixas.ranges.every((r) => neutra(r.sourceRange) && neutra(r.destRange))))
    fora.push({ recurso: 'faixas-de-mesclagem', detalhe: 'faixas de mesclagem ("mesclar se")' });

  const base = {
    nome: l.name ?? '',
    opacidade: l.opacity ?? 1,
    opacidadeDoPreenchimento: l.fillOpacity ?? 1,
    modo: modoDe(l.blendMode, fora, 'camada'),
    oculta: l.hidden === true,
    recortadaNaDeBaixo: l.clipping === true,
    bloqueada: l.protected?.position === true || l.protected?.composite === true,
    area,
    foraDoModelo: fora,
    ...(mascara ? { mascara } : {}),
  };
  const fx = l.effects ? efeitos(l.effects, psd.imageResources?.globalAngle, fora) : undefined;
  const vetorial =
    l.vectorMask && l.vectorMask.paths.length > 0 ? { caminhos: caminhos(l.vectorMask.paths), invertida: l.vectorMask.invert === true, desativada: l.vectorMask.disable === true } : undefined;
  const composto = (l.vectorMask?.paths ?? []).some((p) => p.operation !== undefined && p.operation !== 'combine');

  let decodificada = false;
  const decodificar = (): { pixels?: PixelsDoArquivo; mascara?: MascaraDoArquivo } => {
    if (decodificada || !l.rawData) return {};
    decodificada = true;
    decodeLayerPixels(l, true);
    const saida: { pixels?: PixelsDoArquivo; mascara?: MascaraDoArquivo } = {};
    const imagem = l.imageData;
    if (imagem && area.largura > 0 && area.altura > 0)
      saida.pixels = { x: area.x, y: area.y, largura: imagem.width, altura: imagem.height, rgba: new Uint8Array(imagem.data.buffer, imagem.data.byteOffset, imagem.data.byteLength) };
    const dados = daBiblioteca?.imageData;
    if (mascara && dados && mascara.largura > 0) {
      // a biblioteca devolve a máscara como imagem: a cobertura está no primeiro canal
      const cobertura = new Uint8Array(dados.width * dados.height);
      for (let i = 0; i < cobertura.length; i++) cobertura[i] = dados.data[i * 4] as number;
      saida.mascara = { x: mascara.x, y: mascara.y, largura: dados.width, altura: dados.height, cobertura, fora: mascara.fora };
    }
    // solta o que a biblioteca guardou: daqui em diante a memória é de quem chamou
    delete l.imageData;
    if (l.mask) delete l.mask.imageData;
    if (l.realMask) delete l.realMask.imageData;
    return saida;
  };

  if (l.children) {
    const grupo: CamadaLida = {
      ...base,
      tipo: 'grupo',
      decodificar,
      filhos: l.children.map((f) => camada(f, psd, embutidos)),
      ...(fx ? { efeitos: fx } : {}),
      ...(vetorial ? { mascaraVetorial: vetorial } : {}),
    };
    if (l.artboard) {
      const r = l.artboard.rect;
      // tipos de fundo da prancheta do Photoshop: 1 branco, 2 preto, 3 transparente, 4 cor própria
      const tipo = l.artboard.backgroundType ?? 1;
      const fundo = tipo === 2 ? { r: 0, g: 0, b: 0 } : tipo === 4 ? (rgb(l.artboard.color) ?? { r: 255, g: 255, b: 255 }) : { r: 255, g: 255, b: 255 };
      grupo.prancheta = { x: r.left, y: r.top, largura: r.right - r.left, altura: r.bottom - r.top, fundo, transparente: tipo === 3 };
    }
    return grupo;
  }
  if (l.adjustment) {
    const a = ajuste(l.adjustment, fora);
    return { ...base, tipo: 'ajuste', decodificar, ...(a.ajuste ? { ajuste: a.ajuste } : {}), ...(a.mistura ? { misturaDeCanais: a.mistura } : {}) };
  }
  const comum = { ...base, decodificar, ...(fx ? { efeitos: fx } : {}), ...(vetorial ? { mascaraVetorial: vetorial } : {}) };
  if (l.text) return { ...comum, tipo: 'texto', texto: texto(l.text, fora) };
  if (l.placedLayer) {
    const o = l.placedLayer;
    const arquivo = psd.linkedFiles?.find((f) => f.id === o.id);
    const tipo = tipoDeImagem(arquivo?.data);
    const filtros: Filtro[] = [];
    if (o.filter?.enabled !== false) {
      for (const f of o.filter?.list ?? []) {
        if (f.enabled === false) continue;
        const lido = filtroInteligente(f);
        if (typeof lido === 'string') fora.push({ recurso: 'filtro-inteligente', detalhe: `filtro inteligente: ${lido}` });
        else filtros.push(lido);
      }
    }
    if (filtros.length > 6) fora.push({ recurso: 'filtro-inteligente', detalhe: `${filtros.length} filtros inteligentes na mesma camada` });
    if (!arquivo?.data || !tipo) {
      fora.push({
        recurso: 'objeto-inteligente',
        detalhe: !arquivo?.data ? 'objeto inteligente vinculado a um arquivo de fora' : `objeto inteligente com "${arquivo.name}" dentro (não é PNG nem JPEG)`,
      });
      return { ...comum, tipo: 'objeto-inteligente' };
    }
    if (o.type !== 'raster') fora.push({ recurso: 'objeto-inteligente', detalhe: `objeto inteligente do tipo "${o.type}"` });
    const naoAfim = o.nonAffineTransform?.some((v, i) => Math.abs(v - (o.transform[i] ?? 0)) > 0.01);
    if (!semDeformacao(o.warp) || naoAfim) fora.push({ recurso: 'objeto-inteligente-deformado', detalhe: 'objeto inteligente com deformação ou perspectiva' });
    if (!embutidos.has(o.id)) embutidos.set(o.id, { id: o.id, nome: arquivo.name, tipo, bytes: arquivo.data });
    return {
      ...comum,
      tipo: 'objeto-inteligente',
      objetoInteligente: {
        embutido: o.id,
        instancia: o.placed ?? o.id,
        cantos: o.transform.slice(0, 8) as [number, number, number, number, number, number, number, number],
        largura: o.width ?? 0,
        altura: o.height ?? 0,
        filtros,
        semente: 0,
      },
    };
  }
  if (l.vectorFill) {
    const saida: CamadaLida = { ...comum, tipo: 'forma' };
    const f = l.vectorFill;
    let preenchimento: PreenchimentoDoArquivo | undefined;
    if (f.type === 'color') {
      const c = rgb(f.color);
      if (c) preenchimento = { tipo: 'cor', cor: c };
      else fora.push({ recurso: 'preenchimento', detalhe: 'preenchimento com cor fora de RGB' });
    } else if (f.type === 'pattern') fora.push({ recurso: 'preenchimento', detalhe: 'preenchimento de padrão' });
    else {
      const d = degrade(f, f);
      if (typeof d === 'string') fora.push({ recurso: 'preenchimento', detalhe: `preenchimento em ${d}` });
      else preenchimento = { tipo: 'degrade', ...degradeComNota(d, fora) };
    }
    if (preenchimento) saida.preenchimento = preenchimento;
    if (composto) fora.push({ recurso: 'caminho-composto', detalhe: 'forma feita de caminhos que se subtraem ou se intersectam' });
    const s = l.vectorStroke;
    if (s?.strokeEnabled) {
      const cor = s.content?.type === 'color' ? rgb(s.content.color) : undefined;
      const motivo = [
        !cor ? 'em degradê ou padrão' : '',
        (s.lineDashSet?.length ?? 0) > 0 ? 'tracejado' : '',
        (s.opacity ?? 1) < 0.999 ? 'com opacidade própria' : '',
        (s.blendMode ?? 'normal') !== 'normal' ? 'com modo de mesclagem próprio' : '',
      ].filter(Boolean);
      if (motivo.length > 0 || !cor) fora.push({ recurso: 'traco-vetorial', detalhe: `traçado ${motivo.join(', ')}` });
      else
        saida.tracoVetorial = {
          cor,
          espessura: px(s.lineWidth),
          ponta: ({ butt: 'reta', round: 'redonda', square: 'quadrada' } as const)[s.lineCapType ?? 'butt'],
          juncao: ({ miter: 'angular', round: 'redonda', bevel: 'chanfrada' } as const)[s.lineJoinType ?? 'miter'],
          comPreenchimento: s.fillEnabled !== false,
          alinhamento: ({ inside: 'dentro', center: 'centro', outside: 'fora' } as const)[s.lineAlignment ?? 'center'],
        };
    }
    // forma viva: retângulo (1), retângulo arredondado (2) ou elipse (5), sem transformação
    const viva = l.vectorOrigination?.keyDescriptorList.length === 1 ? l.vectorOrigination.keyDescriptorList[0] : undefined;
    const caixa = viva?.keyOriginShapeBoundingBox;
    const semTransformacao = !viva?.transform || viva.transform.every((v, i) => Math.abs(v - ([1, 0, 0, 1, 0, 0][i] as number)) < 1e-6);
    if (viva && caixa && semTransformacao && (viva.keyOriginType === 1 || viva.keyOriginType === 2 || viva.keyOriginType === 5)) {
      const r = viva.keyOriginRRectRadii;
      const raios = r ? [px(r.topLeft), px(r.topRight), px(r.bottomLeft), px(r.bottomRight)] : [0];
      if (raios.every((v) => Math.abs(v - (raios[0] as number)) < 0.01))
        saida.formaViva = {
          forma: viva.keyOriginType === 5 ? 'elipse' : 'retangulo',
          x: px(caixa.left),
          y: px(caixa.top),
          largura: px(caixa.right) - px(caixa.left),
          altura: px(caixa.bottom) - px(caixa.top),
          raio: viva.keyOriginType === 5 ? 0 : (raios[0] as number),
        };
    }
    return saida;
  }
  // vídeo e o que mais a biblioteca não reconhece: só o pixel gravado serve
  if (l.pixelSource) fora.push({ recurso: 'conteudo-desconhecido', detalhe: 'camada de vídeo' });
  return { ...comum, tipo: 'pixels' };
}

/** Lê o PSD (ou PSB) para o modelo da porta. O arquivo já passou pela inspeção: RGB, 8 bits, dentro dos tetos. */
export function lerPsd(bytes: Uint8Array, opcoes: OpcoesDeLeitura = {}): ArquivoLido {
  const psd = readPsd(bytes, {
    useImageData: true,
    useRawData: true,
    skipThumbnail: true,
    logMissingFeatures: false,
    throwForMissingFeatures: false,
    ...(opcoes.memoria !== undefined ? { totalMemoryLimit: opcoes.memoria } : {}),
  });
  const embutidos = new Map<string, ArquivoEmbutido>();
  const camadas = (psd.children ?? []).map((l) => camada(l, psd, embutidos));
  return {
    largura: psd.width,
    altura: psd.height,
    camadas,
    embutidos: [...embutidos.values()],
    composta() {
      const imagem = getCompositeImageData(psd);
      return imagem ? new Uint8Array(imagem.data.buffer, imagem.data.byteOffset, imagem.data.byteLength) : undefined;
    },
  };
}
