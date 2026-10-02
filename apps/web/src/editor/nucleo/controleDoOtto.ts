// A tarefa do Otto, fora do React: pedir, acompanhar pelo fluxo de eventos, o "pode", a revisão e a
// retomada. Mora no editor, não no painel: esconder os painéis ou recarregar a página não perde a
// tarefa (ela está no servidor), e reabrir a peça volta ao ponto em que ela está.
//
// Quem manda no estado é o servidor. Aqui só se guarda a fotografia mais recente, o registro dos
// eventos e o que o painel precisa para desenhar; toda ação é uma chamada, e o estado novo é a resposta.

import type { Documento } from '@otto/documento';
import { type EventoDaTarefa, type LimitesDeTarefa, type PedidoDeTarefa, type PendenciaDaPeca, Tarefa } from '@otto/shared';
import type { EventoDoFluxo } from '../../api/fluxo';
import type { ApiDeTarefas, ResultadoDaTarefa, ResultadoDeDesfazer } from '../../api/tarefas';
import { type Armazem, criarArmazem } from './armazem';
import { emAndamento, novaTarefaNaTela, receberEvento, receberFotografia, type TarefaNaTela } from './tarefaDoOtto';

export interface EstadoDoOtto {
  /** A tarefa em tela: a viva da peça, ou a última que terminou enquanto o editor estava aberto. */
  atual?: TarefaNaTela;
  /** O que dizer antes de enviar. Indefinido enquanto não chegou (ou se a consulta falhou). */
  limites?: LimitesDeTarefa;
  /** As pendências abertas da peça. Sobrevivem ao aceite. */
  pendencias: readonly PendenciaDaPeca[];
  /** Há uma chamada em curso (pedindo, aprovando, aceitando...): os botões esperam. */
  ocupado: boolean;
  /** A última ação foi recusada: o código (e o detalhe) para a frase da tela. */
  recusa?: { codigo: string; detalhe?: Record<string, unknown> };
  /** O fluxo de eventos caiu: o painel segue com o último estado conhecido e relê por consulta. */
  semAoVivo: boolean;
}

export interface ControleDoOtto {
  armazem: Pick<Armazem<EstadoDoOtto>, 'obter' | 'assinar'>;
  /** Ao abrir a peça: acha a tarefa viva (se houver) e volta a acompanhá-la; lê limites e pendências. */
  iniciar(): Promise<void>;
  pedir(entrada: PedidoDeTarefa): Promise<boolean>;
  /** O "pode". */
  aprovar(): Promise<void>;
  /** Pede outra direção ou outro plano, com o que muda. */
  ajustar(texto: string): Promise<void>;
  /** Cancela na fila ou no "pode"; interrompe se o Otto está trabalhando. */
  cancelar(): Promise<void>;
  aceitar(): Promise<boolean>;
  /** Volta a peça para antes da tarefa. Em tarefa aceita com edições depois, `incluirEdicoesPosteriores` leva essas junto. */
  desfazer(incluirEdicoesPosteriores?: boolean): Promise<void>;
  /** Tira uma prancheta que a tarefa criou; o resto fica. */
  descartar(pranchetaId: string): Promise<void>;
  tentarDeNovo(): Promise<void>;
  dispensarPendencia(id: string): Promise<void>;
  /** Fecha o aviso da última recusa. */
  dispensarRecusa(): void;
  /** Tira da tela o resultado de uma tarefa que já terminou. */
  fecharResultado(): void;
  /** Ao sair do editor: para de acompanhar. A tarefa continua no servidor. */
  parar(): void;
}

export interface DependenciasDoOtto {
  api: ApiDeTarefas;
  /**
   * A peça mudou no servidor por causa da tarefa (um lote do Otto, desfazer, descartar). Com a peça
   * nova em mãos (desfazer e descartar a devolvem), o editor a adota; sem ela, busca.
   */
  aoMudarAPeca(peca?: { versao: number; arvore: Documento }): void;
  /** O estado da tarefa mudou: é onde o editor avisa quem não está olhando. */
  aoMudarDeEstado?(tarefa: Tarefa, anterior: Tarefa['estado'] | undefined): void;
  /** Padrão: setTimeout. */
  esperar?(ms: number): Promise<void>;
}

/** Quanto esperar para tentar o fluxo de novo depois de uma queda. */
const ESPERA_DEPOIS_DA_QUEDA = 3000;

export function criarControleDoOtto(deps: DependenciasDoOtto): ControleDoOtto {
  const { api } = deps;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((seguir) => setTimeout(seguir, ms)));
  const armazem = criarArmazem<EstadoDoOtto>({ pendencias: [], ocupado: false, semAoVivo: false });
  /** Cada acompanhamento tem uma vez; quem acorda com a vez errada não escreve mais. */
  let vez = 0;
  let sinal: AbortController | undefined;

  const definirAtual = (proxima: TarefaNaTela | undefined) => {
    const anterior = armazem.obter().atual;
    if (proxima === anterior) return;
    armazem.definir((e) => {
      const { atual: _atual, ...resto } = e;
      return proxima ? { ...resto, atual: proxima } : resto;
    });
    if (proxima && (proxima.tarefa.id !== anterior?.tarefa.id || proxima.tarefa.estado !== anterior.tarefa.estado)) {
      deps.aoMudarDeEstado?.(proxima.tarefa, proxima.tarefa.id === anterior?.tarefa.id ? anterior.tarefa.estado : undefined);
    }
  };
  const comFotografia = (tarefa: Tarefa) => {
    const { atual } = armazem.obter();
    definirAtual(atual ? receberFotografia(atual, tarefa) : novaTarefaNaTela(tarefa));
  };
  const comEvento = (sequencia: number, evento: EventoDaTarefa) => {
    const { atual } = armazem.obter();
    if (!atual) return;
    const proxima = receberEvento(atual, sequencia, evento);
    if (proxima === atual) return;
    definirAtual(proxima);
    // o Otto gravou um lote: a peça mudou, e o canvas a mostra como está agora
    if (evento.tipo === 'lote') deps.aoMudarAPeca();
  };

  const doFluxo = (evento: EventoDoFluxo) => {
    if (armazem.obter().semAoVivo) armazem.definir((e) => ({ ...e, semAoVivo: false }));
    if (evento.evento === 'tarefa') {
      const lida = Tarefa.safeParse(evento.dados);
      if (lida.success) comFotografia(lida.data);
    } else if (evento.id !== undefined && evento.evento !== 'fim') comEvento(evento.id, evento.dados as EventoDaTarefa);
  };

  async function atualizarEntorno(): Promise<void> {
    const [limites, pendencias] = await Promise.all([api.limites(), api.pendencias()]);
    armazem.definir((e) => {
      const { limites: _limites, ...resto } = e;
      return { ...resto, ...(limites ? { limites } : {}), pendencias };
    });
  }

  /** Segue a tarefa pelo fluxo enquanto ela anda. Queda de conexão não é erro: relê por consulta e tenta de novo. */
  async function acompanhar(): Promise<void> {
    const minha = ++vez;
    sinal?.abort();
    const meuSinal = new AbortController();
    sinal = meuSinal;
    const atualiza = () => minha === vez;

    while (atualiza()) {
      const { atual } = armazem.obter();
      if (!atual || !emAndamento(atual.tarefa)) break;
      const fim = await api.fluxo(atual.tarefa.id, atual.ultimaSequencia, doFluxo, meuSinal.signal);
      if (!atualiza()) return;
      if (fim === 'fim') {
        // a fotografia veio antes do "fim"; se por algum motivo não veio, busca
        const depois = armazem.obter().atual;
        if (depois && emAndamento(depois.tarefa)) {
          const r = await api.obter(depois.tarefa.id);
          if (!atualiza()) return;
          if (r.ok) comFotografia(r.tarefa);
          else break;
        }
        continue;
      }
      armazem.definir((e) => (e.semAoVivo ? e : { ...e, semAoVivo: true }));
      await esperar(ESPERA_DEPOIS_DA_QUEDA);
      if (!atualiza()) return;
      const agora = armazem.obter().atual;
      if (!agora) break;
      const perdidos = await api.eventosDesde(agora.tarefa.id, agora.ultimaSequencia);
      if (!atualiza()) return;
      if (perdidos) {
        for (const e of perdidos.eventos) comEvento(e.sequencia, e.evento);
        comFotografia(perdidos.tarefa);
      }
    }
    if (!atualiza()) return;
    armazem.definir((e) => (e.semAoVivo ? { ...e, semAoVivo: false } : e));
    // parou de andar: a peça é a que o servidor tem agora, e limites e pendências mudaram
    deps.aoMudarAPeca();
    await atualizarEntorno();
  }

  /** Roda uma ação: liga "ocupado", guarda a recusa se houver, e devolve a resposta. */
  async function agir<R extends ResultadoDaTarefa | ResultadoDeDesfazer>(acao: (id: string) => Promise<R>): Promise<R | undefined> {
    const id = armazem.obter().atual?.tarefa.id;
    if (!id || armazem.obter().ocupado) return undefined;
    armazem.definir((e) => {
      const { recusa: _recusa, ...resto } = e;
      return { ...resto, ocupado: true };
    });
    const r = await acao(id);
    armazem.definir((e) => ({ ...e, ocupado: false, ...(r.ok ? {} : { recusa: { codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) } }) }));
    return r;
  }

  /** A resposta trouxe a tarefa no estado novo: mostra, e volta a acompanhar se ela anda. */
  function seguirCom(tarefa: Tarefa): void {
    comFotografia(tarefa);
    if (emAndamento(tarefa)) void acompanhar();
    else void atualizarEntorno();
  }

  return {
    armazem,
    async iniciar() {
      const [daPeca] = await Promise.all([api.daPeca(), atualizarEntorno()]);
      const viva = daPeca?.itens.find((t) => t.id === daPeca.viva);
      if (!viva) return;
      definirAtual(novaTarefaNaTela(viva));
      if (emAndamento(viva)) return void acompanhar();
      // parada no "pode" ou em revisão: o registro do que já aconteceu vem por consulta
      const passados = await api.eventosDesde(viva.id, -1);
      if (passados && armazem.obter().atual?.tarefa.id === viva.id) {
        for (const e of passados.eventos) comEvento(e.sequencia, e.evento);
        comFotografia(passados.tarefa);
      }
    },
    async pedir(entrada) {
      if (armazem.obter().ocupado) return false;
      armazem.definir((e) => {
        const { recusa: _recusa, ...resto } = e;
        return { ...resto, ocupado: true };
      });
      const r = await api.pedir(entrada);
      armazem.definir((e) => ({ ...e, ocupado: false, ...(r.ok ? {} : { recusa: { codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) } }) }));
      if (!r.ok) {
        void atualizarEntorno();
        return false;
      }
      definirAtual(novaTarefaNaTela(r.tarefa));
      seguirCom(r.tarefa);
      return true;
    },
    async aprovar() {
      const r = await agir(api.aprovar);
      if (r?.ok) seguirCom(r.tarefa);
    },
    async ajustar(texto) {
      const r = await agir((id) => api.ajustar(id, texto));
      if (r?.ok) seguirCom(r.tarefa);
    },
    async cancelar() {
      const r = await agir(api.cancelar);
      // interromper é pedido: o Otto para em instantes, e o fluxo (que continua aberto) traz o fim
      if (r?.ok) seguirCom(r.tarefa);
    },
    async aceitar() {
      const r = await agir(api.aceitar);
      if (r?.ok) seguirCom(r.tarefa);
      return r?.ok === true;
    },
    async desfazer(incluirEdicoesPosteriores = false) {
      const r = await agir((id) => api.desfazer(id, incluirEdicoesPosteriores));
      if (!r?.ok) return;
      deps.aoMudarAPeca({ versao: r.versao, arvore: r.arvore });
      seguirCom(r.tarefa);
    },
    async descartar(pranchetaId) {
      const r = await agir((id) => api.descartar(id, pranchetaId));
      if (!r?.ok) return;
      deps.aoMudarAPeca({ versao: r.versao, arvore: r.arvore });
      seguirCom(r.tarefa);
    },
    async tentarDeNovo() {
      const r = await agir(api.tentarDeNovo);
      if (!r?.ok) return;
      // é OUTRA tarefa, e o que a anterior tinha feito foi desfeito
      deps.aoMudarAPeca();
      seguirCom(r.tarefa);
    },
    async dispensarPendencia(id) {
      if (await api.dispensar(id)) armazem.definir((e) => ({ ...e, pendencias: e.pendencias.filter((p) => p.id !== id) }));
    },
    dispensarRecusa() {
      armazem.definir((e) => {
        const { recusa: _recusa, ...resto } = e;
        return resto;
      });
    },
    fecharResultado() {
      const { atual } = armazem.obter();
      if (atual && !emAndamento(atual.tarefa) && atual.tarefa.estado !== 'aguardando_confirmacao' && atual.tarefa.estado !== 'em_revisao') definirAtual(undefined);
    },
    parar() {
      vez++;
      sinal?.abort();
    },
  };
}
