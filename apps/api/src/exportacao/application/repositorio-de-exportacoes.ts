// Porta: o registro das exportações. O escopo da conta é sempre o primeiro argumento (ADR 023).
import type { RelatorioDeExportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export type EstadoDaExportacao = 'na_fila' | 'rodando' | 'pronta' | 'pronta_em_parte' | 'falhou';

/** O pedido, com as pranchetas já resolvidas em ids (nunca "todas"). */
export type OpcoesGuardadas = { formato: 'psd'; arquivos: 'por-prancheta' | 'juntas'; pranchetas: string[] } | { formato: 'png'; escala: 1 | 2; semFundo: boolean; pranchetas: string[] };

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
}

export interface NovaExportacao {
  id: string;
  documentoId: string;
  versao: number;
  nome: string;
  opcoes: OpcoesGuardadas;
}

export type InicioDeExportacao =
  /** Passou de na_fila para rodando: este worker é o dono. */
  | { resultado: 'iniciada'; exportacao: ExportacaoGuardada }
  /** Outra exportação da MESMA conta está rodando: tente depois. */
  | { resultado: 'ocupada' }
  /** Não existe nesta conta, ou não está mais na fila (outro worker pegou, ou já terminou): não há o que fazer. */
  | { resultado: 'ignorada' };

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
  /** undefined se não existe ou é de outra conta. */
  abstract buscar(escopo: EscopoDaConta, id: string): Promise<ExportacaoGuardada | undefined>;
  /** Quantas a conta tem esperando ou rodando. */
  abstract contarEmAndamento(escopo: EscopoDaConta): Promise<number>;
  /**
   * na_fila → rodando, só se nenhuma outra exportação da conta está rodando. É o que torna o
   * consumidor idempotente e o que garante uma por vez por conta.
   * Exportação "rodando" sem sinal de vida desde `semSinalDesde` é dada como interrompida antes.
   */
  abstract iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date): Promise<InicioDeExportacao>;
  /** Sinal de vida do worker. */
  abstract bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void>;
  /** Um arquivo saiu. `pranchetas` é quantas pranchetas ele cobre (1, ou todas no PSD com as pranchetas juntas). */
  abstract registrarArquivo(escopo: EscopoDaConta, id: string, arquivo: ArquivoGuardado, pranchetas: number, agora: Date): Promise<void>;
  /** Uma prancheta não saiu. Conta no progresso. */
  abstract registrarFalha(escopo: EscopoDaConta, id: string, falha: FalhaDePrancheta, agora: Date): Promise<void>;
  /** rodando (ou na_fila, se a fila recusou o pedido) → estado final. */
  abstract concluir(escopo: EscopoDaConta, id: string, conclusao: Conclusao): Promise<void>;
}
