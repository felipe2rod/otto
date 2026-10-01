// O contrato HTTP da exportação (docs/mvp/backend.md, seção 7.6 e 17).
//
//   POST /api/documentos/:id/exportacoes/relatorio   PedidoDeExportacao → RelatorioDeExportacao
//        O relatório ANTES de exportar. Síncrono (não renderiza). Não cria nada.
//   POST /api/documentos/:id/exportacoes             PedidoDeExportacao → 202 Exportacao
//        Entra na fila. Uma exportação por vez por conta; as outras esperam.
//   GET  /api/exportacoes/:id                        → Exportacao
//        Consulte a cada 1 a 2 segundos enquanto o estado for na_fila ou rodando.
//   GET  /api/exportacoes/:id/arquivos/:indice       → 302 para um link assinado de 5 minutos
//        O link é novo a cada pedido: guarde este endereço, nunca o link.
//
// A exportação é da VERSÃO do documento no momento do pedido: editar depois não muda o arquivo.
import { z } from 'zod';

/** Quanto dura o link de download. Depois disso, peça de novo o endereço `baixar` do arquivo. */
export const VALIDADE_DO_LINK_EM_SEGUNDOS = 300;
/** Por quantos dias os arquivos de uma exportação ficam guardados. */
export const DIAS_DE_RETENCAO_DA_EXPORTACAO = 7;
/** Quantas exportações uma conta pode ter esperando na fila. */
export const EXPORTACOES_NA_FILA_POR_CONTA = 5;

const Id = z.uuid();
const Quando = z.iso.datetime();
/** Ids de prancheta do documento, na ordem que quiser. Sem o campo: todas. */
const Pranchetas = z.array(z.string().min(1)).min(1).max(100).optional();

/**
 * Corpo de POST .../exportacoes e de POST .../exportacoes/relatorio.
 * - psd, `arquivos: "por-prancheta"` (padrão): um arquivo por prancheta;
 * - psd, `arquivos: "juntas"`: um arquivo só, cada prancheta como prancheta do Photoshop;
 * - png: um arquivo por prancheta; `escala` 1 ou 2; `semFundo` deixa transparente o que não tem camada.
 */
export const PedidoDeExportacao = z.discriminatedUnion('formato', [
  z.strictObject({ formato: z.literal('psd'), arquivos: z.enum(['por-prancheta', 'juntas']).default('por-prancheta'), pranchetas: Pranchetas }),
  z.strictObject({ formato: z.literal('png'), escala: z.union([z.literal(1), z.literal(2)]).default(1), semFundo: z.boolean().default(false), pranchetas: Pranchetas }),
]);
export type PedidoDeExportacao = z.infer<typeof PedidoDeExportacao>;

/**
 * O relatório de exportação, como @otto/psd o produz (docs/tecnico/psd.md).
 * `avisos[].texto` e `camadas[].observacao` são frases em português ainda sem o guardião da marca:
 * o editor decide a frase pelo `codigo` do aviso e pelo `destino` da camada.
 */
export const RelatorioDeExportacao = z.object({
  arquivos: z.array(z.string()),
  camadas: z.array(
    z.object({
      prancheta: z.string(),
      camada: z.string(),
      /** Ausente nas camadas que a exportação cria (fundo, ajustes da foto). */
      idDoNo: z.string().optional(),
      tipo: z.string(),
      /** nativo-editavel: continua editável no Photoshop. nativo-pixel: é pixel por natureza. raster-com-aviso: perdeu a edição. */
      destino: z.enum(['nativo-editavel', 'nativo-pixel', 'raster-com-aviso']),
      mapeamento: z.string(),
      observacao: z.string().optional(),
    }),
  ),
  tokens: z.array(z.object({ nome: z.string(), valor: z.string(), usadoEm: z.array(z.string()) })),
  /** Fontes que precisam estar instaladas para editar o texto no Photoshop. */
  fontes: z.array(z.object({ familia: z.string(), peso: z.number(), postScript: z.string(), arquivo: z.string().optional() })),
  /** Texto que pediu um peso que não existe: saiu com o mais próximo, como no editor. */
  substituicoes: z.array(
    z.object({ camada: z.string(), pedida: z.object({ familia: z.string(), peso: z.number() }), usada: z.object({ familia: z.string(), peso: z.number(), postScript: z.string() }) }),
  ),
  /** O que o documento usa e não existe: a foto sai como retângulo cinza e o texto sai vazio. */
  emFalta: z.object({ fontes: z.array(z.object({ familia: z.string(), camadas: z.array(z.string()) })), imagens: z.array(z.object({ arquivo: z.string(), camadas: z.array(z.string()) })) }),
  /** Origem e licença de cada imagem de banco. */
  imagens: z.array(z.object({ camada: z.string(), banco: z.string(), autor: z.string(), licenca: z.string(), url: z.string() })),
  /** `codigo` é texto livre de propósito: o catálogo de avisos é de @otto/psd e pode crescer. */
  avisos: z.array(z.object({ codigo: z.string(), texto: z.string() })),
});
export type RelatorioDeExportacao = z.infer<typeof RelatorioDeExportacao>;

export const EstadoDaExportacao = z.enum(['na_fila', 'rodando', 'pronta', 'pronta_em_parte', 'falhou']);
export type EstadoDaExportacao = z.infer<typeof EstadoDaExportacao>;

/** Estados em que não adianta mais consultar. */
export const ESTADOS_FINAIS_DA_EXPORTACAO: readonly EstadoDaExportacao[] = ['pronta', 'pronta_em_parte', 'falhou'];

export const ArquivoDaExportacao = z.object({
  indice: z.int().min(0),
  /** Nome de arquivo sugerido para salvar. */
  nome: z.string(),
  tipo: z.string(),
  bytes: z.int().min(0),
  /** A prancheta deste arquivo. Ausente no PSD com todas as pranchetas juntas. */
  pranchetaId: z.string().optional(),
  /** Endereço estável para baixar: responde 302 para um link assinado novo a cada pedido. */
  baixar: z.string(),
});
export type ArquivoDaExportacao = z.infer<typeof ArquivoDaExportacao>;

/**
 * Resposta de POST .../exportacoes (202) e de GET /api/exportacoes/:id.
 * - `progresso` anda uma unidade por prancheta terminada (com ou sem falha);
 * - `pronta_em_parte`: alguma prancheta falhou; os arquivos das outras estão em `arquivos` e as falhas em `falhas`;
 * - depois de `expiraEm`, baixar responde 410 exportacao_expirada.
 */
export const Exportacao = z.object({
  id: Id,
  documentoId: Id,
  /** A versão do documento que foi exportada. */
  versao: z.int().min(0),
  formato: z.enum(['psd', 'png']),
  estado: EstadoDaExportacao,
  progresso: z.object({ pranchetasProntas: z.int().min(0), pranchetasNoTotal: z.int().min(0) }),
  arquivos: z.array(ArquivoDaExportacao),
  falhas: z.array(z.object({ pranchetaId: z.string(), codigo: z.string() })),
  /** O relatório do que de fato saiu. Presente quando o estado é pronta ou pronta_em_parte, no PSD. */
  relatorio: RelatorioDeExportacao.optional(),
  /** Presente quando o estado é falhou. */
  erro: z.object({ codigo: z.string() }).optional(),
  criadaEm: Quando,
  prontaEm: Quando.optional(),
  expiraEm: Quando.optional(),
  /** Do começo do trabalho ao último arquivo guardado. */
  duracaoMs: z.int().min(0).optional(),
});
export type Exportacao = z.infer<typeof Exportacao>;
