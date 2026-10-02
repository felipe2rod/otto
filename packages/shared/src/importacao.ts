// O contrato HTTP da importação de PSD (docs/mvp/backend.md, seção 17.14; ADR 028, item 4).
//
//   POST   /api/importacoes                    corpo: os bytes do .psd ou .psb → 201 Importacao (estado "enviada")
//          Content-Type: image/vnd.adobe.photoshop (TIPO_DO_PSD). O nome do arquivo vai no cabeçalho
//          X-Otto-Nome-Do-Arquivo, codificado como em URL. Teto: BYTES_DO_PSD_NO_MAXIMO.
//          O servidor confere o arquivo pelos bytes e pelos tetos ANTES de guardar. Recusa: 413 arquivo_grande_demais,
//          422 psd_recusado (detalhe: { motivo, mensagem }), 429 limite_de_importacoes.
//          A resposta já diz o que o arquivo é (medidas, camadas) e, em `fontes`, cada fonte que o texto dele pede
//          e se o Otto a tem. É aqui que o designer escolhe o que fazer com as que faltam.
//   POST   /api/importacoes/:id/importar       PedidoDeImportacao → 202 Importacao (estado "na_fila")
//          Uma importação por vez por conta; as outras esperam. Só vale no estado "enviada" (senão 409).
//   GET    /api/importacoes/:id                → Importacao
//          Consulte a cada 1 a 2 segundos enquanto o estado for na_fila ou rodando. Em "pronta" vêm `documentoId`
//          (a peça nova, que se abre com GET /api/documentos/:id) e `relatorio`.
//   GET    /api/importacoes                    → ListaDeImportacoes
//          As em curso e as recentes, da mais nova para a mais velha, sem o relatório: é como a tela retoma
//          depois de recarregar a página.
//   DELETE /api/importacoes/:id                → 204
//          Desiste de um arquivo enviado e ainda não importado: o arquivo é apagado.
//   GET    /api/documentos/:id/importacao      → Importacao
//          O relatório da importação que criou a peça, para consultar depois. 404 se a peça não veio de um PSD.
//
// O arquivo enviado é apagado assim que a importação termina (com ou sem peça) ou, se ninguém pedir a importação,
// HORAS_DE_RETENCAO_DO_PSD_ENVIADO depois do envio. O registro e o relatório ficam.
// A peça nasce na versão 0, sem lote no histórico: quem diz que ela veio de um PSD é `importacaoId`, na peça.
import { z } from 'zod';
import { LIMITES } from './contrato';

/** Content-Type do envio. */
export const TIPO_DO_PSD = 'image/vnd.adobe.photoshop';
/**
 * Teto do arquivo no MVP. O pacote de PSD aguenta 300 MB; o servidor do MVP recebe o arquivo inteiro em memória
 * (API) e o importa num worker de memória limitada, então o teto daqui é menor. O servidor pode estar configurado
 * com menos: o 413 traz `limiteEmBytes`.
 */
export const BYTES_DO_PSD_NO_MAXIMO = 100 * 1024 * 1024;
/** Quantas importações uma conta pode ter abertas (enviadas e ainda não importadas, na fila ou rodando). */
export const IMPORTACOES_ABERTAS_POR_CONTA = 5;
/** Por quantas horas um arquivo enviado e não importado fica guardado. */
export const HORAS_DE_RETENCAO_DO_PSD_ENVIADO = 24;
/** Quantas importações a lista traz, no máximo. */
export const IMPORTACOES_NA_LISTA = 20;

const Id = z.uuid();
const Quando = z.iso.datetime();
const Nome = z.string().trim().min(1).max(LIMITES.caracteresDoNome);
/** Nome PostScript, como está no arquivo. É dado de terceiro: só se compara, nunca se interpreta. */
const PostScript = z.string().min(1).max(200);
const FamiliaEPeso = z.strictObject({ familia: z.string().min(1).max(80), peso: z.int().min(1).max(1000) });

/**
 * Por que um arquivo não pode ser importado (`detalhe.motivo` do 422 psd_recusado e `erro.motivo` da importação
 * que falhou). `mensagem` é a frase pronta de @otto/psd, em português, ainda sem o guardião da marca: a tela
 * decide a frase pelo motivo.
 */
export const MOTIVOS_DE_PSD_RECUSADO = [
  'nao-e-psd',
  'arquivo-grande-demais',
  'dimensoes-grandes-demais',
  'modo-de-cor',
  'profundidade',
  'camadas-demais',
  'grupos-fundos-demais',
  'pixels-demais',
  'arquivo-truncado',
  'arquivo-malformado',
] as const;
export type MotivoDePsdRecusado = (typeof MOTIVOS_DE_PSD_RECUSADO)[number];

/**
 * Uma fonte que o texto do arquivo pede, pelo nome PostScript.
 * - `na_biblioteca`: o Otto tem; o texto vem editável. `familia` e `peso` dizem qual é.
 * - `no_catalogo`: não tem ainda, e o catálogo de fontes abertas tem: `fazer: "baixar"` a traz (é o padrão).
 * - `em_falta`: não tem. O texto vem como imagem (o padrão) ou com outra fonte (`fazer: "substituir"`).
 *   `sugestao`, quando vem, é a fonte mais parecida que o Otto tem (a mesma família em outro peso).
 */
export const FonteDoPsd = z.object({
  postScript: PostScript,
  situacao: z.enum(['na_biblioteca', 'no_catalogo', 'em_falta']),
  familia: z.string().optional(),
  peso: z.int().optional(),
  sugestao: z.object({ familia: z.string(), peso: z.int() }).optional(),
});
export type FonteDoPsd = z.infer<typeof FonteDoPsd>;

/**
 * O que fazer com uma fonte do arquivo. Fonte sem escolha fica no padrão da situação dela.
 * - `imagem`: o texto que a usa vem como imagem, com a aparência do arquivo;
 * - `baixar`: traz a família do catálogo (só para fonte `no_catalogo`); se não der, o texto vem como imagem;
 * - `substituir`: o texto vem editável com a fonte de `por` (uma família da biblioteca ou do catálogo, no peso
 *   mais próximo que existir). A troca aparece em `relatorio.substituicoes`.
 */
export const EscolhaDeFonte = z.discriminatedUnion('fazer', [
  z.strictObject({ postScript: PostScript, fazer: z.literal('imagem') }),
  z.strictObject({ postScript: PostScript, fazer: z.literal('baixar') }),
  z.strictObject({ postScript: PostScript, fazer: z.literal('substituir'), por: FamiliaEPeso }),
]);
export type EscolhaDeFonte = z.infer<typeof EscolhaDeFonte>;

/**
 * Corpo de POST /api/importacoes/:id/importar.
 * `nome`: o nome da peça (padrão: o nome do arquivo, sem a extensão). `marcaId`: uma marca da conta.
 * `fontes`: uma escolha por fonte; cita só fonte que está em `Importacao.fontes`.
 */
export const PedidoDeImportacao = z.strictObject({
  nome: Nome.optional(),
  marcaId: Id.optional(),
  fontes: z
    .array(EscolhaDeFonte)
    .max(200)
    .refine((fontes) => new Set(fontes.map((f) => f.postScript)).size === fontes.length, { message: 'a mesma fonte aparece duas vezes' })
    .default([]),
});
export type PedidoDeImportacao = z.infer<typeof PedidoDeImportacao>;

/**
 * O relatório de importação, como @otto/psd o produz (docs/tecnico/psd.md, coluna de importação).
 * Uma linha por camada do arquivo: `editavel` (virou o recurso equivalente do Otto), `imagem` (veio como imagem,
 * com o pixel do arquivo) ou `ignorado` (não veio). `camada` é o nome que a camada tem NO ARQUIVO: é conteúdo de
 * terceiro, mostre como texto e nada mais. `avisos[].texto`, `camadas[].observacao` e `perdas[].detalhe` são frases
 * em português ainda sem o guardião da marca: a tela decide a frase pelo `codigo` do aviso e pelo `destino`.
 */
export const RelatorioDeImportacao = z.object({
  arquivo: z.object({
    formato: z.enum(['psd', 'psb']),
    largura: z.int(),
    altura: z.int(),
    /** Registros de camada do arquivo (cada grupo conta dois). */
    camadas: z.int(),
    perfilDeCor: z.string().optional(),
    conversaoDeCor: z.enum(['srgb', 'sem-perfil', 'convertido', 'nao-reconhecido']),
  }),
  camadas: z.array(
    z.object({
      prancheta: z.string(),
      camada: z.string(),
      /** Id do nó criado. Ausente no que foi ignorado e no que virou o fundo da prancheta. */
      idDoNo: z.string().optional(),
      /** O nome que a camada ganhou no Otto, quando não pôde ficar com o do arquivo. */
      nomeNoOtto: z.string().optional(),
      tipo: z.string().optional(),
      destino: z.enum(['editavel', 'imagem', 'ignorado']),
      mapeamento: z.string(),
      observacao: z.string().optional(),
      perdas: z.array(z.object({ mapeamento: z.string(), detalhe: z.string() })).optional(),
    }),
  ),
  /** Fontes que o texto importado usa, e que o Otto tem. */
  fontes: z.array(z.object({ familia: z.string(), peso: z.number(), postScript: z.string(), arquivo: z.string().optional() })),
  /** Texto cuja fonte foi trocada, a pedido de quem importou. */
  substituicoes: z.array(z.object({ camada: z.string(), pedida: z.string(), usada: z.object({ familia: z.string(), peso: z.number(), postScript: z.string() }) })),
  /** Fontes que o arquivo pede e não foram entregues: o texto dessas camadas veio como imagem. */
  emFalta: z.object({ fontes: z.array(z.object({ postScript: z.string(), camadas: z.array(z.string()) })) }),
  /** `codigo` é texto livre de propósito: o catálogo de avisos é de @otto/psd e pode crescer. */
  avisos: z.array(z.object({ codigo: z.string(), texto: z.string() })),
});
export type RelatorioDeImportacao = z.infer<typeof RelatorioDeImportacao>;

/**
 * - `enviada`: o arquivo passou na conferência e espera o pedido de importação (até `expiraEm`);
 * - `na_fila`, `rodando`: o worker vai importar, ou está importando;
 * - `pronta`: a peça existe (`documentoId`);
 * - `falhou`: não deu (`erro`); `descartada`: a pessoa desistiu, ou o prazo do arquivo enviado venceu.
 */
export const EstadoDaImportacao = z.enum(['enviada', 'na_fila', 'rodando', 'pronta', 'falhou', 'descartada']);
export type EstadoDaImportacao = z.infer<typeof EstadoDaImportacao>;

/** Estados em que não adianta mais consultar. */
export const ESTADOS_FINAIS_DA_IMPORTACAO: readonly EstadoDaImportacao[] = ['pronta', 'falhou', 'descartada'];

/** Resposta de todas as rotas de importação. A chave do objeto no armazenamento nunca sai. */
export const Importacao = z.object({
  id: Id,
  estado: EstadoDaImportacao,
  /** O que a conferência do envio viu, sem decodificar pixel. `nome` é o nome do arquivo enviado. */
  arquivo: z.object({
    nome: z.string(),
    bytes: z.int().min(0),
    formato: z.enum(['psd', 'psb']),
    largura: z.int().positive(),
    altura: z.int().positive(),
    /** Registros de camada do arquivo (cada grupo conta dois). */
    camadas: z.int().min(0),
  }),
  /** As fontes que o texto do arquivo pede, com a situação de cada uma AGORA (muda quando uma fonte entra na biblioteca). */
  fontes: z.array(FonteDoPsd),
  /** O pedido que foi feito. Presente depois de POST .../importar. */
  pedido: PedidoDeImportacao.optional(),
  /** A peça criada. Presente só em `pronta`. */
  documentoId: Id.optional(),
  /** Presente só em `pronta`. Não vem na lista. */
  relatorio: RelatorioDeImportacao.optional(),
  /**
   * Presente em `falhou`. `psd_recusado`: o arquivo não pode ser importado (`motivo` e `mensagem` dizem por quê).
   * `interrompida`: o servidor caiu no meio, duas vezes. `abandonada`: ficou tempo demais na fila.
   * `fila_indisponivel`, `arquivo_indisponivel`, `documento_grande_demais`, `falha_na_importacao`.
   */
  erro: z.object({ codigo: z.string(), motivo: z.string().optional(), mensagem: z.string().optional() }).optional(),
  criadaEm: Quando,
  prontaEm: Quando.optional(),
  /** Até quando o arquivo enviado espera o pedido de importação. Presente só em `enviada`. */
  expiraEm: Quando.optional(),
  /** Do começo do trabalho no worker ao fim. */
  duracaoMs: z.int().min(0).optional(),
});
export type Importacao = z.infer<typeof Importacao>;

/** Resposta de GET /api/importacoes. Os itens vêm sem `relatorio`: consulte a importação para tê-lo. */
export const ListaDeImportacoes = z.object({ itens: z.array(Importacao) });
export type ListaDeImportacoes = z.infer<typeof ListaDeImportacoes>;
