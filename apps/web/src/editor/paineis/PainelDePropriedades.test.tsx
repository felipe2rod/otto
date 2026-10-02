// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fontes as textosDeFontes } from '../../textos/briefing';
import { editor as textos } from '../../textos/editor';
import { ambienteDeTeste, documentoDeTeste } from './apoioDeTeste';
import { PainelDePropriedades } from './PainelDePropriedades';

afterEach(cleanup);
const p = textos.propriedades;

const doc = () =>
  documentoDeTeste([
    { op: 'definirToken', nome: 'primaria', valor: '#0f3b2c' },
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Selo', forma: 'retangulo', x: 100, y: 200, largura: 300, altura: 150, preenchimento: '#ff5b1f', raio: 8 } },
    {
      op: 'criarNo',
      prancheta: 'Feed',
      no: { tipo: 'texto', nome: 'Título', conteudo: 'Olá', fonte: 'Anton', peso: 400, tamanho: 96, x: 90, y: 840, largura: 900, altura: 200, cor: 'token:primaria' },
    },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'imagem', nome: 'Foto', arquivo: 'a'.repeat(64), larguraOriginal: 800, alturaOriginal: 600, x: 0, y: 0, largura: 400, altura: 300 } },
    { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Travada', forma: 'elipse', x: 0, y: 0, largura: 50, altura: 50, preenchimento: '#000000', bloqueado: true } },
  ]);

function montar(qual?: 'Selo' | 'Título' | 'Travada' | 'Foto' | 'prancheta' | 'varias', opcoes: Parameters<typeof ambienteDeTeste>[1] = {}) {
  const a = ambienteDeTeste(doc(), opcoes);
  const feed = a.documento.obter()?.pranchetas[0];
  const id = (nome: string) => feed?.filhos.find((n) => n.nome === nome)?.id ?? '';
  if (qual === 'prancheta') a.iface.selecionar({ tipo: 'prancheta', id: feed?.id ?? '' });
  else if (qual === 'varias') a.iface.selecionar({ tipo: 'camadas', ids: [id('Selo'), id('Título')] });
  else if (qual) a.iface.selecionar({ tipo: 'camadas', ids: [id(qual)] });
  render(<PainelDePropriedades />, { wrapper: a.Moldura });
  const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;
  const confirmar = (rotulo: string, valor: string) => {
    fireEvent.change(campo(rotulo), { target: { value: valor } });
    fireEvent.keyDown(campo(rotulo), { key: 'Enter' });
  };
  return { ...a, campo, confirmar, id };
}

describe('painel de propriedades: o que mostra', () => {
  it('sem seleção, pede para selecionar', () => {
    montar();
    expect(screen.getByText(textos.paineis.propriedades.vazio)).toBeDefined();
  });

  it('com uma forma, mostra posição, tamanho, rotação, opacidade, preenchimento e raio', () => {
    const { campo } = montar('Selo');
    expect(campo(p.x).value).toBe('100');
    expect(campo(p.y).value).toBe('200');
    expect(campo(p.largura).value).toBe('300');
    expect(campo(p.altura).value).toBe('150');
    expect(campo(p.opacidade).value).toBe('100');
    expect(campo(p.raio).value).toBe('8');
    expect(campo(p.seletorDeCor(p.preenchimento)).value).toBe('#ff5b1f');
  });

  it('com um texto, mostra conteúdo, fonte, tamanho e a cor resolvida do token', () => {
    const { campo } = montar('Título');
    expect(campo(p.conteudo).value).toBe('Olá');
    expect(campo(p.tamanho).value).toBe('96');
    expect(campo(p.seletorDeCor(p.cor)).value).toBe('#0f3b2c');
    expect((screen.getByLabelText(p.seletorDeToken(p.cor)) as HTMLSelectElement).value).toBe('token:primaria');
  });

  it('peso que a biblioteca não tem: diz o pedido e o que está sendo usado, o mais próximo', async () => {
    const a = montar('Título');
    // Anton só tem 400 na biblioteca de teste
    act(() => void a.ambiente.aplicar({ descricao: 'peso', operacoes: [{ op: 'alterar', alvo: a.id('Título'), props: { peso: 700 } }] }));
    expect(await screen.findByText(p.pesoTrocado(700, 400))).toBeDefined();
    // o peso pedido continua sendo o do campo: é o que está no documento
    expect((screen.getByLabelText(p.peso) as HTMLSelectElement).value).toBe('700');
  });

  it('peso que existe não ganha aviso; fonte que a biblioteca não tem, sim', async () => {
    const a = montar('Título');
    await screen.findByRole('option', { name: 'IBM Plex Sans' });
    expect(screen.queryByText(p.pesoTrocado(400, 400))).toBeNull();
    expect(screen.queryByText(p.fonteForaDaBiblioteca)).toBeNull();

    act(() => void a.ambiente.aplicar({ descricao: 'fonte', operacoes: [{ op: 'alterar', alvo: a.id('Título'), props: { fonte: 'Didot' } }] }));
    expect(await screen.findByText(p.fonteForaDaBiblioteca)).toBeDefined();
  });

  it('fonte do catálogo que ainda não foi baixada: diz que está baixando e só troca a fonte da camada quando ela chega', async () => {
    let chegar: ((ok: boolean) => void) | undefined;
    const a = montar('Título', { trazerFonte: () => new Promise<boolean>((seguir) => (chegar = seguir)) });
    await screen.findByRole('option', { name: 'Bitter' });
    const fonte = screen.getByLabelText(p.fonte) as HTMLSelectElement;
    expect(within(screen.getByRole('group', { name: textosDeFontes.doCatalogo })).getByRole('option', { name: 'Bitter' })).toBeDefined();

    fireEvent.change(fonte, { target: { value: 'Bitter' } });
    expect(a.ambiente.trazerFonte).toHaveBeenCalledWith('Bitter', 400);
    expect(screen.getByText(textosDeFontes.baixando('Bitter'))).toBeDefined();
    expect(a.lotes).toHaveLength(0);

    await act(async () => chegar?.(true));
    expect(a.lotes).toHaveLength(1);
    expect(a.lotes[0]?.operacoes).toEqual([{ op: 'alterar', alvo: a.id('Título'), props: { fonte: 'Bitter' } }]);
    expect(screen.queryByText(textosDeFontes.baixando('Bitter'))).toBeNull();
    // chegou: não é "fora da biblioteca", e os pesos são os dela
    expect(screen.queryByText(p.fonteForaDaBiblioteca)).toBeNull();
    expect([...(screen.getByLabelText(p.peso) as HTMLSelectElement).options].map((o) => o.value)).toEqual(['400', '700']);
  });

  it('fonte do catálogo que não chegou: a camada fica com a fonte que tinha, e a tela diz', async () => {
    const a = montar('Título', { trazerFonte: async () => false });
    await screen.findByRole('option', { name: 'Bitter' });
    await act(async () => fireEvent.change(screen.getByLabelText(p.fonte), { target: { value: 'Bitter' } }));
    expect(a.lotes).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe(textosDeFontes.naoBaixou('Bitter'));
    expect((screen.getByLabelText(p.fonte) as HTMLSelectElement).value).toBe('Anton');
  });

  it('foto de banco de imagens diz de onde veio: banco, autor e licença; a foto do designer não tem essa linha', () => {
    const a = montar('Foto');
    expect(document.querySelector('[data-origem-da-imagem]')).toBeNull();
    const origem = { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', url: '' };
    act(() => void a.ambiente.aplicar({ descricao: 'origem', operacoes: [{ op: 'alterar', alvo: a.id('Foto'), props: { origem } }] }));
    expect(document.querySelector('[data-origem-da-imagem]')?.textContent).toBe(p.origemDaImagem('Banco de Teste', 'Fulana', 'Licença livre'));
  });

  it('com a prancheta, mostra nome e fundo', () => {
    const { campo } = montar('prancheta');
    expect(campo(p.nome).value).toBe('Feed');
    expect(campo(p.seletorDeCor(p.fundo)).value).toBe('#ffffff');
  });

  it('com várias camadas, diz quantas e não mostra campo', () => {
    montar('varias');
    expect(screen.getByText(p.variasCamadas(2))).toBeDefined();
    expect(screen.queryByLabelText(p.x)).toBeNull();
  });

  it('acompanha o documento: mover a camada por fora atualiza o campo', () => {
    const { campo, ambiente, id } = montar('Selo');
    act(() => void ambiente.aplicar({ descricao: 'mover', operacoes: [{ op: 'mover', alvo: id('Selo'), x: 500, y: 200 }] }));
    expect(campo(p.x).value).toBe('500');
  });
});

describe('painel de propriedades: cada confirmação é UM lote do catálogo', () => {
  it('Enter confirma: X vira `alterar` com o número', () => {
    const { confirmar, lotes, id } = montar('Selo');
    confirmar(p.x, '120');
    expect(lotes).toEqual([{ descricao: textos.historico.alterar(p.x, 'Selo'), operacoes: [{ op: 'alterar', alvo: id('Selo'), props: { x: 120 } }] }]);
  });

  it('digitar não manda nada; só Enter ou sair do campo', () => {
    const { campo, lotes } = montar('Selo');
    fireEvent.change(campo(p.y), { target: { value: '25' } });
    fireEvent.change(campo(p.y), { target: { value: '250' } });
    expect(lotes).toHaveLength(0);
    fireEvent.blur(campo(p.y));
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.operacoes[0]).toMatchObject({ props: { y: 250 } });
  });

  it('Esc devolve o valor do documento e não manda nada; valor igual também não', () => {
    const { campo, lotes } = montar('Selo');
    fireEvent.change(campo(p.x), { target: { value: '999' } });
    fireEvent.keyDown(campo(p.x), { key: 'Escape' });
    expect(campo(p.x).value).toBe('100');
    fireEvent.blur(campo(p.x));
    expect(lotes).toHaveLength(0);
  });

  it('aceita vírgula decimal; o que não é número não vira lote', () => {
    const { confirmar, lotes, campo } = montar('Selo');
    confirmar(p.x, '12,5');
    expect(lotes[0]?.operacoes[0]).toMatchObject({ props: { x: 12.5 } });
    confirmar(p.y, 'abc');
    expect(lotes).toHaveLength(1);
    expect(campo(p.y).value).toBe('200');
  });

  it('opacidade vai de porcentagem para fração, presa entre 0 e 1', () => {
    const { confirmar, lotes } = montar('Selo');
    confirmar(p.opacidade, '40');
    confirmar(p.opacidade, '250');
    expect(lotes.map((l) => l.operacoes[0])).toMatchObject([{ props: { opacidade: 0.4 } }, { props: { opacidade: 1 } }]);
  });

  it('texto: conteúdo, tamanho, alinhamento e caixa alta', () => {
    const { campo, confirmar, lotes } = montar('Título');
    fireEvent.change(campo(p.conteudo), { target: { value: 'Nova linha' } });
    fireEvent.blur(campo(p.conteudo));
    confirmar(p.tamanho, '120');
    fireEvent.click(screen.getByRole('button', { name: p.alinhamentos.centro }));
    fireEvent.click(screen.getByRole('button', { name: p.caixaAlta }));

    expect(lotes.map((l) => (l.operacoes[0] as { props: unknown }).props)).toEqual([{ conteudo: 'Nova linha' }, { tamanho: 120 }, { alinhamento: 'centro' }, { caixaAlta: true }]);
  });

  it('cor: escolher no seletor manda a cor; escolher um token manda a referência', () => {
    const { campo, lotes } = montar('Selo');
    fireEvent.change(campo(p.seletorDeCor(p.preenchimento)), { target: { value: '#00ff00' } });
    fireEvent.change(screen.getByLabelText(p.seletorDeToken(p.preenchimento)), { target: { value: 'token:primaria' } });
    expect(lotes.map((l) => (l.operacoes[0] as { props: unknown }).props)).toEqual([{ preenchimento: '#00ff00' }, { preenchimento: 'token:primaria' }]);
  });

  it('prancheta: nome e fundo viram `alterarPrancheta`', () => {
    const { confirmar, lotes } = montar('prancheta');
    confirmar(p.nome, 'Quadrado');
    expect(lotes[0]?.operacoes[0]).toMatchObject({ op: 'alterarPrancheta', props: { nome: 'Quadrado' } });
  });

  it('camada bloqueada ou peça só para leitura: campos desligados', () => {
    const travada = montar('Travada');
    expect(travada.campo(p.x).disabled).toBe(true);
    expect(screen.getByText(p.bloqueada)).toBeDefined();
    cleanup();
    expect(montar('Selo', { somenteLeitura: true }).campo(p.x).disabled).toBe(true);
  });
});

describe('painel de propriedades: trocar a imagem', () => {
  it('escolher um arquivo no "Trocar imagem" entrega a camada e o arquivo ao editor', () => {
    const { ambiente, id } = montar('Foto');
    const arquivo = new File([new Uint8Array(4)], 'nova.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(p.trocarImagem), { target: { files: [arquivo] } });

    expect(ambiente.trocarImagem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ambiente.trocarImagem).mock.calls[0]?.[0].id).toBe(id('Foto'));
    expect(vi.mocked(ambiente.trocarImagem).mock.calls[0]?.[1]).toBe(arquivo);
  });

  it('mostra as medidas da imagem de origem', () => {
    montar('Foto');
    expect(screen.getByText(p.medidasDaImagem(800, 600))).toBeDefined();
  });
});
