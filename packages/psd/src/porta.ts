// A porta FormatoDeArquivoEmCamadas (ADR 020, ADR 028) e o modelo que atravessa por ela.
//
// O núcleo decide O QUE vai para o arquivo (mapeamento, em montar.ts) e descreve isso com os tipos daqui, que falam
// de camadas, máscaras e efeitos como o Photoshop os entende, sem nenhum tipo da biblioteca que grava o arquivo.
// O adaptador (src/adaptadores) só traduz este modelo para a biblioteca. Trocar de biblioteca é trocar o adaptador.
import type { Ajuste, Filtro, ModoDeMesclagem, ModoDoGrupo } from '@otto/documento';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Pixels de uma camada: RGBA de 8 bits, não premultiplicado, com o canto em coordenadas do arquivo. */
export interface PixelsDoArquivo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  rgba: Uint8Array;
}

/** Máscara de camada: um byte por pixel (255 mostra, 0 esconde), com o canto em coordenadas do arquivo. */
export interface MascaraDoArquivo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  cobertura: Uint8Array;
  /** valor da máscara fora da área gravada */
  fora: 0 | 255;
}

/** Nó de curva de Bézier: controle de chegada, âncora e controle de saída, em coordenadas do arquivo. */
export interface NoDeBezier {
  chegada: [number, number];
  ancora: [number, number];
  saida: [number, number];
  /** os dois controles se movem juntos (ponto suave) */
  ligado: boolean;
}

export interface CaminhoDoArquivo {
  aberto: boolean;
  regra: 'nao-zero' | 'par-impar';
  nos: NoDeBezier[];
}

export interface DegradeDoArquivo {
  estilo: 'linear' | 'radial';
  angulo: number;
  /** em ordem crescente de posição (0 a 1) */
  paradas: { cor: Rgb; posicao: number; opacidade: number }[];
}

export type PreenchimentoDoArquivo = { tipo: 'cor'; cor: Rgb } | ({ tipo: 'degrade' } & DegradeDoArquivo);

export interface SombraDoArquivo {
  cor: Rgb;
  opacidade: number;
  angulo: number;
  distancia: number;
  tamanho: number;
  modo: ModoDeMesclagem;
}

export interface BrilhoDoArquivo {
  cor: Rgb;
  opacidade: number;
  tamanho: number;
  modo: ModoDeMesclagem;
}

/** Efeitos de camada. Cada um, no máximo uma vez por camada (ADR 028). */
export interface EfeitosDoArquivo {
  sombraProjetada?: SombraDoArquivo;
  sombraInterna?: SombraDoArquivo;
  brilhoExterno?: BrilhoDoArquivo;
  brilhoInterno?: BrilhoDoArquivo;
  /** traço por dentro da camada, de cor sólida */
  tracoInterno?: { cor: Rgb; espessura: number };
  sobreposicaoDeCor?: { cor: Rgb; opacidade: number; modo: ModoDeMesclagem };
  sobreposicaoDeDegrade?: { degrade: DegradeDoArquivo; opacidade: number; modo: ModoDeMesclagem };
}

export interface EstiloDeTextoDoArquivo {
  /** nome PostScript: é por ele que o Photoshop acha a fonte instalada */
  fonte: string;
  tamanho: number;
  cor: Rgb;
  /** entrelinha em pixels */
  entrelinha: number;
  /** milésimos de eme */
  espacamento: number;
  caixa: 'normal' | 'alta' | 'versalete';
  kerning: boolean;
}

export interface TextoDoArquivo {
  conteudo: string;
  /** matriz afim [a, b, c, d, tx, ty] que leva a caixa do texto ao arquivo */
  transformacao: [number, number, number, number, number, number];
  caixa: { largura: number; altura: number };
  alinhamento: 'esquerda' | 'centro' | 'direita';
  estilo: EstiloDeTextoDoArquivo;
  /** estilo por sequência de caracteres, cobrindo o texto inteiro, quando há trechos */
  trechos?: { comprimento: number; estilo: Pick<EstiloDeTextoDoArquivo, 'fonte' | 'tamanho' | 'cor' | 'espacamento' | 'entrelinha'> }[];
}

export interface ObjetoInteligenteDoArquivo {
  /** id do arquivo embutido (ArquivoEmbutido.id) */
  embutido: string;
  /** id desta instância do objeto */
  instancia: string;
  /** os quatro cantos do arquivo embutido já posicionado: superior esquerdo, superior direito, inferior direito, inferior esquerdo */
  cantos: [number, number, number, number, number, number, number, number];
  largura: number;
  altura: number;
  /** filtros inteligentes, na ordem em que se aplicam */
  filtros: Filtro[];
  /** semente do ruído, para o filtro de ruído */
  semente: number;
}

export interface ArquivoEmbutido {
  id: string;
  nome: string;
  tipo: 'png' | 'jpeg';
  bytes: Uint8Array;
}

export interface TracoVetorialDoArquivo {
  cor: Rgb;
  espessura: number;
  ponta: 'reta' | 'redonda' | 'quadrada';
  juncao: 'angular' | 'redonda' | 'chanfrada';
  /** a forma também tem preenchimento */
  comPreenchimento: boolean;
}

export interface PranchetaDoArquivo {
  x: number;
  y: number;
  largura: number;
  altura: number;
  fundo: Rgb;
}

/**
 * Uma camada do arquivo. O que ela é sai dos campos presentes:
 * `filhos` faz dela um grupo; `ajuste`, uma camada de ajuste; `texto`, uma camada de texto; `preenchimento`, uma camada
 * de preenchimento (com `mascaraVetorial`, uma camada de forma); `objetoInteligente`, um objeto inteligente; só `pixels`, uma camada de pixels.
 */
export interface CamadaDoArquivo {
  nome: string;
  opacidade: number;
  modo: ModoDoGrupo;
  oculta: boolean;
  /** máscara de recorte: presa à camada de baixo */
  recortadaNaDeBaixo: boolean;
  bloqueada: boolean;
  mascara?: MascaraDoArquivo;
  efeitos?: EfeitosDoArquivo;
  /** o pixel da camada, sem opacidade, modo, máscara nem efeitos. Toda camada que desenha tem (ADR 028, item 2). */
  pixels?: PixelsDoArquivo;
  filhos?: CamadaDoArquivo[];
  prancheta?: PranchetaDoArquivo;
  /** camada de ajuste, com as cores já resolvidas em #rrggbb */
  ajuste?: Ajuste;
  preenchimento?: PreenchimentoDoArquivo;
  mascaraVetorial?: CaminhoDoArquivo[];
  tracoVetorial?: TracoVetorialDoArquivo;
  texto?: TextoDoArquivo;
  objetoInteligente?: ObjetoInteligenteDoArquivo;
}

export interface ArquivoEmCamadas {
  largura: number;
  altura: number;
  /** a imagem composta: RGBA de 8 bits, não premultiplicado, do tamanho do arquivo */
  composta: Uint8Array;
  /** de baixo para cima */
  camadas: CamadaDoArquivo[];
  embutidos: ArquivoEmbutido[];
}

export interface ArquivoGravado {
  bytes: Uint8Array;
  /** "psb" quando algum lado passa de 30.000 px */
  extensao: 'psd' | 'psb';
}

/** Maior lado que o PSD comum aceita. Acima disso o arquivo é PSB. */
export const MAIOR_LADO_DO_PSD = 30_000;

export interface FormatoDeArquivoEmCamadas {
  /** Grava o arquivo. Mesma entrada, mesmos bytes: sem data, sem id aleatório. */
  escrever(arquivo: ArquivoEmCamadas): ArquivoGravado;
}
