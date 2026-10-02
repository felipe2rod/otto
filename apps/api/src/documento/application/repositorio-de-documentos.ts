// Porta: onde os documentos moram. O escopo da conta é sempre o primeiro argumento (ADR 023).
// Nenhum tipo do Prisma cruza esta porta (ADR 020, exigência 1).
import type { Documento } from '@otto/documento';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface RegistroDeDocumento {
  id: string;
  nome: string;
  /** Versão atual. 0 é o documento como nasceu; cada lote soma 1. */
  versao: number;
  pranchetas: number;
  alteradoEm: Date;
  /** A marca com que a peça foi criada pelo formulário de briefing. */
  marcaId?: string;
  /** A versão que a miniatura guardada mostra. Ausente: ainda não há miniatura. */
  miniaturaVersao?: number;
  /** A importação de PSD de onde a peça nasceu. */
  importacaoId?: string;
}

export interface NovoDocumento {
  id: string;
  nome: string;
  arvore: Documento;
  deExemplo?: boolean;
  importacaoId?: string;
}

export interface DocumentoGuardado extends RegistroDeDocumento {
  arvore: Documento;
}

export interface LoteGravado {
  /** Id do servidor. */
  id: string;
  /** Id que o editor mandou (é o idDoLote de aplicarLote). Nulo em lote criado pelo servidor. */
  chaveDoCliente: string | null;
  versao: number;
  autoria: 'designer' | 'agente';
  tarefaId: string | null;
  tipo: 'edicao' | 'reversao';
  reverteAteVersao: number | null;
  /** Id do lote de reversão que desfez este, enquanto estiver desfeito. */
  desfeitoPor: string | null;
  descricao: string;
  tocados: string[];
  quantidadeDeOperacoes: number;
  criadoEm: Date;
}

export interface NovoLote {
  id: string;
  chaveDoCliente?: string;
  /** Versão que este lote produz: a atual mais 1. */
  versao: number;
  autoria: 'designer' | 'agente';
  tarefaId?: string;
  tipo: 'edicao' | 'reversao';
  reverteAteVersao?: number;
  descricao: string;
  operacoes: readonly unknown[];
  tocados: readonly string[];
  /** A árvore como fica depois deste lote. */
  arvore: Documento;
}

export interface Pagina<T> {
  itens: T[];
  proximoCursor: string | null;
}

/** O documento com a linha travada, dentro de uma transação. Só existe durante `comTrava`. */
export interface DocumentoTravado {
  readonly registro: RegistroDeDocumento;
  arvore(): Promise<Documento>;
  arvoreDaVersao(versao: number): Promise<Documento | undefined>;
  lote(versao: number): Promise<LoteGravado | undefined>;
  lotePorChaveDoCliente(chave: string): Promise<LoteGravado | undefined>;
  /** As reversões seguidas no fim do histórico, da mais nova para a mais velha. */
  caudaDeReversoes(): Promise<LoteGravado[]>;
  /** A versão do primeiro lote que a tarefa gravou nesta peça. undefined se ela não gravou nenhum. */
  primeiraVersaoDaTarefa(tarefaId: string): Promise<number | undefined>;
  /** Grava o lote e a árvore nova e avança a versão. Tudo ou nada, com o resto da transação. */
  gravarLote(novo: NovoLote): Promise<void>;
  /** Marca (ou desmarca, com null) o lote de edição de uma versão como desfeito. */
  marcarDesfeito(versao: number, por: string | null): Promise<void>;
}

/** O bastante para saber se dá para desfazer e refazer, sem travar o documento. */
export interface ResumoDoHistorico {
  /** O lote mais recente. Ausente em documento sem lote. */
  atual?: LoteGravado;
  /** As reversões seguidas no fim do histórico, da mais nova para a mais velha. */
  cauda: LoteGravado[];
  /** O lote logo antes da cauda. Ausente se a cauda começa na versão 1 ou se não há lote. */
  antesDaCauda?: LoteGravado;
}

export abstract class RepositorioDeDocumentos {
  /**
   * `deExemplo`: a peça de exemplo semeada na conta nova. `importacaoId`: a importação de PSD (DA CONTA) de onde a
   * peça nasce; uma importação cria no máximo uma peça, e a segunda tentativa lança.
   */
  abstract criar(escopo: EscopoDaConta, novo: NovoDocumento): Promise<DocumentoGuardado>;
  /** A peça que nasceu de uma importação, arquivada ou não. undefined se não há, nesta conta. */
  abstract daImportacao(escopo: EscopoDaConta, importacaoId: string): Promise<RegistroDeDocumento | undefined>;
  /** A conta já teve a peça de exemplo? Conta também a arquivada: o exemplo não volta sozinho. */
  abstract temExemplo(escopo: EscopoDaConta): Promise<boolean>;
  /** Não arquivados, do alterado mais recentemente para o mais antigo. */
  /** `marcaId` filtra pelas peças de uma marca. */
  abstract listar(escopo: EscopoDaConta, pagina: { cursor?: string; limite: number; marcaId?: string }): Promise<Pagina<RegistroDeDocumento>>;
  /** Liga a peça a uma marca DA CONTA (quem chama já conferiu a marca). false se a peça não existe nesta conta. */
  abstract definirMarca(escopo: EscopoDaConta, id: string, marcaId: string): Promise<boolean>;
  /**
   * Marca que uma miniatura foi pedida agora, se a última foi pedida antes de `seAnteriorA` (ou nunca). É o freio:
   * true quer dizer "publique o trabalho"; false, que já há um pedido recente (ou que a peça não existe nesta conta).
   */
  abstract pedirMiniatura(escopo: EscopoDaConta, id: string, agora: Date, seAnteriorA: Date): Promise<boolean>;
  /** Registra a versão que a miniatura guardada mostra. Devolve a versão que havia antes, para apagar o arquivo antigo. undefined se a peça não existe nesta conta. */
  abstract gravarMiniatura(escopo: EscopoDaConta, id: string, versao: number): Promise<{ anterior?: number } | undefined>;
  /** undefined se não existe, se foi arquivado ou se é de outra conta. */
  abstract abrir(escopo: EscopoDaConta, id: string): Promise<DocumentoGuardado | undefined>;
  abstract renomear(escopo: EscopoDaConta, id: string, nome: string): Promise<RegistroDeDocumento | undefined>;
  /** undefined se o documento não existe nesta conta. */
  abstract resumoDoHistorico(escopo: EscopoDaConta, id: string): Promise<ResumoDoHistorico | undefined>;
  /** A árvore e o nome do documento numa versão. undefined se o documento ou a versão não existem nesta conta. */
  abstract arvoreNaVersao(escopo: EscopoDaConta, id: string, versao: number): Promise<{ nome: string; arvore: Documento } | undefined>;
  /** Arquiva (não apaga). false se não existe nesta conta. */
  abstract arquivar(escopo: EscopoDaConta, id: string): Promise<boolean>;
  /** Do lote mais novo para o mais velho. undefined se o documento não existe nesta conta. */
  abstract historico(escopo: EscopoDaConta, id: string, pagina: { cursor?: string; limite: number }): Promise<Pagina<LoteGravado> | undefined>;
  /**
   * Trava o documento e roda `fn` numa transação: dois lotes nunca ocupam a mesma versão.
   * Se `fn` lançar, nada é gravado. undefined se o documento não existe nesta conta.
   */
  abstract comTrava<T>(escopo: EscopoDaConta, id: string, fn: (doc: DocumentoTravado) => Promise<T>): Promise<T | undefined>;
}
