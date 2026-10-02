// @vitest-environment jsdom

import { caixaDe } from '@otto/documento';
import type { EventoDaTarefa, Exportacao, ImagemTrazida, RelatorioDeExportacao, ResultadoDaBuscaDeImagens, Tarefa } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EventoDoFluxo } from '../api/fluxo';
import type { ResultadoDeAbrir } from '../api/pecas';
import { imagens as textosDeImagens, texturas as textosDeTexturas } from '../textos/briefing';
import { editor as textos } from '../textos/editor';
import { erros } from '../textos/erros';
import { exportar as textosDeExportar } from '../textos/exportar';
import { otto as textosDoOtto } from '../textos/otto';
import { montarDocumentoDeExemplo } from './bancada/documentoDeExemplo';
import type { MotorDeRender, RecursosEmFalta } from './canvas/motor';
import { Editor } from './Editor';
import type { FonteDaPeca } from './fonteDaPeca';
import { paraTela } from './nucleo/camera';
import { SENTINELA_DO_EDITOR } from './sentinela';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(cleanup);

const EXEMPLO = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });

/** O que o último motor de mentira assinou para saber de recurso em falta. */
let avisarFalta: ((f: RecursosEmFalta) => void) | undefined;

function motorFalso(): MotorDeRender {
  return {
    redimensionar: vi.fn(),
    definirDocumento: vi.fn(),
    definirPrevia: vi.fn(),
    definirCamera: vi.fn(),
    prepararRecursos: vi.fn(async () => undefined),
    medidor: { tinta: () => ({ x: 0, y: 0, w: 0, h: 0 }) },
    emFalta: { fontes: [], imagens: [] },
    aoMudarEmFalta: vi.fn((aviso: (f: RecursosEmFalta) => void) => {
      avisarFalta = aviso;
      return () => {};
    }),
    sentinela: 'motor-de-teste',
    contadores: { composicoesDePrancheta: 0, partes: 0, quadros: 0 },
    renderizarReferencia: vi.fn(),
    aoPerderContexto: vi.fn(),
    destruir: vi.fn(),
  };
}

type Lotes = NonNullable<FonteDaPeca['lotes']>;

const TEXTURAS = [
  { nome: 'papel', descricao: 'papel de algodão com fibras', modoDeMesclagem: 'multiplicacao', opacidade: 0.6, largura: 1600, altura: 1600 },
  { nome: 'reticula', descricao: 'meio-tom de impressão', modoDeMesclagem: 'sobrepor', opacidade: 0.25, largura: 1600, altura: 1600 },
];
const TEXTURA_TRAZIDA = {
  sha256: 'd'.repeat(64),
  largura: 1600,
  altura: 1600,
  no: { tipo: 'imagem' as const, arquivo: 'd'.repeat(64), larguraOriginal: 1600, alturaOriginal: 1600, modoDeMesclagem: 'multiplicacao', opacidade: 0.6 },
};
const ORIGEM = { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre' };
const BUSCA: ResultadoDaBuscaDeImagens = {
  banco: { id: 'banco-de-teste', nome: 'Banco de Teste', licenca: 'Licença livre', ladoMaximo: 1280 },
  itens: [
    {
      banco: 'banco-de-teste',
      id: '42',
      descricao: 'pão quente, padaria',
      largura: 853,
      altura: 1280,
      autor: 'Fulana',
      pagina: 'https://exemplo.test/42',
      previa: '/api/imagens/banco-de-teste/42/previa',
    },
  ],
};
const TRAZIDA: ImagemTrazida = {
  sha256: 'c'.repeat(64),
  tipo: 'image/jpeg',
  largura: 853,
  altura: 1280,
  bytes: 1000,
  origem: { ...ORIGEM, pagina: 'https://exemplo.test/42' },
  no: { tipo: 'imagem', arquivo: 'c'.repeat(64), larguraOriginal: 853, alturaOriginal: 1280, origem: { ...ORIGEM, url: '' } },
};

function montar(
  opcoes: {
    abrir?: ResultadoDeAbrir | (() => Promise<ResultadoDeAbrir>);
    webgl?: boolean;
    lotes?: Partial<Lotes>;
    motor?: Partial<MotorDeRender>;
    arquivos?: Partial<NonNullable<FonteDaPeca['arquivos']>>;
    renomear?: FonteDaPeca['renomear'];
    exportacoes?: Partial<NonNullable<FonteDaPeca['exportacoes']>>;
    tarefas?: Partial<NonNullable<FonteDaPeca['tarefas']>>;
    imagens?: Partial<NonNullable<FonteDaPeca['imagens']>>;
    texturas?: Partial<NonNullable<FonteDaPeca['texturas']>>;
  } = {},
) {
  const motor = { ...motorFalso(), ...opcoes.motor };
  const criarMotor = vi.fn(async () => motor);
  const abrir = opcoes.abrir ?? { estado: 'nao_encontrada' as const };
  const abrirPeca = vi.fn(typeof abrir === 'function' ? abrir : async () => abrir);
  const lotes: Lotes | undefined = opcoes.lotes && {
    enviar: vi.fn<Lotes['enviar']>(async (lote) => ({ tipo: 'confirmado', versao: lote.versaoBase + 1 })),
    desfazer: vi.fn<Lotes['desfazer']>(async () => ({ ok: false, codigo: 'nada_para_desfazer' })),
    refazer: vi.fn<Lotes['refazer']>(async () => ({ ok: false, codigo: 'nada_para_refazer' })),
    ...opcoes.lotes,
  };
  const fonte: FonteDaPeca = {
    abrir: abrirPeca,
    recursos: { imagem: async () => new ArrayBuffer(0), fonte: async () => new ArrayBuffer(0) },
    listarFontes: async () => [],
    ...(lotes ? { lotes } : {}),
    ...(opcoes.arquivos
      ? {
          arquivos: {
            enviarImagem: vi.fn(async () => ({ ok: true as const, arquivo: { sha256: 'b'.repeat(64), largura: 2000, altura: 1000 } })),
            importarSvg: vi.fn(async () => ({ ok: false as const, codigo: 'svg_invalido' })),
            ...opcoes.arquivos,
          },
        }
      : {}),
    ...(opcoes.renomear ? { renomear: opcoes.renomear } : {}),
    ...(opcoes.texturas
      ? {
          texturas: {
            listar: vi.fn(async () => TEXTURAS),
            trazer: vi.fn(async () => ({ ok: true as const, textura: TEXTURA_TRAZIDA })),
            ...opcoes.texturas,
          },
        }
      : {}),
    ...(opcoes.imagens
      ? {
          imagens: {
            buscar: vi.fn(async () => ({ ok: true as const, resultado: BUSCA })),
            trazer: vi.fn(async () => ({ ok: true as const, imagem: TRAZIDA })),
            ...opcoes.imagens,
          },
        }
      : {}),
    ...(opcoes.tarefas ? { tarefas: tarefasDeMentira(opcoes.tarefas) } : {}),
    ...(opcoes.exportacoes
      ? {
          exportacoes: {
            relatorio: vi.fn(async () => ({ ok: true as const, relatorio: RELATORIO })),
            pedir: vi.fn(async () => ({ ok: true as const, exportacao: EXPORTACAO })),
            consultar: vi.fn(async () => ({ ok: true as const, exportacao: EXPORTACAO })),
            listar: vi.fn(async () => [] as Exportacao[]),
            ...opcoes.exportacoes,
          },
        }
      : {}),
  };
  const tela = render(<Editor pecaId="a1" fonte={fonte} criarMotor={criarMotor} temWebGL={() => opcoes.webgl ?? true} />);
  return { motor, criarMotor, abrirPeca, lotes, tela, fonte };
}

const RELATORIO: RelatorioDeExportacao = { arquivos: [], camadas: [], tokens: [], fontes: [], substituicoes: [], emFalta: { fontes: [], imagens: [] }, imagens: [], avisos: [] };
const EXPORTACAO: Exportacao = {
  id: '0199a000-0000-7000-8000-0000000000e1',
  documentoId: '0199a000-0000-7000-8000-000000000001',
  versao: 3,
  formato: 'psd',
  estado: 'na_fila',
  progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 },
  arquivos: [],
  falhas: [],
  criadaEm: '2026-10-01T12:00:00.000Z',
};

const TAREFA: Tarefa = {
  id: '0199a000-0000-7000-8000-0000000000a1',
  documentoId: '0199a000-0000-7000-8000-000000000001',
  tipo: 'pedido',
  estado: 'rodando',
  entrada: { tipo: 'pedido', pedido: 'adapta para banner' },
  etapas: [{ etapa: 'leitura' }, { etapa: 'producao' }],
  etapa: { etapa: 'producao' },
  versaoInicial: 3,
  lotes: 0,
  tocados: [],
  pendencias: [],
  ultimoEvento: -1,
  criadaEm: '2026-10-02T12:00:00.000Z',
};

/** A API de tarefas de mentira: sem tarefa viva e com o fluxo parado, a menos que o teste diga outra coisa. */
function tarefasDeMentira(extra: Partial<NonNullable<FonteDaPeca['tarefas']>>): NonNullable<FonteDaPeca['tarefas']> {
  const ok = (t: Tarefa) => ({ ok: true as const, tarefa: t });
  return {
    limites: vi.fn(async () => ({ podeEnviar: true, tarefasHoje: 0, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3 })),
    pedir: vi.fn(async () => ok(TAREFA)),
    daPeca: vi.fn(async () => ({ itens: [] as Tarefa[] })),
    obter: vi.fn(async () => ok(TAREFA)),
    fluxo: vi.fn(() => new Promise<'fim' | 'caiu'>(() => undefined)),
    eventosDesde: vi.fn(async () => undefined),
    aprovar: vi.fn(async () => ok(TAREFA)),
    ajustar: vi.fn(async () => ok(TAREFA)),
    cancelar: vi.fn(async () => ok({ ...TAREFA, estado: 'cancelada' })),
    aceitar: vi.fn(async () => ok({ ...TAREFA, estado: 'aceita', fim: 'entregue' })),
    desfazer: vi.fn(async () => ({ ok: true as const, tarefa: { ...TAREFA, estado: 'desfeita' as const }, versao: 9, arvore: EXEMPLO })),
    descartar: vi.fn(async () => ({ ok: true as const, tarefa: TAREFA, versao: 9, arvore: EXEMPLO })),
    tentarDeNovo: vi.fn(async () => ok(TAREFA)),
    antes: vi.fn(async () => undefined),
    pendencias: vi.fn(async () => []),
    dispensar: vi.fn(async () => true),
    ...extra,
  };
}

const aberta: ResultadoDeAbrir = {
  estado: 'aberta',
  peca: { id: 'a1', nome: 'Lançamento Crové', versao: 3, arvore: EXEMPLO, historico: { podeDesfazer: true, podeRefazer: true } },
};

describe('casca do editor: disposição', () => {
  it('tem ferramentas e Otto de um lado, Propriedades e Camadas do outro, e o canvas no meio', async () => {
    const { criarMotor } = montar();
    await waitFor(() => expect(criarMotor).toHaveBeenCalled());

    const ferramentas = screen.getByRole('toolbar', { name: textos.ferramentas.rotulo });
    // três ferramentas (Mover, Mão, Zoom) e a ação de inserir arquivo
    expect(within(ferramentas).getAllByRole('button')).toHaveLength(3);
    expect(within(ferramentas).getByLabelText(textos.ferramentas.inserir)).toBeDefined();
    expect(screen.getByRole('region', { name: textos.paineis.otto.titulo })).toBeDefined();
    expect(screen.getByRole('region', { name: textos.paineis.propriedades.titulo })).toBeDefined();
    expect(screen.getByRole('region', { name: textos.paineis.camadas.titulo })).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
  });

  it('cada painel sem conteúdo diz o que vai aparecer ali', async () => {
    const { criarMotor } = montar();
    await waitFor(() => expect(criarMotor).toHaveBeenCalled());

    for (const painel of [textos.paineis.otto, textos.paineis.propriedades, textos.paineis.camadas]) {
      expect(within(screen.getByRole('region', { name: painel.titulo })).getByText(painel.vazio)).toBeDefined();
    }
  });

  it('traz o aviso de tela estreita, que o CSS mostra abaixo da largura mínima', () => {
    montar();
    expect(screen.getByText(textos.avisos.telaEstreita)).toBeDefined();
  });

  it('carrega a sentinela que o teste de pacote procura nas páginas públicas', () => {
    const { tela } = montar();
    expect(tela.container.querySelector(`[data-otto="${SENTINELA_DO_EDITOR}"]`)).not.toBeNull();
  });
});

describe('casca do editor: ferramentas e atalhos', () => {
  it('começa com Mover; clicar em outra ferramenta troca', () => {
    montar();
    const nome = (f: { nome: string; tecla: string }) => textos.ferramentas.comTecla(f.nome, f.tecla);
    const mover = screen.getByRole('button', { name: nome(textos.ferramentas.mover) });
    const mao = screen.getByRole('button', { name: nome(textos.ferramentas.mao) });
    expect(mover.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(mao);

    expect(mao.getAttribute('aria-pressed')).toBe('true');
    expect(mover.getAttribute('aria-pressed')).toBe('false');
  });

  it('a tecla Z escolhe o zoom', () => {
    montar();
    fireEvent.keyDown(window, { key: 'z' });
    const zoom = screen.getByRole('button', { name: textos.ferramentas.comTecla(textos.ferramentas.zoom.nome, textos.ferramentas.zoom.tecla) });
    expect(zoom.getAttribute('aria-pressed')).toBe('true');
  });

  it('Tab, com o foco fora dos painéis, esconde os painéis e mostra de novo', () => {
    montar();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.queryByRole('region', { name: textos.paineis.camadas.titulo })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: textos.ferramentas.rotulo })).toBeNull();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('region', { name: textos.paineis.camadas.titulo })).toBeDefined();
  });

  it('Tab com o foco num botão de painel continua sendo navegação', () => {
    montar();
    const botao = screen.getByRole('button', { name: textos.topo.paineis });
    botao.focus();
    fireEvent.keyDown(botao, { key: 'Tab' });
    expect(screen.getByRole('region', { name: textos.paineis.camadas.titulo })).toBeDefined();
  });

  it('o botão Painéis faz o mesmo pelo teclado, e diz se está ligado', () => {
    montar();
    const botao = screen.getByRole('button', { name: textos.topo.paineis });
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('region', { name: textos.paineis.otto.titulo })).toBeNull();
  });
});

describe('casca do editor: sem WebGL', () => {
  it('avisa em vez de abrir lento: não cria o motor nem busca a peça', () => {
    const { criarMotor, abrirPeca, tela } = montar({ webgl: false });

    expect(screen.getByRole('alert').textContent).toContain(textos.avisos.semWebGL.titulo);
    expect(tela.container.querySelector('canvas')).toBeNull();
    expect(criarMotor).not.toHaveBeenCalled();
    expect(abrirPeca).not.toHaveBeenCalled();
  });
});

describe('casca do editor: abrir a peça', () => {
  it('peça aberta: o nome vai para o topo e as pranchetas chegam ao motor', async () => {
    const { motor, abrirPeca } = montar({ abrir: aberta });

    await waitFor(() => expect(motor.definirDocumento).toHaveBeenCalled());

    expect(abrirPeca).toHaveBeenCalledWith('a1');
    expect(screen.getByRole('banner').textContent).toContain('Lançamento Crové');
    expect(motor.definirDocumento).toHaveBeenLastCalledWith(
      expect.objectContaining({ pranchetas: [expect.objectContaining({ nome: 'Feed', largura: 1080 }), expect.objectContaining({ nome: 'Story' })] }),
    );
  });

  it('peça que não existe: diz isso e oferece voltar para Peças', async () => {
    montar({ abrir: { estado: 'nao_encontrada' } });

    expect(await screen.findByText(textos.canvas.naoEncontrada)).toBeDefined();
    expect(screen.getByRole('link', { name: textos.canvas.voltarParaPecas }).getAttribute('href')).toBe('/editor');
  });

  it('falha ao abrir: avisa, e "Tentar de novo" busca outra vez', async () => {
    let tentativas = 0;
    const { abrirPeca } = montar({ abrir: async () => (++tentativas === 1 ? { estado: 'erro', codigo: 'erro' } : aberta) });

    expect(await screen.findByText(textos.canvas.naoAbriu)).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.canvas.tentarDeNovo })));

    await waitFor(() => expect(screen.getByRole('banner').textContent).toContain('Lançamento Crové'));
    expect(abrirPeca).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(textos.canvas.naoAbriu)).toBeNull();
  });
});

describe('casca do editor: gesto vira operação', () => {
  const camada = EXEMPLO.pranchetas[0]?.filhos.at(-1);
  const caixaDaCamada = camada && caixaDe(camada);
  if (!camada || !caixaDaCamada) throw new Error('o documento de exemplo precisa de camada com caixa');
  const caixa = caixaDaCamada;

  /** Arrasta a camada do topo 40 unidades para a direita, pela câmera que o motor recebeu. */
  async function arrastar(motor: MotorDeRender, tela: { container: HTMLElement }) {
    await waitFor(() => expect(motor.definirDocumento).toHaveBeenCalled());
    const camera = vi.mocked(motor.definirCamera).mock.lastCall?.[0];
    if (!camera) throw new Error('o motor não recebeu câmera');
    const area = tela.container.querySelector('[data-area-do-canvas]') as HTMLElement;
    const de = paraTela(camera, { x: caixa.x + 4, y: caixa.y + 4 });
    const ate = paraTela(camera, { x: caixa.x + 44, y: caixa.y + 4 });
    await act(async () => {
      fireEvent(area, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: de.x, clientY: de.y }));
      fireEvent(area, new MouseEvent('pointermove', { bubbles: true, clientX: ate.x, clientY: ate.y }));
      // a prévia sai no quadro seguinte ao movimento
      await new Promise((ok) => requestAnimationFrame(ok));
      fireEvent(area, new MouseEvent('pointerup', { bubbles: true, clientX: ate.x, clientY: ate.y }));
    });
  }

  it('arrastar e soltar envia UM lote "mover", e o motor recebe o documento novo antes de a prévia encerrar', async () => {
    const { motor, tela, lotes } = montar({ abrir: aberta, lotes: {} });
    await arrastar(motor, tela);

    expect(lotes?.enviar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls[0]?.[0]).toMatchObject({ versaoBase: 3, operacoes: [{ op: 'mover', alvo: camada.id, x: caixa.x + 40, y: caixa.y }] });

    const documentos = vi.mocked(motor.definirDocumento).mock.invocationCallOrder;
    const fimDaPrevia = vi.mocked(motor.definirPrevia).mock.invocationCallOrder.at(-1) ?? 0;
    expect(vi.mocked(motor.definirPrevia)).toHaveBeenLastCalledWith(null);
    expect(documentos.at(-1)).toBeLessThan(fimDaPrevia);
  });

  it('sem ter para onde enviar, a peça abre só para leitura: o clique seleciona, o arraste não move', async () => {
    const { motor, tela } = montar({ abrir: aberta });
    await arrastar(motor, tela);

    expect(motor.definirDocumento).toHaveBeenCalledTimes(1);
    expect(motor.definirPrevia).not.toHaveBeenCalledWith(expect.objectContaining({ ids: [camada.id] }));
  });
});

describe('casca do editor: a sessão ligada à API', () => {
  const camada = EXEMPLO.pranchetas[0]?.filhos.at(-1);
  const caixaDaCamada = camada && caixaDe(camada);
  if (!camada || !caixaDaCamada) throw new Error('o documento de exemplo precisa de camada com caixa');
  const caixa = caixaDaCamada;

  async function abrirESelecionar(opcoes: Parameters<typeof montar>[0] = {}) {
    const m = montar({ abrir: aberta, lotes: {}, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('treeitem', { name: new RegExp(`^${camada?.nome}`) }));
    return m;
  }
  const enviados = (lotes: Lotes | undefined) => vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls.map((c) => c[0]);

  it('os painéis mostram a peça aberta: camadas na árvore e propriedades da seleção', async () => {
    await abrirESelecionar();
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(5);
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).value).toBe(String(caixa.x));
  });

  it('seta move a camada selecionada e grava um lote; Shift+seta move 10', async () => {
    const { lotes } = await abrirESelecionar();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    });

    await waitFor(() => expect(enviados(lotes)).toHaveLength(2));
    expect(enviados(lotes)[0]).toMatchObject({ versaoBase: 3, operacoes: [{ op: 'mover', alvo: camada.id, x: caixa.x + 1, y: caixa.y }] });
    expect(enviados(lotes)[1]).toMatchObject({ versaoBase: 4, operacoes: [{ op: 'mover', alvo: camada.id, x: caixa.x + 1, y: caixa.y + 10 }] });
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).value).toBe(String(caixa.x + 1));
  });

  it('Delete remove a camada selecionada, e a seleção some', async () => {
    const { lotes } = await abrirESelecionar();
    await act(async () => fireEvent.keyDown(window, { key: 'Delete' }));

    expect(enviados(lotes)[0]?.operacoes).toEqual([{ op: 'remover', alvo: camada.id }]);
    expect(screen.queryByRole('treeitem', { name: new RegExp(`^${camada.nome}`) })).toBeNull();
    expect(screen.getByText(textos.paineis.propriedades.vazio)).toBeDefined();
  });

  it('o topo diz o estado do salvamento', async () => {
    let confirmar: (r: Awaited<ReturnType<Lotes['enviar']>>) => void = () => {};
    const enviar = vi.fn<Lotes['enviar']>(() => new Promise((ok) => (confirmar = ok)));
    await abrirESelecionar({ lotes: { enviar } });
    const estado = () => within(screen.getByRole('banner')).getByRole('status').textContent;
    expect(estado()).toBe(textos.topo.salvamento.salvo);

    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(estado()).toBe(textos.topo.salvamento.salvando);

    await act(async () => confirmar({ tipo: 'confirmado', versao: 4 }));
    expect(estado()).toBe(textos.topo.salvamento.salvo);
  });

  it('Ctrl+Z pede desfazer à API com a versão atual e adota a árvore que volta; Ctrl+Shift+Z refaz', async () => {
    const desfazer = vi.fn<Lotes['desfazer']>(async () => ({
      ok: true,
      versao: 4,
      doc: { ...EXEMPLO, pranchetas: EXEMPLO.pranchetas.slice(0, 1) },
      historico: { podeDesfazer: true, podeRefazer: true },
    }));
    const refazer = vi.fn<Lotes['refazer']>(async () => ({ ok: true, versao: 5, doc: EXEMPLO, historico: { podeDesfazer: true, podeRefazer: false } }));
    const { motor } = await abrirESelecionar({ lotes: { desfazer, refazer } });

    await act(async () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true }));
    expect(desfazer).toHaveBeenCalledWith(3);
    expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0].pranchetas).toHaveLength(1);

    await act(async () => fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true }));
    expect(refazer).toHaveBeenCalledWith(4);
    expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0].pranchetas).toHaveLength(2);
  });

  it('os botões Desfazer e Refazer fazem o mesmo; sem o que desfazer, a tela diz', async () => {
    const { lotes } = await abrirESelecionar();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.topo.desfazer })));

    expect(lotes?.desfazer).toHaveBeenCalledWith(3);
    expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('nada_para_desfazer'));
  });

  it('Desfazer e Refazer ficam desligados quando a API diz que não há o que fazer, e Ctrl+Z nem chama', async () => {
    const semHistorico: ResultadoDeAbrir = { estado: 'aberta', peca: { ...aberta.peca, historico: { podeDesfazer: false, podeRefazer: false } } };
    const { lotes } = await abrirESelecionar({ abrir: semHistorico });
    expect(screen.getByRole('button', { name: textos.topo.desfazer })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: textos.topo.refazer })).toHaveProperty('disabled', true);

    await act(async () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true }));
    expect(lotes?.desfazer).not.toHaveBeenCalled();
  });

  it('o lote confirmado liga o Desfazer; desfazer tudo o desliga e liga o Refazer', async () => {
    const semHistorico: ResultadoDeAbrir = { estado: 'aberta', peca: { ...aberta.peca, historico: { podeDesfazer: false, podeRefazer: false } } };
    const enviar = vi.fn<Lotes['enviar']>(async (lote) => ({ tipo: 'confirmado', versao: lote.versaoBase + 1, historico: { podeDesfazer: true, podeRefazer: false } }));
    const desfazer = vi.fn<Lotes['desfazer']>(async () => ({ ok: true, versao: 5, doc: EXEMPLO, historico: { podeDesfazer: false, podeRefazer: true } }));
    await abrirESelecionar({ abrir: semHistorico, lotes: { enviar, desfazer } });
    const botao = (nome: string) => screen.getByRole('button', { name: nome });

    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    await waitFor(() => expect(botao(textos.topo.desfazer)).toHaveProperty('disabled', false));
    expect(botao(textos.topo.refazer)).toHaveProperty('disabled', true);

    await act(async () => fireEvent.click(botao(textos.topo.desfazer)));
    expect(botao(textos.topo.desfazer)).toHaveProperty('disabled', true);
    expect(botao(textos.topo.refazer)).toHaveProperty('disabled', false);
  });

  it('lote recusado pela API: a camada volta ao lugar e a tela diz a frase dela, não o erro cru', async () => {
    const enviar = vi.fn<Lotes['enviar']>(async () => ({ tipo: 'recusado', codigo: 'lote_invalido', detalhe: { mensagem: 'texto escrito para o agente' } }));
    await abrirESelecionar({ lotes: { enviar } });
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('lote_invalido')));
    expect(screen.getByRole('alert').textContent).not.toContain('texto escrito para o agente');
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).value).toBe(String(caixa.x));
  });

  it('catálogo desatualizado (o Otto foi atualizado com a peça aberta): a edição trava e a tela pede para recarregar, sem sumir', async () => {
    const enviar = vi.fn<Lotes['enviar']>(async () => ({ tipo: 'recusado', codigo: 'catalogo_desatualizado', detalhe: { catalogoDoServidor: 3 } }));
    await abrirESelecionar({ lotes: { enviar } });
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));

    const faixa = await screen.findByRole('alert');
    expect(faixa.textContent).toContain(textos.avisos.catalogoDesatualizado);
    expect(within(faixa).getByRole('button', { name: textos.avisos.recarregar })).toBeDefined();
    // a alteração recusada voltou, e nenhuma outra sai: todas seriam recusadas do mesmo jeito
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).value).toBe(String(caixa.x));
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(textos.topo.salvamento.leitura)).toBeDefined();
  });

  it('peça alterada em outra aba: recarrega a versão atual e avisa', async () => {
    const enviar = vi.fn<Lotes['enviar']>(async () => ({ tipo: 'versao_desatualizada', versaoAtual: 9 }));
    const { abrirPeca } = await abrirESelecionar({ lotes: { enviar } });
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('versao_desatualizada')));
    expect(abrirPeca).toHaveBeenCalledTimes(2);
  });

  it('sem conexão: avisa, trava a edição e o lote parado continua na fila', async () => {
    const enviar = vi.fn<Lotes['enviar']>(async () => ({ tipo: 'sem_conexao' }));
    await abrirESelecionar({ lotes: { enviar } });
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));

    await waitFor(() => expect(screen.getByText(erros.doCodigo('sem_conexao'))).toBeDefined());
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).disabled).toBe(true);
    // a conexão voltou: o mesmo lote é reenviado
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[1]?.[0].id).toBe(enviar.mock.calls[0]?.[0].id);
  });

  it('o que o canvas não mostrou aparece no topo, com a contagem', async () => {
    await abrirESelecionar();
    act(() => avisarFalta?.({ fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Título'] }], imagens: [] }));
    const aviso = await screen.findByText(textos.topo.avisosDoRender(1));
    fireEvent.click(aviso);
    expect(screen.getByText(textos.render.fonte('Didot', 700, 'Feed/Título'))).toBeDefined();
  });

  it('fonte que não carregou: uma faixa diz qual, e "Tentar de novo" pede os recursos outra vez', async () => {
    const { motor } = await abrirESelecionar();
    const antes = vi.mocked(motor.prepararRecursos).mock.calls.length;
    act(() => avisarFalta?.({ fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Título'] }], imagens: [] }));

    expect(screen.getByText(textos.avisos.fonteEmFalta('Didot 700'))).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.avisos.tentarFonteDeNovo })));
    expect(vi.mocked(motor.prepararRecursos).mock.calls.length).toBe(antes + 1);

    act(() => avisarFalta?.({ fontes: [], imagens: [] }));
    expect(screen.queryByText(textos.avisos.fonteEmFalta('Didot 700'))).toBeNull();
  });

  // Achado pelos testes de navegador: a API caiu por alguns segundos bem na hora de buscar uma imagem,
  // e a camada ficou cinza para sempre, mesmo com a API de volta. Só recarregar a página resolvia.
  it('imagem (ou fonte) que não chegou é pedida de novo sozinha, algumas vezes, e para quando chega', async () => {
    const { motor } = await abrirESelecionar();
    vi.useFakeTimers();
    try {
      const pedidos = () => vi.mocked(motor.prepararRecursos).mock.calls.length;
      const antes = pedidos();
      act(() => avisarFalta?.({ fontes: [], imagens: [{ arquivo: 'b'.repeat(64), camadas: ['Feed/Foto'] }] }));
      expect(pedidos()).toBe(antes);

      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(pedidos()).toBe(antes + 1);
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect(pedidos()).toBe(antes + 2);

      // chegou: não pede mais
      act(() => avisarFalta?.({ fontes: [], imagens: [] }));
      await act(async () => vi.advanceTimersByTimeAsync(120_000));
      expect(pedidos()).toBe(antes + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('se o recurso não chega nunca, as tentativas automáticas param: não fica pedindo para sempre', async () => {
    const { motor } = await abrirESelecionar();
    vi.useFakeTimers();
    try {
      const antes = vi.mocked(motor.prepararRecursos).mock.calls.length;
      act(() => avisarFalta?.({ fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Título'] }], imagens: [] }));
      await act(async () => vi.advanceTimersByTimeAsync(600_000));
      expect(vi.mocked(motor.prepararRecursos).mock.calls.length).toBe(antes + 4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Ctrl+J duplica a camada selecionada e seleciona a cópia', async () => {
    const { lotes } = await abrirESelecionar();
    await act(async () => fireEvent.keyDown(window, { key: 'j', ctrlKey: true }));

    // um `duplicar` só; o nome da cópia é o catálogo que dá
    expect(enviados(lotes)[0]?.operacoes).toEqual([{ op: 'duplicar', alvo: camada.id, dx: 0, dy: 0 }]);
    expect(screen.getByRole('treeitem', { name: new RegExp(`^${camada.nome} cópia`) }).getAttribute('aria-selected')).toBe('true');
  });

  it('Enter com uma camada de texto selecionada abre a edição do texto no canvas; confirmar grava um lote', async () => {
    const texto = EXEMPLO.pranchetas[0]?.filhos.filter((n) => n.tipo === 'texto').at(-1);
    if (texto?.tipo !== 'texto') throw new Error('falta o texto');
    const { lotes, motor } = montar({ abrir: aberta, lotes: {} });
    await waitFor(() => expect(motor.definirDocumento).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('treeitem', { name: new RegExp(`^${texto.nome},`) }));
    (document.activeElement as HTMLElement | null)?.blur();

    await act(async () => fireEvent.keyDown(window, { key: 'Enter' }));
    const campo = screen.getByRole('textbox', { name: textos.canvas.editarTexto(texto.nome) });
    fireEvent.change(campo, { target: { value: 'Texto novo' } });
    await act(async () => fireEvent.keyDown(campo, { key: 'Enter', ctrlKey: true }));

    expect(enviados(lotes)[0]?.operacoes).toEqual([{ op: 'alterar', alvo: texto.id, props: { conteudo: 'Texto novo' } }]);
    expect(screen.queryByRole('textbox', { name: textos.canvas.editarTexto(texto.nome) })).toBeNull();
  });

  it('Ctrl+G agrupa a seleção e seleciona o grupo; Ctrl+Shift+G desagrupa', async () => {
    const { lotes } = await abrirESelecionar();
    await act(async () => fireEvent.keyDown(window, { key: 'g', ctrlKey: true }));
    expect(enviados(lotes)[0]?.operacoes).toEqual([{ op: 'agrupar', alvos: [camada.id], nome: textos.camadas.grupoNovo(1) }]);
    const grupo = screen.getByRole('treeitem', { name: new RegExp(`^${textos.camadas.grupoNovo(1)},`) });
    expect(grupo.getAttribute('aria-selected')).toBe('true');

    await act(async () => fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true }));
    await waitFor(() => expect(enviados(lotes)[1]?.operacoes[0]).toMatchObject({ op: 'desagrupar' }));
    expect(screen.getByRole('treeitem', { name: new RegExp(`^${camada.nome}`) }).getAttribute('aria-selected')).toBe('true');
  });

  it('o nome da peça se troca no topo: Enter manda à API e o topo mostra o nome que ela guardou', async () => {
    const renomear = vi.fn(async (_id: string, nome: string) => ({ ok: true as const, nome }));
    await abrirESelecionar({ renomear });
    fireEvent.click(screen.getByRole('button', { name: textos.topo.renomear('Lançamento Crové') }));
    const campo = screen.getByRole('textbox', { name: textos.topo.nomeDaPeca });
    fireEvent.change(campo, { target: { value: 'Crové de verão' } });
    await act(async () => fireEvent.keyDown(campo, { key: 'Enter' }));

    expect(renomear).toHaveBeenCalledWith('a1', 'Crové de verão');
    expect(screen.getByRole('banner').textContent).toContain('Crové de verão');
  });
});

describe('casca do editor: enviar imagem e SVG', () => {
  const escolher = async (arquivos: File[]) => {
    await act(async () => fireEvent.change(screen.getByLabelText(textos.ferramentas.inserir), { target: { files: arquivos } }));
  };
  const abrir = async (opcoes: Parameters<typeof montar>[0] = {}) => {
    const m = montar({ abrir: aberta, lotes: {}, arquivos: {}, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    return m;
  };
  const enviados = (lotes: Lotes | undefined) => vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls.map((c) => c[0]);
  const png = (nome = 'produto.png', tamanho = 8) => new File([new Uint8Array(tamanho)], nome, { type: 'image/png' });

  it('escolher uma imagem pelo botão envia o arquivo e cria a camada por `criarNo`, já selecionada', async () => {
    const { lotes, fonte } = await abrir();
    await escolher([png()]);

    expect(fonte.arquivos?.enviarImagem).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(enviados(lotes)).toHaveLength(1));
    expect(enviados(lotes)[0]?.operacoes[0]).toMatchObject({ op: 'criarNo', no: { tipo: 'imagem', nome: 'produto', arquivo: 'b'.repeat(64), larguraOriginal: 2000 } });
    expect(screen.getByRole('treeitem', { name: /^produto/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('enquanto envia, a tela diz o que está enviando', async () => {
    let terminar: (r: { ok: true; arquivo: { sha256: string; largura: number; altura: number } }) => void = () => {};
    const enviarImagem = vi.fn(() => new Promise<{ ok: true; arquivo: { sha256: string; largura: number; altura: number } }>((ok) => (terminar = ok)));
    await abrir({ arquivos: { enviarImagem } });
    await escolher([png('grande.png')]);
    expect(screen.getByText(textos.envio.enviando('grande.png'))).toBeDefined();

    await act(async () => terminar({ ok: true, arquivo: { sha256: 'c'.repeat(64), largura: 10, altura: 10 } }));
    expect(screen.queryByText(textos.envio.enviando('grande.png'))).toBeNull();
  });

  it('arquivo que não é imagem nem SVG é recusado aqui, sem enviar', async () => {
    const { fonte, lotes } = await abrir();
    await escolher([new File(['x'], 'briefing.pdf', { type: 'application/pdf' })]);

    expect(fonte.arquivos?.enviarImagem).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(textos.envio.tipoNaoAceito('briefing.pdf'));
    expect(enviados(lotes)).toHaveLength(0);
  });

  it('recusa da API vira a frase da tela, com o nome do arquivo e o limite', async () => {
    const enviarImagem = vi.fn(async () => ({ ok: false as const, codigo: 'arquivo_grande_demais', detalhe: { limiteEmBytes: 25 * 1024 * 1024 } }));
    await abrir({ arquivos: { enviarImagem } });
    await escolher([png('enorme.png')]);
    expect(screen.getByRole('alert').textContent).toContain(textos.envio.grandeDemais('enorme.png', 25));
  });

  it('SVG vira camada de vetor, e os avisos do importador aparecem em linguagem de tela', async () => {
    const no = {
      tipo: 'vetor' as const,
      moldura: [200, 100] as [number, number],
      caminhos: [{ d: 'M0 0C1 1 2 2 3 3Z', preenchimento: '#000000', regra: 'nao-zero' as const }],
      origem: { arquivo: 'd'.repeat(64), nome: 'logo.svg' },
    };
    const importarSvg = vi.fn(async () => ({ ok: true as const, no, avisos: ['texto não convertido em curva (1)'] }));
    const { lotes } = await abrir({ arquivos: { importarSvg } });
    await escolher([new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })]);

    await waitFor(() => expect(enviados(lotes)).toHaveLength(1));
    expect(enviados(lotes)[0]?.operacoes[0]).toMatchObject({ op: 'criarNo', no: { tipo: 'vetor', nome: 'logo' } });
    expect(screen.getByRole('status', { name: textos.envio.nota }).textContent).toContain(textos.envio.importadoComAvisos('logo.svg', 'texto não convertido em curva (1)'));
  });

  it('trocar a imagem de uma camada de foto manda o arquivo e altera só o arquivo da camada', async () => {
    const { lotes } = await abrir();
    fireEvent.click(screen.getByRole('treeitem', { name: /^Foto/ }));
    await act(async () => fireEvent.change(screen.getByLabelText(textos.propriedades.trocarImagem), { target: { files: [png('outra.png')] } }));

    await waitFor(() => expect(enviados(lotes)).toHaveLength(1));
    expect(enviados(lotes)[0]?.operacoes).toEqual([{ op: 'alterar', alvo: expect.any(String), props: { arquivo: 'b'.repeat(64), larguraOriginal: 2000, alturaOriginal: 1000 } }]);
  });

  it('peça só para leitura não tem o botão de inserir ligado', async () => {
    const m = montar({ abrir: aberta, arquivos: {} });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    expect((screen.getByLabelText(textos.ferramentas.inserir) as HTMLInputElement).disabled).toBe(true);
  });
});

describe('casca do editor: banco de imagens', () => {
  const abrir = async (opcoes: Parameters<typeof montar>[0] = {}) => {
    const m = montar({ abrir: aberta, lotes: {}, arquivos: {}, imagens: {}, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    return m;
  };
  const enviados = (lotes: Lotes | undefined) => vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls.map((c) => c[0]);
  const botao = () => within(screen.getByRole('toolbar', { name: textos.ferramentas.rotulo })).getByRole('button', { name: textosDeImagens.abrir }) as HTMLButtonElement;

  it('"buscar imagem" abre a busca; a imagem escolhida vira camada por `criarNo`, com banco, autor e licença no nó, e fica selecionada', async () => {
    const { lotes, fonte } = await abrir();
    fireEvent.click(botao());
    const dialogo = screen.getByRole('dialog', { name: textosDeImagens.titulo });
    fireEvent.change(within(dialogo).getByRole('searchbox', { name: textosDeImagens.campo }), { target: { value: 'padaria' } });
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: textosDeImagens.buscar })));
    // a origem está à vista nos resultados
    expect(dialogo.querySelector('[data-origem-das-imagens]')?.textContent).toContain('Banco de Teste');
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: textosDeImagens.trazerEsta('Fulana') })));

    expect(fonte.imagens?.trazer).toHaveBeenCalledWith({ banco: 'banco-de-teste', id: '42' });
    await waitFor(() => expect(enviados(lotes)).toHaveLength(1));
    expect(enviados(lotes)[0]?.operacoes[0]).toMatchObject({
      op: 'criarNo',
      no: { tipo: 'imagem', nome: 'pão quente', arquivo: 'c'.repeat(64), larguraOriginal: 853, alturaOriginal: 1280, origem: { ...ORIGEM, url: '' } },
    });
    // nenhum endereço do banco entra no documento
    expect(JSON.stringify(enviados(lotes)[0])).not.toContain('exemplo.test');
    expect(screen.getByRole('treeitem', { name: /^pão quente/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('fechar a busca tira o diálogo da tela', async () => {
    await abrir();
    fireEvent.click(botao());
    fireEvent.click(within(screen.getByRole('dialog', { name: textosDeImagens.titulo })).getByRole('button', { name: textosDeImagens.fechar }));
    expect(screen.queryByRole('dialog', { name: textosDeImagens.titulo })).toBeNull();
  });

  it('peça só para leitura não busca imagem; sem banco de imagens (a bancada), o botão não existe', async () => {
    const m = montar({ abrir: aberta, arquivos: {}, imagens: {} });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    expect(botao().disabled).toBe(true);
    cleanup();
    const semBanco = montar({ abrir: aberta, lotes: {}, arquivos: {} });
    await waitFor(() => expect(semBanco.motor.definirDocumento).toHaveBeenCalled());
    expect(within(screen.getByRole('toolbar', { name: textos.ferramentas.rotulo })).queryByRole('button', { name: textosDeImagens.abrir })).toBeNull();
  });
});

describe('casca do editor: texturas', () => {
  const abrir = async (opcoes: Parameters<typeof montar>[0] = {}) => {
    const m = montar({ abrir: aberta, lotes: {}, arquivos: {}, texturas: {}, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    return m;
  };
  const enviados = (lotes: Lotes | undefined) => vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls.map((c) => c[0]);
  const botao = () => within(screen.getByRole('toolbar', { name: textos.ferramentas.rotulo })).getByRole('button', { name: textosDeTexturas.abrir }) as HTMLButtonElement;

  it('"texturas" lista as texturas com o modo e a opacidade de costume; usar uma cria a camada por `criarNo`, cobrindo a prancheta', async () => {
    const { lotes, fonte } = await abrir();
    fireEvent.click(botao());
    const dialogo = screen.getByRole('dialog', { name: textosDeTexturas.titulo });
    const itens = await within(dialogo).findAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toContain('papel de algodão com fibras');
    expect(itens[0]?.textContent).toContain(textosDeTexturas.comoEntra(textos.mesclagem.multiplicacao, 60));

    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: textosDeTexturas.usarEsta('papel') })));
    expect(fonte.texturas?.trazer).toHaveBeenCalledWith('papel');
    await waitFor(() => expect(enviados(lotes)).toHaveLength(1));
    const prancheta = EXEMPLO.pranchetas[0];
    expect(enviados(lotes)[0]?.operacoes[0]).toMatchObject({
      op: 'criarNo',
      no: { tipo: 'imagem', nome: 'papel', arquivo: 'd'.repeat(64), x: 0, y: 0, largura: prancheta?.largura, altura: prancheta?.altura, modoDeMesclagem: 'multiplicacao', opacidade: 0.6 },
    });
    expect(screen.getByRole('treeitem', { name: /^papel/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('as texturas não carregaram: o diálogo diz o erro (não "nenhuma textura"); a que não veio diz que não veio', async () => {
    await abrir({ texturas: { listar: vi.fn(async () => undefined) } });
    fireEvent.click(botao());
    expect(await within(screen.getByRole('dialog', { name: textosDeTexturas.titulo })).findByRole('alert')).toBeDefined();
    cleanup();
    const { lotes } = await abrir({ texturas: { trazer: vi.fn(async () => ({ ok: false as const, codigo: 'nao_encontrado' })) } });
    fireEvent.click(botao());
    const dialogo = screen.getByRole('dialog', { name: textosDeTexturas.titulo });
    const usar = await within(dialogo).findByRole('button', { name: textosDeTexturas.usarEsta('papel') });
    await act(async () => fireEvent.click(usar));
    expect(within(dialogo).getByRole('alert').textContent).toBe(textosDeTexturas.naoVeio('papel'));
    expect(enviados(lotes)).toHaveLength(0);
  });

  it('peça só para leitura não põe textura; sem a biblioteca de texturas (a bancada), o botão não existe', async () => {
    const m = montar({ abrir: aberta, arquivos: {}, texturas: {} });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    expect(botao().disabled).toBe(true);
    cleanup();
    const sem = montar({ abrir: aberta, lotes: {}, arquivos: {} });
    await waitFor(() => expect(sem.motor.definirDocumento).toHaveBeenCalled());
    expect(within(screen.getByRole('toolbar', { name: textos.ferramentas.rotulo })).queryByRole('button', { name: textosDeTexturas.abrir })).toBeNull();
  });
});

describe('casca do editor: exportar', () => {
  const camada = EXEMPLO.pranchetas[0]?.filhos.at(-1);
  const exportarDoTopo = () => screen.getByRole('button', { name: textos.topo.exportar });
  async function abrir(opcoes: Parameters<typeof montar>[0] = {}) {
    const m = montar({ abrir: aberta, lotes: {}, exportacoes: {}, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    return m;
  }

  /** O botão só liga quando o relatório chega. */
  async function clicarEmExportarPsd() {
    const botao = await screen.findByRole('button', { name: textosDeExportar.botao.pacote });
    await waitFor(() => expect(botao).toHaveProperty('disabled', false));
    await act(async () => fireEvent.click(botao));
  }

  it('sem ter por onde exportar (a bancada), o botão Exportar fica desligado', async () => {
    const m = montar({ abrir: aberta, lotes: {} });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    expect(exportarDoTopo()).toHaveProperty('disabled', true);
  });

  it('Exportar abre o diálogo com o relatório da peça', async () => {
    const { fonte } = await abrir();
    expect(exportarDoTopo()).toHaveProperty('disabled', false);
    fireEvent.click(exportarDoTopo());

    expect(await screen.findByRole('dialog', { name: textosDeExportar.daPeca('Lançamento Crové') })).toBeDefined();
    await waitFor(() => expect(fonte.exportacoes?.relatorio).toHaveBeenCalledWith({ formato: 'psd', arquivos: 'por-prancheta', pacote: true }));
  });

  it('ao abrir a peça, a exportação que estava em curso é retomada: o topo mostra o andamento sem ninguém pedir de novo', async () => {
    const emCurso: Exportacao = { ...EXPORTACAO, estado: 'rodando', progresso: { pranchetasProntas: 1, pranchetasNoTotal: 2 } };
    const { fonte } = await abrir({ exportacoes: { listar: vi.fn(async () => [emCurso]), consultar: vi.fn(async () => ({ ok: true as const, exportacao: emCurso })) } });

    expect(await screen.findByRole('button', { name: textosDeExportar.topo.andando(1, 2) })).toBeDefined();
    expect(fonte.exportacoes?.pedir).not.toHaveBeenCalled();
  });

  it('exportação recente já terminada não vira aviso no topo ao abrir a peça: fica na lista de recentes do diálogo', async () => {
    const pronta: Exportacao = { ...EXPORTACAO, estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } };
    const { fonte } = await abrir({ exportacoes: { listar: vi.fn(async () => [pronta]) } });
    await waitFor(() => expect(fonte.exportacoes?.listar).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: textosDeExportar.topo.pronto })).toBeNull();
  });

  it('fechar o diálogo devolve o foco a quem o abriu', async () => {
    await abrir();
    exportarDoTopo().focus();
    fireEvent.click(exportarDoTopo());
    // o diálogo modal leva o foco para dentro dele
    const fechar = await screen.findByRole('button', { name: textosDeExportar.fechar });
    fechar.focus();
    fireEvent.click(fechar);
    expect(document.activeElement).toBe(exportarDoTopo());
  });

  it('se quem abriu o diálogo não existe mais (o aviso do topo sumiu), o foco vai para o botão Exportar', async () => {
    const pronta: Exportacao = { ...EXPORTACAO, estado: 'pronta', progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 } };
    await abrir({ exportacoes: { pedir: vi.fn(async () => ({ ok: true as const, exportacao: pronta })) } });
    fireEvent.click(exportarDoTopo());
    await clicarEmExportarPsd();
    fireEvent.click(screen.getByRole('button', { name: textosDeExportar.fechar }));

    const aviso = await screen.findByRole('button', { name: textosDeExportar.topo.pronto });
    aviso.focus();
    fireEvent.click(aviso);
    // nova exportação limpa o estado: o aviso do topo deixa de existir
    const outra = await screen.findByRole('button', { name: textosDeExportar.resultado.outra });
    outra.focus();
    fireEvent.click(outra);
    const fechar = screen.getByRole('button', { name: textosDeExportar.fechar });
    fechar.focus();
    fireEvent.click(fechar);
    expect(document.activeElement).toBe(exportarDoTopo());
  });

  it('com o diálogo aberto, os atalhos do editor não mexem na peça que está atrás', async () => {
    const { lotes } = await abrir();
    fireEvent.click(screen.getByRole('treeitem', { name: new RegExp(`^${camada?.nome}`) }));
    fireEvent.click(exportarDoTopo());
    const dialogo = await screen.findByRole('dialog');

    await act(async () => fireEvent.keyDown(dialogo, { key: 'Delete' }));
    await act(async () => fireEvent.keyDown(dialogo, { key: 'ArrowRight' }));
    expect(lotes?.enviar).not.toHaveBeenCalled();
  });

  it('fechar o diálogo não interrompe: o topo diz o andamento e reabre a exportação', async () => {
    await abrir();
    fireEvent.click(exportarDoTopo());
    await clicarEmExportarPsd();
    fireEvent.click(screen.getByRole('button', { name: textosDeExportar.fechar }));
    expect(screen.queryByRole('dialog')).toBeNull();

    const andamento = await screen.findByRole('button', { name: textosDeExportar.topo.andando(0, 2) });
    fireEvent.click(andamento);
    expect(await screen.findByRole('status', { name: textosDeExportar.andamento.titulo })).toBeDefined();
  });

  it('exportação pronta com o diálogo fechado: o topo avisa, e o aviso leva aos arquivos', async () => {
    const pronta: Exportacao = {
      ...EXPORTACAO,
      estado: 'pronta',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [{ indice: 0, nome: 'Peça - Feed.psd', tipo: 'x', bytes: 2048, baixar: '/api/exportacoes/e1/arquivos/0' }],
    };
    let liberar: (() => void) | undefined;
    const pedir = vi.fn(() => new Promise<{ ok: true; exportacao: Exportacao }>((ok) => (liberar = () => ok({ ok: true, exportacao: pronta }))));
    await abrir({ exportacoes: { pedir } });
    fireEvent.click(exportarDoTopo());
    await clicarEmExportarPsd();
    fireEvent.click(screen.getByRole('button', { name: textosDeExportar.fechar }));

    await act(async () => liberar?.());
    fireEvent.click(await screen.findByRole('button', { name: textosDeExportar.topo.pronto }));
    expect(screen.getByRole('link', { name: textosDeExportar.resultado.baixarArquivo('Peça - Feed.psd') }).getAttribute('href')).toBe('/api/exportacoes/e1/arquivos/0');
  });
});

describe('casca do editor: a tarefa do Otto', () => {
  const camada = EXEMPLO.pranchetas[0]?.filhos.at(-1);
  if (!camada) throw new Error('falta a camada');
  const viva = (tarefa: Tarefa) => vi.fn(async () => ({ itens: [tarefa], viva: tarefa.id }));
  const emRevisao: Tarefa = { ...TAREFA, estado: 'em_revisao', fim: 'entregue', lotes: 2, tocados: [camada.id], resumo: 'Banner pronto.', conferida: true };
  const enviados = (lotes: Lotes | undefined) => vi.mocked(lotes?.enviar as Lotes['enviar']).mock.calls.map((c) => c[0]);

  async function abrir(tarefas: Parameters<typeof tarefasDeMentira>[0] = {}, opcoes: Parameters<typeof montar>[0] = {}) {
    const m = montar({ abrir: aberta, lotes: {}, tarefas, ...opcoes });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    return m;
  }
  const painel = () => screen.getByRole('region', { name: textosDoOtto.titulo });

  it('sem ter por onde pedir (a bancada), o painel do Otto diz o que vai aparecer ali', async () => {
    const m = montar({ abrir: aberta, lotes: {} });
    await waitFor(() => expect(m.motor.definirDocumento).toHaveBeenCalled());
    expect(screen.getByText(textos.paineis.otto.vazio)).toBeDefined();
  });

  it('peça sem tarefa: o painel mostra o campo de pedir, e a edição continua livre', async () => {
    const { lotes } = await abrir();
    expect(await within(painel()).findByRole('textbox', { name: textosDoOtto.pedir.campo })).toBeDefined();
    fireEvent.click(screen.getByRole('treeitem', { name: new RegExp(`^${camada.nome}`) }));
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(enviados(lotes)).toHaveLength(1);
  });

  it('abrir a peça com o Otto trabalhando: mostra as etapas, a peça fica só para leitura e o motivo aparece', async () => {
    const { lotes } = await abrir({ daPeca: viva(TAREFA) });
    expect(await within(painel()).findByRole('list', { name: textosDoOtto.espera.etapas })).toBeDefined();
    expect(screen.getByText(textosDoOtto.trava.trabalhando)).toBeDefined();
    expect(screen.getByText(textos.topo.salvamento.leitura)).toBeDefined();

    fireEvent.click(screen.getByRole('treeitem', { name: new RegExp(`^${camada.nome}`) }));
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(enviados(lotes)).toHaveLength(0);
    // o aviso da edição recusada diz o motivo de verdade, não "aberta só para leitura"
    expect(screen.getByRole('alert').textContent).toContain(textosDoOtto.trava.trabalhando);
  });

  it('a cada lote do Otto o editor relê a peça e o canvas a mostra; ao terminar, vira revisão', async () => {
    let entregar: ((e: EventoDoFluxo) => void) | undefined;
    let terminar: ((fim: 'fim') => void) | undefined;
    const fluxo = vi.fn((_id: string, _de: number, aoReceber: (e: EventoDoFluxo) => void) => {
      entregar = aoReceber;
      return new Promise<'fim' | 'caiu'>((seguir) => (terminar = seguir));
    });
    // a segunda leitura traz a peça como o Otto a deixou
    const depoisDoLote: typeof EXEMPLO = { ...EXEMPLO, pranchetas: EXEMPLO.pranchetas.map((p, i) => (i === 0 ? { ...p, nome: 'Banner do Otto' } : p)) };
    let leituras = 0;
    const releitura = async () => (++leituras === 1 ? aberta : { ...aberta, peca: { ...aberta.peca, versao: aberta.peca.versao + 1, arvore: depoisDoLote } });
    const { abrirPeca, motor } = await abrir({ daPeca: viva(TAREFA), fluxo }, { abrir: releitura });
    await waitFor(() => expect(entregar).toBeDefined());
    const aberturas = abrirPeca.mock.calls.length;

    const lote: EventoDaTarefa = { tipo: 'lote', loteId: 'l1', descricao: 'Banner', tocados: [camada.id], operacoes: [] };
    await act(async () => entregar?.({ id: 0, evento: 'lote', dados: lote }));
    await waitFor(() => expect(abrirPeca.mock.calls.length).toBe(aberturas + 1));
    await waitFor(() => expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0]).toBe(depoisDoLote));

    await act(async () => {
      entregar?.({ evento: 'tarefa', dados: emRevisao });
      terminar?.('fim');
    });
    expect(await within(painel()).findByRole('button', { name: textosDoOtto.revisao.aceitar })).toBeDefined();
    expect(screen.getByText(textosDoOtto.trava.emRevisao)).toBeDefined();
  });

  it('em revisão: as camadas do Otto ganham a marca no painel de Camadas, Ctrl+Z não desmonta o conjunto, e "aceitar e editar" libera a edição', async () => {
    const aceitar = vi.fn(async () => ({ ok: true as const, tarefa: { ...emRevisao, estado: 'aceita' as const } }));
    const { lotes } = await abrir({ daPeca: viva(emRevisao), aceitar });
    const linha = await screen.findByRole('treeitem', { name: new RegExp(`^${camada.nome}`) });
    await waitFor(() => expect(within(linha).getByRole('img', { name: textosDoOtto.revisao.legenda })).toBeDefined());

    await act(async () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true }));
    expect(lotes?.desfazer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(textosDoOtto.trava.desfazerEmRevisao);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: textosDoOtto.trava.aceitarEEditar })));
    expect(aceitar).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(textosDoOtto.trava.emRevisao)).toBeNull());
    fireEvent.click(linha);
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(enviados(lotes)).toHaveLength(1);
    expect(within(linha).queryByRole('img', { name: textosDoOtto.revisao.legenda })).toBeNull();
  });

  it('desfazer tudo: o editor adota a peça que a API devolveu', async () => {
    const semUma = { ...EXEMPLO, pranchetas: EXEMPLO.pranchetas.slice(0, 1) };
    const desfazer = vi.fn(async () => ({ ok: true as const, tarefa: { ...emRevisao, estado: 'desfeita' as const }, versao: 9, arvore: semUma }));
    const { motor } = await abrir({ daPeca: viva(emRevisao), desfazer });
    await act(async () => fireEvent.click(await within(painel()).findByRole('button', { name: textosDoOtto.revisao.desfazer })));
    await waitFor(() => expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0].pranchetas).toHaveLength(1));
  });

  it('segurar "ver o antes" mostra no canvas a peça de antes da tarefa, com o selo; soltar volta', async () => {
    const semUma = { ...EXEMPLO, pranchetas: EXEMPLO.pranchetas.slice(0, 1) };
    const { motor } = await abrir({ daPeca: viva(emRevisao), antes: vi.fn(async () => ({ versao: 3, arvore: semUma })) });
    const botao = await within(painel()).findByRole('button', { name: textosDoOtto.revisao.verOAntes });

    await act(async () => fireEvent.pointerDown(botao));
    await waitFor(() => expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0]).toBe(semUma));
    expect(screen.getByText(textosDoOtto.revisao.seloDoAntes)).toBeDefined();

    await act(async () => fireEvent.pointerUp(botao));
    expect(vi.mocked(motor.definirDocumento).mock.lastCall?.[0]).toBe(EXEMPLO);
    expect(screen.queryByText(textosDoOtto.revisao.seloDoAntes)).toBeNull();
  });

  it('o título da aba diz o estado da tarefa para quem saiu', async () => {
    await abrir({
      daPeca: viva({ ...TAREFA, estado: 'aguardando_confirmacao', confirmacao: { cartao: null, plano: { resumo: '', criar: [], alterar: [], remover: [], pontual: false }, motivos: [] } }),
    });
    await waitFor(() => expect(document.title).toBe(textosDoOtto.aba.aguardando('Lançamento Crové')));
    cleanup();

    await abrir({ daPeca: viva(emRevisao) });
    await waitFor(() => expect(document.title).toBe(textosDoOtto.aba.pronto('Lançamento Crové')));
  });

  it('nada no painel fala de modelo, token ou custo', async () => {
    await abrir({ daPeca: viva(emRevisao) });
    await within(painel()).findByRole('button', { name: textosDoOtto.revisao.aceitar });
    expect(painel().textContent).not.toMatch(/token|modelo|custo|US\$|R\$|\bIA\b/i);
  });
});
