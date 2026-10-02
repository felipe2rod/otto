// Porta: o registro das importações de PSD. O escopo da conta é sempre o primeiro argumento (ADR 023).
// Nenhum tipo do Prisma cruza esta porta (ADR 020).
import type { PedidoDeImportacao, RelatorioDeImportacao } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export type EstadoDaImportacao = 'enviada' | 'na_fila' | 'rodando' | 'pronta' | 'falhou' | 'descartada';

/** Os estados que contam no limite de importações abertas da conta. */
export const ESTADOS_ABERTOS: readonly EstadoDaImportacao[] = ['enviada', 'na_fila', 'rodando'];

export interface ErroDaImportacao {
  codigo: string;
  /** Só com `psd_recusado`: o código do pacote de PSD. */
  motivo?: string;
  /** Só com `psd_recusado`: a frase do pacote de PSD. Pode citar o arquivo: nunca vai para log. */
  mensagem?: string;
}

export interface ImportacaoGuardada {
  id: string;
  estado: EstadoDaImportacao;
  /** Nome do arquivo no computador da pessoa. É conteúdo: nunca vai para log. */
  nomeDoArquivo: string;
  bytes: number;
  sha256: string;
  formato: 'psd' | 'psb';
  largura: number;
  altura: number;
  /** Registros de camada do arquivo. */
  camadas: number;
  /** Nomes PostScript que o texto do arquivo pede. Conteúdo. */
  fontes: string[];
  pedido?: PedidoDeImportacao;
  /** Nunca vai ao cliente. */
  chaveDoObjeto: string;
  /** A peça criada. Presente só em `pronta`. */
  documentoId?: string;
  relatorio?: RelatorioDeImportacao;
  erro?: ErroDaImportacao;
  duracaoMs?: number;
  /** Quantas vezes começou a rodar. 2 é uma retomada (o worker da primeira morreu). */
  tentativas: number;
  criadaEm: Date;
  pedidaEm?: Date;
  terminadaEm?: Date;
  /** Até quando o arquivo enviado espera o pedido de importação. */
  expiraEm: Date;
  /** Quando o arquivo enviado foi apagado do armazenamento. O registro fica. */
  arquivoRemovidoEm?: Date;
}

export interface NovaImportacao {
  id: string;
  nomeDoArquivo: string;
  bytes: number;
  sha256: string;
  formato: 'psd' | 'psb';
  largura: number;
  altura: number;
  camadas: number;
  fontes: string[];
  chaveDoObjeto: string;
  criadaEm: Date;
  expiraEm: Date;
}

export type InicioDeImportacao =
  /** Passou de na_fila para rodando: este worker é o dono. `retomada`: ela estava rodando num worker que morreu, e recomeça do zero. */
  | { resultado: 'iniciada'; importacao: ImportacaoGuardada; retomada?: true }
  /** Outra importação da MESMA conta está rodando: tente depois. */
  | { resultado: 'ocupada' }
  /** Não existe nesta conta, ou não está mais na fila: não há o que fazer. */
  | { resultado: 'ignorada' };

export interface RetomadaDeImportacao {
  semSinalDesde: Date;
  /** Contando a primeira. 2: uma retomada só. */
  maximoDeTentativas: number;
}

export type ConclusaoDaImportacao =
  /** `documentoId` é a peça que JÁ foi criada apontando para esta importação. */
  | { estado: 'pronta'; documentoId: string; relatorio: RelatorioDeImportacao; terminadaEm: Date; duracaoMs: number }
  | { estado: 'falhou'; erro: ErroDaImportacao; terminadaEm: Date; duracaoMs: number };

export abstract class RepositorioDeImportacoes {
  /**
   * Cria (no estado `enviada`) só se a conta tem menos de `limite` importações abertas (enviada, na fila ou rodando).
   * Contar e criar é uma coisa só: envios simultâneos da mesma conta não passam do limite. undefined: não coube.
   */
  abstract criarSeCouber(escopo: EscopoDaConta, nova: NovaImportacao, limite: number): Promise<ImportacaoGuardada | undefined>;
  /** undefined se não existe ou é de outra conta. */
  abstract buscar(escopo: EscopoDaConta, id: string): Promise<ImportacaoGuardada | undefined>;
  /** A importação que criou a peça. undefined se a peça não é da conta ou não veio de uma importação. */
  abstract daPeca(escopo: EscopoDaConta, documentoId: string): Promise<ImportacaoGuardada | undefined>;
  /** As criadas desde a data, da mais nova para a mais velha. */
  abstract listar(escopo: EscopoDaConta, filtro: { criadasDesde: Date; limite: number }): Promise<ImportacaoGuardada[]>;
  /**
   * enviada → na_fila, guardando o pedido. Só a que ainda não venceu (`expiraEm` depois de `agora`).
   * `naFrente` é quantas a conta já tinha na fila ou rodando. 'fora-do-estado': existe e não está (mais) esperando
   * o pedido. undefined: não existe nesta conta.
   */
  abstract pedir(escopo: EscopoDaConta, id: string, pedido: PedidoDeImportacao, agora: Date): Promise<{ importacao: ImportacaoGuardada; naFrente: number } | 'fora-do-estado' | undefined>;
  /** na_fila → enviada, sem o pedido: a fila não aceitou o trabalho, e a pessoa pode pedir de novo sem reenviar. */
  abstract devolver(escopo: EscopoDaConta, id: string): Promise<void>;
  /** enviada → descartada. false se não existe nesta conta ou não está esperando o pedido. */
  abstract descartar(escopo: EscopoDaConta, id: string, agora: Date): Promise<boolean>;
  /**
   * na_fila → rodando, só se nenhuma outra importação da conta está rodando: é o que torna o consumidor idempotente
   * e garante uma por vez por conta. OUTRA importação da conta "rodando" sem sinal de vida desde `semSinalDesde` é
   * dada como interrompida antes. Com `retomar`, a PRÓPRIA importação, se está rodando sem sinal desde
   * `retomar.semSinalDesde` (o worker dela morreu e a fila reentregou o trabalho), recomeça do zero. Passou de
   * `maximoDeTentativas`, falha como interrompida.
   */
  abstract iniciar(escopo: EscopoDaConta, id: string, agora: Date, semSinalDesde: Date, retomar?: RetomadaDeImportacao): Promise<InicioDeImportacao>;
  /** Sinal de vida do worker. */
  abstract bater(escopo: EscopoDaConta, id: string, agora: Date): Promise<void>;
  /** rodando (ou na_fila) → estado final. Em estado final, não muda nada. */
  abstract concluir(escopo: EscopoDaConta, id: string, conclusao: ConclusaoDaImportacao): Promise<void>;
  /**
   * Fecha o que parou, NESTA conta: enviada que venceu (`descartada`), na fila desde antes de `naFilaDesde`
   * (`falhou`, abandonada) e rodando sem sinal de vida desde `semSinalDesde` (`falhou`, interrompida).
   * Devolve as que fechou: quem chama apaga o arquivo de cada uma.
   */
  abstract darBaixaNasParadas(escopo: EscopoDaConta, agora: Date, limites: { naFilaDesde: Date; semSinalDesde: Date }): Promise<ImportacaoGuardada[]>;
  /** O arquivo enviado foi apagado do armazenamento. O registro fica. */
  abstract marcarArquivoRemovido(escopo: EscopoDaConta, id: string, agora: Date): Promise<void>;
}
