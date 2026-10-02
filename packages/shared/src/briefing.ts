// O contrato HTTP da fatia 4 (docs/mvp/backend.md, 17.12): formulário de briefing, marcas, briefings
// salvos, banco de imagens, texturas e o retorno útil de arquivo enviado.
//
//   POST   /api/documentos/:id/tarefas        PedidoDeTarefaPorBriefing → 202 Tarefa (as outras entradas continuam valendo)
//   GET    /api/marcas                        → ListaDeMarcas
//   POST   /api/marcas                        DadosDaMarca → 201 Marca
//   GET    /api/marcas/:id                    → Marca
//   PUT    /api/marcas/:id                    DadosDaMarca → Marca (substitui tudo)
//   DELETE /api/marcas/:id                    → 204
//   GET    /api/briefings                     → ListaDeBriefings (sem os dados)
//   POST   /api/briefings                     DadosDoBriefingSalvo → 201 BriefingSalvo
//   GET    /api/briefings/:id                 → BriefingSalvo
//   PUT    /api/briefings/:id                 DadosDoBriefingSalvo → BriefingSalvo
//   DELETE /api/briefings/:id                 → 204
//   GET    /api/imagens/busca?q=&orientacao=  → ResultadoDaBuscaDeImagens
//   GET    /api/imagens/:banco/:id/previa     → os bytes da prévia (JPEG), só de resultado que veio de busca
//   POST   /api/imagens/trazer                PedidoDeTrazerImagem → 201 ImagemTrazida
//   GET    /api/texturas                      → ListaDeTexturas
//   POST   /api/texturas/:nome/trazer         → 201 TexturaTrazida
//   GET    /api/arquivos/:sha256/dados        → DadosDoArquivo (medidas, espécie, origem)
//   GET    /api/vetores/:sha256               → VetorImportado (o vetor como o Otto o entendeu, com a miniatura)
//   GET    /api/fontes?q=&categoria=&catalogo=1 → ListaDeFontes (com `catalogo`, inclui o que ainda não foi baixado)
//
// BRIEFING É DADO, NÃO INSTRUÇÃO (ADR 033). O formulário é fechado: campo a mais é recusado. Imagem, logo e
// ícone entram pelo hash de um arquivo que a conta já enviou; o servidor confere que o arquivo é da conta e
// monta o material para o Otto. Nenhum campo aceita endereço de rede.
import { z } from 'zod';
import { ArquivoEnviado, LIMITES } from './contrato';

const Id = z.uuid();
const Quando = z.iso.datetime();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Cor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((cor) => cor.toLowerCase());
const texto = (maximo: number) => z.string().trim().max(maximo);
const textoObrigatorio = (maximo: number) => z.string().trim().min(1).max(maximo);

// ---------------------------------------------------------------------------
// Formulário de briefing
// ---------------------------------------------------------------------------

/** Dois formatos já levam de 10 a 30 minutos; mais que três não foi medido (docs/mvp/experiencia.md, 3.4). */
export const FORMATOS_POR_TAREFA = 3;

export const FormatoDoBriefing = z.strictObject({
  nome: textoObrigatorio(60),
  largura: z.int().min(16).max(30000),
  altura: z.int().min(16).max(30000),
});
export type FormatoDoBriefing = z.infer<typeof FormatoDoBriefing>;

/** Os formatos que o formulário oferece. Outro formato é um FormatoDoBriefing qualquer. */
export const FORMATOS_SUGERIDOS: readonly FormatoDoBriefing[] = [
  { nome: 'Feed', largura: 1080, altura: 1350 },
  { nome: 'Quadrado', largura: 1080, altura: 1080 },
  { nome: 'Story', largura: 1080, altura: 1920 },
  { nome: 'Banner', largura: 1200, altura: 628 },
  { nome: 'Capa', largura: 1584, altura: 396 },
];

/**
 * O nível de cuidado, como o designer escolhe. O servidor traduz para o nível de esforço do ciclo
 * (direto → STANDARD, cuidadoso → REFINED, autoral → CONCEPTUAL; a tabela é do treinador-do-otto).
 */
export const OPCOES_DE_CUIDADO = ['direto', 'cuidadoso', 'autoral'] as const;
export const OpcaoDeCuidado = z.enum(OPCOES_DE_CUIDADO);
export type OpcaoDeCuidado = z.infer<typeof OpcaoDeCuidado>;
export const CUIDADO_PADRAO: OpcaoDeCuidado = 'cuidadoso';

/** Cores com papel. Todas opcionais: cor que não foi definida não é inventada (a direção de arte escolhe). */
export const CoresDaIdentidade = z.strictObject({ primaria: Cor.optional(), destaque: Cor.optional(), fundo: Cor.optional(), texto: Cor.optional() });
export type CoresDaIdentidade = z.infer<typeof CoresDaIdentidade>;

/** Ausente no formulário: "sem identidade definida". Nunca mande as cores de exemplo como se fossem da marca. */
export const IdentidadeDoBriefing = z.strictObject({ cores: CoresDaIdentidade.optional(), fonteDeTitulo: textoObrigatorio(80).optional(), fonteDeTexto: textoObrigatorio(80).optional() });
export type IdentidadeDoBriefing = z.infer<typeof IdentidadeDoBriefing>;

/** Um arquivo que a conta já enviou (POST /api/arquivos ou POST /api/vetores), pelo hash. */
export const ReferenciaDeArquivo = z.strictObject({ arquivo: Sha256 });
export type ReferenciaDeArquivo = z.infer<typeof ReferenciaDeArquivo>;

export const IMAGENS_POR_BRIEFING = 6;
export const ICONES_POR_BRIEFING = 8;

export const ImagensDoBriefing = z.discriminatedUnion('fonte', [
  /** Fotos que a conta enviou. É a opção que vem marcada. */
  z.strictObject({ fonte: z.literal('minhas'), arquivos: z.array(Sha256).min(1).max(IMAGENS_POR_BRIEFING) }),
  /** O Otto busca no banco de imagens. `termos` é sugestão de busca. */
  z.strictObject({ fonte: z.literal('banco'), termos: texto(100).optional() }),
  /** Peça só com tipografia e formas. */
  z.strictObject({ fonte: z.literal('nenhuma') }),
]);
export type ImagensDoBriefing = z.infer<typeof ImagensDoBriefing>;

const TextosDoBriefing = z.strictObject({ titulo: textoObrigatorio(300), subtitulo: texto(500).optional(), chamada: texto(200).optional(), rodape: texto(300).optional() });

const camposDoFormulario = {
  /** Versão do formulário. Muda quando um campo muda de sentido. */
  versao: z.literal(1),
  /** Nome da peça. */
  nome: texto(200).optional(),
  /** Marca cadastrada. O servidor completa, com o que ela tem, o que o formulário não trouxe: identidade, logo, ícones, rodapé e restrições. */
  marcaId: Id.optional(),
  objetivo: texto(60).optional(),
  publico: texto(300).optional(),
  estilo: z.array(textoObrigatorio(40)).max(6).optional(),
  restricoes: z.array(textoObrigatorio(300)).max(12).optional(),
  observacoes: texto(2000).optional(),
  identidade: IdentidadeDoBriefing.optional(),
  logo: ReferenciaDeArquivo.optional(),
  icones: z.array(ReferenciaDeArquivo).max(ICONES_POR_BRIEFING).optional(),
};

const nomesDiferentes = (formatos: readonly FormatoDoBriefing[]) => new Set(formatos.map((f) => f.nome.toLowerCase())).size === formatos.length;

/** O formulário de briefing, como o editor envia. Obrigatórios: título, ao menos um formato e de onde vêm as imagens. */
export const FormularioDeBriefing = z.strictObject({
  ...camposDoFormulario,
  formatos: z.array(FormatoDoBriefing).min(1).max(FORMATOS_POR_TAREFA).refine(nomesDiferentes, { error: 'os formatos precisam ter nomes diferentes' }),
  textos: TextosDoBriefing,
  imagens: ImagensDoBriefing,
});
export type FormularioDeBriefing = z.infer<typeof FormularioDeBriefing>;

/** O formulário pela metade: é o que um briefing salvo guarda (o que não muda de uma peça para outra). */
export const RascunhoDeBriefing = z.strictObject({
  ...camposDoFormulario,
  formatos: z.array(FormatoDoBriefing).max(FORMATOS_POR_TAREFA).refine(nomesDiferentes, { error: 'os formatos precisam ter nomes diferentes' }).optional(),
  textos: TextosDoBriefing.partial().optional(),
  imagens: z
    .discriminatedUnion('fonte', [
      z.strictObject({ fonte: z.literal('minhas'), arquivos: z.array(Sha256).max(IMAGENS_POR_BRIEFING) }),
      z.strictObject({ fonte: z.literal('banco'), termos: texto(100).optional() }),
      z.strictObject({ fonte: z.literal('nenhuma') }),
    ])
    .optional(),
});
export type RascunhoDeBriefing = z.infer<typeof RascunhoDeBriefing>;

/**
 * Corpo de POST /api/documentos/:id/tarefas para criar pelo formulário. `briefingId` é o briefing salvo de
 * onde o formulário partiu, se houve: só conta o uso.
 */
export const PedidoDeTarefaPorBriefing = z.strictObject({
  tipo: z.literal('briefing'),
  briefing: FormularioDeBriefing,
  cuidado: OpcaoDeCuidado.default(CUIDADO_PADRAO),
  briefingId: Id.optional(),
});
export type PedidoDeTarefaPorBriefing = z.infer<typeof PedidoDeTarefaPorBriefing>;

/**
 * "Nova peça com este briefing": o formulário e o cuidado com que uma tarefa foi criada, lidos de
 * `Tarefa.entrada`. Indefinido se a tarefa não nasceu do formulário. O que volta já tem a marca aplicada
 * (identidade, logo, rodapé), como estava no dia do pedido.
 */
export function briefingDaTarefa(tarefa: { entrada: unknown }): { briefing: FormularioDeBriefing; cuidado: OpcaoDeCuidado } | undefined {
  const entrada = tarefa.entrada as { tipo?: unknown; briefing?: unknown; cuidado?: unknown } | null;
  if (entrada?.tipo !== 'briefing') return undefined;
  const briefing = FormularioDeBriefing.safeParse(entrada.briefing);
  if (!briefing.success) return undefined;
  const cuidado = OpcaoDeCuidado.safeParse(entrada.cuidado);
  return { briefing: briefing.data, cuidado: cuidado.success ? cuidado.data : CUIDADO_PADRAO };
}

// ---------------------------------------------------------------------------
// Marcas (o cadastro do cliente do designer)
// ---------------------------------------------------------------------------

/** Quantas marcas uma conta guarda. */
export const MARCAS_POR_CONTA = 200;

/** Só o nome é obrigatório: marca sem identidade é um estado válido. */
export const DadosDaMarca = z.strictObject({
  nome: textoObrigatorio(LIMITES.caracteresDoNome),
  /** Endereço do site, como a pessoa escreveu. É dado: o servidor não abre este endereço. */
  site: texto(300).optional(),
  cores: CoresDaIdentidade.optional(),
  fonteDeTitulo: textoObrigatorio(80).optional(),
  fonteDeTexto: textoObrigatorio(80).optional(),
  logo: ReferenciaDeArquivo.optional(),
  icones: z.array(ReferenciaDeArquivo).max(ICONES_POR_BRIEFING).optional(),
  /** Rodapé fixo das peças da marca. */
  rodape: texto(300).optional(),
  /** Restrições permanentes ("nunca foto de pessoa"). */
  restricoes: z.array(textoObrigatorio(300)).max(12).optional(),
});
export type DadosDaMarca = z.infer<typeof DadosDaMarca>;

export const Marca = DadosDaMarca.extend({ id: Id, criadaEm: Quando, alteradaEm: Quando });
export type Marca = z.infer<typeof Marca>;

export const ListaDeMarcas = z.object({ itens: z.array(Marca) });
export type ListaDeMarcas = z.infer<typeof ListaDeMarcas>;

// ---------------------------------------------------------------------------
// Briefings salvos
// ---------------------------------------------------------------------------

export const BRIEFINGS_POR_CONTA = 500;

export const DadosDoBriefingSalvo = z.strictObject({ nome: textoObrigatorio(LIMITES.caracteresDoNome), dados: RascunhoDeBriefing, cuidado: OpcaoDeCuidado.optional() });
export type DadosDoBriefingSalvo = z.infer<typeof DadosDoBriefingSalvo>;

export const BriefingSalvo = DadosDoBriefingSalvo.extend({
  id: Id,
  /** Quantas tarefas foram criadas a partir dele. */
  usos: z.int().min(0),
  criadoEm: Quando,
  alteradoEm: Quando,
});
export type BriefingSalvo = z.infer<typeof BriefingSalvo>;

/** Item de GET /api/briefings: sem os dados. */
export const ItemDeBriefing = z.object({ id: Id, nome: z.string(), marcaId: Id.optional(), usos: z.int().min(0), alteradoEm: Quando });
export type ItemDeBriefing = z.infer<typeof ItemDeBriefing>;

export const ListaDeBriefings = z.object({ itens: z.array(ItemDeBriefing) });
export type ListaDeBriefings = z.infer<typeof ListaDeBriefings>;

// ---------------------------------------------------------------------------
// Banco de imagens (ADR 032)
// ---------------------------------------------------------------------------

/**
 * O identificador do banco de imagens, dado pelo servidor nos resultados. O editor não conhece banco nenhum
 * pelo nome: mostra `banco.nome` e devolve `banco.id` (ADR 020).
 */
export const BancoDeImagensId = z.string().regex(/^[a-z][a-z0-9-]{0,30}$/);
export type BancoDeImagensId = z.infer<typeof BancoDeImagensId>;

export const OrientacaoDeImagem = z.enum(['horizontal', 'vertical', 'todas']);
export type OrientacaoDeImagem = z.infer<typeof OrientacaoDeImagem>;

/** Só caminho nosso: o endereço do arquivo no banco de imagens nunca chega ao navegador nem ao documento. */
const RotaNossa = z.string().regex(/^\/api\/[A-Za-z0-9/_-]+$/);

export const ImagemDoBanco = z.strictObject({
  banco: BancoDeImagensId,
  /** Identificador do resultado no banco. Vale para trazer por 24 horas depois da busca. */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  /** Etiquetas do banco. Vêm de terceiros. */
  descricao: z.string(),
  /** Medidas com que a imagem chega (o acesso padrão do banco de fábrica entrega até 1280 px no lado maior: `banco.ladoMaximo`). */
  largura: z.int().positive(),
  altura: z.int().positive(),
  autor: z.string(),
  /** A página da imagem no banco, para mostrar a origem. Não é o endereço do arquivo. */
  pagina: z.url({ protocol: /^https$/ }),
  previa: RotaNossa,
});
export type ImagemDoBanco = z.infer<typeof ImagemDoBanco>;

/** A origem (`banco.nome`) aparece sempre que há resultado: é regra de uso do banco de fábrica. */
export const ResultadoDaBuscaDeImagens = z.object({
  banco: z.object({ id: BancoDeImagensId, nome: z.string(), licenca: z.string(), ladoMaximo: z.int().positive() }),
  itens: z.array(ImagemDoBanco),
});
export type ResultadoDaBuscaDeImagens = z.infer<typeof ResultadoDaBuscaDeImagens>;

export const PedidoDeTrazerImagem = z.strictObject({ banco: BancoDeImagensId, id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) });
export type PedidoDeTrazerImagem = z.infer<typeof PedidoDeTrazerImagem>;

/** De onde veio um arquivo da conta que não foi enviado pela pessoa. */
export const OrigemDoArquivo = z.object({ banco: z.string(), autor: z.string(), licenca: z.string(), pagina: z.string() });
export type OrigemDoArquivo = z.infer<typeof OrigemDoArquivo>;

/** Nó de imagem pronto para criarNo: faltam nome, x, y, largura e altura. Não carrega endereço do banco. */
const NoDeImagem = z.object({
  tipo: z.literal('imagem'),
  arquivo: Sha256,
  larguraOriginal: z.int().positive(),
  alturaOriginal: z.int().positive(),
  origem: z.object({ banco: z.string(), autor: z.string(), licenca: z.string(), url: z.literal('') }).optional(),
});

/** Resposta de POST /api/imagens/trazer: a imagem já está no armazenamento da conta. */
export const ImagemTrazida = ArquivoEnviado.extend({ origem: OrigemDoArquivo, no: NoDeImagem });
export type ImagemTrazida = z.infer<typeof ImagemTrazida>;

// ---------------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------------

export const Textura = z.object({
  nome: z.string(),
  descricao: z.string(),
  /** Modo de mesclagem e opacidade com que a textura costuma ser usada. */
  modoDeMesclagem: z.string(),
  opacidade: z.number().min(0).max(1),
  largura: z.int().positive(),
  altura: z.int().positive(),
});
export type Textura = z.infer<typeof Textura>;

export const ListaDeTexturas = z.object({ itens: z.array(Textura) });
export type ListaDeTexturas = z.infer<typeof ListaDeTexturas>;

/** Resposta de POST /api/texturas/:nome/trazer: a textura virou arquivo da conta. */
export const TexturaTrazida = z.object({ sha256: Sha256, largura: z.int().positive(), altura: z.int().positive(), no: NoDeImagem.extend({ modoDeMesclagem: z.string(), opacidade: z.number() }) });
export type TexturaTrazida = z.infer<typeof TexturaTrazida>;

// ---------------------------------------------------------------------------
// Arquivo enviado: retorno útil
// ---------------------------------------------------------------------------

/** GET /api/arquivos/:sha256/dados. Para mostrar o que já foi enviado sem baixar os bytes. */
export const DadosDoArquivo = z.object({
  sha256: Sha256,
  especie: z.enum(['imagem', 'vetor', 'mascara']),
  tipo: z.string(),
  bytes: z.int().positive(),
  largura: z.int().positive().optional(),
  altura: z.int().positive().optional(),
  /** O nome do arquivo no computador de quem enviou. */
  nome: z.string().optional(),
  origem: OrigemDoArquivo.optional(),
});
export type DadosDoArquivo = z.infer<typeof DadosDoArquivo>;

/**
 * Acima disto a imagem é esticada além dos próprios pixels. Limiar provisório (qualquer ampliação): quem
 * decide o número é o diretor-de-arte, com o lint de resolução efetiva.
 */
export const AMPLIACAO_QUE_PERDE_NITIDEZ = 1;

export interface AmpliacaoNoFormato {
  formato: string;
  /** Quanto a imagem cresce para cobrir o formato inteiro. 2,4 é "ampliada 240%". Abaixo de 1, é reduzida. */
  ampliacao: number;
  perdeNitidez: boolean;
}

/**
 * Quanto uma imagem precisa crescer para cobrir cada formato. É o aviso do formulário ("800×600. No Story
 * vai ser ampliada 240% e perder nitidez."): avisa, não bloqueia. Cobrir o formato inteiro é o pior caso.
 */
export function ampliacoesPorFormato(imagem: { largura: number; altura: number }, formatos: readonly { nome: string; largura: number; altura: number }[]): AmpliacaoNoFormato[] {
  return formatos.map((f) => {
    const ampliacao = Math.round(Math.max(f.largura / imagem.largura, f.altura / imagem.altura) * 100) / 100;
    return { formato: f.nome, ampliacao, perdeNitidez: ampliacao > AMPLIACAO_QUE_PERDE_NITIDEZ };
  });
}
