// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiDePecas, PecaDaLista, ResultadoDaLista } from '../api/pecas';
import { erros } from '../textos/erros';
import { pecas as textos } from '../textos/pecas';
import { Pecas } from './Pecas';

afterEach(cleanup);
const AGORA = '2026-10-01T12:00:00.000Z';
const peca = (id: string, nome: string, extra: Partial<PecaDaLista> = {}): PecaDaLista => ({ id, nome, formatos: 2, alteradoEm: '2026-09-29T12:00:00.000Z', ...extra });

function montar(inicial: ResultadoDaLista, api: Partial<ApiDePecas> = {}) {
  const irPara = vi.fn();
  const completa: ApiDePecas = {
    listar: vi.fn(async () => ({ estado: 'ok', pecas: [], proximoCursor: null }) as ResultadoDaLista),
    criar: vi.fn(async () => ({ ok: true as const, peca: peca('nova', 'Sem título', { formatos: 0 }) })),
    renomear: vi.fn(async (_id: string, nome: string) => ({ ok: true as const, nome })),
    duplicar: vi.fn(async (id: string) => ({ ok: true as const, peca: peca(`${id}-copia`, 'Crové (cópia)') })),
    arquivar: vi.fn(async () => ({ ok: true as const })),
    abrir: vi.fn(),
    ...api,
  };
  render(<Pecas inicial={inicial} agora={AGORA} api={completa} irPara={irPara} />);
  const cartao = (nome: string) => screen.getByRole('link', { name: new RegExp(nome) }).closest('li') as HTMLElement;
  const acao = async (nome: string, qual: string) => {
    fireEvent.click(screen.getByText(textos.acoes(nome)));
    await act(async () => fireEvent.click(within(cartao(nome)).getByRole('button', { name: qual })));
  };
  return { api: completa, irPara, cartao, acao };
}
/** O botão que confirma a exclusão, na faixa que pergunta (o menu tem outro "Excluir", que só abre a pergunta). */
const confirmar = (nome: string) => within(screen.getByText(textos.confirmarExclusao(nome)).parentElement as HTMLElement).getByRole('button', { name: textos.excluir });
const comDuas: ResultadoDaLista = { estado: 'ok', pecas: [peca('a1', 'Crové'), peca('b2', 'Jazz na Praça', { tarefa: 'em_revisao' })], proximoCursor: null };

describe('peças: estados da lista', () => {
  it('sem peça nenhuma, diz isso, não mostra lista e oferece criar a primeira', () => {
    montar({ estado: 'ok', pecas: [], proximoCursor: null });
    expect(screen.getByText(textos.vazio)).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: textos.novaPeca })).toBeDefined();
  });

  it('quando não carregou, avisa o erro e oferece tentar de novo: nunca a frase de lista vazia', () => {
    montar({ estado: 'erro' });
    expect(screen.getByRole('alert').textContent).toContain(textos.erro);
    expect(screen.getByRole('link', { name: textos.tentarDeNovo }).getAttribute('href')).toBe('/editor');
    expect(screen.queryByText(textos.vazio)).toBeNull();
  });

  it('cada peça é um link para o editor, com nome, formatos e quando foi alterada', () => {
    montar(comDuas);
    const link = screen.getByRole('link', { name: /Crové/ });
    expect(link.getAttribute('href')).toBe('/editor/p/a1');
    expect(link.textContent).toContain(textos.formatos(2));
    expect(link.textContent).toContain(textos.alterada('anteontem'));
  });

  it('peça com tarefa viva mostra o estado com as palavras da tela, não o nome do código', () => {
    montar(comDuas);
    expect(screen.getByRole('link', { name: /Jazz/ }).textContent).toContain(textos.estadoDaTarefa.em_revisao);
    expect(screen.queryByText('em_revisao')).toBeNull();
  });

  it('havendo mais páginas, "carregar mais" busca a seguinte e acrescenta', async () => {
    const listar = vi.fn(async () => ({ estado: 'ok', pecas: [peca('c3', 'Terceira')], proximoCursor: null }) as ResultadoDaLista);
    montar({ ...comDuas, proximoCursor: 'cursor-2' } as ResultadoDaLista, { listar });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.carregarMais })));

    expect(listar).toHaveBeenCalledWith('cursor-2');
    expect(screen.getByRole('link', { name: /Terceira/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: textos.carregarMais })).toBeNull();
  });
});

describe('peças: criar, renomear, duplicar e excluir', () => {
  it('"Nova peça" cria e abre o editor da peça criada', async () => {
    const { api, irPara } = montar(comDuas);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.novaPeca })));
    expect(api.criar).toHaveBeenCalledTimes(1);
    expect(irPara).toHaveBeenCalledWith('/editor/p/nova');
  });

  it('renomear abre o campo com o nome atual; salvar manda o nome novo e o cartão muda', async () => {
    const { api, acao } = montar(comDuas);
    await acao('Crové', textos.renomear);
    const campo = screen.getByRole('textbox', { name: textos.novoNome('Crové') }) as HTMLInputElement;
    expect(campo.value).toBe('Crové');
    fireEvent.change(campo, { target: { value: 'Crové latte' } });
    await act(async () => fireEvent.submit(campo));

    expect(api.renomear).toHaveBeenCalledWith('a1', 'Crové latte');
    expect(screen.getByRole('link', { name: /Crové latte/ })).toBeDefined();
  });

  it('cancelar a renomeação não manda nada; nome vazio ou igual também não', async () => {
    const { api, acao } = montar(comDuas);
    await acao('Crové', textos.renomear);
    fireEvent.click(screen.getByRole('button', { name: textos.cancelar }));
    await acao('Crové', textos.renomear);
    await act(async () => fireEvent.submit(screen.getByRole('textbox', { name: textos.novoNome('Crové') })));
    expect(api.renomear).not.toHaveBeenCalled();
  });

  it('duplicar põe a cópia no começo da lista', async () => {
    const { api, acao } = montar(comDuas);
    await acao('Crové', textos.duplicar);
    expect(api.duplicar).toHaveBeenCalledWith('a1');
    expect(screen.getAllByRole('link')[0]?.textContent).toContain('Crové (cópia)');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('excluir pede confirmação dizendo o nome da peça, e só então tira da lista', async () => {
    const { api, acao, cartao } = montar(comDuas);
    await acao('Crové', textos.excluir);
    expect(api.arquivar).not.toHaveBeenCalled();
    expect(within(cartao('Crové')).getByText(textos.confirmarExclusao('Crové'))).toBeDefined();

    await act(async () => fireEvent.click(confirmar('Crové')));
    expect(api.arquivar).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('link', { name: /Crové/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Jazz/ })).toBeDefined();
  });

  it('ação que falha deixa a lista como estava e diz a frase da tela', async () => {
    const { acao } = montar(comDuas, { arquivar: vi.fn(async () => ({ ok: false as const, codigo: 'erro_interno' })) });
    await acao('Crové', textos.excluir);
    await act(async () => fireEvent.click(confirmar('Crové')));

    expect(screen.getByRole('alert').textContent).toContain(erros.generico);
    expect(screen.getByRole('link', { name: /Crové/ })).toBeDefined();
  });
});
