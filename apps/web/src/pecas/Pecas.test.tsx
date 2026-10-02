// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiDePecas, PecaDaLista, ResultadoDaLista } from '../api/pecas';
import { erros } from '../textos/erros';
import { pecas as textos } from '../textos/pecas';
import { Pecas } from './Pecas';

afterEach(cleanup);
const AGORA = '2026-10-01T12:00:00.000Z';
const peca = (id: string, nome: string, extra: Partial<PecaDaLista> = {}): PecaDaLista => ({ id, nome, formatos: 2, alteradoEm: '2026-09-29T12:00:00.000Z', ...extra });

const ID_DA_MARCA = '0199a000-0000-7000-8000-00000000000a';
const MARCAS = [
  { id: ID_DA_MARCA, nome: 'Café Aurora', criadaEm: AGORA, alteradaEm: AGORA },
  { id: '0199a000-0000-7000-8000-00000000000b', nome: 'Padaria Sol', criadaEm: AGORA, alteradaEm: AGORA },
];

function montar(inicial: ResultadoDaLista, api: Partial<ApiDePecas> = {}, opcoes: { marcaId?: string; marcas?: typeof MARCAS | undefined } = {}) {
  const irPara = vi.fn();
  const completa: ApiDePecas = {
    listar: vi.fn(async () => ({ estado: 'ok', pecas: [], proximoCursor: null }) as ResultadoDaLista),
    criar: vi.fn(async () => ({ ok: true as const, peca: peca('nova', 'Sem título', { formatos: 0 }) })),
    renomear: vi.fn(async (_id: string, nome: string) => ({ ok: true as const, nome })),
    duplicar: vi.fn(async (id: string) => ({ ok: true as const, peca: peca(`${id}-copia`, 'Crové (cópia)') })),
    arquivar: vi.fn(async () => ({ ok: true as const })),
    criarComTarefa: vi.fn(),
    abrir: vi.fn(),
    ...api,
  };
  const marcas = vi.fn(async () => ('marcas' in opcoes ? opcoes.marcas : []));
  render(<Pecas inicial={inicial} agora={AGORA} api={completa} irPara={irPara} cadastros={{ marcas }} {...(opcoes.marcaId ? { marcaId: opcoes.marcaId } : {})} />);
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

describe('peças: miniatura e filtro por marca', () => {
  it('peça com miniatura mostra a imagem; sem miniatura (ou se ela não carregar), o contorno do formato, e o cartão continua clicável', () => {
    const endereco = '/api/documentos/a1/miniatura?v=3';
    const { cartao } = montar({ estado: 'ok', pecas: [peca('a1', 'Crové', { miniatura: endereco }), peca('b2', 'Jazz na Praça')], proximoCursor: null });
    const imagem = cartao('Crové').querySelector('img') as HTMLImageElement;
    expect(imagem.getAttribute('src')).toBe(endereco);
    // decorativa: o nome da peça está logo abaixo
    expect(imagem.getAttribute('alt')).toBe('');
    expect(cartao('Jazz').querySelector('img')).toBeNull();
    expect(cartao('Jazz').querySelector('[data-sem-miniatura]')).not.toBeNull();

    fireEvent.error(imagem);
    expect(cartao('Crové').querySelector('img')).toBeNull();
    expect(cartao('Crové').querySelector('[data-sem-miniatura]')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Crové/ }).getAttribute('href')).toBe('/editor/p/a1');
  });

  it('o filtro lista as marcas da conta; escolher uma abre a lista só das peças dela, e "todas" volta', async () => {
    const { irPara } = montar(comDuas, {}, { marcas: MARCAS });
    const filtro = (await screen.findByRole('combobox', { name: textos.filtro.rotulo })) as HTMLSelectElement;
    expect([...filtro.options].map((o) => o.textContent)).toEqual([textos.filtro.todas, 'Café Aurora', 'Padaria Sol']);
    fireEvent.change(filtro, { target: { value: ID_DA_MARCA } });
    expect(irPara).toHaveBeenCalledWith(`/editor?marca=${ID_DA_MARCA}`);
    cleanup();

    const filtrada = montar(comDuas, {}, { marcas: MARCAS, marcaId: ID_DA_MARCA });
    const escolhido = (await screen.findByRole('combobox', { name: textos.filtro.rotulo })) as HTMLSelectElement;
    await waitFor(() => expect(escolhido.value).toBe(ID_DA_MARCA));
    fireEvent.change(escolhido, { target: { value: '' } });
    expect(filtrada.irPara).toHaveBeenCalledWith('/editor');
  });

  it('marca sem peça: diz o nome dela e oferece a peça nova da marca, em vez da frase de conta vazia', async () => {
    montar({ estado: 'ok', pecas: [], proximoCursor: null }, {}, { marcas: MARCAS, marcaId: ID_DA_MARCA });
    expect(await screen.findByText(textos.filtro.nenhuma('Café Aurora'))).toBeDefined();
    expect(screen.queryByText(textos.vazio)).toBeNull();
    expect(screen.getByRole('link', { name: textos.filtro.novaPara('Café Aurora') }).getAttribute('href')).toBe(`/editor/novo?marca=${ID_DA_MARCA}`);
  });

  it('com o filtro, "carregar mais" pede a página seguinte da mesma marca', async () => {
    const { api } = montar({ estado: 'ok', pecas: [peca('a1', 'Crové')], proximoCursor: 'abc' }, {}, { marcas: MARCAS, marcaId: ID_DA_MARCA });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.carregarMais })));
    expect(api.listar).toHaveBeenCalledWith('abc', ID_DA_MARCA);
  });

  it('conta sem marca, ou marcas que não carregaram: a lista aparece sem o filtro', async () => {
    montar(comDuas, {}, { marcas: [] });
    await act(async () => undefined);
    expect(screen.queryByRole('combobox', { name: textos.filtro.rotulo })).toBeNull();
    cleanup();
    montar(comDuas, {}, { marcas: undefined });
    await act(async () => undefined);
    expect(screen.queryByRole('combobox', { name: textos.filtro.rotulo })).toBeNull();
    expect(screen.getByRole('link', { name: /Crové/ })).toBeDefined();
  });
});

describe('peças: estados da lista', () => {
  it('sem peça nenhuma, diz isso, não mostra lista e oferece criar a primeira', () => {
    montar({ estado: 'ok', pecas: [], proximoCursor: null });
    expect(screen.getByText(textos.vazio)).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('link', { name: textos.novaPeca }).getAttribute('href')).toBe('/editor/novo');
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

  it('tarefa que parou no meio não aparece como "pronto para revisar": diz que não terminou', () => {
    montar({ estado: 'ok', pecas: [peca('c3', 'Deploy no meio', { tarefa: 'em_revisao', tarefaParou: true })], proximoCursor: null });
    const cartao = screen.getByRole('link', { name: /Deploy/ });
    expect(cartao.textContent).toContain(textos.estadoDaTarefa.naoTerminou);
    expect(cartao.textContent).not.toContain(textos.estadoDaTarefa.em_revisao);
  });

  it('havendo mais páginas, "carregar mais" busca a seguinte e acrescenta', async () => {
    const listar = vi.fn(async () => ({ estado: 'ok', pecas: [peca('c3', 'Terceira')], proximoCursor: null }) as ResultadoDaLista);
    montar({ ...comDuas, proximoCursor: 'cursor-2' } as ResultadoDaLista, { listar });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.carregarMais })));

    expect(listar).toHaveBeenCalledWith('cursor-2', undefined);
    expect(screen.getByRole('link', { name: /Terceira/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: textos.carregarMais })).toBeNull();
  });
});

describe('peças: criar, renomear, duplicar e excluir', () => {
  it('"Nova peça" leva ao formulário de briefing, que é o caminho padrão; nada é criado ao clicar', () => {
    const { api } = montar(comDuas);
    expect(screen.getByRole('link', { name: textos.novaPeca }).getAttribute('href')).toBe('/editor/novo');
    expect(api.criar).not.toHaveBeenCalled();
  });

  it('a peça em branco fica em segundo plano: cria e abre o editor da peça criada', async () => {
    const { api, irPara } = montar(comDuas);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.pecaEmBranco })));
    expect(api.criar).toHaveBeenCalledTimes(1);
    expect(irPara).toHaveBeenCalledWith('/editor/p/nova');
  });

  it('"nova peça com este briefing" abre o formulário com o briefing que gerou a peça', () => {
    const { cartao } = montar(comDuas);
    fireEvent.click(screen.getByText(textos.acoes('Crové')));
    expect(within(cartao('Crové')).getByRole('link', { name: textos.comEsteBriefing }).getAttribute('href')).toBe('/editor/novo?peca=a1');
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
    // os cartões da lista (a tela tem outros links: "Nova peça" e o de cada menu)
    const cartoes = within(screen.getByRole('list', { name: textos.lista })).getAllByRole('listitem');
    expect(cartoes[0]?.textContent).toContain('Crové (cópia)');
    expect(cartoes).toHaveLength(3);
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
