// O contrato HTTP da API, como esquemas zod (docs/mvp/backend.md, seção 7). Fonte única:
// a API valida o pedido e monta a resposta com eles; o editor valida a resposta e tira os tipos daqui.
//
// Regras gerais do contrato:
// - mesma origem: o navegador fala com /api/...;
// - a conta NUNCA vai na requisição: não existe campo, parâmetro nem cabeçalho de conta;
// - erro é sempre { codigo, detalhe? } (ErroDaApi); a frase que a pessoa lê é montada no editor;
// - recurso de outra conta responde 404 com o mesmo corpo de id inexistente.
import { CaminhoVetorial, Documento } from '@otto/documento';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const LIMITES = {
  caracteresDoNome: 120,
  caracteresDaDescricao: 200,
  operacoesPorLote: 500,
  /** Corpo de POST .../lotes. Um vetor importado cabe. */
  bytesDoLote: 6 * 1024 * 1024,
  /** Corpo de POST /api/vetores. */
  bytesDoSvg: 5 * 1024 * 1024,
  itensPorPagina: 50,
  itensPorPaginaNoMaximo: 100,
} as const;

export const CABECALHOS = {
  /** Obrigatório em toda escrita (POST, PATCH, PUT, DELETE). Sem ele: 403 cliente_nao_identificado. */
  cliente: { nome: 'X-Otto-Cliente', valor: 'editor' },
  /** Versão do formato do documento que o servidor fala. Vem em toda resposta; o editor manda a dele na escrita. */
  catalogo: 'X-Otto-Catalogo',
  /** Id da requisição, para casar tela e log. Vem em toda resposta. */
  correlacao: 'X-Otto-Correlacao',
} as const;

/** Códigos de erro da fatia 1. O editor decide pelo código; `detalhe` varia por código (ver cada um). */
export const CODIGOS_DE_ERRO = {
  /** 404. Documento, arquivo ou fonte que não existe OU é de outra conta: o corpo é o mesmo. */
  naoEncontrado: 'nao_encontrado',
  /** 404. A rota não existe. */
  rotaNaoEncontrada: 'rota_nao_encontrada',
  /** 400. detalhe: { campos: string[] } com o caminho de cada campo recusado. */
  pedidoInvalido: 'pedido_invalido',
  /** 403. Escrita sem o cabeçalho X-Otto-Cliente. */
  clienteNaoIdentificado: 'cliente_nao_identificado',
  /** 409. detalhe: { versaoAtual }. O editor busca o documento de novo. */
  versaoDesatualizada: 'versao_desatualizada',
  /** 409. detalhe: { catalogoDoServidor }. O editor pede para recarregar a página. */
  catalogoDesatualizado: 'catalogo_desatualizado',
  /** 422. detalhe: { indice, op, alvo?, campo?, mensagem }. Nada do lote entrou. */
  loteInvalido: 'lote_invalido',
  /** 422. O lote cita arquivo que a conta não tem. detalhe: { quantos }. */
  arquivoDesconhecido: 'arquivo_desconhecido',
  /** 409. */
  nadaParaDesfazer: 'nada_para_desfazer',
  /** 409. */
  nadaParaRefazer: 'nada_para_refazer',
  /** 413. detalhe: { limiteEmBytes }. */
  corpoGrandeDemais: 'corpo_grande_demais',
  /** 413. O documento passaria do tamanho máximo. */
  documentoGrandeDemais: 'documento_grande_demais',
  /** 413. detalhe: { limiteEmBytes }. */
  arquivoGrandeDemais: 'arquivo_grande_demais',
  /** 415. O conteúdo não é JPEG, PNG nem WebP (confere-se o conteúdo, não o cabeçalho). */
  tipoNaoAceito: 'tipo_nao_aceito',
  /** 422. detalhe: { ladoMaximo, megapixelsNoMaximo }. */
  imagemGrandeDemais: 'imagem_grande_demais',
  /** 422. O arquivo diz ser imagem e não dá para ler as medidas. */
  imagemIlegivel: 'imagem_ilegivel',
  /** 422. detalhe: { motivo }. */
  svgInvalido: 'svg_invalido',
  /** 422. O pedido de exportação cita prancheta que o documento não tem. */
  pranchetaDesconhecida: 'prancheta_desconhecida',
  /** 422. O documento não tem prancheta nenhuma para exportar. */
  nadaParaExportar: 'nada_para_exportar',
  /** 429. A conta já tem exportações demais na fila. detalhe: { naFila, limite }. */
  limiteDeExportacoes: 'limite_de_exportacoes',
  /** 409. O arquivo ainda não saiu. detalhe: { estado }. */
  exportacaoNaoPronta: 'exportacao_nao_pronta',
  /** 410. Os arquivos da exportação já foram apagados (7 dias). Peça outra. */
  exportacaoExpirada: 'exportacao_expirada',
  /** 503. A fila de trabalho não aceitou o pedido. Tente de novo. */
  filaIndisponivel: 'fila_indisponivel',
  /** 422. detalhe: { pranchetaId, megapixels, limite }. A prancheta, na escala pedida, passa do que uma exportação aguenta. */
  exportacaoGrandeDemais: 'exportacao_grande_demais',
  /** 500. */
  erroInterno: 'erro_interno',
} as const;
export type CodigoDeErro = (typeof CODIGOS_DE_ERRO)[keyof typeof CODIGOS_DE_ERRO];

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

const Id = z.uuid();
const Versao = z.int().min(0);
const Quando = z.iso.datetime();
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const Nome = z.string().trim().min(1).max(LIMITES.caracteresDoNome);
const Cursor = z.string().min(1).nullable();

/** Estados da tarefa do Otto (seção 7.5). Na fatia 1 nenhuma tarefa existe; o campo já está no contrato. */
export const EstadoDaTarefa = z.enum(['na_fila', 'rodando', 'aguardando_confirmacao', 'em_revisao', 'aceita', 'aceita_em_parte', 'desfeita', 'cancelada', 'falhou']);
export type EstadoDaTarefa = z.infer<typeof EstadoDaTarefa>;

const TarefaResumida = z.object({ id: Id, estado: EstadoDaTarefa });

/**
 * Se há o que desfazer e o que refazer DEPOIS desta resposta. Vem em abrir, lote, desfazer e refazer.
 * Resposta sem os campos vale como falso.
 */
const PossibilidadesDoHistorico = { podeDesfazer: z.boolean().default(false), podeRefazer: z.boolean().default(false) };

/** Parâmetros de paginação de toda lista: ?cursor=&limite= */
export const Paginacao = z.object({
  cursor: z.string().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITES.itensPorPaginaNoMaximo).default(LIMITES.itensPorPagina),
});
export type Paginacao = z.infer<typeof Paginacao>;

// ---------------------------------------------------------------------------
// Documentos (7.3)
// ---------------------------------------------------------------------------

/** Item de GET /api/documentos. */
export const DocumentoDaLista = z.object({
  id: Id,
  nome: z.string(),
  /** Quantas pranchetas (formatos) a peça tem. */
  pranchetas: z.int().min(0),
  versao: Versao,
  alteradoEm: Quando,
  /** Presente quando há tarefa na fila, rodando ou aguardando revisão. */
  tarefa: TarefaResumida.optional(),
  /** Sempre nulo no MVP até a fatia de exportação. */
  miniatura: z.null(),
});
export type DocumentoDaLista = z.infer<typeof DocumentoDaLista>;

/** GET /api/documentos. Do alterado mais recentemente para o mais antigo. */
export const ListaDeDocumentos = z.object({ itens: z.array(DocumentoDaLista), proximoCursor: Cursor });
export type ListaDeDocumentos = z.infer<typeof ListaDeDocumentos>;

/**
 * GET /api/documentos/:id, e a resposta de criar e de duplicar.
 * Nome e id são do registro, não da árvore. Histórico e tarefas vêm em chamadas próprias.
 */
export const DocumentoAberto = z.object({
  id: Id,
  nome: z.string(),
  versao: Versao,
  arvore: Documento,
  ...PossibilidadesDoHistorico,
  /**
   * As famílias de fonte que o documento usa, com os pesos que a biblioteca TEM de cada uma.
   * `pesos` vazio: a biblioteca não tem a família, e o texto não é desenhado.
   * O editor sabe a troca de peso por aqui, com `pesoMaisProximo(pesos, pedido)`: a rota de bytes
   * devolve exatamente esse peso, e ninguém precisa ler cabeçalho de resposta binária.
   */
  fontes: z.array(z.object({ familia: z.string(), pesos: z.array(z.int()) })).default([]),
  tarefaAtiva: TarefaResumida.optional(),
  /** Alterações do Otto aguardando revisão. */
  conjuntoPendente: z.object({ tarefaId: Id, versaoInicial: Versao, tocados: z.array(z.string()) }).optional(),
});
export type DocumentoAberto = z.infer<typeof DocumentoAberto>;

/** POST /api/documentos. Sem nome, o servidor dá um nome padrão. */
export const PedidoDeCriarDocumento = z.strictObject({ nome: Nome.optional() });
export type PedidoDeCriarDocumento = z.infer<typeof PedidoDeCriarDocumento>;

/** POST /api/documentos/:id/duplicar. Sem nome, o servidor deriva do original. */
export const PedidoDeDuplicarDocumento = z.strictObject({ nome: Nome.optional() });
export type PedidoDeDuplicarDocumento = z.infer<typeof PedidoDeDuplicarDocumento>;

/** PATCH /api/documentos/:id. Renomear não é operação do catálogo nem passo do histórico. */
export const PedidoDeRenomearDocumento = z.strictObject({ nome: Nome });
export type PedidoDeRenomearDocumento = z.infer<typeof PedidoDeRenomearDocumento>;

export const DocumentoRenomeado = z.object({ id: Id, nome: z.string() });
export type DocumentoRenomeado = z.infer<typeof DocumentoRenomeado>;

// ---------------------------------------------------------------------------
// Lotes, desfazer, refazer, histórico (7.3)
// ---------------------------------------------------------------------------

/**
 * POST /api/documentos/:id/lotes.
 * - `id` é gerado pelo editor. É o `idDoLote` de aplicarLote: os ids dos nós novos derivam dele.
 *   Reenviar o mesmo id não aplica duas vezes: a API devolve o resultado guardado.
 * - `versaoBase` é a versão confirmada sobre a qual o lote foi montado.
 * - `operacoes` são validadas pelo catálogo (@otto/documento), não aqui: o erro vem por operação.
 * - `devolver: "arvore"` faz a resposta trazer a árvore como ficou no servidor. Peça quando o lote
 *   mede texto (loteDependeDeMedida): navegador e servidor podem medir diferente.
 */
export const PedidoDeLote = z.strictObject({
  id: Id,
  versaoBase: Versao,
  descricao: z.string().trim().min(1).max(LIMITES.caracteresDaDescricao),
  operacoes: z.array(z.unknown()).min(1).max(LIMITES.operacoesPorLote),
  devolver: z.literal('arvore').optional(),
});
export type PedidoDeLote = z.infer<typeof PedidoDeLote>;

export const RespostaDeLote = z.object({
  versao: Versao,
  lote: z.object({ id: Id, tocados: z.array(z.string()) }),
  arvore: Documento.optional(),
  ...PossibilidadesDoHistorico,
});
export type RespostaDeLote = z.infer<typeof RespostaDeLote>;

/** detalhe do erro lote_invalido. `mensagem` foi escrita para o agente; o editor monta a própria frase. */
export const DetalheDeLoteInvalido = z.object({ indice: z.int().min(0), op: z.string(), alvo: z.string().optional(), campo: z.string().optional(), mensagem: z.string() });
export type DetalheDeLoteInvalido = z.infer<typeof DetalheDeLoteInvalido>;

/** POST /api/documentos/:id/desfazer e /refazer. */
export const PedidoDeDesfazer = z.strictObject({ versaoBase: Versao });
export type PedidoDeDesfazer = z.infer<typeof PedidoDeDesfazer>;

/** Desfazer e refazer sempre devolvem a árvore: o editor adota. */
export const RespostaDeDesfazer = z.object({ versao: Versao, arvore: Documento, ...PossibilidadesDoHistorico });
export type RespostaDeDesfazer = z.infer<typeof RespostaDeDesfazer>;

/** Item de GET /api/documentos/:id/historico. Sem as operações: o histórico é para listar, não para reaplicar. */
export const LoteDoHistorico = z.object({
  /** O id que o editor mandou no lote; em lote criado pelo servidor (reversão), um id do servidor. */
  id: Id,
  versao: z.int().min(1),
  autoria: z.enum(['designer', 'agente']),
  tarefaId: Id.optional(),
  /** `reversao` é o lote que desfazer, refazer e "desfazer tudo" gravam: o histórico só cresce. */
  tipo: z.enum(['edicao', 'reversao']),
  /** Só em reversão: a versão cuja árvore o documento voltou a ter. A frase ("desfez", "refez") é do editor. */
  reverteAteVersao: Versao.optional(),
  descricao: z.string(),
  tocados: z.array(z.string()),
  quantidadeDeOperacoes: z.int().min(0),
  quando: Quando,
  /** Verdadeiro enquanto este lote estiver desfeito. */
  desfeito: z.boolean(),
});
export type LoteDoHistorico = z.infer<typeof LoteDoHistorico>;

/** GET /api/documentos/:id/historico. Do mais novo para o mais velho. */
export const Historico = z.object({ itens: z.array(LoteDoHistorico), proximoCursor: Cursor });
export type Historico = z.infer<typeof Historico>;

// ---------------------------------------------------------------------------
// Arquivos, vetores e fontes (7.4)
// ---------------------------------------------------------------------------

export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoDeImagem = (typeof TIPOS_DE_IMAGEM)[number];

/**
 * Resposta de POST /api/arquivos (corpo: os bytes; Content-Type: um de TIPOS_DE_IMAGEM).
 * O documento referencia o arquivo por `sha256`. Os bytes saem em GET /api/arquivos/:sha256.
 */
export const ArquivoEnviado = z.object({
  sha256: Sha256,
  tipo: z.enum(TIPOS_DE_IMAGEM),
  largura: z.int().positive(),
  altura: z.int().positive(),
  bytes: z.int().positive(),
});
export type ArquivoEnviado = z.infer<typeof ArquivoEnviado>;

/**
 * Resposta de POST /api/vetores?nome= (corpo: o texto do SVG).
 * `no` vai direto em criarNo: falta só nome, x, y, largura e altura.
 */
export const VetorImportado = z.object({
  no: z.object({
    tipo: z.literal('vetor'),
    moldura: z.tuple([z.number().positive(), z.number().positive()]),
    caminhos: z.array(CaminhoVetorial).min(1),
    origem: z.object({ arquivo: Sha256, nome: z.string() }),
  }),
  avisos: z.array(z.string()),
});
export type VetorImportado = z.infer<typeof VetorImportado>;

/**
 * O peso que existe mais perto do pedido; no empate, o mais pesado. É a mesma regra na rota de bytes
 * da fonte, no medidor do servidor e na exportação. Sem peso nenhum, undefined.
 */
export function pesoMaisProximo(pesos: readonly number[], pedido: number): number | undefined {
  let melhor: number | undefined;
  for (const peso of pesos) {
    if (melhor === undefined) melhor = peso;
    else {
      const [distancia, atual] = [Math.abs(peso - pedido), Math.abs(melhor - pedido)];
      if (distancia < atual || (distancia === atual && peso > melhor)) melhor = peso;
    }
  }
  return melhor;
}

/** Item de GET /api/fontes?q= */
export const FonteDaLista = z.object({ familia: z.string(), pesos: z.array(z.int()) });
export type FonteDaLista = z.infer<typeof FonteDaLista>;

export const ListaDeFontes = z.object({ itens: z.array(FonteDaLista) });
export type ListaDeFontes = z.infer<typeof ListaDeFontes>;

/**
 * GET /api/fontes/:familia/:peso. `peso` é o que existe mais perto do pedido.
 * Os bytes saem em GET /api/fontes/:familia/:peso/arquivo.
 */
export const FonteDaBiblioteca = z.object({ familia: z.string(), peso: z.int(), nomePostScript: z.string().nullable(), arquivo: z.string() });
export type FonteDaBiblioteca = z.infer<typeof FonteDaBiblioteca>;
