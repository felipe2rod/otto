// Porta: o registro das exportações. O escopo da conta é sempre o primeiro argumento (ADR 023).
import type { RelatorioDeExportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export type EstadoDaExportacao = 'na_fila' | 'rodando' | 'pronta' | 'pronta_em_parte' | 'falhou';

/** O pedido, com as pranchetas já resolvidas em ids (nunca "todas"). */
export type OpcoesGuardadas = (
  | { formato: 'psd'; arquivos: 'por-prancheta' | 'juntas' }
  | { formato: 'png'; escala: 1 | 2; semFundo: boolean }
  | { formato: 'svg' }
  | { formato: 'pdf'; arquivos: 'por-prancheta' | 'juntas' }
) & {
  pranchetas: string[];
  /** Um .zip só, com os arquivos, as fontes e o relatório. */
  pacote?: boolean;
};

export interface ArquivoGuardado {
  indice: number;
  nome: string;
  tipoMime: string;
  bytes: number;
  pranchetaId?: string;
  /** Nunca vai ao cliente. */
  chaveDoObjeto: string;
}

export interface FalhaDePrancheta {
  pranchetaId: string;
  codigo: string;
}

export interface ExportacaoGuardada {
  id: string;
  documentoId: string;
  versao: number;
  /** Nome do documento no momento do pedido: vira nome de arquivo. */
  nome: string;
  opcoes: OpcoesGuardadas;
  estado: EstadoDaExportacao;
  pranchetasNoTotal: number;
  pranchetasProntas: number;
  arquivos: ArquivoGuardado[];
  falhas: FalhaDePrancheta[];
  relatorio?: RelatorioDeExportacao;
  erroCodigo?: string;
  duracaoMs?: number;
  criadaEm: Date;
  terminadaEm?: Date;
  expiraEm?: Date;
  /** Quantas vezes começou a rodar. 2 é uma retomada (o worker da primeira morreu). */
  tentativas: number;
  /** Quando os arquivos foram apagados do armazenamento. O registro fica. */
  arquivosRemovidosEm?: Date;
}

export interface NovaExportacao {
  id: string;
  documentoId: string;
  versao: number;
  nome: string;
  opcoes: OpcoesGuardadas;
  /** Sem isto, a hora do banco. */
  criadaEm?: Date;
}

export type InicioDeExportacao =
  /** Passou de na_fila para rodando: este worker é o dono. `retomada`: ela estava rodando num worker que morreu, e recomeça do zero. */
  | { resultado: 'iniciada'; exportacao: ExportacaoGuardada; retomada?: true }
  /** Outra exportação da MESMA conta está rodando: tente depois. */
  | { resultado: 'ocupada' }
  /** Não existe nesta conta, ou não está mais na fila (outro worker pegou, ou já terminou): não há o que fazer. */
  | { resultado: 'ignorada' };

export interface Retomada {
  semSinalDesde: Date;
  /** Contando a primeira. 2: uma retomada só. */
  maximoDeTentativas: number;
}

export interface Conclusao {
  estado: 'pronta' | 'pronta_em_parte' | 'falhou';
  relatorio?: RelatorioDeExportacao;
  erroCodigo?: string;
  terminadaEm: Date;
  /** Quando os arquivos podem ser apagados. Ausente se nada foi gerado. */
  expiraEm?: Date;
  duracaoMs: number;
}

export abstract class RepositorioDeExportacoes {
  abstract criar(escopo: EscopoDaConta, nova: NovaExportacao): Promise<ExportacaoGuardada>;
  /**
   * Cria só se a conta tem menos de `limite` exportações esperando ou rodando. Contar e criar é uma
   * coisa só: pedidos simultâneos da mesma conta não passam do limite. undefined: não coube.
   * `jaEmAndamento` é quantas a conta já tinha na frente desta.
   */
  abstract criarSeCouber(escopo: EscopoDaConta, nova: NovaExportacao, limite: number): Promise<{ exportacao: ExportacaoGuardada; jaEmAndamento: number } | undefined>;
  /** undefined se não existe ou é de outra conta. */
  abstract buscar(escopo: EscopoDaConta, id: string): Promise<ExportacaoGuardada | undefined>;
  /** As exportações de um documento criadas desde a data, da mais nova para a mais velha. Lista vazia se o documento não é da conta. */
  abstract listarDoDocumento(escopo: EscopoDaConta, documentoId: string, filtro: { criadasDesde: Date; limite: number }): Promise<ExportacaoGuardada[]>;
  /**
   * Fecha como `falhou` o que parou, NESTA conta: na fila desde antes de `naFilaDesde` (o trabalho da fila se
   * perdeu ou esgotou as tentativas: `abandonada`) e rodando sem sinal de vida desde `semSinalDesde` (`interrompida`).
   * Devolve quantas fechou.
   */
  abstract darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, limites: { naFilaDesde: Date; semSinalDesde: Date }): Promise<number>;
  /** Os arquivos foram apagados do armazenamento. O registro (nomes, tamanhos, relatório) fica. */
  abstract marcarArquivosRemovidos(escopo: EscopoDaConta, id: string, agora: Date): Promise<void>;
  /** Quantas a conta tem esperando ou rodando. */
  abstract contarEmAndamento(escopo: EscopoDaConta): Promise<number>;
  /**
   * na_fila → rodando, só se nenhuma outra exportação da conta está rodando. É o que torna o
   * consumidor idempotente e o que garante uma por vez por conta.
   * OUTRA exportação da conta "rodando" sem sinal de vida desde `semSinalDesde` é dada como interrompida antes.
   * Com `retomar`, a PRÓPRIA exportação, se está rodando sem sinal desde `retomar.semSinalDesde` (o worker
   * dela morreu e a fila reentregou o trabalho), recomeça do zero: arquivos, falhas e progresso da tentativa
   * que morreu são apagados. Passou de `maximoDeTentativas`, falha como interrompida.
   */
  abstract iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date, retomar?: Retomada): Promise<InicioDeExportacao>;
  /** Sinal de vida do worker. */
  abstract bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void>;
  /** Um arquivo saiu. `pranchetas` é quantas pranchetas ele cobre (1, ou todas no PSD com as pranchetas juntas). */
  abstract registrarArquivo(escopo: EscopoDaConta, id: string, arquivo: ArquivoGuardado, pranchetas: number, agora: Date): Promise<void>;
  /** Pranchetas terminaram sem arquivo guardado ainda (pacote: tudo vai num .zip no fim). Também é sinal de vida. */
  abstract registrarProgresso(escopo: EscopoDaConta, id: string, pranchetas: number, agora: Date): Promise<void>;
  /** Uma prancheta não saiu. Conta no progresso. */
  abstract registrarFalha(escopo: EscopoDaConta, id: string, falha: FalhaDePrancheta, agora: Date): Promise<void>;
  /** rodando (ou na_fila, se a fila recusou o pedido) → estado final. */
  abstract concluir(escopo: EscopoDaConta, id: string, conclusao: Conclusao): Promise<void>;
}
