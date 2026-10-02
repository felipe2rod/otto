// @vitest-environment jsdom
// A tela de importar PSD, com a API trocada por mentiras.
import { BYTES_DO_PSD_NO_MAXIMO, type FonteDoPsd, type Importacao } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ApiDeImportacoes } from '../api/importacoes';
import { CAFE, ID_DA_MARCA, QUANDO } from '../marcas/apoioDeTeste';
import { importar as textos } from '../textos/importar';
import { ImportarPsd } from './ImportarPsd';

afterEach(cleanup);

const ID = '0199a000-0000-7000-8000-0000000000d1';
const PECA = '0199a000-0000-7000-8000-0000000000d2';
const FONTES: FonteDoPsd[] = [
  { postScript: 'Anton-Regular', situacao: 'na_biblioteca', familia: 'Anton', peso: 400 },
  { postScript: 'Bitter-Bold', situacao: 'no_catalogo', familia: 'Bitter', peso: 700 },
  { postScript: 'Gotham-Black', situacao: 'em_falta' },
  { postScript: 'IBMPlexSans-Black', situacao: 'em_falta', sugestao: { familia: 'IBM Plex Sans', peso: 700 } },
];
const importacao = (extra: Partial<Importacao> = {}): Importacao => ({
  id: ID,
  estado: 'enviada',
  arquivo: { nome: 'campanha de verão.psd', bytes: 2_500_000, formato: 'psd', largura: 1080, altura: 1350, camadas: 12 },
  fontes: FONTES,
  criadaEm: QUANDO,
  expiraEm: QUANDO,
  ...extra,
});
const CATALOGO = [
  { familia: 'Anton', pesos: [400], naBiblioteca: true },
  { familia: 'IBM Plex Sans', pesos: [300, 400, 700], naBiblioteca: true },
  { familia: 'Bitter', pesos: [400, 700], naBiblioteca: false },
];

function montar(api: Partial<ApiDeImportacoes> = {}, opcoes: { marcas?: (typeof CAFE)[] } = {}) {
  const importacoes = {
    enviar: vi.fn(async () => ({ ok: true as const, importacao: importacao() })),
    pedir: vi.fn(async () => ({ ok: true as const, importacao: importacao({ estado: 'na_fila' }) })),
    consultar: vi.fn(async () => ({ ok: true as const, importacao: importacao({ estado: 'pronta', documentoId: PECA }) })),
    listar: vi.fn(async () => [] as Importacao[] | undefined),
    desistir: vi.fn(async () => ({ ok: true as const })),
    daPeca: vi.fn(async () => undefined),
    ...api,
  };
  const irPara = vi.fn();
  const servicos = { importacoes, cadastros: { marcas: vi.fn(async () => opcoes.marcas ?? []) }, fontes: { catalogo: vi.fn(async () => CATALOGO), trazer: vi.fn() } };
  render(<ImportarPsd servicos={servicos as never} irPara={irPara} esperar={async () => undefined} />);
  return { importacoes: importacoes as unknown as { [K in keyof ApiDeImportacoes]: Mock<ApiDeImportacoes[K]> }, irPara };
}

const psd = (nome = 'campanha de verão.psd', tamanho = 10) => {
  const arquivo = new File([new Uint8Array(10)], nome, { type: '' });
  if (tamanho !== 10) Object.defineProperty(arquivo, 'size', { value: tamanho });
  return arquivo;
};
const escolher = async (arquivo: File) => act(async () => fireEvent.change(screen.getByLabelText(textos.escolher.rotulo), { target: { files: [arquivo] } }));
const fonte = (postScript: string) => screen.getByText(postScript).closest('li') as HTMLElement;
const opcao = (postScript: string, qual: string) => within(fonte(postScript)).getByRole('radio', { name: textos.fontes.opcoes[qual] as string }) as HTMLInputElement;
const botaoDeImportar = () => screen.getByRole('button', { name: textos.acoes.importar }) as HTMLButtonElement;

describe('importar PSD: o arquivo', () => {
  it('o que não é PSD nem PSB, o vazio e o que passa do teto são recusados no navegador, sem enviar', async () => {
    const { importacoes } = montar();
    await escolher(psd('foto.png'));
    expect(screen.getByRole('alert').textContent).toBe(textos.local.naoEPsd('foto.png'));
    await escolher(psd('grande.psd', BYTES_DO_PSD_NO_MAXIMO + 1));
    expect(screen.getByRole('alert').textContent).toBe(textos.local.grandeDemais('grande.psd', textos.tamanho(BYTES_DO_PSD_NO_MAXIMO + 1), textos.tamanho(BYTES_DO_PSD_NO_MAXIMO)));
    await escolher(psd('vazio.psd', 0));
    expect(screen.getByRole('alert').textContent).toBe(textos.local.vazio('vazio.psd'));
    expect(importacoes.enviar).not.toHaveBeenCalled();
  });

  it('soltar o arquivo na zona envia; PSB também é aceito', async () => {
    const { importacoes } = montar();
    const arquivo = psd('painel.PSB');
    await act(async () => fireEvent.drop(document.querySelector('[data-zona-de-soltar]') as Element, { dataTransfer: { files: [arquivo] } }));
    expect(importacoes.enviar).toHaveBeenCalledWith(arquivo);
  });

  it('enviado: mostra o que o arquivo é, e o nome da peça já vem do nome do arquivo, sem a extensão', async () => {
    montar();
    await escolher(psd());
    expect(document.querySelector('[data-nome-do-arquivo]')?.textContent).toBe('campanha de verão.psd');
    expect(screen.getByText(textos.arquivo.resumo('psd', 1080, 1350, 12, textos.tamanho(2_500_000)))).toBeDefined();
    expect((screen.getByRole('textbox', { name: textos.arquivo.nomeDaPeca }) as HTMLInputElement).value).toBe('campanha de verão');
  });

  it('arquivo recusado pelo servidor: diz o motivo com a frase da tela e como converter; a frase do servidor não aparece', async () => {
    montar({ enviar: vi.fn(async () => ({ ok: false as const, codigo: 'psd_recusado', detalhe: { motivo: 'modo-de-cor', mensagem: 'FRASE DO SERVIDOR' } })) });
    await escolher(psd('cmyk.psd'));
    const recusa = screen.getByRole('alert');
    expect(recusa.getAttribute('data-recusa')).toBe('modo-de-cor');
    expect(recusa.textContent).toContain(textos.recusa.titulo('cmyk.psd'));
    expect(recusa.textContent).toContain(textos.recusa.motivos['modo-de-cor']);
    expect(recusa.querySelector('[data-como-converter]')?.textContent).toBe(textos.recusa.comoConverter['modo-de-cor']);
    expect(recusa.textContent).not.toContain('FRASE DO SERVIDOR');
    // a tela continua pronta para outro arquivo
    expect(screen.getByLabelText(textos.escolher.rotulo)).toBeDefined();
  });

  it('motivo de recusa que a tela não conhece cai na frase genérica; limite de importações e conexão que caiu têm frase própria', async () => {
    const m = montar({ enviar: vi.fn(async () => ({ ok: false as const, codigo: 'psd_recusado', detalhe: { motivo: 'motivo-de-amanha', mensagem: 'x' } })) });
    await escolher(psd());
    expect(screen.getByRole('alert').textContent).toContain(textos.recusa.generico);
    m.importacoes.enviar.mockResolvedValueOnce({ ok: false, codigo: 'limite_de_importacoes' } as never);
    await escolher(psd());
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.limite_de_importacoes(5));
    m.importacoes.enviar.mockResolvedValueOnce({ ok: false, codigo: 'sem_conexao' } as never);
    await escolher(psd());
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.sem_conexao);
  });
});

describe('importar PSD: as fontes', () => {
  it('cada fonte do arquivo aparece com a situação dela; a que o Otto tem não pede escolha', async () => {
    montar();
    await escolher(psd());
    const itens = within(screen.getByRole('list', { name: textos.fontes.lista })).getAllByRole('listitem');
    expect(itens.map((i) => i.getAttribute('data-situacao'))).toEqual(['na_biblioteca', 'no_catalogo', 'em_falta', 'em_falta']);
    expect(within(fonte('Anton-Regular')).queryAllByRole('radio')).toHaveLength(0);
    expect(fonte('Anton-Regular').textContent).toContain('Anton');
  });

  it('sem mexer em nada vale o padrão, e ele está marcado na tela: a do catálogo é baixada, a que falta vira imagem', async () => {
    const { importacoes } = montar();
    await escolher(psd());
    expect(opcao('Bitter-Bold', 'baixar').checked).toBe(true);
    expect(opcao('Gotham-Black', 'imagem').checked).toBe(true);
    expect(document.querySelector('[data-resumo-das-fontes]')?.textContent).toBe(textos.fontes.resumo(2, 2));
    await act(async () => fireEvent.click(botaoDeImportar()));
    // o pedido não cita fonte nenhuma: nada foi trocado
    expect(importacoes.pedir).toHaveBeenCalledWith(ID, { nome: 'campanha de verão' });
  });

  it('trocar a fonte que falta: enquanto a fonte nova não é escolhida não dá para importar; escolhida, vai no pedido com o peso mais próximo', async () => {
    const { importacoes } = montar();
    await escolher(psd());
    fireEvent.click(opcao('Gotham-Black', 'substituir'));
    expect(botaoDeImportar().disabled).toBe(true);
    expect(document.querySelector('[data-resumo-das-fontes]')?.textContent).toBe(textos.fontes.faltaEscolher(1));

    fireEvent.change(screen.getByRole('combobox', { name: textos.fontes.trocarPor('Gotham-Black') }), { target: { value: 'Anton' } });
    expect(botaoDeImportar().disabled).toBe(false);
    expect(document.querySelector('[data-resumo-das-fontes]')?.textContent).toBe(textos.fontes.resumo(3, 1));
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect(importacoes.pedir).toHaveBeenCalledWith(ID, { nome: 'campanha de verão', fontes: [{ postScript: 'Gotham-Black', fazer: 'substituir', por: { familia: 'Anton', peso: 400 } }] });
  });

  it('com sugestão do servidor (a mesma família em outro peso), "usar esta" preenche a troca', async () => {
    const { importacoes } = montar();
    await escolher(psd());
    fireEvent.click(opcao('IBMPlexSans-Black', 'substituir'));
    fireEvent.click(within(fonte('IBMPlexSans-Black')).getByRole('button', { name: textos.fontes.usarSugestao }));
    expect((screen.getByRole('combobox', { name: textos.fontes.trocarPor('IBMPlexSans-Black') }) as HTMLSelectElement).value).toBe('IBM Plex Sans');
    expect((screen.getByRole('combobox', { name: textos.fontes.pesoDaTroca('IBMPlexSans-Black') }) as HTMLSelectElement).value).toBe('700');
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect(importacoes.pedir.mock.calls[0]?.[1]).toMatchObject({ fontes: [{ postScript: 'IBMPlexSans-Black', fazer: 'substituir', por: { familia: 'IBM Plex Sans', peso: 700 } }] });
  });

  it('a fonte do catálogo pode virar imagem em vez de ser baixada; o nome e a marca escolhidos vão no pedido', async () => {
    const { importacoes } = montar({}, { marcas: [CAFE] });
    await escolher(psd());
    fireEvent.click(opcao('Bitter-Bold', 'imagem'));
    fireEvent.change(screen.getByRole('textbox', { name: textos.arquivo.nomeDaPeca }), { target: { value: ' Verão 2027 ' } });
    fireEvent.change(await screen.findByRole('combobox', { name: textos.arquivo.marca }), { target: { value: ID_DA_MARCA } });
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect(importacoes.pedir).toHaveBeenCalledWith(ID, { nome: 'Verão 2027', marcaId: ID_DA_MARCA, fontes: [{ postScript: 'Bitter-Bold', fazer: 'imagem' }] });
  });

  it('arquivo sem texto diz que não há o que escolher', async () => {
    montar({ enviar: vi.fn(async () => ({ ok: true as const, importacao: importacao({ fontes: [] }) })) });
    await escolher(psd());
    expect(screen.getByText(textos.fontes.semTexto)).toBeDefined();
    expect(botaoDeImportar().disabled).toBe(false);
  });

  it('nome de fonte e de arquivo é texto de terceiro: marcação dentro dele aparece como texto, não vira elemento', async () => {
    const malicioso = '<img src=x onerror=alert(1)>.psd';
    montar({
      enviar: vi.fn(async () => ({
        ok: true as const,
        importacao: importacao({ arquivo: { ...importacao().arquivo, nome: malicioso }, fontes: [{ postScript: '<b>Fonte</b>', situacao: 'em_falta' }] }),
      })),
    });
    await escolher(psd());
    expect(document.querySelector('[data-nome-do-arquivo]')?.textContent).toBe(malicioso);
    expect(document.querySelector('[data-nome-do-arquivo] img')).toBeNull();
    expect(fonte('<b>Fonte</b>').querySelector('b')).toBeNull();
  });
});

describe('importar PSD: o andamento e o fim', () => {
  it('pedida, a tela acompanha (fila, importando) sem barra de porcentagem, e abre a peça quando fica pronta', async () => {
    const passos: Importacao[] = [importacao({ estado: 'na_fila' }), importacao({ estado: 'rodando' }), importacao({ estado: 'pronta', documentoId: PECA })];
    let soltar: (() => void) | undefined;
    const consultar = vi.fn(async () => {
      if (consultar.mock.calls.length === 2) await new Promise<void>((seguir) => (soltar = seguir));
      return { ok: true as const, importacao: passos[Math.min(consultar.mock.calls.length - 1, 2)] as Importacao };
    });
    const { irPara } = montar({ consultar });
    await escolher(psd());
    await act(async () => fireEvent.click(botaoDeImportar()));
    await waitFor(() => expect(document.querySelector('[data-andamento="na_fila"], [data-andamento="rodando"]')).not.toBeNull());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(irPara).not.toHaveBeenCalled();
    await act(async () => soltar?.());
    await waitFor(() => expect(irPara).toHaveBeenCalledWith(`/editor/p/${PECA}`));
  });

  it('consulta que falha no meio não é falha da importação: a tela continua consultando', async () => {
    let vez = 0;
    const consultar = vi.fn(async () => (++vez === 1 ? { ok: false as const, codigo: 'sem_conexao' } : { ok: true as const, importacao: importacao({ estado: 'pronta', documentoId: PECA }) }));
    const { irPara } = montar({ consultar });
    await escolher(psd());
    await act(async () => fireEvent.click(botaoDeImportar()));
    await waitFor(() => expect(irPara).toHaveBeenCalledWith(`/editor/p/${PECA}`));
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it('a importação falhou: a frase vem do código (ou do motivo da recusa), nunca a mensagem do servidor, e dá para escolher outro arquivo', async () => {
    const falha = (erro: Importacao['erro']) => vi.fn(async () => ({ ok: true as const, importacao: importacao({ estado: 'falhou', erro }) }));
    montar({ consultar: falha({ codigo: 'interrompida', mensagem: 'FRASE DO SERVIDOR' }) });
    await escolher(psd());
    await act(async () => fireEvent.click(botaoDeImportar()));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(textos.falhou.codigos.interrompida);
    expect(alerta.textContent).not.toContain('FRASE DO SERVIDOR');
    fireEvent.click(screen.getByRole('button', { name: textos.recusa.outroArquivo }));
    expect(screen.getByLabelText(textos.escolher.rotulo)).toBeDefined();
    cleanup();

    montar({ consultar: falha({ codigo: 'psd_recusado', motivo: 'profundidade', mensagem: 'x' }) });
    await escolher(psd());
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect((await screen.findByRole('alert')).textContent).toContain(textos.recusa.motivos.profundidade);
    expect(document.querySelector('[data-como-converter]')?.textContent).toBe(textos.recusa.comoConverter.profundidade);
  });

  it('pedido recusado porque a importação mudou de estado em outra aba: a tela diz e mostra como ela está agora', async () => {
    montar({
      pedir: vi.fn(async () => ({ ok: false as const, codigo: 'importacao_fora_do_estado' })),
      consultar: vi.fn(async () => ({ ok: true as const, importacao: importacao({ estado: 'descartada' }) })),
    });
    await escolher(psd());
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect(await screen.findByText(textos.descartada)).toBeDefined();
  });
});

describe('importar PSD: o que ficou para trás', () => {
  const esperando = importacao({ id: '0199a000-0000-7000-8000-0000000000e1', arquivo: { ...importacao().arquivo, nome: 'ontem.psd' } });
  const feita = importacao({ id: '0199a000-0000-7000-8000-0000000000e2', estado: 'pronta', documentoId: PECA, arquivo: { ...importacao().arquivo, nome: 'feita.psd' } });

  it('arquivo enviado e não importado aparece para continuar: abre a tela de fontes dele, sem enviar de novo', async () => {
    const { importacoes } = montar({ listar: vi.fn(async () => [esperando, feita]) });
    const pendentes = await screen.findByRole('list', { name: textos.pendentes.lista });
    expect(within(pendentes).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(within(pendentes).getByRole('button', { name: textos.pendentes.continuar('ontem.psd') }));
    expect(document.querySelector('[data-nome-do-arquivo]')?.textContent).toBe('ontem.psd');
    expect(screen.getByRole('list', { name: textos.fontes.lista })).toBeDefined();
    expect(importacoes.enviar).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(botaoDeImportar()));
    expect(importacoes.pedir).toHaveBeenCalledWith(esperando.id, { nome: 'ontem' });
  });

  it('desistir pede confirmação dizendo o nome do arquivo, e só então apaga', async () => {
    const listar = vi.fn(async () => [esperando] as Importacao[] | undefined);
    const { importacoes } = montar({ listar });
    const pendentes = await screen.findByRole('list', { name: textos.pendentes.lista });
    fireEvent.click(within(pendentes).getByRole('button', { name: textos.pendentes.desistir('ontem.psd') }));
    expect(importacoes.desistir).not.toHaveBeenCalled();
    expect(within(pendentes).getByText(textos.acoes.confirmarDesistir('ontem.psd'))).toBeDefined();
    listar.mockResolvedValue([]);
    await act(async () => fireEvent.click(within(pendentes).getByRole('button', { name: textos.pendentes.desistirCurto })));
    expect(importacoes.desistir).toHaveBeenCalledWith(esperando.id);
    await waitFor(() => expect(screen.queryByRole('list', { name: textos.pendentes.lista })).toBeNull());
  });

  it('importação que ficou em curso é retomada: continuar volta a acompanhar e abre a peça no fim', async () => {
    const rodando = importacao({ id: esperando.id, estado: 'rodando', arquivo: esperando.arquivo });
    const { irPara, importacoes } = montar({ listar: vi.fn(async () => [rodando]) });
    fireEvent.click(await screen.findByRole('button', { name: textos.pendentes.continuar('ontem.psd') }));
    await waitFor(() => expect(irPara).toHaveBeenCalledWith(`/editor/p/${PECA}`));
    expect(importacoes.consultar).toHaveBeenCalledWith(esperando.id);
  });

  it('as importadas há pouco levam à peça; a lista que não carrega não derruba a tela', async () => {
    montar({ listar: vi.fn(async () => [feita]) });
    const recentes = await screen.findByRole('list', { name: textos.recentes.lista });
    expect(
      within(recentes)
        .getByRole('link', { name: textos.recentes.abrir('feita.psd') })
        .getAttribute('href'),
    ).toBe(`/editor/p/${PECA}`);
    cleanup();
    montar({ listar: vi.fn(async () => undefined) });
    await act(async () => undefined);
    expect(screen.getByLabelText(textos.escolher.rotulo)).toBeDefined();
  });

  it('vencido o prazo do arquivo enviado (ou depois de desistir), a tela diz e pede o arquivo de novo', async () => {
    montar({ enviar: vi.fn(async () => ({ ok: true as const, importacao: importacao({ estado: 'descartada' }) })) });
    await escolher(psd());
    expect(screen.getByText(textos.descartada)).toBeDefined();
    expect(screen.getByRole('button', { name: textos.recusa.outroArquivo })).toBeDefined();
  });
});
