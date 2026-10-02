// As chamadas da tarefa do Otto (packages/shared/src/tarefa.ts; docs/mvp/backend.md, 17.11).
// O custo da tarefa (tokens, chamadas, dinheiro) não vem em resposta nenhuma: a tela mostra o tempo.
import type { Documento } from '@otto/documento';
import {
  AntesDaTarefa,
  LimitesDeTarefa as EsquemaDeLimites,
  type EventoGravado,
  EventosDaTarefa,
  type LimitesDeTarefa,
  ListaDePendencias,
  ListaDeTarefas,
  type PedidoDeTarefa,
  PendenciaDaPeca,
  RespostaDeDesfazerTarefa,
  Tarefa,
} from '@otto/shared';
import type { Cliente, Resposta } from './cliente';
import { type EventoDoFluxo, lerFluxo } from './fluxo';

export type ResultadoDaTarefa = { ok: true; tarefa: Tarefa } | { ok: false; codigo: string; detalhe?: Record<string, unknown> };
export type ResultadoDeDesfazer = { ok: true; tarefa: Tarefa; versao: number; arvore: Documento } | { ok: false; codigo: string; detalhe?: Record<string, unknown> };

export interface ApiDeTarefas {
  /** O que dizer antes de o designer enviar. Indefinido se a consulta falhou: não impede de tentar. */
  limites(): Promise<LimitesDeTarefa | undefined>;
  /** O que a rota aceita: pedido livre, ajuste, ou o formulário de briefing (com o cuidado e o briefing salvo de origem). */
  pedir(entrada: PedidoDeTarefa): Promise<ResultadoDaTarefa>;
  /** As tarefas recentes da peça e qual está viva. */
  daPeca(): Promise<{ itens: Tarefa[]; viva?: string } | undefined>;
  obter(id: string): Promise<ResultadoDaTarefa>;
  /**
   * Abre o fluxo de eventos a partir de `depoisDe` (-1: do começo) e entrega cada evento. Devolve
   * "fim" quando o servidor encerra (a tarefa parou de andar) e "caiu" quando a conexão se perde.
   */
  fluxo(id: string, depoisDe: number, aoReceber: (evento: EventoDoFluxo) => void, sinal: AbortSignal): Promise<'fim' | 'caiu'>;
  /** A reserva do fluxo: os eventos depois de uma sequência, por consulta. */
  eventosDesde(id: string, sequencia: number): Promise<{ eventos: EventoGravado[]; tarefa: Tarefa } | undefined>;
  aprovar(id: string): Promise<ResultadoDaTarefa>;
  ajustar(id: string, texto: string): Promise<ResultadoDaTarefa>;
  /** Cancela na fila ou no "pode"; interrompe se está rodando. */
  cancelar(id: string): Promise<ResultadoDaTarefa>;
  aceitar(id: string): Promise<ResultadoDaTarefa>;
  desfazer(id: string, incluirEdicoesPosteriores: boolean): Promise<ResultadoDeDesfazer>;
  descartar(id: string, pranchetaId: string): Promise<ResultadoDeDesfazer>;
  tentarDeNovo(id: string): Promise<ResultadoDaTarefa>;
  /** A peça como era antes da tarefa. */
  antes(id: string): Promise<{ versao: number; arvore: Documento } | undefined>;
  pendencias(): Promise<PendenciaDaPeca[]>;
  dispensar(id: string): Promise<boolean>;
}

type Buscar = (endereco: string, init?: RequestInit) => Promise<Response>;

export function criarApiDeTarefas(cliente: Cliente, pecaId: string, opcoes: { buscar?: Buscar; base?: string } = {}): ApiDeTarefas {
  const buscar = opcoes.buscar ?? ((endereco, init) => fetch(endereco, init));
  const base = opcoes.base ?? '';
  const daPeca = `/api/documentos/${encodeURIComponent(pecaId)}`;
  const rota = (id: string, resto = '') => `/api/tarefas/${encodeURIComponent(id)}${resto}`;
  const comDetalhe = (r: { codigo: string; detalhe?: Record<string, unknown> }) => ({ ok: false as const, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) });
  const daTarefa = (r: Resposta<Tarefa>): ResultadoDaTarefa => (r.ok ? { ok: true, tarefa: r.dados } : comDetalhe(r));
  const agir = async (id: string, acao: string, corpo: unknown = {}) => daTarefa(await cliente.escrever(Tarefa, 'POST', rota(id, `/${acao}`), corpo));
  const desfeita = (r: Resposta<RespostaDeDesfazerTarefa>): ResultadoDeDesfazer => (r.ok ? { ok: true, tarefa: r.dados.tarefa, versao: r.dados.versao, arvore: r.dados.arvore } : comDetalhe(r));

  return {
    async limites() {
      const r = await cliente.ler(EsquemaDeLimites, '/api/tarefas/limites');
      return r.ok ? r.dados : undefined;
    },
    pedir: async (entrada) => daTarefa(await cliente.escrever(Tarefa, 'POST', `${daPeca}/tarefas`, entrada)),
    async daPeca() {
      const r = await cliente.ler(ListaDeTarefas, `${daPeca}/tarefas`);
      return r.ok ? { itens: r.dados.itens, ...(r.dados.viva ? { viva: r.dados.viva } : {}) } : undefined;
    },
    obter: async (id) => daTarefa(await cliente.ler(Tarefa, rota(id))),
    async fluxo(id, depoisDe, aoReceber, sinal) {
      try {
        const resposta = await buscar(`${base}${rota(id, '/eventos')}`, {
          cache: 'no-store',
          signal: sinal,
          headers: { Accept: 'text/event-stream', ...(depoisDe >= 0 ? { 'Last-Event-ID': String(depoisDe) } : {}) },
        });
        if (!resposta.ok) return 'caiu';
        return (await lerFluxo(resposta, aoReceber)) ? 'fim' : 'caiu';
      } catch {
        return 'caiu';
      }
    },
    async eventosDesde(id, sequencia) {
      const r = await cliente.ler(EventosDaTarefa, rota(id, `/eventos?depoisDe=${sequencia}`));
      return r.ok ? r.dados : undefined;
    },
    aprovar: (id) => agir(id, 'aprovar'),
    ajustar: (id, texto) => agir(id, 'ajustar', { texto }),
    cancelar: (id) => agir(id, 'cancelar'),
    aceitar: (id) => agir(id, 'aceitar'),
    desfazer: async (id, incluirEdicoesPosteriores) => desfeita(await cliente.escrever(RespostaDeDesfazerTarefa, 'POST', rota(id, '/desfazer'), { incluirEdicoesPosteriores })),
    descartar: async (id, pranchetaId) => desfeita(await cliente.escrever(RespostaDeDesfazerTarefa, 'POST', rota(id, '/descartar'), { pranchetaId })),
    tentarDeNovo: (id) => agir(id, 'tentar-de-novo'),
    async antes(id) {
      const r = await cliente.ler(AntesDaTarefa, rota(id, '/antes'));
      return r.ok ? { versao: r.dados.versao, arvore: r.dados.arvore } : undefined;
    },
    async pendencias() {
      const r = await cliente.ler(ListaDePendencias, `${daPeca}/pendencias`);
      return r.ok ? r.dados.itens : [];
    },
    async dispensar(id) {
      return (await cliente.escrever(PendenciaDaPeca, 'POST', `/api/pendencias/${encodeURIComponent(id)}/dispensar`, {})).ok;
    },
  };
}
