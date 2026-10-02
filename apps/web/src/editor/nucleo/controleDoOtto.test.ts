// O controle da tarefa do Otto, com uma API de mentira: pedir, acompanhar, o "pode", a revisão, a
// queda do fluxo e a retomada ao abrir a peça.
import { documentoVazio } from '@otto/documento';
import type { EventoDaTarefa, Tarefa } from '@otto/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventoDoFluxo } from '../../api/fluxo';
import type { ApiDeTarefas } from '../../api/tarefas';
import { type ControleDoOtto, criarControleDoOtto } from './controleDoOtto';

const ID = '0199a000-0000-7000-8000-0000000000a1';
const tarefa = (extra: Partial<Tarefa> = {}): Tarefa => ({
  id: ID,
  documentoId: '0199a000-0000-7000-8000-000000000001',
  tipo: 'criar',
  estado: 'na_fila',
  entrada: { tipo: 'criar', pedido: 'cartaz' },
  etapas: [],
  versaoInicial: 0,
  lotes: 0,
  tocados: [],
  pendencias: [],
  ultimoEvento: -1,
  criadaEm: '2026-10-02T12:00:00.000Z',
  ...extra,
});
const evento = (id: number, e: EventoDaTarefa): EventoDoFluxo => ({ id, evento: e.tipo, dados: e });
const fotografia = (t: Tarefa): EventoDoFluxo => ({ evento: 'tarefa', dados: t });
const FIM: EventoDoFluxo = { evento: 'fim', dados: {} };
const lote: EventoDaTarefa = { tipo: 'lote', loteId: 'l1', descricao: 'Feed', tocados: ['a'], operacoes: [] };
const LIMITES = { podeEnviar: true, tarefasHoje: 1, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3 };

/** Cada conexão do fluxo: os eventos que ela entrega e como termina. */
type Conexao = { eventos: EventoDoFluxo[]; termina: 'fim' | 'caiu' };

let conexoes: Conexao[];
let aberturas: number[];
let api: ApiDeTarefas;
let peca: unknown[];
let estados: string[];
let esperas: (() => void)[];
let otto: ControleDoOtto;

const assentar = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const atual = () => otto.armazem.obter().atual;

beforeEach(() => {
  conexoes = [];
  aberturas = [];
  peca = [];
  estados = [];
  esperas = [];
  const ok = (t: Tarefa) => ({ ok: true as const, tarefa: t });
  api = {
    limites: vi.fn(async () => LIMITES),
    pedir: vi.fn(async () => ok(tarefa())),
    daPeca: vi.fn(async () => ({ itens: [] })),
    obter: vi.fn(async () => ok(tarefa({ estado: 'em_revisao', fim: 'entregue' }))),
    fluxo: vi.fn(async (_id, depoisDe, aoReceber) => {
      aberturas.push(depoisDe);
      const conexao = conexoes.shift();
      if (!conexao) return new Promise<'fim'>(() => undefined);
      for (const e of conexao.eventos) aoReceber(e);
      return conexao.termina;
    }),
    eventosDesde: vi.fn(async () => undefined),
    aprovar: vi.fn(async () => ok(tarefa({ estado: 'na_fila' }))),
    ajustar: vi.fn(async () => ok(tarefa({ estado: 'preparando' }))),
    cancelar: vi.fn(async () => ok(tarefa({ estado: 'cancelada', fim: 'cancelada' }))),
    aceitar: vi.fn(async () => ok(tarefa({ estado: 'aceita', fim: 'entregue' }))),
    desfazer: vi.fn(async () => ({ ok: true as const, tarefa: tarefa({ estado: 'desfeita' }), versao: 7, arvore: documentoVazio() })),
    descartar: vi.fn(async () => ({ ok: true as const, tarefa: tarefa({ estado: 'em_revisao', fim: 'entregue' }), versao: 8, arvore: documentoVazio() })),
    tentarDeNovo: vi.fn(async () => ok(tarefa({ id: '0199a000-0000-7000-8000-0000000000a2', estado: 'na_fila' }))),
    antes: vi.fn(async () => undefined),
    pendencias: vi.fn(async () => []),
    dispensar: vi.fn(async () => true),
  };
  otto = criarControleDoOtto({
    api,
    aoMudarAPeca: (p) => peca.push(p ?? 'buscar'),
    aoMudarDeEstado: (t, anterior) => estados.push(`${anterior ?? '-'}>${t.estado}`),
    esperar: () => new Promise<void>((seguir) => esperas.push(seguir)),
  });
});

describe('pedir e acompanhar', () => {
  it('pede, abre o fluxo do começo e segue os eventos até o servidor encerrar', async () => {
    conexoes.push({
      eventos: [
        fotografia(tarefa({ estado: 'rodando' })),
        evento(0, { tipo: 'etapa', etapa: 'producao' }),
        evento(1, lote),
        fotografia(tarefa({ estado: 'em_revisao', fim: 'entregue', lotes: 1 })),
        FIM,
      ],
      termina: 'fim',
    });
    expect(await otto.pedir({ tipo: 'criar', pedido: 'cartaz' })).toBe(true);
    await assentar();

    expect(aberturas).toEqual([-1]);
    expect(atual()?.tarefa.estado).toBe('em_revisao');
    expect(atual()?.registro.map((l) => l.evento.tipo)).toEqual(['etapa', 'lote']);
    expect([...(atual()?.tocados ?? [])]).toEqual(['a']);
    expect(estados).toEqual(['->na_fila', 'na_fila>rodando', 'rodando>em_revisao']);
    // a peça é relida a cada lote do Otto, e de novo quando a tarefa para
    expect(peca).toEqual(['buscar', 'buscar']);
    expect(otto.armazem.obter().ocupado).toBe(false);
  });

  it('pedido recusado: guarda o código para a frase, e não há tarefa em tela', async () => {
    vi.mocked(api.pedir).mockResolvedValueOnce({ ok: false, codigo: 'limite_de_tarefas', detalhe: { motivo: 'fila_cheia' } });
    expect(await otto.pedir({ tipo: 'ajuste', pedido: 'x' })).toBe(false);
    expect(otto.armazem.obter().recusa).toEqual({ codigo: 'limite_de_tarefas', detalhe: { motivo: 'fila_cheia' } });
    expect(atual()).toBeUndefined();
    otto.dispensarRecusa();
    expect(otto.armazem.obter().recusa).toBeUndefined();
  });

  it('o fluxo caiu: marca "sem atualização ao vivo", relê o que perdeu por consulta e reconecta de onde parou', async () => {
    conexoes.push({ eventos: [fotografia(tarefa({ estado: 'rodando' })), evento(0, { tipo: 'etapa', etapa: 'leitura' })], termina: 'caiu' });
    vi.mocked(api.eventosDesde).mockResolvedValueOnce({ eventos: [{ sequencia: 1, quando: '2026-10-02T12:00:01.000Z', evento: lote }], tarefa: tarefa({ estado: 'rodando', lotes: 1 }) });
    await otto.pedir({ tipo: 'criar', pedido: 'cartaz' });
    await assentar();
    expect(otto.armazem.obter().semAoVivo).toBe(true);
    expect(atual()?.tarefa.etapa).toEqual({ etapa: 'leitura' });

    conexoes.push({ eventos: [evento(2, { tipo: 'etapa', etapa: 'conferencia' }), fotografia(tarefa({ estado: 'em_revisao', fim: 'entregue' })), FIM], termina: 'fim' });
    esperas.shift()?.();
    await assentar();
    expect(api.eventosDesde).toHaveBeenCalledWith(ID, 0);
    expect(aberturas).toEqual([-1, 1]);
    expect(otto.armazem.obter().semAoVivo).toBe(false);
    expect(atual()?.tarefa.estado).toBe('em_revisao');
  });
});

describe('o "pode"', () => {
  const noPode = tarefa({
    estado: 'aguardando_confirmacao',
    confirmacao: { cartao: null, plano: { resumo: '', criar: [], alterar: [], remover: [], pontual: false }, motivos: ['varias_pranchetas'] },
  });

  it('o fluxo fecha no "pode"; aprovar abre de novo, de onde parou', async () => {
    conexoes.push({ eventos: [evento(0, { tipo: 'etapa', etapa: 'direcao' }), fotografia(noPode), FIM], termina: 'fim' });
    await otto.pedir({ tipo: 'criar', pedido: 'cartaz' });
    await assentar();
    expect(atual()?.tarefa.estado).toBe('aguardando_confirmacao');
    expect(aberturas).toEqual([-1]);

    conexoes.push({ eventos: [fotografia(tarefa({ estado: 'rodando' })), evento(1, lote), fotografia(tarefa({ estado: 'em_revisao', fim: 'entregue' })), FIM], termina: 'fim' });
    await otto.aprovar();
    await assentar();
    expect(aberturas).toEqual([-1, 0]);
    expect(atual()?.tarefa.estado).toBe('em_revisao');
  });

  it('ajustar manda o texto e volta a acompanhar; cancelar fecha sem alterar nada', async () => {
    conexoes.push({ eventos: [fotografia(noPode), FIM], termina: 'fim' });
    await otto.pedir({ tipo: 'criar', pedido: 'cartaz' });
    await assentar();

    conexoes.push({ eventos: [fotografia(noPode), FIM], termina: 'fim' });
    await otto.ajustar('paleta mais quente');
    await assentar();
    expect(api.ajustar).toHaveBeenCalledWith(ID, 'paleta mais quente');
    expect(atual()?.tarefa.estado).toBe('aguardando_confirmacao');

    await otto.cancelar();
    await assentar();
    expect(atual()?.tarefa.estado).toBe('cancelada');
    otto.fecharResultado();
    expect(atual()).toBeUndefined();
  });
});

describe('revisão', () => {
  beforeEach(async () => {
    conexoes.push({ eventos: [fotografia(tarefa({ estado: 'em_revisao', fim: 'entregue', lotes: 2 })), FIM], termina: 'fim' });
    await otto.pedir({ tipo: 'criar', pedido: 'cartaz' });
    await assentar();
    peca = [];
  });

  it('aceitar fecha a tarefa e relê limites e pendências', async () => {
    expect(await otto.aceitar()).toBe(true);
    await assentar();
    expect(atual()?.tarefa.estado).toBe('aceita');
    expect(vi.mocked(api.pendencias).mock.calls.length).toBeGreaterThan(1);
  });

  it('desfazer e descartar entregam ao editor a peça como ficou', async () => {
    await otto.descartar('p2');
    expect(api.descartar).toHaveBeenCalledWith(ID, 'p2');
    expect(peca).toEqual([{ versao: 8, arvore: documentoVazio() }]);
    expect(atual()?.tarefa.estado).toBe('em_revisao');

    await otto.desfazer();
    expect(peca[1]).toEqual({ versao: 7, arvore: documentoVazio() });
    expect(atual()?.tarefa.estado).toBe('desfeita');
  });

  it('desfazer recusado por edições posteriores guarda quantas são, para a tela perguntar', async () => {
    vi.mocked(api.desfazer).mockResolvedValueOnce({ ok: false, codigo: 'editado_depois', detalhe: { edicoes: 3 } });
    await otto.desfazer();
    expect(otto.armazem.obter().recusa).toEqual({ codigo: 'editado_depois', detalhe: { edicoes: 3 } });
    await otto.desfazer(true);
    expect(api.desfazer).toHaveBeenLastCalledWith(ID, true);
  });

  it('tentar de novo é OUTRA tarefa: começa do zero e volta a acompanhar', async () => {
    await otto.tentarDeNovo();
    await assentar();
    expect(atual()?.tarefa.id).toBe('0199a000-0000-7000-8000-0000000000a2');
    expect(atual()?.ultimaSequencia).toBe(-1);
    expect(peca[0]).toBe('buscar');
  });

  it('enquanto uma ação está em curso, outra não começa', async () => {
    let liberar: (() => void) | undefined;
    vi.mocked(api.aceitar).mockImplementationOnce(() => new Promise((seguir) => (liberar = () => seguir({ ok: true, tarefa: tarefa({ estado: 'aceita' }) }))));
    const primeira = otto.aceitar();
    expect(otto.armazem.obter().ocupado).toBe(true);
    await otto.desfazer();
    expect(api.desfazer).not.toHaveBeenCalled();
    liberar?.();
    await primeira;
  });
});

describe('abrir a peça', () => {
  it('com tarefa viva trabalhando: volta a acompanhar, do começo, para refazer o registro', async () => {
    vi.mocked(api.daPeca).mockResolvedValueOnce({ itens: [tarefa({ estado: 'rodando', ultimoEvento: 9 })], viva: ID });
    conexoes.push({ eventos: [evento(0, { tipo: 'mensagem', texto: 'Monto o Feed.' })], termina: 'caiu' });
    await otto.iniciar();
    await assentar();
    expect(aberturas).toEqual([-1]);
    expect(atual()?.registro).toHaveLength(1);
    expect(otto.armazem.obter().limites).toEqual(LIMITES);
  });

  it('com tarefa parada no "pode" ou em revisão: mostra a fotografia e busca o registro por consulta, sem abrir fluxo', async () => {
    vi.mocked(api.daPeca).mockResolvedValueOnce({ itens: [tarefa({ estado: 'em_revisao', fim: 'interrompida', lotes: 2 })], viva: ID });
    vi.mocked(api.eventosDesde).mockResolvedValueOnce({
      eventos: [{ sequencia: 0, quando: '2026-10-02T12:00:01.000Z', evento: lote }],
      tarefa: tarefa({ estado: 'em_revisao', fim: 'interrompida', lotes: 2 }),
    });
    await otto.iniciar();
    expect(atual()?.tarefa).toMatchObject({ estado: 'em_revisao', fim: 'interrompida' });
    expect(atual()?.registro).toHaveLength(1);
    expect(api.fluxo).not.toHaveBeenCalled();
  });

  it('sem tarefa viva: nada em tela, só limites e pendências', async () => {
    vi.mocked(api.pendencias).mockResolvedValueOnce([{ id: 'p', tarefaId: ID, tipo: 'outro', texto: 'x', camadas: [], origem: 'otto', estado: 'aberta', criadaEm: '2026-10-02T12:00:00.000Z' }]);
    await otto.iniciar();
    expect(atual()).toBeUndefined();
    expect(otto.armazem.obter().pendencias).toHaveLength(1);

    await otto.dispensarPendencia('p');
    expect(otto.armazem.obter().pendencias).toEqual([]);
  });

  it('parar deixa de acompanhar: evento que chegar depois não escreve mais', async () => {
    let entregar: ((e: EventoDoFluxo) => void) | undefined;
    vi.mocked(api.fluxo).mockImplementationOnce((_id, _de, aoReceber) => {
      entregar = aoReceber;
      return new Promise(() => undefined);
    });
    await otto.pedir({ tipo: 'criar', pedido: 'cartaz' });
    await assentar();
    otto.parar();
    expect(entregar).toBeDefined();
  });
});
