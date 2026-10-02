// O fluxo de eventos de uma tarefa (text/event-stream), como está descrito em @otto/shared (tarefa.ts):
//   id: <sequência>   event: <tipo do evento>   data: <EventoDaTarefa>      um por evento gravado
//   event: tarefa     data: <Tarefa>                                        a fotografia, quando muda (sem id)
//   : batimento                                                             comentário, a cada 15 s
//   event: fim        data: { estado }                                      a tarefa parou de andar; o servidor fecha
//
// O evento é gravado ANTES de ser mostrado, e o fluxo lê da tabela: reconectar com Last-Event-ID entrega
// exatamente o que faltava, e não importa em que processo a tarefa roda. A leitura é por consulta periódica
// (uma leitura leve por volta); trocar por LISTEN/NOTIFY é mudança só deste arquivo.
import type { EventosDaTarefa } from '@otto/shared';

export interface FonteDoFluxo {
  pulso(): Promise<{ ultimoEvento: number; emAndamento: boolean; marca: string }>;
  eventos(depoisDe: number): Promise<EventosDaTarefa>;
}

export interface SaidaDoFluxo {
  escrever(texto: string): void;
  /** O cliente foi embora. */
  fechada(): boolean;
}

export interface RitmoDoFluxo {
  intervaloMs: number;
  batimentoMs: number;
  /** Depois disto o servidor fecha a conexão, sem `fim`: o navegador reconecta sozinho com Last-Event-ID. */
  duracaoMaximaMs: number;
  esperar?(ms: number): Promise<void>;
  agora?(): number;
}

export const RITMO_PADRAO: RitmoDoFluxo = { intervaloMs: 500, batimentoMs: 15_000, duracaoMaximaMs: 30 * 60_000 };
const POR_LEITURA = 500;

const quadro = (campos: { id?: number; evento: string; dados: unknown }): string =>
  `${campos.id !== undefined ? `id: ${campos.id}\n` : ''}event: ${campos.evento}\ndata: ${JSON.stringify(campos.dados)}\n\n`;

/** Lê o cursor de `Last-Event-ID` (ou de `?depoisDe=`). Qualquer coisa que não seja inteiro ≥ 0 vale "do começo". */
export function cursorDe(valor: string | undefined): number {
  return valor !== undefined && /^\d{1,9}$/.test(valor) ? Number(valor) : -1;
}

export async function transmitir(fonte: FonteDoFluxo, saida: SaidaDoFluxo, depoisDe: number, ritmo: RitmoDoFluxo = RITMO_PADRAO): Promise<void> {
  const agora = ritmo.agora ?? Date.now;
  const esperar = ritmo.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inicio = agora();
  let cursor = depoisDe;
  let marca: string | undefined;
  let ultimaEscrita = agora();
  const escrever = (texto: string) => {
    saida.escrever(texto);
    ultimaEscrita = agora();
  };
  // se a conexão cair, o navegador tenta de novo em 2 s
  escrever('retry: 2000\n\n');
  while (!saida.fechada()) {
    const pulso = await fonte.pulso();
    if (pulso.ultimoEvento > cursor || pulso.marca !== marca) {
      const lido = await fonte.eventos(cursor);
      for (const e of lido.eventos) {
        escrever(quadro({ id: e.sequencia, evento: e.evento.tipo, dados: e.evento }));
        cursor = e.sequencia;
      }
      // veio a página cheia: há mais para ler antes de mostrar a fotografia
      if (lido.eventos.length >= POR_LEITURA) continue;
      escrever(quadro({ evento: 'tarefa', dados: lido.tarefa }));
      marca = pulso.marca;
      if (!pulso.emAndamento && lido.tarefa.ultimoEvento <= cursor) {
        escrever(quadro({ evento: 'fim', dados: { estado: lido.tarefa.estado } }));
        return;
      }
    }
    if (agora() - inicio >= ritmo.duracaoMaximaMs) return;
    if (agora() - ultimaEscrita >= ritmo.batimentoMs) escrever(': batimento\n\n');
    await esperar(ritmo.intervaloMs);
  }
}
