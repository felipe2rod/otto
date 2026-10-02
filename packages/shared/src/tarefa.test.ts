// O contrato HTTP da tarefa do Otto (docs/mvp/backend.md, 7.5 e 17.11).
import { describe, expect, it } from 'vitest';
import {
  CODIGOS_DE_ERRO,
  ESTADOS_DE_TAREFA_EM_ANDAMENTO,
  ESTADOS_VIVOS_DA_TAREFA,
  EventosDaTarefa,
  LimitesDeTarefa,
  ListaDePendencias,
  ListaDeTarefas,
  PedidoDeAjusteDoPlano,
  PedidoDeDescartar,
  PedidoDeDesfazerTarefa,
  Tarefa,
} from './index';

const ID = '0199a3f0-0000-7000-8000-000000000001';
const QUANDO = '2026-10-03T12:00:00.000Z';
const base = {
  id: ID,
  documentoId: ID,
  tipo: 'pedido',
  estado: 'rodando',
  entrada: { tipo: 'pedido', pedido: 'adapta para Story' },
  etapas: [{ etapa: 'leitura' }, { etapa: 'producao', prancheta: { nome: 'Story' } }],
  etapa: { etapa: 'producao', prancheta: { nome: 'Story' } },
  versaoInicial: 4,
  lotes: 2,
  tocados: ['n1'],
  pendencias: [],
  ultimoEvento: 17,
  criadaEm: QUANDO,
};

describe('Tarefa', () => {
  it('é a fotografia do estado: o editor que abre a peça no meio da tarefa desenha o painel só com ela', () => {
    const t = Tarefa.parse(base);
    expect(t).toMatchObject({ estado: 'rodando', etapa: { etapa: 'producao' }, lotes: 2, ultimoEvento: 17 });
    expect(t.confirmacao).toBeUndefined();
  });

  it('aguardando o "pode": traz o cartão da direção, o plano em três listas e os motivos', () => {
    const confirmacao = {
      cartao: {
        conceito: 'lua de latão',
        assinatura: 'disco dourado',
        paleta: [{ papel: 'dominante', cor: '#101820' }],
        tipografia: { titulo: 'Anton 400', texto: 'IBM Plex Sans 400' },
        imagem: 'sax em contraluz',
      },
      plano: { resumo: 'Monto Feed e Story.', criar: [{ nome: 'Story', largura: 1080, altura: 1920 }], alterar: [], remover: [], pontual: false },
      motivos: ['varias_pranchetas'],
    };
    const t = Tarefa.parse({ ...base, estado: 'aguardando_confirmacao', confirmacao });
    expect(t.confirmacao?.plano.criar).toHaveLength(1);
    expect(t.confirmacao?.motivos).toEqual(['varias_pranchetas']);
  });

  it('em revisão: como parou, o resumo, as pendências e as pranchetas que a tarefa criou (as que dá para descartar)', () => {
    const pendencia = { tipo: 'aviso_da_verificacao', texto: 'Contraste baixo', camadas: ['n1'], origem: 'verificacao', regra: 'contraste', gravidade: 'aviso' };
    const t = Tarefa.parse({
      ...base,
      estado: 'em_revisao',
      fim: 'limite_de_tempo',
      versaoFinal: 9,
      resumo: 'Parei no limite.',
      conferida: false,
      pendencias: [pendencia],
      pranchetasNovas: ['p2'],
      terminadaEm: QUANDO,
      duracaoMs: 1000,
    });
    expect(t).toMatchObject({ fim: 'limite_de_tempo', conferida: false, pranchetasNovas: ['p2'] });
    expect(t.pendencias[0]?.origem).toBe('verificacao');
  });

  it('recusa estado, fim e tipo que não existem; e o custo não faz parte da tarefa', () => {
    expect(Tarefa.safeParse({ ...base, estado: 'pensando' }).success).toBe(false);
    expect(Tarefa.safeParse({ ...base, fim: 'acabou' }).success).toBe(false);
    expect(Tarefa.safeParse({ ...base, tipo: 'video' }).success).toBe(false);
    expect(Object.keys(Tarefa.parse({ ...base, custo: { dolares: 1 }, tokens: 9 }))).not.toEqual(expect.arrayContaining(['custo', 'tokens']));
  });

  it('estados vivos (uma por peça) e em andamento (o fluxo de eventos fica aberto)', () => {
    expect(ESTADOS_VIVOS_DA_TAREFA).toEqual(['na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao']);
    expect(ESTADOS_DE_TAREFA_EM_ANDAMENTO).toEqual(['na_fila', 'preparando', 'rodando']);
  });
});

describe('o resto do contrato da tarefa', () => {
  it('lista de tarefas da peça diz qual é a viva', () => {
    expect(ListaDeTarefas.parse({ itens: [base], viva: ID }).viva).toBe(ID);
    expect(ListaDeTarefas.parse({ itens: [] }).viva).toBeUndefined();
  });

  it('eventos por consulta: sequência, hora e o evento do ciclo, mais a fotografia da tarefa', () => {
    const r = EventosDaTarefa.parse({ eventos: [{ sequencia: 18, quando: QUANDO, evento: { tipo: 'etapa', etapa: 'conferencia' } }], tarefa: base });
    expect(r.eventos[0]).toMatchObject({ sequencia: 18, evento: { tipo: 'etapa' } });
    expect(EventosDaTarefa.safeParse({ eventos: [{ sequencia: -1, quando: QUANDO, evento: { tipo: 'etapa' } }], tarefa: base }).success).toBe(false);
  });

  it('pedidos: ajustar o plano pede texto; descartar pede a prancheta; desfazer pode levar as edições posteriores junto', () => {
    expect(PedidoDeAjusteDoPlano.safeParse({ texto: '  ' }).success).toBe(false);
    expect(PedidoDeAjusteDoPlano.parse({ texto: 'menos dourado' })).toEqual({ texto: 'menos dourado' });
    expect(PedidoDeDescartar.safeParse({}).success).toBe(false);
    expect(PedidoDeDesfazerTarefa.parse({})).toEqual({ incluirEdicoesPosteriores: false });
  });

  it('limites antes de enviar: contagem de tarefas, nunca tokens nem dinheiro', () => {
    const l = LimitesDeTarefa.parse({ podeEnviar: false, motivo: 'limite_diario', tarefasHoje: 6, tarefasPorDia: 6, naFila: 0, naFilaNoMaximo: 3 });
    expect(l.motivo).toBe('limite_diario');
    expect(LimitesDeTarefa.safeParse({ podeEnviar: false, motivo: 'sem_credito', tarefasHoje: 0, tarefasPorDia: 6, naFila: 0, naFilaNoMaximo: 3 }).success).toBe(false);
  });

  it('pendência da peça: a do Otto, com id, tarefa e estado', () => {
    const p = { id: ID, tarefaId: ID, tipo: 'resolucao_da_imagem', texto: 'Foto ampliada 140%', camadas: ['n3'], prancheta: 'p2', origem: 'otto', estado: 'aberta', criadaEm: QUANDO };
    expect(ListaDePendencias.parse({ itens: [p] }).itens[0]?.estado).toBe('aberta');
    expect(ListaDePendencias.safeParse({ itens: [{ ...p, estado: 'sumida' }] }).success).toBe(false);
  });

  it('códigos de erro da tarefa', () => {
    expect([
      CODIGOS_DE_ERRO.documentoEmTarefa,
      CODIGOS_DE_ERRO.revisaoPendente,
      CODIGOS_DE_ERRO.tarefaEmAndamento,
      CODIGOS_DE_ERRO.tarefaForaDoEstado,
      CODIGOS_DE_ERRO.editadoDepois,
      CODIGOS_DE_ERRO.limiteDeTarefas,
      CODIGOS_DE_ERRO.limiteDiario,
    ]).toEqual(['documento_em_tarefa', 'revisao_pendente', 'tarefa_em_andamento', 'tarefa_fora_do_estado', 'editado_depois', 'limite_de_tarefas', 'limite_diario']);
  });
});
