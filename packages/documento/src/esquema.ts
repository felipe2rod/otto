// Esquema do documento do Otto (ADR 027). A árvore é a única fonte de verdade: o canvas é só uma renderização dela.
// Veio de poc/src/documento/esquema.ts. O que mudou na migração:
// - o nome e o id do documento saíram da árvore: são do registro (conta, nome, datas), não do desenho;
// - não há gerador de id aqui: o id de nó novo deriva do id do lote (ver ids.ts e operacoes.ts).
import { z } from 'zod';

export const VERSAO_DO_FORMATO = 1;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor em hex #RRGGBB');
/** Cor solta (#RRGGBB) ou referência a token ("token:primaria"). */
export const Cor = z.union([hex, z.string().regex(/^token:[a-z0-9-]+$/, 'referência de token token:nome')]);
export type Cor = z.infer<typeof Cor>;

/** Degradê com a convenção do Photoshop: ângulo 0 vai da esquerda (início) para a direita (fim), 90 de baixo para cima. */
export const Degrade = z.object({
  tipo: z.enum(['linear', 'radial']).default('linear'),
  angulo: z.number().default(90),
  paradas: z
    .array(z.object({ cor: Cor, posicao: z.number().min(0).max(1), opacidade: z.number().min(0).max(1).default(1) }))
    .min(2)
    .max(6),
});
export type Degrade = z.infer<typeof Degrade>;
export const Preenchimento = z.union([Cor, Degrade]);
export type Preenchimento = z.infer<typeof Preenchimento>;

/** Sombra projetada (efeito de camada). Ângulo como no Photoshop: de onde vem a luz; 90 = luz de cima, sombra para baixo. */
export const Sombra = z.object({
  cor: Cor.default('#000000'),
  opacidade: z.number().min(0).max(1).default(0.35),
  distancia: z.number().min(0).default(12),
  angulo: z.number().default(90),
  desfoque: z.number().min(0).default(24),
});
export type Sombra = z.infer<typeof Sombra>;

/** Modos de mesclagem do Photoshop (ADR 028). "dissolver" fica bloqueado; "atravessar" só vale para grupo. */
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
export const ModoDeMesclagem = z.enum(MODOS_DE_MESCLAGEM);
export type ModoDeMesclagem = z.infer<typeof ModoDeMesclagem>;
export const ModoDoGrupo = z.enum(['atravessar', ...MODOS_DE_MESCLAGEM]);
export type ModoDoGrupo = z.infer<typeof ModoDoGrupo>;

/** Máscara de camada (cinza no PSD): degradê, forma desenhada, ou o sujeito recortado da foto. */
export const Mascara = z.preprocess(
  // compatível com a máscara antiga da foto, que não tinha tipo
  (v) => (v && typeof v === 'object' && !('tipo' in v) ? { ...(v as object), tipo: 'degrade' } : v),
  z.discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('degrade'),
      angulo: z.number().default(90),
      inicio: z.number().min(0).max(1),
      fim: z.number().min(0).max(1),
    }),
    z.object({
      tipo: z.literal('forma'),
      forma: z.enum(['retangulo', 'elipse']),
      x: z.number(),
      y: z.number(),
      largura: z.number().positive(),
      altura: z.number().positive(),
      raio: z.number().min(0).default(0),
      /** borda suave em px */
      suavizar: z.number().min(0).default(0),
      inverter: z.boolean().default(false),
    }),
    z.object({
      /** Recorte do sujeito da foto (arquivo cinza do tamanho da foto original, gerado por detectarSujeito). */
      tipo: z.literal('sujeito'),
      arquivo: z.string().regex(/^[0-9a-f]{64}$/),
      inverter: z.boolean().default(false),
    }),
  ]),
);
export type Mascara = z.infer<typeof Mascara>;

/** Filtro inteligente (no PSD, a foto vira objeto inteligente com o filtro editável). */
export const Filtro = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('desfoque'), raio: z.number().min(0).max(250) }),
  z.object({ tipo: z.literal('desfoque-de-movimento'), angulo: z.number(), distancia: z.number().min(0).max(500) }),
  z.object({ tipo: z.literal('ruido'), quantidade: z.number().min(0).max(1), monocromatico: z.boolean().default(true) }),
  z.object({ tipo: z.literal('nitidez'), quantidade: z.number().min(0).max(5), raio: z.number().min(0.1).max(50) }),
]);
export type Filtro = z.infer<typeof Filtro>;

/** O que toda camada tem, visual ou não. */
const Comum = z.object({
  id: z.string(),
  nome: z.string().min(1),
  opacidade: z.number().min(0).max(1).default(1),
  visivel: z.boolean().default(true),
  bloqueado: z.boolean().default(false),
  mascara: Mascara.optional(),
  /** Máscara de recorte: a camada só aparece onde a camada de baixo tem pixel (foto dentro do texto). */
  recortadaNaDeBaixo: z.boolean().default(false),
});

/** Efeitos de camada do Photoshop além da sombra projetada e do traço. */
const Brilho = z.object({ cor: Cor, opacidade: z.number().min(0).max(1).default(0.5), tamanho: z.number().min(0).max(250).default(20) });
export const Efeitos = z.object({
  sombraInterna: Sombra.optional(),
  brilhoExterno: Brilho.optional(),
  brilhoInterno: Brilho.optional(),
  sobreposicaoDeCor: z.object({ cor: Cor, opacidade: z.number().min(0).max(1).default(1), modoDeMesclagem: ModoDeMesclagem.default('normal') }).optional(),
  sobreposicaoDeDegrade: z.object({ degrade: Degrade, opacidade: z.number().min(0).max(1).default(1), modoDeMesclagem: ModoDeMesclagem.default('normal') }).optional(),
});
export type Efeitos = z.infer<typeof Efeitos>;

const Base = Comum.extend({
  x: z.number(),
  y: z.number(),
  largura: z.number().positive(),
  altura: z.number().positive(),
  /** graus, sentido horário, em torno do centro da caixa */
  rotacao: z.number().min(-360).max(360).default(0),
  modoDeMesclagem: ModoDeMesclagem.default('normal'),
  sombra: Sombra.optional(),
  efeitos: Efeitos.optional(),
  filtros: z.array(Filtro).max(6).optional(),
});

export const NoForma = Base.extend({
  tipo: z.literal('forma'),
  forma: z.enum(['retangulo', 'elipse']),
  preenchimento: Preenchimento,
  raio: z.number().min(0).default(0),
  /** Contorno interno (efeito de traço do Photoshop). */
  traco: z.object({ cor: Cor, espessura: z.number().positive() }).optional(),
});

export const NoTexto = Base.extend({
  tipo: z.literal('texto'),
  conteudo: z.string(),
  fonte: z.string(),
  peso: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).default(400),
  tamanho: z.number().positive(),
  entrelinha: z.number().positive().default(1.15),
  espacamento: z.number().default(0),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']).default('esquerda'),
  cor: Cor,
  caixaAlta: z.boolean().default(false),
  /** versalete (small caps) */
  versalete: z.boolean().default(false),
  /** kerning da fonte (métrico); "nenhum" desliga */
  kerning: z.enum(['metrico', 'nenhum']).default('metrico'),
  /** estilo de texto da identidade (tokens.estilosDeTexto) aplicado a esta camada */
  estiloDeTexto: z.string().optional(),
  /** Trechos com estilo próprio (posições no conteúdo, fim exclusivo): preço em destaque, palavra em outra cor. */
  trechos: z
    .array(
      z.object({
        inicio: z.number().int().min(0),
        fim: z.number().int().min(1),
        cor: Cor.optional(),
        peso: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
        fonte: z.string().optional(),
        tamanho: z.number().positive().optional(),
        /** tracking do trecho em milésimos de eme: kerning manual entre letras específicas */
        espacamento: z.number().optional(),
      }),
    )
    .max(40)
    .optional(),
});

export const OrigemDaImagem = z.object({
  banco: z.string(),
  autor: z.string(),
  licenca: z.string(),
  url: z.string(),
});

export const NoImagem = Base.extend({
  tipo: z.literal('imagem'),
  arquivo: z.string().regex(/^[0-9a-f]{64}$/, 'hash sha256 do arquivo'),
  larguraOriginal: z.number().positive(),
  alturaOriginal: z.number().positive(),
  ajuste: z.enum(['cobrir', 'conter']).default('cobrir'),
  /** Ponto focal do enquadramento em "cobrir": 0 = borda esquerda/topo da foto, 1 = direita/base. */
  foco: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.5, y: 0.5 }),
  /** Aproximação dentro da caixa (1 = só cobrir; 1,5 = 50% mais perto). */
  zoom: z.number().min(1).max(4).default(1),
  origem: OrigemDaImagem.optional(),
  /** Ajuste de cor (camadas de ajuste com recorte no PSD). */
  ajusteDeCor: z
    .object({
      brilho: z.number().min(-100).max(100).default(0),
      contraste: z.number().min(-100).max(100).default(0),
      saturacao: z.number().min(-100).max(100).default(0),
      duotone: z.object({ sombras: Cor, luzes: Cor }).optional(),
    })
    .optional(),
  /** Máscara vetorial: a foto aparece só dentro desta forma, do tamanho da caixa. */
  recorte: z.object({ forma: z.enum(['retangulo', 'elipse']), raio: z.number().min(0).default(0) }).optional(),
});

const CurvaDeCanal = z
  .array(z.tuple([z.number().min(0).max(255), z.number().min(0).max(255)]))
  .min(2)
  .max(16);

/** Camada de ajuste: muda a cor de tudo que está abaixo dela (no grupo), ou só da camada de baixo, se recortada. */
export const Ajuste = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('curvas'), rgb: CurvaDeCanal.optional(), vermelho: CurvaDeCanal.optional(), verde: CurvaDeCanal.optional(), azul: CurvaDeCanal.optional() }),
  z.object({
    tipo: z.literal('niveis'),
    pretoDeEntrada: z.number().min(0).max(253).default(0),
    brancoDeEntrada: z.number().min(2).max(255).default(255),
    gama: z.number().min(0.1).max(9.99).default(1),
    pretoDeSaida: z.number().min(0).max(255).default(0),
    brancoDeSaida: z.number().min(0).max(255).default(255),
  }),
  z.object({
    tipo: z.literal('matiz-saturacao'),
    matiz: z.number().min(-180).max(180).default(0),
    saturacao: z.number().min(-100).max(100).default(0),
    luminosidade: z.number().min(-100).max(100).default(0),
  }),
  z.object({ tipo: z.literal('brilho-contraste'), brilho: z.number().min(-150).max(150).default(0), contraste: z.number().min(-50).max(100).default(0) }),
  z.object({ tipo: z.literal('vibracao'), vibracao: z.number().min(-100).max(100).default(0), saturacao: z.number().min(-100).max(100).default(0) }),
  z.object({
    tipo: z.literal('equilibrio-de-cor'),
    /** [ciano↔vermelho, magenta↔verde, amarelo↔azul], de -100 a 100 */
    sombras: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    meiosTons: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
    realces: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  }),
  z.object({ tipo: z.literal('filtro-de-foto'), cor: Cor, densidade: z.number().min(1).max(100).default(25) }),
  z.object({ tipo: z.literal('preto-e-branco') }),
  z.object({
    tipo: z.literal('mapa-de-degrade'),
    paradas: z
      .array(z.object({ cor: Cor, posicao: z.number().min(0).max(1) }))
      .min(2)
      .max(6),
  }),
]);
export type Ajuste = z.infer<typeof Ajuste>;

/** Traço de caminho vetorial (contorno de ícone de linha). Espessura em unidades da moldura: escala com a caixa. */
export const TracoDeCaminho = z.object({
  cor: Cor,
  espessura: z.number().positive(),
  ponta: z.enum(['reta', 'redonda', 'quadrada']).default('reta'),
  juncao: z.enum(['angular', 'redonda', 'chanfrada']).default('angular'),
});
export type TracoDeCaminho = z.infer<typeof TracoDeCaminho>;

export const CaminhoVetorial = z
  .object({ d: z.string().min(1), preenchimento: Cor.optional(), traco: TracoDeCaminho.optional(), regra: z.enum(['nao-zero', 'par-impar']).default('nao-zero') })
  .refine((c) => c.preenchimento !== undefined || c.traco !== undefined, 'caminho precisa de preenchimento, traco ou os dois');
export type CaminhoVetorial = z.infer<typeof CaminhoVetorial>;

/** Vetor (logo, ícone importado ou forma livre): caminhos só com M, C e Z, em coordenadas da "moldura". */
export const NoVetor = Base.extend({
  tipo: z.literal('vetor'),
  /** tamanho do desenho original; a caixa da camada escala a partir dele */
  moldura: z.tuple([z.number().positive(), z.number().positive()]),
  caminhos: z.array(CaminhoVetorial).min(1).max(400),
  origem: z.object({ arquivo: z.string(), nome: z.string() }).optional(),
});
export type NoVetor = z.infer<typeof NoVetor>;

/** Cores distintas de um vetor, do preenchimento e do traço, na ordem em que aparecem. */
export function coresDoVetor(no: Pick<NoVetor, 'caminhos'>): Cor[] {
  return [...new Set(no.caminhos.flatMap((c) => [c.preenchimento, c.traco?.cor].filter((x): x is Cor => x !== undefined)))];
}

export const NoAjuste = Comum.extend({
  tipo: z.literal('ajuste'),
  modoDeMesclagem: ModoDeMesclagem.default('normal'),
  ajuste: Ajuste,
});

export interface NoGrupo {
  id: string;
  nome: string;
  tipo: 'grupo';
  opacidade: number;
  visivel: boolean;
  bloqueado: boolean;
  mascara?: Mascara | undefined;
  recortadaNaDeBaixo: boolean;
  modoDeMesclagem: ModoDoGrupo;
  filhos: No[];
}

export const NoGrupo: z.ZodType<NoGrupo> = Comum.extend({
  tipo: z.literal('grupo'),
  modoDeMesclagem: ModoDoGrupo.default('atravessar'),
  get filhos(): z.ZodArray<z.ZodType<No>> {
    return z.array(No);
  },
}) as unknown as z.ZodType<NoGrupo>;

export type NoForma = z.infer<typeof NoForma>;
export type NoTexto = z.infer<typeof NoTexto>;
export type NoImagem = z.infer<typeof NoImagem>;
export type NoAjuste = z.infer<typeof NoAjuste>;
/** Camada que desenha e tem caixa: forma, texto, imagem, vetor. */
export type NoVisual = NoForma | NoTexto | NoImagem | NoVetor;
export type No = NoVisual | NoGrupo | NoAjuste;

export const No: z.ZodType<No> = z.lazy(() => z.discriminatedUnion('tipo', [NoForma, NoTexto, NoImagem, NoVetor, NoAjuste, NoGrupo as never])) as unknown as z.ZodType<No>;
export type TipoDeNo = No['tipo'];

export function ehVisual(n: No): n is NoVisual {
  return n.tipo === 'forma' || n.tipo === 'texto' || n.tipo === 'imagem' || n.tipo === 'vetor';
}

/** Todas as camadas da lista, em profundidade, na ordem de empilhamento (de baixo para cima). */
export function todasAsCamadas(filhos: readonly No[]): No[] {
  return filhos.flatMap((n) => (n.tipo === 'grupo' ? [n, ...todasAsCamadas(n.filhos)] : [n]));
}

/** Camadas visuais efetivamente visíveis (grupo oculto esconde tudo dentro). */
export function camadasVisuaisVisiveis(filhos: readonly No[]): NoVisual[] {
  return filhos.flatMap((n) => (!n.visivel ? [] : n.tipo === 'grupo' ? camadasVisuaisVisiveis(n.filhos) : ehVisual(n) ? [n] : []));
}

export const Prancheta = z.object({
  id: z.string(),
  nome: z.string().min(1),
  tipo: z.literal('prancheta'),
  largura: z.number().int().positive().max(30000),
  altura: z.number().int().positive().max(30000),
  fundo: Cor,
  /** Ordem de empilhamento: o primeiro fica embaixo, como no painel de camadas lido de baixo para cima. */
  filhos: z.array(No),
});
export type Prancheta = z.infer<typeof Prancheta>;

/**
 * A árvore do documento. Nome e id do documento não moram aqui: são do registro que guarda a árvore.
 * Renomear a peça não é operação do catálogo nem passo do histórico, como renomear um arquivo não é.
 * Documento da POC (que trazia `nome` e `id`) continua válido: as duas chaves são ignoradas na leitura.
 */
export const Documento = z.object({
  versaoDoFormato: z.literal(VERSAO_DO_FORMATO),
  tokens: z.object({
    cores: z.record(z.string(), hex),
    /** estilos de texto da identidade (título, subtítulo, corpo...) */
    estilosDeTexto: z
      .record(
        z.string(),
        z.object({
          fonte: z.string(),
          peso: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).default(400),
          tamanho: z.number().positive(),
          entrelinha: z.number().positive().default(1.15),
          espacamento: z.number().default(0),
          caixaAlta: z.boolean().default(false),
          versalete: z.boolean().default(false),
        }),
      )
      .default({}),
  }),
  pranchetas: z.array(Prancheta),
});
export type Documento = z.infer<typeof Documento>;

export type Autoria = { tipo: 'designer' } | { tipo: 'agente'; tarefaId: string };

export function documentoVazio(): Documento {
  return { versaoDoFormato: VERSAO_DO_FORMATO, tokens: { cores: {}, estilosDeTexto: {} }, pranchetas: [] };
}

export function resolverCor(doc: Documento, cor: Cor): string {
  if (!cor.startsWith('token:')) return cor;
  const nome = cor.slice('token:'.length);
  return doc.tokens.cores[nome] ?? '#ff00ff';
}

/** Toda cor que o nó usa, de preenchimento, degradê, traço, texto e sombra. */
export function coresDoNo(no: No): Cor[] {
  const cores: Cor[] = [];
  if (no.tipo === 'texto') {
    cores.push(no.cor);
    for (const t of no.trechos ?? []) if (t.cor) cores.push(t.cor);
  }
  if (no.tipo === 'imagem' && no.ajusteDeCor?.duotone) cores.push(no.ajusteDeCor.duotone.sombras, no.ajusteDeCor.duotone.luzes);
  if (no.tipo === 'forma') {
    if (typeof no.preenchimento === 'string') cores.push(no.preenchimento);
    else cores.push(...no.preenchimento.paradas.map((p) => p.cor));
    if (no.traco) cores.push(no.traco.cor);
  }
  if (no.tipo === 'ajuste') {
    const a = no.ajuste;
    if (a.tipo === 'filtro-de-foto') cores.push(a.cor);
    if (a.tipo === 'mapa-de-degrade') cores.push(...a.paradas.map((p) => p.cor));
  }
  if (no.tipo === 'vetor') cores.push(...coresDoVetor(no));
  if (ehVisual(no)) {
    if (no.sombra) cores.push(no.sombra.cor);
    const e = no.efeitos;
    if (e?.sombraInterna) cores.push(e.sombraInterna.cor);
    if (e?.brilhoExterno) cores.push(e.brilhoExterno.cor);
    if (e?.brilhoInterno) cores.push(e.brilhoInterno.cor);
    if (e?.sobreposicaoDeCor) cores.push(e.sobreposicaoDeCor.cor);
    if (e?.sobreposicaoDeDegrade) cores.push(...e.sobreposicaoDeDegrade.degrade.paradas.map((p) => p.cor));
  }
  return cores;
}

/** Caixa alinhada aos eixos que contém a caixa dada girada em torno de (cx, cy). */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function girarCaixa(c: Caixa, cx: number, cy: number, graus: number): Caixa {
  if (!graus) return c;
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cantos: [number, number][] = [
    [c.x, c.y],
    [c.x + c.w, c.y],
    [c.x + c.w, c.y + c.h],
    [c.x, c.y + c.h],
  ];
  const pts = cantos.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Caixa (girada) de uma camada visual. */
export function caixaVisual(n: NoVisual): Caixa {
  return girarCaixa({ x: n.x, y: n.y, w: n.largura, h: n.altura }, n.x + n.largura / 2, n.y + n.altura / 2, n.rotacao);
}
