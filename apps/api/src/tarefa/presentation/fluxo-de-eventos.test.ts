import type { EventosDaTarefa, Tarefa } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { cursorDe, type FonteDoFluxo, transmitir } from './fluxo-de-eventos';

/** Uma tarefa de mentira: a cada volta do fluxo o teste pode gravar eventos e mudar o estado. */
class TarefaDeMentira implements FonteDoFluxo {
  gravados: { tipo: string; texto?: string }[] = [];
  estado = 'rodando';
  leituras: number[] = [];
  async pulso() {
    return { ultimoEvento: this.gravados.length - 1, emAndamento: this.estado === 'rodando', marca: `${this.estado}:${this.gravados.length}` };
  }
  async eventos(depoisDe: number): Promise<EventosDaTarefa> {
    this.leituras.push(depoisDe);
    return {
      eventos: this.gravados.map((evento, sequencia) => ({ sequencia, quando: '2026-10-03T12:00:00.000Z', evento })).filter((e) => e.sequencia > depoisDe) as unknown as EventosDaTarefa['eventos'],
      tarefa: { estado: this.estado, ultimoEvento: this.gravados.length - 1 } as Tarefa,
    };
  }
}

function montar(voltas: ((t: TarefaDeMentira) => void)[], extras: { duracaoMaximaMs?: number; passoDoRelogioMs?: number } = {}) {
  const tarefa = new TarefaDeMentira();
  const escrito: string[] = [];
  let relogio = 0;
  let volta = 0;
  let fechada = false;
  const ritmo = {
    intervaloMs: 500,
    batimentoMs: 15_000,
    duracaoMaximaMs: extras.duracaoMaximaMs ?? 3_600_000,
    agora: () => relogio,
    esperar: async (ms: number) => {
      relogio += extras.passoDoRelogioMs ?? ms;
      const acao = voltas[volta++];
      if (acao) acao(tarefa);
      else fechada = true;
    },
  };
  return { tarefa, escrito, rodar: (depoisDe = -1) => transmitir(tarefa, { escrever: (t) => void escrito.push(t), fechada: () => fechada }, depoisDe, ritmo) };
}

const quadros = (escrito: string[]) =>
  escrito
    .filter((t) => t.startsWith('id:') || t.startsWith('event:'))
    .map((t) =>
      t
        .split('\n')
        .slice(0, t.startsWith('id:') ? 2 : 1)
        .join(' | '),
    );

describe('fluxo de eventos da tarefa', () => {
  it('entrega cada evento com a sequência como id, a fotografia quando muda, e fecha com "fim" quando a tarefa para', async () => {
    const f = montar([
      (t) => t.gravados.push({ tipo: 'etapa' }),
      (t) => {
        t.gravados.push({ tipo: 'lote' }, { tipo: 'entrega' });
        t.estado = 'em_revisao';
      },
    ]);
    await f.rodar();
    expect(f.escrito[0]).toBe('retry: 2000\n\n');
    expect(quadros(f.escrito)).toEqual(['event: tarefa', 'id: 0 | event: etapa', 'event: tarefa', 'id: 1 | event: lote', 'id: 2 | event: entrega', 'event: tarefa', 'event: fim']);
    expect(f.escrito.at(-1)).toBe('event: fim\ndata: {"estado":"em_revisao"}\n\n');
    // o corpo do evento é o que o ciclo emitiu, numa linha só
    expect(f.escrito.find((t) => t.startsWith('id: 1'))).toBe('id: 1\nevent: lote\ndata: {"tipo":"lote"}\n\n');
  });

  it('reconexão com Last-Event-ID entrega exatamente o que faltava, sem repetir e sem pular', async () => {
    const f = montar([]);
    f.tarefa.gravados.push({ tipo: 'etapa' }, { tipo: 'lote' }, { tipo: 'render' }, { tipo: 'entrega' });
    f.tarefa.estado = 'em_revisao';
    await f.rodar(cursorDe('1'));
    expect(quadros(f.escrito)).toEqual(['id: 2 | event: render', 'id: 3 | event: entrega', 'event: tarefa', 'event: fim']);
    expect(f.tarefa.leituras).toEqual([1]);
  });

  it('quem já viu tudo de uma tarefa parada recebe só a fotografia e o "fim"', async () => {
    const f = montar([]);
    f.tarefa.gravados.push({ tipo: 'etapa' }, { tipo: 'entrega' });
    f.tarefa.estado = 'aguardando_confirmacao';
    await f.rodar(1);
    expect(quadros(f.escrito)).toEqual(['event: tarefa', 'event: fim']);
  });

  it('sem novidade não relê os eventos: só o pulso, e um batimento a cada 15 s', async () => {
    const f = montar(
      Array.from({ length: 70 }, () => () => undefined),
      {},
    );
    await f.rodar();
    // 70 voltas de 500 ms = 35 s: dois batimentos, uma leitura (a primeira)
    expect(f.escrito.filter((t) => t === ': batimento\n\n')).toHaveLength(2);
    expect(f.tarefa.leituras).toEqual([-1]);
  });

  it('passado o tempo máximo o servidor fecha sem "fim", e o cliente reconecta de onde parou', async () => {
    const f = montar(
      Array.from({ length: 10 }, () => () => undefined),
      { duracaoMaximaMs: 2_000 },
    );
    await f.rodar();
    expect(f.escrito.some((t) => t.startsWith('event: fim'))).toBe(false);
  });

  it('cursor malformado vale "do começo"', () => {
    expect([cursorDe(undefined), cursorDe(''), cursorDe('abc'), cursorDe('-3'), cursorDe('1.5'), cursorDe('7')]).toEqual([-1, -1, -1, -1, -1, 7]);
  });
});
