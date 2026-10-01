// Recorte do documento da POC (poc/src/documento/esquema.ts) usado pelo spike.
// Os nomes dos campos são os mesmos, para a migração ser mecânica. Aqui não há zod:
// o spike mede o motor, não o catálogo de operações.

/** Cor em #rrggbb. Token já chega resolvido: resolver token é do documento, não do motor. */
export type Cor = string;

export interface Parada {
  cor: Cor;
  posicao: number;
  opacidade?: number;
}

export interface Degrade {
  tipo: 'linear' | 'radial';
  /** graus, convenção do Photoshop: 0 aponta para a direita, 90 para cima */
  angulo: number;
  paradas: Parada[];
}

export type Preenchimento = Cor | Degrade;

export interface Sombra {
  cor: Cor;
  opacidade: number;
  angulo: number;
  distancia: number;
  desfoque: number;
}

export const MODOS_DE_MESCLAGEM = [
  'normal',
  'escurecer',
  'multiplicacao',
  'subexposicao-de-cores',
  'subexposicao-linear',
  'cor-mais-escura',
  'clarear',
  'tela',
  'superexposicao-de-cores',
  'superexposicao-linear',
  'cor-mais-clara',
  'sobrepor',
  'luz-suave',
  'luz-direta',
  'luz-intensa',
  'luz-linear',
  'luz-do-ponto',
  'mistura-solida',
  'diferenca',
  'exclusao',
  'subtrair',
  'dividir',
  'matiz',
  'saturacao',
  'cor',
  'luminosidade',
] as const;

export type ModoDeMesclagem = (typeof MODOS_DE_MESCLAGEM)[number];
export type ModoDoGrupo = ModoDeMesclagem | 'atravessar';

export type Mascara =
  | { tipo: 'degrade'; angulo: number; inicio: number; fim: number }
  | { tipo: 'forma'; forma: 'retangulo' | 'elipse'; x: number; y: number; largura: number; altura: number; raio: number; suavizar: number; inverter: boolean };

export type Ajuste =
  | { tipo: 'matiz-saturacao'; matiz: number; saturacao: number; luminosidade: number }
  | { tipo: 'brilho-contraste'; brilho: number; contraste: number }
  | { tipo: 'niveis'; pretoDeEntrada: number; brancoDeEntrada: number; gama: number; pretoDeSaida: number; brancoDeSaida: number }
  | { tipo: 'preto-e-branco' };

interface Comum {
  id: string;
  nome: string;
  visivel?: boolean;
  opacidade?: number;
  mascara?: Mascara;
  /** máscara de recorte: esta camada só aparece onde a de baixo tem pixel */
  recortadaNaDeBaixo?: boolean;
}

interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
  rotacao?: number;
}

interface Visual extends Comum, Caixa {
  modoDeMesclagem?: ModoDeMesclagem;
  sombra?: Sombra;
  /** desfoque gaussiano, raio em unidade do documento */
  desfoque?: number;
}

export interface NoForma extends Visual {
  tipo: 'forma';
  forma: 'retangulo' | 'elipse';
  raio?: number;
  preenchimento: Preenchimento;
  traco?: { cor: Cor; espessura: number };
}

export interface TrechoDeTexto {
  inicio: number;
  fim: number;
  fonte?: string;
  peso?: number;
  tamanho?: number;
  cor?: Cor;
  /** tracking em milésimos de eme, como no Photoshop */
  espacamento?: number;
}

export interface NoTexto extends Visual {
  tipo: 'texto';
  conteudo: string;
  fonte: string;
  peso: number;
  tamanho: number;
  cor: Cor;
  /** múltiplo do corpo */
  entrelinha: number;
  espacamento: number;
  alinhamento: 'esquerda' | 'centro' | 'direita';
  trechos?: TrechoDeTexto[];
  kerning?: 'metrico' | 'nenhum';
  /** recursos OpenType ligados na camada inteira (ex.: 'smcp', 'tnum'). O Canvas 2D da POC não dava acesso. */
  recursosOpenType?: string[];
}

export interface NoImagem extends Visual {
  tipo: 'imagem';
  /** chave do arquivo; no produto é o sha256 do conteúdo */
  arquivo: string;
  ajuste: 'cobrir' | 'conter';
  foco?: { x: number; y: number };
  zoom?: number;
  recorte?: { forma: 'retangulo' | 'elipse'; raio: number };
}

export interface NoVetor extends Visual {
  tipo: 'vetor';
  moldura: [number, number];
  caminhos: { d: string; preenchimento?: Cor; traco?: { cor: Cor; espessura: number }; regra?: 'nao-zero' | 'par-impar' }[];
}

export interface NoAjuste extends Comum {
  tipo: 'ajuste';
  ajuste: Ajuste;
}

export interface NoGrupo extends Comum {
  tipo: 'grupo';
  modoDeMesclagem: ModoDoGrupo;
  filhos: No[];
}

export type NoVisual = NoForma | NoTexto | NoImagem | NoVetor;
export type No = NoVisual | NoGrupo | NoAjuste;

export interface Prancheta {
  id: string;
  nome: string;
  /** posição no plano do editor; o render de uma prancheta sozinha ignora */
  x: number;
  y: number;
  largura: number;
  altura: number;
  fundo: Cor;
  filhos: No[];
}

export interface Documento {
  nome: string;
  pranchetas: Prancheta[];
}

export interface CaixaMedida {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ehVisual(n: No): n is NoVisual {
  return n.tipo !== 'grupo' && n.tipo !== 'ajuste';
}

/** Todos os nós, em profundidade, na ordem de empilhamento. */
export function todasAsCamadas(filhos: readonly No[]): No[] {
  return filhos.flatMap((n) => (n.tipo === 'grupo' ? [n, ...todasAsCamadas(n.filhos)] : [n]));
}

export function rgbDe(cor: Cor): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
