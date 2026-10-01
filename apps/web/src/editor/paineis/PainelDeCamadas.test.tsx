// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { editor as textos } from '../../textos/editor';
import { ambienteDeTeste, documentoDeTeste } from './apoioDeTeste';
import { PainelDeCamadas } from './PainelDeCamadas';

afterEach(cleanup);

const forma = (nome: string, extra: Record<string, unknown> = {}) => ({ tipo: 'forma', nome, forma: 'retangulo', x: 0, y: 0, largura: 100, altura: 100, preenchimento: '#ff5b1f', ...extra });
const doc = () =>
  documentoDeTeste([
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Fundo') },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Foto') },
    { op: 'criarNo', prancheta: 'Feed', no: forma('Título') },
    { op: 'agrupar', alvos: ['Feed/Foto', 'Feed/Título'], nome: 'Destaque' },
    { op: 'criarNo', prancheta: 'Story', no: forma('Faixa', { bloqueado: true }) },
  ]);

function montar(opcoes: Parameters<typeof ambienteDeTeste>[1] = {}) {
  const a = ambienteDeTeste(doc(), opcoes);
  render(<PainelDeCamadas />, { wrapper: a.Moldura });
  const linha = (nome: string) => screen.getByRole('treeitem', { name: new RegExp(`^${nome}`) });
  return { ...a, linha, nomes: () => screen.getAllByRole('treeitem').map((l) => l.getAttribute('aria-label')) };
}

describe('painel de camadas: a árvore', () => {
  it('mostra cada prancheta com as camadas de cima para baixo, e o grupo com as filhas dentro', () => {
    const { nomes, linha } = montar();
    expect(nomes()).toEqual(['Feed, prancheta 1080×1350', 'Destaque, grupo', 'Título, forma', 'Foto, forma', 'Fundo, forma', 'Story, prancheta 1080×1920', 'Faixa, forma']);
    expect(linha('Título').getAttribute('aria-level')).toBe('3');
    expect(linha('Fundo').getAttribute('aria-level')).toBe('2');
  });

  it('sem prancheta, diz que não há nenhuma', () => {
    const a = ambienteDeTeste(documentoDeTeste([{ op: 'definirToken', nome: 'x', valor: '#000000' }]));
    render(<PainelDeCamadas />, { wrapper: a.Moldura });
    expect(screen.getByText(textos.paineis.camadas.vazio)).toBeDefined();
  });

  it('recolher o grupo esconde as filhas', () => {
    const { linha, nomes } = montar();
    fireEvent.click(within(linha('Destaque')).getByRole('button', { name: textos.camadas.recolher }));
    expect(nomes()).not.toContain('Título, forma');
    expect(linha('Destaque').getAttribute('aria-expanded')).toBe('false');
  });

  it('com centenas de camadas, só as linhas à vista vão para a página', () => {
    const muitas = documentoDeTeste([
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      ...Array.from({ length: 300 }, (_, i) => ({ op: 'criarNo', prancheta: 'Feed', no: forma(`Camada ${i}`) })),
    ]);
    const a = ambienteDeTeste(muitas);
    render(<PainelDeCamadas />, { wrapper: a.Moldura });

    expect(screen.getAllByRole('treeitem').length).toBeLessThan(120);
    expect(screen.getByRole('tree').getAttribute('aria-label')).toBe(textos.paineis.camadas.titulo);
  });
});

describe('painel de camadas: seleção', () => {
  it('clicar numa camada a seleciona; clicar na prancheta seleciona a prancheta', () => {
    const { linha, iface, documento } = montar();
    fireEvent.click(linha('Fundo'));
    const fundo = documento.obter()?.pranchetas[0]?.filhos[0];
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [fundo?.id] });
    expect(linha('Fundo').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(linha('Story'));
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'prancheta', id: documento.obter()?.pranchetas[1]?.id });
  });

  it('a seleção feita no canvas aparece na árvore', () => {
    const { linha, iface, documento } = montar();
    const fundo = documento.obter()?.pranchetas[0]?.filhos[0];
    act(() => iface.selecionar({ tipo: 'camadas', ids: [fundo?.id ?? ''] }));
    expect(linha('Fundo').getAttribute('aria-selected')).toBe('true');
  });

  it('seta para baixo e para cima andam pela árvore; esquerda recolhe e direita abre o grupo', () => {
    const { linha, iface, documento, nomes } = montar();
    fireEvent.click(linha('Destaque'));
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
    const titulo = documento.obter()?.pranchetas[0]?.filhos.at(-1);
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [titulo?.tipo === 'grupo' ? titulo.filhos.at(-1)?.id : ''] });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowLeft' });
    expect(nomes()).not.toContain('Título, forma');
    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowRight' });
    expect(nomes()).toContain('Título, forma');
  });
});

describe('painel de camadas: toda mudança é operação do catálogo', () => {
  it('ocultar vira `alterar` de visivel, e a linha passa a dizer que está oculta', () => {
    const { linha, lotes } = montar();
    fireEvent.click(within(linha('Fundo')).getByRole('button', { name: textos.camadas.ocultar }));

    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'alterar', props: { visivel: false } });
    expect(within(linha('Fundo')).getByRole('button', { name: textos.camadas.mostrar })).toBeDefined();
  });

  it('bloquear e desbloquear viram `alterar` de bloqueado', () => {
    const { linha, lotes } = montar();
    fireEvent.click(within(linha('Faixa')).getByRole('button', { name: textos.camadas.desbloquear }));
    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'alterar', props: { bloqueado: false } });
  });

  it('duplo clique no nome abre o campo; Enter renomeia, Esc desiste', () => {
    const { linha, lotes } = montar();
    fireEvent.doubleClick(within(linha('Fundo')).getByText('Fundo'));
    const campo = screen.getByRole('textbox', { name: textos.camadas.novoNome('Fundo') });
    fireEvent.change(campo, { target: { value: 'Papel' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'alterar', props: { nome: 'Papel' } });
    expect(linha('Papel')).toBeDefined();

    fireEvent.doubleClick(within(linha('Papel')).getByText('Papel'));
    const outro = screen.getByRole('textbox', { name: textos.camadas.novoNome('Papel') });
    fireEvent.change(outro, { target: { value: 'Outro' } });
    fireEvent.keyDown(outro, { key: 'Escape' });
    expect(lotes).toHaveLength(1);
  });

  it('subir e descer a camada selecionada viram `reordenar`', () => {
    const { linha, lotes } = montar();
    fireEvent.click(linha('Fundo'));
    fireEvent.click(screen.getByRole('button', { name: textos.camadas.paraAFrente }));
    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'reordenar', posicao: 1 });
  });

  it('peça só para leitura: dá para selecionar, não para alterar', () => {
    const { linha, lotes, iface } = montar({ somenteLeitura: true });
    fireEvent.click(linha('Fundo'));
    expect(iface.armazem.obter().selecao).not.toBeNull();
    expect((within(linha('Fundo')).getByRole('button', { name: textos.camadas.ocultar }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(within(linha('Fundo')).getByText('Fundo'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(lotes).toHaveLength(0);
  });
});

describe('painel de camadas: seleção múltipla', () => {
  it('Shift+clique acrescenta a camada à seleção; de novo, tira', () => {
    const { linha, iface } = montar();
    fireEvent.click(linha('Fundo'));
    fireEvent.click(linha('Foto'), { shiftKey: true });
    expect(iface.armazem.obter().selecao?.tipo === 'camadas' && iface.armazem.obter().selecao).toMatchObject({ ids: [expect.any(String), expect.any(String)] });
    expect(linha('Fundo').getAttribute('aria-selected')).toBe('true');
    expect(linha('Foto').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tree').getAttribute('aria-multiselectable')).toBe('true');

    fireEvent.click(linha('Fundo'), { shiftKey: true });
    expect(linha('Fundo').getAttribute('aria-selected')).toBe('false');
  });
  // Visto no navegador: o Shift+clique estendia a seleção de TEXTO da página até a linha, e o
  // arraste seguinte virava arraste nativo de texto, que cancela o ponteiro.
  it('o Shift+clique não seleciona texto da página, o foco vai para a árvore, e não há arraste nativo', () => {
    const { linha } = montar();
    const comShift = fireEvent.mouseDown(linha('Foto'), { shiftKey: true });
    expect(comShift).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('tree'));
    expect(fireEvent.mouseDown(linha('Foto'))).toBe(true);
    expect(fireEvent.dragStart(linha('Foto'))).toBe(false);
  });

  it('no campo de renomear, o Shift+clique continua sendo do texto', () => {
    const { linha } = montar();
    fireEvent.doubleClick(within(linha('Foto')).getByText('Foto'));
    expect(fireEvent.mouseDown(screen.getByRole('textbox'), { shiftKey: true })).toBe(true);
  });
});

describe('painel de camadas: reordenar por arraste', () => {
  // no grupo Destaque: Título em cima, Foto embaixo
  const arrastar = (de: HTMLElement, ate: HTMLElement, clientY: number) => {
    fireEvent.pointerDown(de, { button: 0, clientY: 0 });
    fireEvent.pointerMove(ate, { clientY });
    fireEvent.pointerUp(ate, { clientY });
  };

  it('soltar a camada sobre a metade de baixo da irmã a põe logo abaixo dela', () => {
    const { linha, lotes, nomes } = montar();
    // sem layout no teste, toda linha tem topo 0 e altura 0: qualquer Y positivo é "metade de baixo"
    arrastar(linha('Título'), linha('Foto'), 10);

    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'reordenar', posicao: 0 });
    expect(nomes().slice(1, 4)).toEqual(['Destaque, grupo', 'Foto, forma', 'Título, forma']);
  });

  it('soltar sobre camada de outro nível não faz nada: o catálogo não muda camada de pai', () => {
    const { linha, lotes } = montar();
    arrastar(linha('Título'), linha('Fundo'), 10);
    expect(lotes).toHaveLength(0);
  });

  it('um clique sem mover não reordena, e camada bloqueada ou peça só para leitura não arrasta', () => {
    const { linha, lotes } = montar();
    fireEvent.pointerDown(linha('Título'), { button: 0 });
    fireEvent.pointerUp(linha('Título'));
    expect(lotes).toHaveLength(0);
    cleanup();

    const leitura = montar({ somenteLeitura: true });
    arrastar(leitura.linha('Título'), leitura.linha('Foto'), 10);
    expect(leitura.lotes).toHaveLength(0);
  });
});

describe('painel de camadas: fonte que não carregou', () => {
  it('a camada de texto cuja fonte faltou ganha uma marca com texto, não só cor', () => {
    const { linha } = montar({ faltas: { emFalta: { fontes: [{ familia: 'Didot', peso: 700, camadas: ['Feed/Fundo'] }], imagens: [] }, naoDesenhado: [] } });
    expect(within(linha('Fundo')).getByRole('img', { name: textos.camadas.fonteEmFalta })).toBeDefined();
    expect(within(linha('Foto')).queryByRole('img', { name: textos.camadas.fonteEmFalta })).toBeNull();
  });
});
