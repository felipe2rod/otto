// Portas do ciclo do agente (ADR 020, ADR 029). Tudo que é efeito fica atrás de uma delas: o modelo,
// aplicar lote, ver o documento, renderizar, verificar, buscar e trazer imagem, relógio, id, custo e progresso.
// O núcleo não sabe qual modelo responde, de onde vêm os bytes nem onde o documento é guardado.
//
// Quem implementa: o worker (apps/api), com banco, armazenamento e @otto/render; a avaliação (avaliacao/),
// em memória; os testes, com falsos.
import type { Aviso, Documento, ErroDeOperacao } from '@otto/documento';
import type { EventoDaTarefa } from './contrato';

// ---------- modelo ----------

export type TipoDeImagem = 'image/jpeg' | 'image/png' | 'image/webp';

export type ParteDeConteudo = { tipo: 'texto'; texto: string } | { tipo: 'imagem'; mime: TipoDeImagem; base64: string };

export interface ChamadaDeFerramenta {
  id: string;
  nome: string;
  /** Argumentos já lidos como objeto. Se o modelo mandou algo que não é objeto, vem vazio. */
  argumentos: Record<string, unknown>;
}

export interface ResultadoDeFerramenta {
  idDaChamada: string;
  texto: string;
  erro?: boolean;
}

export type MensagemDoModelo =
  | { papel: 'usuario'; partes: ParteDeConteudo[] }
  | {
      papel: 'assistente';
      texto: string;
      chamadas: ChamadaDeFerramenta[];
      /** O que o adaptador precisa devolver intacto na chamada seguinte (blocos de raciocínio). O núcleo não lê. */
      opaco?: unknown;
    }
  | {
      papel: 'ferramentas';
      resultados: ResultadoDeFerramenta[];
      /** Imagens (e o rótulo de cada uma) que acompanham os resultados: render e prévia de foto. */
      anexos: ParteDeConteudo[];
    };

export interface DescricaoDeFerramenta {
  nome: string;
  descricao: string;
  /** Esquema JSON dos parâmetros. */
  parametros: Record<string, unknown>;
}

/** Esforço de raciocínio do modelo na chamada. Não é o esforço criativo (esforco.ts). */
export type Raciocinio = 'baixo' | 'medio' | 'alto';

/** Quem está falando com o modelo. Serve ao registro de custo; o adaptador não muda de comportamento por ele. */
export type PapelDaChamada = 'agente' | 'ajuste' | 'diretor' | 'planejador' | 'revisor';

export interface PedidoAoModelo {
  papel: PapelDaChamada;
  /**
   * Blocos do prompt do sistema, do mais estável para o mais variável. O primeiro é o prefixo que não muda
   * entre tarefas (caráter, modo de trabalho, repertório): é ele, com as ferramentas, que o cache guarda.
   */
  sistema: string[];
  mensagens: MensagemDoModelo[];
  ferramentas: DescricaoDeFerramenta[];
  raciocinio: Raciocinio;
  sinal?: AbortSignal;
}

export interface UsoDoModelo {
  /** Tokens de entrada cobrados cheios: nem lidos do cache, nem escritos nele. */
  entrada: number;
  cacheLido: number;
  cacheCriado: number;
  /** Inclui o raciocínio. */
  saida: number;
}

export interface RespostaDoModelo {
  texto: string;
  chamadas: ChamadaDeFerramenta[];
  opaco?: unknown;
  uso: UsoDoModelo;
  parada: 'fim' | 'ferramentas' | 'limite-de-saida';
}

/** Preço em dólar por milhão de tokens. */
export interface PrecoDoModelo {
  entrada: number;
  saida: number;
  cacheLido: number;
  cacheCriado: number;
}

export interface ModeloDoAgente {
  /** Identificador para o registro de custo. Nunca aparece em texto que o designer lê. */
  readonly nome: string;
  /** O que este modelo, por este caminho, de fato atende. O ciclo degrada de forma explícita (ADR 020). */
  readonly capacidades: { imagem: boolean; ferramentas: boolean; cache: boolean };
  /** Sem preço, o custo em dinheiro fica indefinido e o teto de custo não vale (os outros tetos continuam). */
  readonly preco?: PrecoDoModelo;
  responder(pedido: PedidoAoModelo): Promise<RespostaDoModelo>;
}

export type CodigoDeErroDoModelo = 'cancelada' | 'limite_diario' | 'limite_de_taxa' | 'rede' | 'recusa' | 'credencial' | 'pedido_invalido' | 'resposta_invalida' | 'desconhecido';

/**
 * Falha do modelo, com código estável. A mensagem é para diagnóstico e nunca leva conteúdo da tarefa
 * (pedido, briefing, texto de camada): pode ir para log (ADR 031).
 */
export class ErroDoModelo extends Error {
  readonly codigo: CodigoDeErroDoModelo;
  /**
   * O que o fornecedor respondeu, para diagnóstico de quem desenvolve. PODE conter trecho do pedido:
   * não vai para log, evento nem tela.
   */
  readonly detalhe: string | undefined;
  constructor(codigo: CodigoDeErroDoModelo, mensagem: string, detalhe?: string) {
    super(mensagem);
    this.name = 'ErroDoModelo';
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

// ---------- documento, render, verificação ----------

export interface LoteDoAgente {
  /** Id do lote, gerado pelo ciclo. Os ids dos nós novos derivam dele (@otto/documento, ids.ts). */
  id: string;
  descricao: string;
  operacoes: unknown[];
}

export type ResultadoDaAplicacao = { ok: true; tocados: string[]; versao?: number } | { ok: false; erro: ErroDeOperacao };

export interface ImagemParaOModelo {
  mime: TipoDeImagem;
  base64: string;
  /** Tamanho em pixels do que foi mandado ao modelo. */
  largura: number;
  altura: number;
}

export interface PedidoDeRender {
  /** Id da prancheta. */
  prancheta: string;
  /** Lado maior da imagem, em pixels. Imagem é a parte cara da entrada: o ciclo pede a menor que resolve a pergunta. */
  ladoMaximo: number;
  /** [x, y, largura, altura] em pixels da prancheta: recorte em tamanho real (ou reduzido até caber em ladoMaximo). */
  regiao?: [number, number, number, number];
}

// ---------- imagens, fontes, texturas, sujeito ----------

export interface ImagemEncontrada {
  /** Identificador do resultado, válido até o fim da tarefa. */
  id: string;
  /** Etiquetas ou descrição do banco. É material: vem de terceiros. */
  descricao: string;
  largura: number;
  altura: number;
  autor: string;
}

export interface ImagemTrazida {
  /** Objeto pronto para criarNo (falta nome e caixa): { tipo: 'imagem', arquivo, larguraOriginal, alturaOriginal, ajuste, origem }. */
  no: Record<string, unknown>;
  largura: number;
  altura: number;
  /** Prévia para o modelo conferir a foto antes de usar. Ausente: o modelo fica sem ver, e o resultado da ferramenta diz isso. */
  previa?: ImagemParaOModelo;
}

/** Banco de imagens (ADR 032). O mesmo do painel de biblioteca do editor. */
export interface BancoDeImagens {
  buscar(consulta: string, orientacao?: 'horizontal' | 'vertical' | 'todas'): Promise<ImagemEncontrada[]>;
  trazer(id: string): Promise<ImagemTrazida>;
}

export interface FamiliaDeFonte {
  familia: string;
  pesos: number[];
  categoria?: string;
  /** Para que serve, em poucas palavras ("título condensado", "texto corrido"). */
  uso?: string;
}

export interface BibliotecaDeFontes {
  /** As famílias que a conta já tem. Entram no contexto do prompt. */
  daConta(): FamiliaDeFonte[];
  /** Catálogo maior, sob demanda. Ausente: o Otto só usa as da conta e não recebe a ferramenta buscarFontes. */
  buscar?(consulta: string, categoria?: string): Promise<FamiliaDeFonte[]>;
}

export interface TexturaDaBiblioteca {
  nome: string;
  descricao: string;
  modoDeMesclagem: string;
  opacidade: number;
  /** Objeto pronto para criarNo (falta nome e caixa). */
  no: Record<string, unknown>;
}

export interface SujeitoDetectado {
  /** Arquivo da máscara (sha256), para {"mascara": {"tipo": "sujeito", "arquivo": ...}}. */
  arquivo: string;
  /** Onde o sujeito cai na prancheta, com o enquadramento da camada: [x, y, largura, altura] em px. */
  caixaNaPrancheta: [number, number, number, number];
  /** Quanto da foto o sujeito ocupa, de 0 a 1. */
  cobertura: number;
}

// ---------- custo e progresso ----------

/** Uma chamada ao modelo, para o registro de custo (ADR 029, item 5). Só números e códigos: nenhum conteúdo. */
export interface ChamadaRegistrada {
  papel: PapelDaChamada;
  modelo: string;
  uso: UsoDoModelo;
  duracaoMs: number;
  /** Imagens mandadas ao modelo nesta chamada pela primeira vez. */
  imagens: number;
  resultado: 'ok' | CodigoDeErroDoModelo;
}

/** Tetos do sistema. Valem em qualquer nível de esforço criativo; o nível só mexe em voltas, chamadas e revisões. */
export interface LimitesDoSistema {
  /** Teto absoluto de chamadas ao modelo, somando direção, plano, ciclo e revisão. */
  maximoDeChamadas: number;
  /** Em dólar, pelo preço do modelo. Só vale se o modelo declara preço. */
  tetoDeCusto: number;
  tetoDeTempoMs: number;
  /** Soma de entrada (com cache) e saída. */
  tetoDeTokens: number;
}

export const LIMITES_PADRAO: LimitesDoSistema = { maximoDeChamadas: 90, tetoDeCusto: 3, tetoDeTempoMs: 40 * 60 * 1000, tetoDeTokens: 4_000_000 };

/** O que as duas partes da tarefa têm em comum. */
export interface AmbienteBase {
  /** Modelo do ciclo de produção. */
  modelo: ModeloDoAgente;
  /** Modelo da direção de arte, do plano e do revisor (mais raciocínio). Ausente: o do ciclo. */
  modeloDoJulgamento?: ModeloDoAgente;
  /** A versão atual do documento. Depois de aplicarLote dar certo, devolve a árvore nova. */
  documento(): Documento;
  /** Árvore compacta para o modelo (resumirDocumento com o medidor de tinta e o nome da peça). */
  resumir(doc: Documento, prancheta?: string): unknown;
  /** Prévia de um arquivo da conta (imagem do cliente, captura do site), para a direção e o revisor compararem a identidade. */
  previaDeArquivo?(arquivo: string, ladoMaximo: number): Promise<ImagemParaOModelo | undefined>;
  fontes: BibliotecaDeFontes;
  relogio: { agora(): number };
  /** Id novo e imprevisível (UUID). Vira id de lote e marca de material. */
  novoId(): string;
  /** Progresso. O evento existe antes de ser mostrado: quem implementa grava e depois avisa. */
  emitir(evento: EventoDaTarefa): void | Promise<void>;
  /** Custo por chamada. O total da tarefa volta no resultado. */
  registrarChamada?(chamada: ChamadaRegistrada): void | Promise<void>;
  /** Cancelamento cooperativo: conferido entre passos e repassado à chamada ao modelo em curso. */
  sinal: AbortSignal;
  limites?: Partial<LimitesDoSistema>;
  /** Banco de imagens. Ausente: o Otto não recebe buscarImagens nem trazerImagem, e o prompt não os cita. */
  imagens?: BancoDeImagens;
  /** Biblioteca de texturas. Ausente: sem listarTexturas. */
  texturas?(): Promise<TexturaDaBiblioteca[]>;
  /** Recorte do sujeito de uma camada de foto. Ausente: sem detectarSujeito e sem as técnicas que dependem dele. */
  detectarSujeito?(camada: { id: string; arquivo: string }, doc: Documento): Promise<SujeitoDetectado>;
}

/** O que a execução precisa além do preparo. */
export interface AmbienteDaTarefa extends AmbienteBase {
  /** Aplica em transação, com autoria do agente. Não fica transação aberta durante chamada ao modelo. */
  aplicarLote(lote: LoteDoAgente): Promise<ResultadoDaAplicacao>;
  /** Render de referência (CPU), na menor escala que resolve. */
  renderizar(doc: Documento, pedido: PedidoDeRender): Promise<ImagemParaOModelo>;
  /** Lint de design (verificarDocumento com os meios do motor). */
  verificar(doc: Documento, prancheta?: string): Promise<Aviso[]>;
}
