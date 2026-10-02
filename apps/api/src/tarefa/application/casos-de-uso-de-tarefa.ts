// Casos de uso da tarefa do Otto (docs/mvp/backend.md, 7.5, 8 e 17.11). Classe pura: o ciclo é o de
// @otto/agente, que também é puro; tudo que é efeito entra por porta.
//
// A tarefa tem duas partes (@otto/agente, README): entender e planejar, e depois fazer e conferir. Entre
// uma e outra pode haver o "pode" do designer. Cada parte é um trabalho da fila; na espera do "pode"
// não há trabalho na fila nem custo correndo, e a espera não tem prazo.
//
// O que é do servidor aqui, e não do ciclo:
// - sem preparo aprovado, a segunda parte não começa (o estado da tarefa decide; o banco confere);
// - cada lote entra por uma transação curta, com autoria do Otto, e passa pela guarda do plano DE NOVO,
//   nesta porta: um lote fora do plano aprovado é recusado mesmo que o ciclo o mande;
// - a peça é somente leitura para o designer enquanto a tarefa vive (CasosDeUsoDeDocumento);
// - cada chamada ao modelo deixa uma linha de custo, inclusive a que falha;
// - o teto diário da plataforma é conferido antes de aceitar a tarefa e antes de cada chamada;
// - o trabalho da fila traz só (conta, id): tudo é relido sob o escopo da conta.
import {
  type AmbienteBase,
  type AmbienteDaTarefa,
  type BancoDeImagens as BancoDeImagensDoCiclo,
  type ChamadaRegistrada,
  type CustoDaTarefa,
  criarGuarda,
  custoVazio,
  type EntradaDaTarefa,
  ErroDoModelo,
  type EventoDaTarefa,
  executarTarefa,
  type ImagemParaOModelo,
  type LimitesDoSistema,
  type ModeloDoAgente,
  prepararTarefa,
  type ResultadoDaTarefa,
} from '@otto/agente';
import type { Documento } from '@otto/documento';
import {
  type AntesDaTarefa,
  briefingDaTarefa,
  CODIGOS_DE_ERRO,
  ESTADOS_DE_TAREFA_EM_ANDAMENTO,
  type EstadoDaPendencia,
  type EventosDaTarefa,
  type FimDaTarefa,
  type LimitesDeTarefa,
  type ListaDePendencias,
  type ListaDeTarefas,
  type PedidoDeAjusteDoPlano,
  type PedidoDeDescartar,
  type PedidoDeDesfazerTarefa,
  type PedidoDeTarefaPorBriefing,
  type PendenciaDaPeca,
  type RespostaDeDesfazerTarefa,
  type Tarefa,
} from '@otto/shared';
import type { CasosDeUsoDeDocumento } from '../../documento/application/casos-de-uso-de-documento';
import type { RepositorioDeDocumentos } from '../../documento/application/repositorio-de-documentos';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import type { BancadaDoOtto } from './bancada-do-otto';
import type { BriefingDaTarefa } from './briefing-da-tarefa';
import type { ConsumoDoModelo } from './consumo-do-modelo';
import type { ModelosDoOtto } from './modelos-do-otto';
import type { FontesDoOtto, ImagensDoOtto, TexturasDoOtto } from './recursos-do-otto';
import type { PendenciaGuardada, RepositorioDeTarefas, TarefaGuardada } from './repositorio-de-tarefas';

/** Tarefa trabalhando sem sinal de vida há mais que isto: o worker caiu. O sinal sai a cada 2 s. */
export const SEM_SINAL_DA_TAREFA_MS = 60_000;
const INTERVALO_DO_SINAL_DE_VIDA_MS = 2_000;
/** Quanto o desligamento espera as tarefas abortadas gravarem o fecho. Cabe com folga no prazo de parada do contêiner. */
const ESPERA_DO_FECHO_MS = 8_000;
/**
 * Tarefa na fila há mais que isto sem começar: o trabalho dela pode ter se perdido (worker morto ao pegar,
 * tentativas esgotadas). É publicado de novo, uma vez por prazo. Publicar de novo não roda o ciclo duas vezes:
 * só a tarefa que está "na fila" começa. Se a fila só está cheia, o trabalho a mais é ignorado quando chegar.
 */
export const NA_FILA_SEM_TRABALHO_MS = 5 * 60_000;
/** Nada de download em massa (ADR 032): tetos de uma tarefa no banco de imagens. */
const BUSCAS_POR_TAREFA = 8;
const IMAGENS_POR_TAREFA = 6;
const TAREFAS_NA_LISTA = 20;
/** Até quantos lotes para trás se olha para separar o que é da revisão da tarefa do que o designer fez depois. */
const JANELA_DO_HISTORICO = 200;
const EVENTOS_POR_LEITURA = 500;

export interface LimitesDaTarefa {
  /** Quantas tarefas a conta pode pedir por dia (UTC). */
  tarefasPorDia: number;
  /** Quantas tarefas a conta pode ter esperando ou trabalhando ao mesmo tempo. */
  naFilaPorConta: number;
  /** Teto nosso de tokens por dia, da plataforma inteira, abaixo do limite do fornecedor. */
  tetoDiarioDeTokens: number;
  /** Se o fornecedor disse que resta menos que isto no dia, não começa nem continua. */
  restoMinimoNoFornecedor: number;
  /** Tetos de uma tarefa (custo, tempo, tokens, chamadas). Sem isto, os padrões de @otto/agente. */
  sistema?: Partial<LimitesDoSistema>;
  /**
   * Falso quando o modelo é o roteirizado: não há consumo de verdade, então o teto de tokens e o resto do
   * fornecedor não recusam nada e o contador do dia não é somado. Com o modelo de verdade é sempre verdadeiro.
   */
  contarConsumo?: boolean;
  /** Quantas buscas no banco de imagens, e quantas imagens trazidas, uma tarefa pode fazer. */
  buscasPorTarefa?: number;
  imagensPorTarefa?: number;
}

/** O que aconteceu de errado, sem conteúdo: a mensagem do erro pode citar a peça e não sai daqui. */
export interface FalhaDaTarefa {
  tarefaId: string;
  etapa: 'preparo' | 'execucao' | 'fila';
  erro: unknown;
}

export interface DependenciasDaTarefa {
  tarefas: RepositorioDeTarefas;
  documentos: RepositorioDeDocumentos;
  pecas: CasosDeUsoDeDocumento;
  fila: BarramentoDeEventos;
  bancada: BancadaDoOtto;
  modelos: ModelosDoOtto;
  consumo: ConsumoDoModelo;
  limites: LimitesDaTarefa;
  gerarId: () => string;
  agora?: () => Date;
  uso?: RegistroDeUso;
  aoFalhar?: (falha: FalhaDaTarefa) => void;
  /** O formulário de briefing. Ausente: só pedido livre e ajuste. */
  briefing?: BriefingDaTarefa;
  /** Banco de imagens. Ausente: o Otto não recebe buscarImagens nem trazerImagem. */
  imagens?: ImagensDoOtto;
  texturas?: TexturasDoOtto;
  /** Catálogo de fontes. Ausente: o Otto só usa as da biblioteca. */
  fontes?: FontesDoOtto;
  /** O ciclo do agente. Só os testes trocam. */
  ciclo?: { preparar: typeof prepararTarefa; executar: typeof executarTarefa };
  intervaloDoSinalDeVidaMs?: number;
}

interface EmCurso {
  controle: AbortController;
  /** O worker está sendo desligado: o fim é "interrompida", não "cancelada". */
  peloSistema: boolean;
}

const inicioDoDia = (agora: Date): Date => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
const totalDeTokensDaChamada = (c: ChamadaRegistrada): number => c.uso.entrada + c.uso.cacheLido + c.uso.cacheCriado + c.uso.saida;

function pendenciaDaPeca(p: PendenciaGuardada): PendenciaDaPeca {
  return {
    id: p.id,
    tarefaId: p.tarefaId,
    tipo: p.tipo,
    texto: p.texto,
    camadas: p.camadas,
    ...(p.prancheta ? { prancheta: p.prancheta } : {}),
    origem: p.origem,
    ...(p.regra ? { regra: p.regra } : {}),
    ...(p.gravidade ? { gravidade: p.gravidade } : {}),
    estado: p.estado,
    criadaEm: p.criadaEm.toISOString(),
    ...(p.fechadaEm ? { fechadaEm: p.fechadaEm.toISOString() } : {}),
  };
}

export class CasosDeUsoDeTarefa {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;
  private readonly ciclo: { preparar: typeof prepararTarefa; executar: typeof executarTarefa };
  private readonly emCurso = new Map<string, EmCurso>();
  private readonly contaConsumo: boolean;
  private desligando = false;

  constructor(private readonly d: DependenciasDaTarefa) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
    this.ciclo = d.ciclo ?? { preparar: prepararTarefa, executar: executarTarefa };
    this.contaConsumo = d.limites.contarConsumo !== false;
  }

  // ---------------------------------------------------------------- pedir e consultar

  /** O que dizer ao designer ANTES de enviar: em tarefas, nunca em tokens. */
  async limites(escopo: EscopoDaConta): Promise<LimitesDeTarefa> {
    const agora = this.agora();
    await this.varrer(escopo);
    const [tarefasHoje, naFila, semTeto] = [await this.d.tarefas.contarCriadasDesde(escopo, inicioDoDia(agora)), await this.d.tarefas.contarNaFila(escopo), await this.plataformaSemTeto(agora)];
    const motivo = semTeto
      ? ('limite_diario' as const)
      : tarefasHoje >= this.d.limites.tarefasPorDia
        ? ('limite_da_conta' as const)
        : naFila >= this.d.limites.naFilaPorConta
          ? ('fila_cheia' as const)
          : undefined;
    return { podeEnviar: motivo === undefined, ...(motivo ? { motivo } : {}), tarefasHoje, tarefasPorDia: this.d.limites.tarefasPorDia, naFila, naFilaNoMaximo: this.d.limites.naFilaPorConta };
  }

  /** Cria a tarefa sobre a versão atual da peça e põe a primeira parte na fila. */
  async criar(escopo: EscopoDaConta, documentoId: string, entrada: EntradaDaTarefa, origemId?: string, briefingId?: string): Promise<Tarefa> {
    const agora = this.agora();
    await this.varrer(escopo);
    // parar no meio custa mais que recusar no começo: o teto do dia é conferido antes de aceitar
    if (await this.plataformaSemTeto(agora)) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDiario);
    if ((await this.d.tarefas.contarCriadasDesde(escopo, inicioDoDia(agora))) >= this.d.limites.tarefasPorDia)
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeTarefas, { motivo: 'limite_da_conta', limite: this.d.limites.tarefasPorDia });

    const criada = await this.d.tarefas.criar(
      escopo,
      { id: this.d.gerarId(), documentoId, entrada, ...(origemId ? { origemId } : {}), ...(briefingId ? { briefingId } : {}), criadaEm: agora },
      { naFilaPorConta: this.d.limites.naFilaPorConta },
    );
    if ('recusa' in criada) {
      if (criada.recusa === 'documento') throw new NaoEncontrado();
      if (criada.recusa === 'viva') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaEmAndamento, { tarefaId: criada.viva.id, estado: criada.viva.estado });
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeTarefas, { motivo: 'fila_cheia', limite: this.d.limites.naFilaPorConta });
    }
    await this.publicar(escopo, criada.tarefa.id, criada.jaNaFila);
    const formulario = briefingDaTarefa({ entrada });
    this.uso.registrar(escopo, {
      evento: 'tarefa_pedida',
      tarefaId: criada.tarefa.id,
      documentoId,
      tipo: entrada.tipo,
      ...(criada.tarefa.esforco ? { esforco: criada.tarefa.esforco } : {}),
      // do formulário só o que é contagem e escolha de opção: o que foi preenchido é conteúdo
      ...(formulario ? { porFormulario: true, formatos: formulario.briefing.formatos.length, cuidado: formulario.cuidado, deBriefingSalvo: briefingId !== undefined } : {}),
    });
    return this.fotografia(escopo, criada.tarefa, { entrada });
  }

  /**
   * Cria a tarefa a partir do formulário de briefing (ADR 033). O que fica guardado é o formulário, já com a
   * marca aplicada e só com referências a arquivos da conta; o material para o ciclo é montado no worker.
   */
  async criarPorBriefing(escopo: EscopoDaConta, documentoId: string, pedido: PedidoDeTarefaPorBriefing): Promise<Tarefa> {
    if (!this.d.briefing) throw new NaoEncontrado();
    // primeiro "a peça existe nesta conta?": peça de outra conta responde o mesmo, qualquer que seja o formulário
    await this.exigirPeca(escopo, documentoId);
    const { entrada, briefingId } = await this.d.briefing.preparar(escopo, pedido);
    const tarefa = await this.criar(escopo, documentoId, entrada, undefined, briefingId);
    if (briefingId) await this.d.briefing.usado(escopo, briefingId).catch(() => undefined);
    return tarefa;
  }

  async consultar(escopo: EscopoDaConta, id: string): Promise<Tarefa> {
    let t = await this.exigir(escopo, id);
    // trabalhando: confere se o worker ainda dá sinal, para quem acompanha não ver "rodando" para sempre
    if ((t.estado === 'preparando' || t.estado === 'rodando') && (await this.darBaixaNasParadas(escopo)) > 0) t = await this.exigir(escopo, id);
    // na fila há tempo demais: o trabalho pode ter se perdido
    if (t.estado === 'na_fila') await this.devolverAFila(escopo);
    return this.fotografia(escopo, t, { completa: true });
  }

  /** As tarefas recentes da peça e qual está viva. É por aqui que o editor retoma ao abrir a peça. */
  async listar(escopo: EscopoDaConta, documentoId: string): Promise<ListaDeTarefas> {
    await this.exigirPeca(escopo, documentoId);
    await this.varrer(escopo);
    const itens = await this.d.tarefas.listarDoDocumento(escopo, documentoId, TAREFAS_NA_LISTA);
    const viva = await this.d.tarefas.vivaDoDocumento(escopo, documentoId);
    return { itens: await Promise.all(itens.map((t) => this.fotografia(escopo, t))), ...(viva ? { viva: viva.id } : {}) };
  }

  /** Os eventos gravados depois de uma sequência, e a fotografia. É a leitura do fluxo e da consulta periódica. */
  async eventos(escopo: EscopoDaConta, id: string, depoisDe: number): Promise<EventosDaTarefa> {
    const tarefa = await this.consultar(escopo, id);
    const eventos = await this.d.tarefas.eventosDepois(escopo, id, depoisDe, EVENTOS_POR_LEITURA);
    return { eventos: eventos.map((e) => ({ sequencia: e.sequencia, quando: e.quando.toISOString(), evento: e.evento })), tarefa };
  }

  /**
   * O mínimo para o fluxo de eventos saber se há novidade, sem montar a fotografia: uma leitura. `marca` muda
   * quando muda algo que a fotografia mostra.
   */
  async pulso(escopo: EscopoDaConta, id: string): Promise<{ ultimoEvento: number; emAndamento: boolean; marca: string }> {
    let t = await this.exigir(escopo, id);
    if ((t.estado === 'preparando' || t.estado === 'rodando') && (await this.darBaixaNasParadas(escopo)) > 0) t = await this.exigir(escopo, id);
    return { ultimoEvento: t.ultimoEvento, emAndamento: ESTADOS_DE_TAREFA_EM_ANDAMENTO.includes(t.estado), marca: `${t.estado}:${t.lotes}:${t.ultimoEvento}` };
  }

  /** A peça como era antes da tarefa ("segure para ver o antes"). */
  async antes(escopo: EscopoDaConta, id: string): Promise<AntesDaTarefa> {
    const t = await this.exigir(escopo, id);
    const guardada = await this.d.documentos.arvoreNaVersao(escopo, t.documentoId, t.versaoInicial);
    if (!guardada) throw new NaoEncontrado();
    return { versao: t.versaoInicial, arvore: guardada.arvore };
  }

  // ---------------------------------------------------------------- o "pode"

  async aprovar(escopo: EscopoDaConta, id: string): Promise<Tarefa> {
    const t = await this.exigir(escopo, id);
    const aprovada = await this.d.tarefas.aprovar(escopo, id, this.agora());
    if (!aprovada) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    await this.publicar(escopo, id, aprovada.jaNaFila);
    this.uso.registrar(escopo, { evento: 'tarefa_confirmacao', tarefaId: id, documentoId: t.documentoId, resposta: 'pode' });
    return this.consultar(escopo, id);
  }

  /** "Ajustar a direção": guarda o texto e manda a primeira parte rodar de novo. A tarefa volta a esperar depois. */
  async ajustar(escopo: EscopoDaConta, id: string, pedido: PedidoDeAjusteDoPlano): Promise<Tarefa> {
    const t = await this.exigir(escopo, id);
    const devolvida = await this.d.tarefas.pedirAjuste(escopo, id, pedido.texto, this.agora());
    if (!devolvida) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    await this.publicar(escopo, id, devolvida.jaNaFila);
    this.uso.registrar(escopo, { evento: 'tarefa_confirmacao', tarefaId: id, documentoId: t.documentoId, resposta: 'ajustar' });
    return this.consultar(escopo, id);
  }

  /**
   * Na fila ou no "pode": cancela na hora, e nada foi alterado. Trabalhando: pede para interromper; o worker
   * aborta a chamada em curso e fecha a tarefa (em revisão, se já havia alteração).
   */
  async cancelar(escopo: EscopoDaConta, id: string): Promise<Tarefa> {
    const t = await this.exigir(escopo, id);
    const resultado = await this.d.tarefas.pedirCancelamento(escopo, id, this.agora());
    if (resultado === undefined) throw new NaoEncontrado();
    if (resultado === 'fora') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    // se a tarefa roda neste processo, não espera o próximo sinal de vida
    if (resultado === 'pedido') this.emCurso.get(id)?.controle.abort();
    if (resultado === 'cancelada' && t.estado === 'aguardando_confirmacao')
      this.uso.registrar(escopo, { evento: 'tarefa_confirmacao', tarefaId: id, documentoId: t.documentoId, resposta: 'cancelar' });
    return this.consultar(escopo, id);
  }

  // ---------------------------------------------------------------- a revisão

  async aceitar(escopo: EscopoDaConta, id: string): Promise<Tarefa> {
    const t = await this.exigir(escopo, id);
    // descartar prancheta é um lote do designer ligado à tarefa: se houve, a tarefa foi aceita em parte
    const historico = await this.d.documentos.historico(escopo, t.documentoId, { limite: JANELA_DO_HISTORICO });
    const descartou = historico?.itens.some((l) => l.tarefaId === id && l.autoria === 'designer' && l.tipo === 'edicao') ?? false;
    const resultado = descartou ? 'aceita_em_parte' : 'aceita';
    if (!(await this.d.tarefas.decidir(escopo, id, { de: ['em_revisao'], para: 'aceita', resultado, agora: this.agora() })))
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    this.uso.registrar(escopo, { evento: 'tarefa_decidida', tarefaId: id, documentoId: t.documentoId, resultado });
    return this.consultar(escopo, id);
  }

  /**
   * "Desfazer tudo" na revisão, e "voltar para antes desta tarefa" depois de aceita. A peça volta, num lote de
   * reversão, ao que era quando a tarefa foi pedida. Depois de aceita, se o designer editou, é preciso confirmar.
   */
  async desfazer(escopo: EscopoDaConta, id: string, pedido: PedidoDeDesfazerTarefa): Promise<RespostaDeDesfazerTarefa> {
    const t = await this.exigir(escopo, id);
    if ((t.estado !== 'em_revisao' && t.estado !== 'aceita') || t.lotes === 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    if (t.estado === 'aceita') {
      const viva = await this.d.tarefas.vivaDoDocumento(escopo, t.documentoId);
      if (viva) throw new ErroDaAplicacao(viva.estado === 'em_revisao' ? CODIGOS_DE_ERRO.revisaoPendente : CODIGOS_DE_ERRO.documentoEmTarefa, { tarefaId: viva.id, estado: viva.estado });
      const edicoes = await this.edicoesDepois(escopo, t);
      if (edicoes > 0 && !pedido.incluirEdicoesPosteriores) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.editadoDepois, { edicoes });
    }
    // primeiro a decisão (é o que impede dois "desfazer" ao mesmo tempo), depois a reversão
    if (!(await this.d.tarefas.decidir(escopo, id, { de: [t.estado], para: 'desfeita', resultado: 'desfeita', agora: this.agora() })))
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    const revertida = await this.d.pecas.voltarParaAntesDaTarefa(escopo, t.documentoId, { id, versaoInicial: t.versaoInicial });
    await this.d.tarefas.fecharPendenciasDaTarefa(escopo, id, this.agora());
    this.uso.registrar(escopo, { evento: 'tarefa_decidida', tarefaId: id, documentoId: t.documentoId, resultado: 'desfeita' });
    return { tarefa: await this.consultar(escopo, id), versao: revertida.versao, arvore: revertida.arvore };
  }

  /** Aceitar em parte, por prancheta: tira da peça uma prancheta que a tarefa criou. O resto fica em revisão. */
  async descartar(escopo: EscopoDaConta, id: string, pedido: PedidoDeDescartar): Promise<RespostaDeDesfazerTarefa> {
    const t = await this.exigir(escopo, id);
    if (t.estado !== 'em_revisao') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    if (!(await this.pranchetasNovas(escopo, t)).includes(pedido.pranchetaId)) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.pranchetaNaoDescartavel);
    const r = await this.d.pecas.removerPranchetaDaTarefa(escopo, t.documentoId, id, pedido.pranchetaId);
    return { tarefa: await this.consultar(escopo, id), versao: r.versao, arvore: r.arvore };
  }

  /**
   * Recomeça do início, com a mesma entrada, numa tarefa nova. Vale para a tarefa que não terminou
   * (falhou, foi cancelada, ou está em revisão sem ter entregue): o parcial é desfeito antes.
   */
  async tentarDeNovo(escopo: EscopoDaConta, id: string): Promise<Tarefa> {
    const t = await this.exigir(escopo, id);
    const naoTerminou = t.estado === 'falhou' || t.estado === 'cancelada' || t.estado === 'desfeita' || (t.estado === 'em_revisao' && t.fim !== 'entregue');
    if (!naoTerminou) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tarefaForaDoEstado, { estado: t.estado });
    const guardada = await this.d.tarefas.entradaDe(escopo, id);
    if (!guardada) throw new NaoEncontrado();
    if (t.estado === 'em_revisao') await this.desfazer(escopo, id, { incluirEdicoesPosteriores: false });
    return this.criar(escopo, t.documentoId, guardada.entrada, id);
  }

  // ---------------------------------------------------------------- pendências da peça

  async pendencias(escopo: EscopoDaConta, documentoId: string, estado: EstadoDaPendencia): Promise<ListaDePendencias> {
    await this.exigirPeca(escopo, documentoId);
    return { itens: (await this.d.tarefas.listarPendencias(escopo, documentoId, estado)).map(pendenciaDaPeca) };
  }

  dispensar(escopo: EscopoDaConta, pendenciaId: string): Promise<PendenciaDaPeca> {
    return this.mudarPendencia(escopo, pendenciaId, 'dispensada');
  }

  reabrir(escopo: EscopoDaConta, pendenciaId: string): Promise<PendenciaDaPeca> {
    return this.mudarPendencia(escopo, pendenciaId, 'aberta');
  }

  private async mudarPendencia(escopo: EscopoDaConta, pendenciaId: string, estado: EstadoDaPendencia): Promise<PendenciaDaPeca> {
    const mudada = await this.d.tarefas.mudarPendencia(escopo, pendenciaId, estado, this.agora());
    if (!mudada) throw new NaoEncontrado();
    return pendenciaDaPeca(mudada);
  }

  // ---------------------------------------------------------------- o worker

  /**
   * O trabalho do worker: uma parte da tarefa. `escopo` vem do que estava na fila e é hipótese: tudo é relido
   * sob ele, e tarefa que não existe nessa conta não é processada.
   * - 'ignorada': não existe nesta conta, ou não está na fila (entrega repetida, cancelada, esperando o "pode");
   * - 'ocupada': outra tarefa da conta está trabalhando; quem consome a fila adia o trabalho.
   */
  async trabalhar(escopo: EscopoDaConta, id: string): Promise<'feita' | 'ignorada' | 'ocupada'> {
    if (this.desligando) return 'ocupada';
    const inicio = await this.d.tarefas.iniciar(escopo, id, this.agora());
    if (inicio.resultado !== 'iniciada') return inicio.resultado;
    const tarefa = inicio.tarefa;
    const emCurso: EmCurso = { controle: new AbortController(), peloSistema: false };
    this.emCurso.set(id, emCurso);
    // Sinal de vida por relógio. É também por onde chega o pedido de interromper feito em outro processo (a API).
    const relogio = setInterval(() => {
      void this.d.tarefas
        .bater(escopo, id, this.agora())
        .then((r) => r.cancelamentoPedido && emCurso.controle.abort())
        .catch(() => undefined);
    }, this.d.intervaloDoSinalDeVidaMs ?? INTERVALO_DO_SINAL_DE_VIDA_MS);
    try {
      await this.rodar(escopo, tarefa, emCurso);
    } finally {
      clearInterval(relogio);
      this.emCurso.delete(id);
    }
    return 'feita';
  }

  /**
   * Desligamento do worker. Uma tarefa de 10 a 30 minutos não cabe no prazo de um deploy: as tarefas em curso
   * são abortadas e fechadas como interrompidas, com o parcial em revisão. Não pega trabalho novo.
   */
  async interromperTudo(): Promise<void> {
    this.desligando = true;
    for (const emCurso of this.emCurso.values()) {
      emCurso.peloSistema = true;
      emCurso.controle.abort();
    }
    // espera cada tarefa gravar o próprio fecho; a que não conseguir a tempo é fechada depois, pela falta de sinal de vida
    const limite = Date.now() + ESPERA_DO_FECHO_MS;
    while (this.emCurso.size > 0 && Date.now() < limite) await new Promise((r) => setTimeout(r, 25));
  }

  private async rodar(escopo: EscopoDaConta, tarefa: TarefaGuardada, emCurso: EmCurso): Promise<void> {
    const guardada = await this.d.tarefas.entradaDe(escopo, tarefa.id);
    const peca = await this.d.documentos.abrir(escopo, tarefa.documentoId);
    if (!guardada || !peca) {
      await this.fechar(
        escopo,
        tarefa,
        emCurso,
        { fim: 'erro', entrega: { resumo: '', pendencias: [] }, conferida: false, lotes: 0, erro: 'documento_indisponivel', custo: custoVazio('') },
        peca?.versao,
      );
      return;
    }
    const { ajustes } = guardada;
    // o que está guardado pode ser o formulário (só referências): o material para o ciclo é montado aqui, sob a conta do trabalho
    const entrada = this.d.briefing ? await this.d.briefing.paraOCiclo(escopo, guardada.entrada) : guardada.entrada;
    let docAtual = peca.arvore;
    let versaoAtual = peca.versao;
    const bancada = await this.d.bancada.abrir(escopo, { nome: peca.nome, arvore: peca.arvore });
    const { fontes, texturas } = this.d;
    const imagens = this.d.imagens ? this.imagensDaTarefa(escopo, this.d.imagens, bancada) : undefined;
    const base = (aberto: { modelo: ModeloDoAgente; modeloDoJulgamento?: ModeloDoAgente; novoId(): string }, contarId: () => void): AmbienteBase => ({
      modelo: this.comTetoDiario(aberto.modelo),
      ...(aberto.modeloDoJulgamento ? { modeloDoJulgamento: this.comTetoDiario(aberto.modeloDoJulgamento) } : {}),
      documento: () => docAtual,
      resumir: (doc, prancheta) => bancada.resumir(doc, prancheta),
      previaDeArquivo: (arquivo, ladoMaximo) => bancada.previaDeArquivo(arquivo, ladoMaximo),
      fontes: { daConta: () => bancada.fontes, ...(fontes ? { buscar: (consulta: string, categoria?: string) => fontes.buscar(consulta, categoria) } : {}) },
      ...(imagens ? { imagens } : {}),
      ...(texturas ? { texturas: () => texturas.paraOOtto(escopo) } : {}),
      relogio: { agora: () => this.agora().getTime() },
      novoId: () => {
        contarId();
        return aberto.novoId();
      },
      // o evento existe antes de ser mostrado: grava, e só depois o fluxo o entrega
      emitir: (evento) => this.registrarEvento(escopo, tarefa.id, evento),
      registrarChamada: (chamada) => this.registrarChamada(escopo, tarefa.id, chamada),
      sinal: emCurso.controle.signal,
      ...(this.d.limites.sistema ? { limites: this.d.limites.sistema } : {}),
    });

    try {
      let preparo = tarefa.preparo;
      let idsDoPreparo = tarefa.idsDoPreparo;
      if (tarefa.fase === 'preparo') {
        let ids = 0;
        const amb = base(this.d.modelos.abrir({ entrada, parte: 'preparo', idsDoPreparo: 0 }), () => void ids++);
        try {
          const ajuste = ajustes.at(-1);
          preparo = await this.ciclo.preparar(amb, entrada, ajuste && tarefa.preparo ? { ajuste: { anterior: tarefa.preparo, texto: ajuste } } : {});
        } catch (erro) {
          await this.fecharPorErro(escopo, tarefa, emCurso, erro, 'preparo', versaoAtual);
          return;
        }
        idsDoPreparo = ids;
        // O "pode": a tarefa para aqui, com direção e plano guardados. Nada roda nem custa até o designer responder.
        const aguardar = preparo.pedeConfirmacao && !preparo.naoConsigo;
        await this.d.tarefas.guardarPreparo(escopo, tarefa.id, { preparo, idsDoPreparo, seguir: aguardar ? 'aguardar' : 'executar', agora: this.agora() });
        if (aguardar) return;
      }
      if (!preparo) throw new Error('tarefa na fase de execução sem preparo guardado');

      // A guarda do plano, DE NOVO, nesta porta: o que o ciclo mandar fora do plano aprovado não é gravado.
      const inicial = (await this.d.documentos.arvoreNaVersao(escopo, tarefa.documentoId, tarefa.versaoInicial))?.arvore ?? docAtual;
      const guarda = criarGuarda(preparo.plano, inicial);
      const amb: AmbienteDaTarefa = {
        ...base(this.d.modelos.abrir({ entrada, parte: 'execucao', idsDoPreparo }), () => undefined),
        aplicarLote: async (lote) => {
          let antes: Documento | undefined;
          const r = await this.d.pecas.aplicarLoteDoAgente(escopo, tarefa.documentoId, tarefa.id, lote, (a, depois) => {
            antes = a;
            const veredito = guarda.conferir(a, depois);
            return veredito.ok ? veredito : { ok: false, erro: { indice: 0, op: 'lote', mensagem: veredito.mensagem } };
          });
          if (!r.ok) return r;
          if (antes) guarda.registrar(antes, r.arvore);
          docAtual = r.arvore;
          versaoAtual = r.versao;
          await this.d.tarefas.registrarLote(escopo, tarefa.id, r.tocados);
          return { ok: true, tocados: r.tocados, versao: r.versao };
        },
        renderizar: (doc, pedido) => bancada.renderizar(doc, pedido),
        verificar: (doc, prancheta) => bancada.verificar(doc, prancheta),
      };
      let resultado: ResultadoDaTarefa;
      try {
        resultado = await this.ciclo.executar(amb, entrada, preparo);
      } catch (erro) {
        await this.fecharPorErro(escopo, tarefa, emCurso, erro, 'execucao', versaoAtual);
        return;
      }
      await this.fechar(escopo, tarefa, emCurso, resultado, versaoAtual);
    } finally {
      bancada.fechar();
    }
  }

  /** O ciclo lançou (o preparo lança ErroDoModelo; a execução só lança por defeito). A tarefa fecha com o que já foi gravado. */
  private async fecharPorErro(escopo: EscopoDaConta, tarefa: TarefaGuardada, emCurso: EmCurso, erro: unknown, etapa: 'preparo' | 'execucao', versao: number): Promise<void> {
    const doModelo = erro instanceof ErroDoModelo ? erro.codigo : undefined;
    if (!doModelo) this.d.aoFalhar?.({ tarefaId: tarefa.id, etapa, erro });
    const fim = doModelo === 'cancelada' ? 'cancelada' : 'erro';
    await this.fechar(
      escopo,
      tarefa,
      emCurso,
      { fim, entrega: { resumo: '', pendencias: [] }, conferida: false, lotes: 0, ...(fim === 'erro' ? { erro: doModelo ?? 'interno' } : {}), custo: custoVazio('') },
      versao,
    );
  }

  private async fechar(escopo: EscopoDaConta, tarefa: TarefaGuardada, emCurso: EmCurso, resultado: ResultadoDaTarefa, versaoAtual: number | undefined): Promise<void> {
    const atual = (await this.d.tarefas.buscar(escopo, tarefa.id)) ?? tarefa;
    // o que vale é o que foi GRAVADO: se o ciclo disser um número e a tabela outro, a tabela ganha
    const lotes = atual.lotes;
    const fim: FimDaTarefa = emCurso.peloSistema && resultado.fim === 'cancelada' ? 'interrompida' : resultado.fim;
    const estado = lotes > 0 ? 'em_revisao' : fim === 'entregue' ? 'aceita' : fim === 'cancelada' ? 'cancelada' : 'falhou';
    const erroCodigo = resultado.erro ?? (estado === 'falhou' ? fim : undefined);
    const custo: CustoDaTarefa | undefined = resultado.custo.chamadas > 0 || resultado.custo.duracaoMs > 0 ? resultado.custo : undefined;
    const agora = this.agora();
    await this.d.tarefas.concluir(escopo, tarefa.id, {
      estado,
      fim,
      ...(erroCodigo ? { erroCodigo } : {}),
      entrega: resultado.entrega,
      conferida: resultado.conferida,
      ...(versaoAtual !== undefined ? { versaoFinal: versaoAtual } : {}),
      ...(custo ? { custo } : {}),
      ...(estado === 'aceita' ? { resultado: 'sem_alteracao' } : {}),
      agora,
    });
    // as pendências viram itens da peça quando há o que revisar; sem alteração, ficam só na entrega da tarefa
    if (lotes > 0 && resultado.entrega.pendencias.length > 0) {
      await this.d.tarefas.criarPendencias(
        escopo,
        tarefa,
        resultado.entrega.pendencias.map((p) => ({ ...p, id: this.d.gerarId() })),
        agora,
      );
    }
    const c = resultado.custo;
    this.uso.registrar(escopo, {
      evento: 'tarefa_terminada',
      tarefaId: tarefa.id,
      documentoId: tarefa.documentoId,
      tipo: tarefa.tipo,
      estado,
      fim,
      ...(erroCodigo ? { erro: erroCodigo } : {}),
      lotes,
      lotesRecusados: c.lotesRecusados,
      chamadas: c.chamadas,
      tokensDeEntrada: c.tokens.entrada,
      tokensDeCacheLidos: c.tokens.cacheLido,
      tokensDeCacheCriados: c.tokens.cacheCriado,
      tokensDeSaida: c.tokens.saida,
      imagens: c.imagensVistas,
      voltasDeConferencia: c.voltasDeConferencia,
      duracaoMs: Math.round(c.duracaoMs),
      ...(c.dolares !== null ? { microDolares: Math.round(c.dolares * 1_000_000) } : {}),
      conferida: resultado.conferida,
    });
  }

  private async registrarEvento(escopo: EscopoDaConta, id: string, evento: EventoDaTarefa): Promise<void> {
    await this.d.tarefas.registrarEvento(escopo, id, evento, this.agora());
    if (evento.tipo === 'etapa')
      await this.d.tarefas.atualizarEtapa(escopo, id, {
        etapa: { etapa: evento.etapa, ...(evento.prancheta ? { prancheta: evento.prancheta } : {}), ...(evento.rodada ? { rodada: evento.rodada } : {}) },
      });
    if (evento.tipo === 'etapas') await this.d.tarefas.atualizarEtapa(escopo, id, { etapas: evento.previstas });
  }

  /** Custo por chamada: a linha da tarefa e o contador do dia da plataforma. */
  private async registrarChamada(escopo: EscopoDaConta, id: string, chamada: ChamadaRegistrada): Promise<void> {
    const agora = this.agora();
    await this.d.tarefas.registrarChamada(escopo, id, chamada, agora);
    if (this.contaConsumo) await this.d.consumo.somar(agora, totalDeTokensDaChamada(chamada));
  }

  /**
   * O banco de imagens como o ciclo o vê, dentro de UMA parte da tarefa: as mesmas regras da busca do editor
   * (cache, origem guardada, download para o armazenamento da conta), mais os tetos da tarefa. O id que o
   * Otto manda em trazerImagem tem de ter vindo de uma busca desta tarefa.
   * As mensagens de erro são lidas pelo modelo, como resultado da ferramenta.
   */
  private imagensDaTarefa(
    escopo: EscopoDaConta,
    imagens: ImagensDoOtto,
    bancada: { previaDeArquivo(arquivo: string, ladoMaximo: number): Promise<ImagemParaOModelo | undefined> },
  ): BancoDeImagensDoCiclo {
    const vistas = new Map<string, string>();
    let [buscas, trazidas] = [0, 0];
    const tetoDeBuscas = this.d.limites.buscasPorTarefa ?? BUSCAS_POR_TAREFA;
    const tetoDeImagens = this.d.limites.imagensPorTarefa ?? IMAGENS_POR_TAREFA;
    return {
      buscar: async (consulta, orientacao) => {
        if (buscas >= tetoDeBuscas) throw new Error(`limite de ${tetoDeBuscas} buscas por tarefa atingido: escolha entre as imagens que já apareceram`);
        buscas++;
        const r = await imagens.buscar(escopo, consulta, orientacao ?? 'todas');
        for (const i of r.itens) vistas.set(i.id, r.banco);
        return r.itens.map((i) => ({ id: i.id, descricao: i.descricao, largura: i.largura, altura: i.altura, autor: i.autor }));
      },
      trazer: async (id) => {
        const banco = vistas.get(id);
        if (!banco) throw new Error('esse id não veio de uma busca desta tarefa: use buscarImagens e escolha um dos resultados');
        if (trazidas >= tetoDeImagens) throw new Error(`limite de ${tetoDeImagens} imagens trazidas por tarefa atingido: use as que já estão na biblioteca`);
        trazidas++;
        const t = await imagens.trazer(escopo, banco, id);
        const previa = await bancada.previaDeArquivo(t.sha256, 768).catch(() => undefined);
        return { no: t.no, largura: t.largura, altura: t.altura, ...(previa ? { previa } : {}) };
      },
    };
  }

  /** O teto diário é conferido antes de CADA chamada: estourou, o ciclo recebe o erro com código e fecha a tarefa com o que já fez. */
  private comTetoDiario(modelo: ModeloDoAgente): ModeloDoAgente {
    return {
      nome: modelo.nome,
      capacidades: modelo.capacidades,
      ...(modelo.preco ? { preco: modelo.preco } : {}),
      responder: async (pedido) => {
        if (await this.plataformaSemTeto(this.agora())) throw new ErroDoModelo('limite_diario', 'o teto diário de tokens da plataforma foi atingido');
        return modelo.responder(pedido);
      },
    };
  }

  // ---------------------------------------------------------------- apoio

  private async plataformaSemTeto(agora: Date): Promise<boolean> {
    if (!this.contaConsumo) return false;
    const hoje = await this.d.consumo.hoje(agora);
    return hoje.tokens >= this.d.limites.tetoDiarioDeTokens || (hoje.restanteNoFornecedor !== undefined && hoje.restanteNoFornecedor < this.d.limites.restoMinimoNoFornecedor);
  }

  private async publicar(escopo: EscopoDaConta, id: string, jaNaFila: number): Promise<void> {
    try {
      // só identificadores na fila; e quem tem menos na fila passa na frente
      await this.d.fila.publicar(FILAS.tarefaDoOtto, { contaId: escopo.contaId, id }, { jaNaFilaDaConta: jaNaFila });
    } catch (erro) {
      // sem fila não há quem rode: a peça não fica presa a uma tarefa parada
      await this.d.tarefas.pedirCancelamento(escopo, id, this.agora());
      this.d.aoFalhar?.({ tarefaId: id, etapa: 'fila', erro });
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.filaIndisponivel);
    }
  }

  /** O que toda leitura da conta confere: a tarefa cujo worker caiu, e a que ficou parada na fila. */
  private async varrer(escopo: EscopoDaConta): Promise<void> {
    await this.darBaixaNasParadas(escopo);
    await this.devolverAFila(escopo);
  }

  /** Publica de novo o trabalho da tarefa parada na fila. Nunca lança: é reparo, não é o pedido de quem está lendo. */
  private async devolverAFila(escopo: EscopoDaConta): Promise<void> {
    const agora = this.agora();
    try {
      const paradas = await this.d.tarefas.devolverAFila(escopo, new Date(agora.getTime() - NA_FILA_SEM_TRABALHO_MS), agora);
      for (const parada of paradas) await this.d.fila.publicar(FILAS.tarefaDoOtto, { contaId: escopo.contaId, id: parada.id }, { jaNaFilaDaConta: parada.jaNaFila });
    } catch (erro) {
      this.d.aoFalhar?.({ tarefaId: '', etapa: 'fila', erro });
    }
  }

  private darBaixaNasParadas(escopo: EscopoDaConta): Promise<number> {
    const agora = this.agora();
    return this.d.tarefas.darBaixaNasParadas(escopo, agora, new Date(agora.getTime() - SEM_SINAL_DA_TAREFA_MS)).then((fechadas) => fechadas.length);
  }

  private async exigir(escopo: EscopoDaConta, id: string): Promise<TarefaGuardada> {
    const t = await this.d.tarefas.buscar(escopo, id);
    if (!t) throw new NaoEncontrado();
    return t;
  }

  /** Peça de outra conta é "não encontrado", não lista vazia: a resposta é a mesma de id inexistente. */
  private async exigirPeca(escopo: EscopoDaConta, documentoId: string): Promise<void> {
    if (!(await this.d.documentos.historico(escopo, documentoId, { limite: 1 }))) throw new NaoEncontrado();
  }

  private async versaoDaPeca(escopo: EscopoDaConta, documentoId: string): Promise<number | undefined> {
    return (await this.d.documentos.abrir(escopo, documentoId))?.versao;
  }

  /**
   * Quantos lotes do designer entraram na peça depois que a tarefa parou. O que ele fez NA revisão da própria
   * tarefa (descartar uma prancheta) é parte dela, e não conta.
   */
  private async edicoesDepois(escopo: EscopoDaConta, t: TarefaGuardada): Promise<number> {
    const versao = await this.versaoDaPeca(escopo, t.documentoId);
    if (versao === undefined || t.versaoFinal === undefined || versao <= t.versaoFinal) return 0;
    const depois = versao - t.versaoFinal;
    const recentes = await this.d.documentos.historico(escopo, t.documentoId, { limite: Math.min(depois, JANELA_DO_HISTORICO) });
    const daTarefa = recentes?.itens.filter((l) => l.versao > (t.versaoFinal as number) && l.tarefaId === t.id).length ?? 0;
    return depois - daTarefa;
  }

  /** Ids das pranchetas que não existiam quando a tarefa foi pedida e existem agora. */
  private async pranchetasNovas(escopo: EscopoDaConta, t: TarefaGuardada): Promise<string[]> {
    const [antes, agora] = [await this.d.documentos.arvoreNaVersao(escopo, t.documentoId, t.versaoInicial), await this.d.documentos.abrir(escopo, t.documentoId)];
    if (!antes || !agora) return [];
    const iniciais = new Set(antes.arvore.pranchetas.map((p) => p.id));
    return agora.arvore.pranchetas.filter((p) => !iniciais.has(p.id)).map((p) => p.id);
  }

  /** @param extras `completa`: com o que custa leitura da peça (pranchetas novas, edições depois). A lista não traz. */
  private async fotografia(escopo: EscopoDaConta, t: TarefaGuardada, extras: { entrada?: EntradaDaTarefa; completa?: boolean } = {}): Promise<Tarefa> {
    const entrada = extras.entrada ?? (await this.d.tarefas.entradaDe(escopo, t.id))?.entrada;
    if (!entrada) throw new NaoEncontrado();
    const emAndamento = ESTADOS_DE_TAREFA_EM_ANDAMENTO.includes(t.estado);
    return {
      id: t.id,
      documentoId: t.documentoId,
      tipo: t.tipo,
      estado: t.estado,
      ...(t.fim ? { fim: t.fim } : {}),
      ...(t.erroCodigo ? { erro: { codigo: t.erroCodigo } } : {}),
      entrada,
      ...(t.etapa && emAndamento ? { etapa: t.etapa } : {}),
      etapas: t.etapas,
      ...(t.preparo ? { confirmacao: { cartao: t.preparo.cartao, plano: t.preparo.plano, motivos: t.preparo.motivos } } : {}),
      versaoInicial: t.versaoInicial,
      ...(t.versaoFinal !== undefined ? { versaoFinal: t.versaoFinal } : {}),
      lotes: t.lotes,
      tocados: t.tocados,
      ...(extras.completa && t.estado === 'em_revisao' ? { pranchetasNovas: await this.pranchetasNovas(escopo, t) } : {}),
      ...(t.entrega?.resumo ? { resumo: t.entrega.resumo } : {}),
      ...(t.conferida !== undefined ? { conferida: t.conferida } : {}),
      pendencias: t.entrega?.pendencias ?? [],
      ...(extras.completa && t.estado === 'aceita' ? { edicoesDepois: await this.edicoesDepois(escopo, t) } : {}),
      ultimoEvento: t.ultimoEvento,
      criadaEm: t.criadaEm.toISOString(),
      ...(t.iniciadaEm ? { iniciadaEm: t.iniciadaEm.toISOString() } : {}),
      ...(t.terminadaEm ? { terminadaEm: t.terminadaEm.toISOString() } : {}),
      ...(t.decididaEm ? { decididaEm: t.decididaEm.toISOString() } : {}),
      ...(t.duracaoMs > 0 ? { duracaoMs: t.duracaoMs } : {}),
    };
  }
}
