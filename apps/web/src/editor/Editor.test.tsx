// @vitest-environment jsdom

import { caixaDe } from '@otto/documento';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResultadoDeAbrir } from '../api/pecas';
import { editor as textos } from '../textos/editor';
import { erros } from '../textos/erros';
import { montarDocumentoDeExemplo } from './bancada/documentoDeExemplo';
import type { MotorDeRender } from './canvas/motor';
import { Editor } from './Editor';
import type { FonteDaPeca } from './fonteDaPeca';
import { paraTela } from './nucleo/camera';
import { SENTINELA_DO_EDITOR } from './sentinela';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});
afterEach(cleanup);

const EXEMPLO = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });

function motorFalso(): MotorDeRender {
  return {
    redimensionar: vi.fn(),
    definirDocumento: vi.fn(),
    definirPrevia: vi.fn(),
    definirCamera: vi.fn(),
    prepararRecursos: vi.fn(async () => undefined),
    medidor: { tinta: () => ({ x: 0, y: 0, w: 0, h: 0 }) },
    emFalta: { fontes: [], imagens: [] },
    contadores: { composicoesDePrancheta: 0, partes: 0, quadros: 0 },
    renderizarReferencia: vi.fn(),
    aoPerderContexto: vi.fn(),
    destruir: vi.fn(),
  };
}

type Lotes = NonNullable<FonteDaPeca['lotes']>;

function montar(opcoes: { abrir?: ResultadoDeAbrir | (() => Promise<ResultadoDeAbrir>); webgl?: boolean; lotes?: Partial<Lotes>; motor?: Partial<MotorDeRender> } = {}) {
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
  };
  const tela = render(<Editor pecaId="a1" fonte={fonte} criarMotor={criarMotor} temWebGL={() => opcoes.webgl ?? true} />);
  return { motor, criarMotor, abrirPeca, lotes, tela };
}

const aberta: ResultadoDeAbrir = {
  estado: 'aberta',
  peca: { id: 'a1', nome: 'Lançamento Crové', versao: 3, arvore: EXEMPLO },
};

describe('casca do editor: disposição', () => {
  it('tem ferramentas e Otto de um lado, Propriedades e Camadas do outro, e o canvas no meio', async () => {
    const { criarMotor } = montar();
    await waitFor(() => expect(criarMotor).toHaveBeenCalled());

    const ferramentas = screen.getByRole('toolbar', { name: textos.ferramentas.rotulo });
    expect(within(ferramentas).getAllByRole('button')).toHaveLength(3);
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
    const desfazer = vi.fn<Lotes['desfazer']>(async () => ({ ok: true, versao: 4, doc: { ...EXEMPLO, pranchetas: EXEMPLO.pranchetas.slice(0, 1) } }));
    const refazer = vi.fn<Lotes['refazer']>(async () => ({ ok: true, versao: 5, doc: EXEMPLO }));
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

  it('lote recusado pela API: a camada volta ao lugar e a tela diz a frase dela, não o erro cru', async () => {
    const enviar = vi.fn<Lotes['enviar']>(async () => ({ tipo: 'recusado', codigo: 'lote_invalido', detalhe: { mensagem: 'texto escrito para o agente' } }));
    await abrirESelecionar({ lotes: { enviar } });
    await act(async () => fireEvent.keyDown(window, { key: 'ArrowRight' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('lote_invalido')));
    expect(screen.getByRole('alert').textContent).not.toContain('texto escrito para o agente');
    expect((screen.getByLabelText(textos.propriedades.x) as HTMLInputElement).value).toBe(String(caixa.x));
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
    await abrirESelecionar({ motor: { emFalta: { fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Título'] }], imagens: [] } } });
    const aviso = await screen.findByText(textos.topo.avisosDoRender(1));
    fireEvent.click(aviso);
    expect(screen.getByText(textos.render.fonte('Didot', 700, 'Feed/Título'))).toBeDefined();
  });
});
