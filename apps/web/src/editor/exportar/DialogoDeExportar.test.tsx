// @vitest-environment jsdom
import type { Exportacao, RelatorioDeExportacao } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoDoRelatorio } from '../../api/exportacoes';
import { erros } from '../../textos/erros';
import { exportar as textos } from '../../textos/exportar';
import type { EstadoDaPecaAberta } from '../Editor';
import { criarArmazem } from '../nucleo/armazem';
import { ambienteDeTeste, documentoDeTeste } from '../paineis/apoioDeTeste';
import { DialogoDeExportar } from './DialogoDeExportar';
import type { EstadoDoExportador } from './exportador';

afterEach(cleanup);

const doc = () =>
  documentoDeTeste([
    { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
    { op: 'criarPrancheta', nome: 'Story', largura: 1080, altura: 1920, fundo: '#ffffff' },
  ]);

const relatorio: RelatorioDeExportacao = {
  arquivos: [],
  camadas: [
    { prancheta: 'Feed', camada: 'Título', tipo: 'texto', destino: 'nativo-editavel', mapeamento: 'no:texto', observacao: 'no Photoshop…' },
    { prancheta: 'Feed', camada: 'Selo', tipo: 'forma', destino: 'raster-com-aviso', mapeamento: 'filtro-fora-de-foto', observacao: 'no Photoshop…' },
  ],
  tokens: [],
  fontes: [{ familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' }],
  substituicoes: [{ camada: 'Feed / Título', pedida: { familia: 'IBM Plex Sans', peso: 800 }, usada: { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' } }],
  emFalta: { fontes: [], imagens: [] },
  imagens: [{ camada: 'Feed / Foto', banco: 'Banco de exemplo', autor: 'alguém', licenca: 'Licença livre', url: 'https://exemplo.test/foto' }],
  avisos: [{ codigo: 'atualizar-texto', texto: 'Ao abrir, o Photoshop pode avisar…' }],
};

const ID = '0199a000-0000-7000-8000-0000000000e1';
const exportacao = (extra: Partial<Exportacao> = {}): Exportacao => ({
  id: ID,
  documentoId: '0199a000-0000-7000-8000-000000000001',
  versao: 3,
  formato: 'psd',
  estado: 'rodando',
  progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 },
  arquivos: [],
  falhas: [],
  criadaEm: '2026-10-01T12:00:00.000Z',
  ...extra,
});
const PSD = { formato: 'psd', arquivos: 'por-prancheta' } as const;
/** O relatório é sempre pedido como pacote: é assim que vem a lista de fontes que vão e que não vão no .zip. */
const RELATORIO_PSD = { ...PSD, pacote: true } as const;

function montar(opcoes: { respostas?: ResultadoDoRelatorio[]; exportador?: EstadoDoExportador; pendentes?: number; agora?: number; recentes?: Exportacao[]; relatorio?: RelatorioDeExportacao } = {}) {
  const documento = doc();
  const a = ambienteDeTeste(documento);
  const respostas = [...(opcoes.respostas ?? [])];
  const pedirRelatorio = vi.fn(async (_pedido: unknown): Promise<ResultadoDoRelatorio> => respostas.shift() ?? { ok: true, relatorio: opcoes.relatorio ?? relatorio });
  const listar = vi.fn(async () => opcoes.recentes ?? []);
  const armazemDoExportador = criarArmazem<EstadoDoExportador>(opcoes.exportador ?? { fase: 'parado' });
  const exportador = {
    armazem: armazemDoExportador,
    exportar: vi.fn(),
    retomar: vi.fn(),
    tentarDeNovo: vi.fn(),
    tentarAsQueFalharam: vi.fn(),
    limpar: vi.fn(() => armazemDoExportador.definir({ fase: 'parado' })),
  };
  const estado = criarArmazem<EstadoDaPecaAberta>({ salvamento: opcoes.pendentes ? 'salvando' : 'salvo', pendentes: opcoes.pendentes ?? 0, versao: 3, somenteLeitura: false });
  const aoFechar = vi.fn();
  render(
    <DialogoDeExportar
      nomeDaPeca="Café Aurora"
      api={{ relatorio: pedirRelatorio, listar }}
      exportador={exportador}
      estado={estado}
      aoFechar={aoFechar}
      agora={() => opcoes.agora ?? Date.parse('2026-10-01T12:00:10.000Z')}
    />,
    { wrapper: a.Moldura },
  );
  const ids = documento.pranchetas.map((p) => p.id);
  return { pedirRelatorio, listar, exportador, armazemDoExportador, estado, aoFechar, ids };
}
/** O botão principal: o pacote (.zip) com os arquivos, as fontes e o relatório. */
const botaoDeExportar = () => screen.getByRole('button', { name: textos.botao.pacote });
const soArquivos = (sigla: string) => screen.getByRole('button', { name: textos.botao.soArquivos(sigla) });

describe('exportar: o relatório vem antes do botão', () => {
  it('abre montando o relatório, com o botão desligado; o relatório chega e libera o botão', async () => {
    const { pedirRelatorio } = montar();
    expect(screen.getByRole('dialog', { name: textos.daPeca('Café Aurora') })).toBeDefined();
    expect(screen.getByText(textos.relatorio.montando)).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);

    expect(await screen.findByText(textos.relatorio.resumo(1, 1, 1))).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', false);
    // todas as pranchetas: o pedido não cita nenhuma
    expect(pedirRelatorio).toHaveBeenCalledWith(RELATORIO_PSD);
    expect(soArquivos('PSD')).toHaveProperty('disabled', false);
  });

  it('mostra o que vai em pixel com o motivo, as fontes, o peso trocado e a licença das imagens', async () => {
    montar();
    const pixel = await screen.findByRole('region', { name: textos.relatorio.emPixel.titulo(1) });
    expect(within(pixel).getByText('Feed / Selo')).toBeDefined();
    expect(within(pixel).getByText(textos.relatorio.emPixel.motivos['filtro-fora-de-foto'] as string)).toBeDefined();
    expect(within(screen.getByRole('region', { name: textos.relatorio.fontes.titulo(1) })).getByText('IBM Plex Sans Negrito (700)')).toBeDefined();
    expect(within(screen.getByRole('region', { name: textos.relatorio.pesosTrocados.titulo(1) })).getByText('Feed / Título: pedido IBM Plex Sans 800, usando 700')).toBeDefined();
    const imagens = screen.getByRole('region', { name: textos.relatorio.imagens.titulo(1) });
    expect(within(imagens).getByRole('link', { name: textos.relatorio.imagens.pagina }).getAttribute('href')).toBe('https://exemplo.test/foto');
  });

  it('a tela não diz nada sobre o Photoshop nem o Illustrator: nenhum arquivo do Otto foi conferido neles', async () => {
    const vetorial: RelatorioDeExportacao = {
      ...relatorio,
      camadas: [...relatorio.camadas, { prancheta: 'Feed', camada: 'Curvas', tipo: 'ajuste', destino: 'omitido-com-aviso', mapeamento: 'ajuste:curvas', observacao: 'no Illustrator…' }],
      avisos: [
        { codigo: 'instalar-fontes', texto: 'Para editar o texto no Illustrator…' },
        { codigo: 'texto-em-linhas', texto: 'No Illustrator ele não requebra sozinho…' },
        { codigo: 'atualizar-texto', texto: 'Ao abrir, o Photoshop pode avisar…' },
      ],
    };
    montar({ relatorio: vetorial });
    for (const formato of ['psd', 'pdf', 'svg', 'png'] as const) {
      fireEvent.click(screen.getByRole('radio', { name: textos.formato[formato] }));
      await screen.findByText(textos.relatorio.resumo(1, 1, 1, 1));
      expect(document.body.textContent).not.toMatch(/photoshop|illustrator|adobe/i);
    }
  });

  it('relatório que não saiu: diz por que não libera, e tentar de novo busca outra vez', async () => {
    const { pedirRelatorio } = montar({ respostas: [{ ok: false, codigo: 'erro_interno' }] });
    expect(await screen.findByText(textos.relatorio.naoSaiu)).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: textos.relatorio.tentarDeNovo }));
    expect(await screen.findByText(textos.relatorio.resumo(1, 1, 1))).toBeDefined();
    expect(pedirRelatorio).toHaveBeenCalledTimes(2);
  });

  it('com alteração ainda por salvar, espera salvar antes de pedir o relatório: a exportação é da versão do servidor', async () => {
    const { pedirRelatorio, estado } = montar({ pendentes: 1 });
    expect(screen.getByText(textos.relatorio.salvando)).toBeDefined();
    expect(pedirRelatorio).not.toHaveBeenCalled();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);

    act(() => estado.definir({ salvamento: 'salvo', pendentes: 0, versao: 4, somenteLeitura: false }));
    expect(await screen.findByText(textos.relatorio.resumo(1, 1, 1))).toBeDefined();
  });
});

describe('exportar: formato e pranchetas', () => {
  it('trocar para PNG mostra tamanho e fundo, e pede o relatório do PNG', async () => {
    const { pedirRelatorio } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('radio', { name: textos.formato.png }));
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ formato: 'png', escala: 1, semFundo: false, pacote: true }));

    fireEvent.click(screen.getByRole('radio', { name: textos.escala[2] }));
    fireEvent.click(screen.getByRole('checkbox', { name: textos.semFundo }));
    expect(soArquivos('PNG')).toBeDefined();
    // tamanho e fundo não mudam o relatório: não há pedido novo por causa deles
    expect(pedirRelatorio).toHaveBeenCalledTimes(2);
  });

  it('tirar uma prancheta manda só as que ficaram; sem nenhuma, não há o que exportar', async () => {
    const { pedirRelatorio, ids } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('checkbox', { name: textos.pranchetas.item('Story', 1080, 1920) }));
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ ...RELATORIO_PSD, pranchetas: [ids[0]] }));

    fireEvent.click(screen.getByRole('checkbox', { name: textos.pranchetas.item('Feed', 1080, 1350) }));
    expect(screen.getByText(textos.pranchetas.nenhuma)).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);
    expect(pedirRelatorio).toHaveBeenCalledTimes(2);
  });

  it('o botão principal pede o PACOTE do formato escolhido; "só os arquivos" pede sem pacote', async () => {
    const { exportador } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('radio', { name: textos.arquivos.juntas }));
    fireEvent.click(botaoDeExportar());
    expect(exportador.exportar).toHaveBeenLastCalledWith({ formato: 'psd', arquivos: 'juntas', pacote: true });

    fireEvent.click(soArquivos('PSD'));
    expect(exportador.exportar).toHaveBeenLastCalledWith({ formato: 'psd', arquivos: 'juntas' });
  });

  it('SVG: um arquivo por prancheta, sem opções; PDF: por padrão um arquivo com uma página por prancheta', async () => {
    const { pedirRelatorio, exportador } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('radio', { name: textos.formato.svg }));
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ formato: 'svg', pacote: true }));
    expect(screen.queryByRole('radio', { name: textos.arquivos.juntas })).toBeNull();
    await waitFor(() => expect(soArquivos('SVG')).toHaveProperty('disabled', false));
    fireEvent.click(soArquivos('SVG'));
    expect(exportador.exportar).toHaveBeenLastCalledWith({ formato: 'svg' });

    fireEvent.click(screen.getByRole('radio', { name: textos.formato.pdf }));
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ formato: 'pdf', arquivos: 'juntas', pacote: true }));
    expect(screen.getByRole('radio', { name: textos.arquivos.juntasNoPdf })).toHaveProperty('checked', true);
    await waitFor(() => expect(botaoDeExportar()).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('radio', { name: textos.arquivos['por-prancheta'] }));
    fireEvent.click(botaoDeExportar());
    expect(exportador.exportar).toHaveBeenLastCalledWith({ formato: 'pdf', arquivos: 'por-prancheta', pacote: true });
  });
});

describe('exportar: SVG e PDF', () => {
  const vetorial: RelatorioDeExportacao = {
    ...relatorio,
    camadas: [
      { prancheta: 'Feed', camada: 'Título', tipo: 'texto', destino: 'nativo-editavel', mapeamento: 'no:texto' },
      { prancheta: 'Feed', camada: 'Selo', tipo: 'forma', destino: 'raster-com-aviso', mapeamento: 'efeito:sombraInterna' },
      { prancheta: 'Feed', camada: 'Curvas', tipo: 'ajuste', destino: 'omitido-com-aviso', mapeamento: 'ajuste:curvas' },
    ],
    avisos: [{ codigo: 'modo-de-mesclagem-trocado', texto: 'Há camada com modo…' }],
  };

  it('o que fica de fora tem seção própria, antes do que vai como imagem, e diz que a aparência pode mudar', async () => {
    montar({ relatorio: vetorial });
    fireEvent.click(screen.getByRole('radio', { name: textos.formato.svg }));

    // uma camada de fora mais o modo de mesclagem trocado
    const deFora = await screen.findByRole('region', { name: textos.relatorio.deFora.titulo(2) });
    expect(within(deFora).getByText('Feed / Curvas')).toBeDefined();
    expect(within(deFora).getByText(textos.relatorio.deFora.ajuste)).toBeDefined();
    expect(within(deFora).getByText(textos.relatorio.deFora.modoTrocado)).toBeDefined();
    expect(within(deFora).getByText(textos.relatorio.deFora.apoio)).toBeDefined();

    const imagem = screen.getByRole('region', { name: textos.relatorio.emPixel.tituloNoVetor(1) });
    expect(within(imagem).getByText('Feed / Selo')).toBeDefined();
    expect(within(imagem).queryByText('Feed / Curvas')).toBeNull();
    // a seção do que muda a aparência vem antes
    expect(deFora.compareDocumentPosition(imagem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('exportar: pacote', () => {
  const comPacote: RelatorioDeExportacao = {
    ...relatorio,
    pacote: {
      fontes: [
        { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold', licenca: 'SIL Open Font License', incluida: true, arquivo: 'Fontes/IBMPlexSans-Bold.ttf' },
        { familia: 'Didot', peso: 400, postScript: 'Didot', licenca: 'Licença comercial', incluida: false, motivo: 'licenca_nao_permite' },
      ],
    },
  };

  it('a lista de fontes diz quais vão no .zip e quais não, com o motivo', async () => {
    montar({ relatorio: comPacote });
    const fontes = await screen.findByRole('region', { name: textos.relatorio.pacote.titulo(1, 2) });
    expect(within(fontes).getByText('IBM Plex Sans Negrito (700)')).toBeDefined();
    expect(within(fontes).getByText(textos.relatorio.pacote.naoVai('Didot Regular (400)', textos.relatorio.pacote.motivos.licenca_nao_permite('Licença comercial')))).toBeDefined();
    // a seção de fontes do pacote substitui a lista simples
    expect(screen.queryByRole('region', { name: textos.relatorio.fontes.titulo(1) })).toBeNull();
  });

  it('o botão principal diz o que vai no pacote', async () => {
    montar({ relatorio: comPacote });
    await screen.findByRole('region', { name: textos.relatorio.pacote.titulo(1, 2) });
    expect(screen.getByText(textos.botao.oQueVaiNoPacote('PSD', true))).toBeDefined();
  });

  it('pacote pronto: um arquivo só para baixar, o .zip', () => {
    const ids = doc().pranchetas.map((p) => p.id);
    const e = exportacao({
      estado: 'pronta',
      pacote: true,
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [{ indice: 0, nome: 'Café Aurora.zip', tipo: 'application/zip', bytes: 4_900_000, baixar: `/api/exportacoes/${ID}/arquivos/0` }],
      relatorio: comPacote,
      expiraEm: '2026-10-08T12:00:00.000Z',
    });
    montar({ exportador: { fase: 'terminou', pedido: { ...PSD, pacote: true, pranchetas: ids }, exportacao: e, arquivos: e.arquivos } });
    expect(screen.getAllByRole('link', { name: /^Baixar/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: textos.resultado.baixarArquivo('Café Aurora.zip') }).getAttribute('href')).toBe(`/api/exportacoes/${ID}/arquivos/0`);
    expect(screen.getByRole('region', { name: textos.relatorio.pacote.titulo(1, 2) })).toBeDefined();
  });
});

describe('exportar: retomar e recentes', () => {
  const arquivoDe = (id: string, nome: string) => ({ indice: 0, nome, tipo: 'application/pdf', bytes: 2048, baixar: `/api/exportacoes/${id}/arquivos/0` });
  const E2 = '0199a000-0000-7000-8000-0000000000e2';
  const E3 = '0199a000-0000-7000-8000-0000000000e3';
  const E4 = '0199a000-0000-7000-8000-0000000000e4';

  it('mostra as exportações recentes da peça, cada uma com o que é, quando foi e o link para baixar', async () => {
    const recentes = [
      exportacao({ id: E2, formato: 'pdf', pacote: true, estado: 'pronta', arquivos: [arquivoDe(E2, 'Peça.zip')], criadaEm: '2026-10-01T11:00:00.000Z', expiraEm: '2026-10-08T11:00:00.000Z' }),
      exportacao({ id: E3, formato: 'png', estado: 'falhou', erro: { codigo: 'interrompida' }, criadaEm: '2026-10-01T10:00:00.000Z' }),
      exportacao({ id: E4, formato: 'svg', estado: 'pronta', arquivos: [arquivoDe(E4, 'Peça - Feed.svg')], criadaEm: '2026-09-20T10:00:00.000Z', expiraEm: '2026-09-27T10:00:00.000Z' }),
    ];
    montar({ recentes });

    const lista = await screen.findByRole('region', { name: textos.recentes.titulo(3) });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens[0]?.textContent).toContain(textos.recentes.oQueE('PDF', true));
    expect(
      within(itens[0] as HTMLElement)
        .getByRole('link', { name: textos.resultado.baixarArquivo('Peça.zip') })
        .getAttribute('href'),
    ).toBe(`/api/exportacoes/${E2}/arquivos/0`);
    // a que falhou diz que não saiu; a que venceu diz que os arquivos foram apagados, sem link
    expect(itens[1]?.textContent).toContain(textos.recentes.estados.falhou);
    expect(itens[2]?.textContent).toContain(textos.recentes.estados.apagada);
    expect(within(itens[2] as HTMLElement).queryByRole('link')).toBeNull();
  });

  it('sem exportação recente, a seção não aparece', async () => {
    const { listar } = montar();
    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /Exportações recentes/ })).toBeNull();
  });

  it('exportação retomada (o pedido original não é conhecido): mostra a contagem, sem lista por prancheta', () => {
    const e = exportacao({ progresso: { pranchetasProntas: 1, pranchetasNoTotal: 2 } });
    montar({ exportador: { fase: 'andando', pedido: undefined, exportacao: e, arquivos: [] } });
    expect(within(screen.getByRole('status', { name: textos.andamento.titulo })).getByText(textos.andamento.contagem(1, 2))).toBeDefined();
  });

  it('retomada que falhou: diz por quê, e só oferece voltar às opções (não há pedido para repetir)', () => {
    montar({ exportador: { fase: 'falhou', pedido: undefined, codigo: 'interrompida', arquivos: [] } });
    expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('interrompida'));
    expect(screen.queryByRole('button', { name: textos.falha.tentarDeNovo })).toBeNull();
    expect(screen.getByRole('button', { name: textos.falha.voltar })).toBeDefined();
  });
});

describe('exportar: estados novos de falha', () => {
  it('abandonada e interrompida têm frase própria, e dá para tentar de novo', () => {
    for (const codigo of ['abandonada', 'interrompida']) {
      const { exportador } = montar({ exportador: { fase: 'falhou', pedido: PSD, codigo, arquivos: [] } });
      expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo(codigo));
      fireEvent.click(screen.getByRole('button', { name: textos.falha.tentarDeNovo }));
      expect(exportador.tentarDeNovo).toHaveBeenCalled();
      cleanup();
    }
  });
});

describe('exportar: espera longa', () => {
  it('passados alguns segundos, diz que peça pesada demora e mostra o tempo', () => {
    vi.useFakeTimers();
    try {
      const e = exportacao({ progresso: { pranchetasProntas: 0, pranchetasNoTotal: 2 } });
      montar({ exportador: { fase: 'andando', pedido: PSD, exportacao: e, arquivos: [] } });
      expect(screen.queryByText(textos.andamento.demora)).toBeNull();
      act(() => void vi.advanceTimersByTime(12_000));
      expect(screen.getByText(textos.andamento.demora)).toBeDefined();
      expect(screen.getByText(textos.andamento.decorrido(12))).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('exportar: andamento', () => {
  it('mostra cada prancheta com o estado dela, e diz que pode fechar', () => {
    const { ids } = montar({});
    const e = exportacao({
      progresso: { pranchetasProntas: 1, pranchetasNoTotal: 2 },
      arquivos: [{ indice: 0, nome: 'Café Aurora - Feed.psd', tipo: 'x', bytes: 10, pranchetaId: ids[0] as string, baixar: `/api/exportacoes/${ID}/arquivos/0` }],
    });
    cleanup();
    montar({ exportador: { fase: 'andando', pedido: PSD, exportacao: e, arquivos: e.arquivos } });

    const andamento = screen.getByRole('status', { name: textos.andamento.titulo });
    expect(within(andamento).getByText('Feed').parentElement?.textContent).toContain(textos.andamento.estados.pronta);
    expect(within(andamento).getByText('Story').parentElement?.textContent).toContain(textos.andamento.estados.andando);
    expect(screen.getByText(textos.andamento.podeFechar)).toBeDefined();
    // enquanto anda, não há outro pedido para fazer
    expect(screen.queryByRole('button', { name: textos.botao.pacote })).toBeNull();
  });

  it('fechar não mexe na exportação em andamento', () => {
    const { aoFechar, exportador } = montar({ exportador: { fase: 'pedindo', pedido: PSD, arquivos: [] } });
    expect(screen.getByText(textos.andamento.pedindo)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.fechar }));
    expect(aoFechar).toHaveBeenCalled();
    expect(exportador.limpar).not.toHaveBeenCalled();
  });
});

describe('exportar: resultado', () => {
  const arquivo = (indice: number, nome: string, pranchetaId: string) => ({
    indice,
    nome,
    tipo: 'image/vnd.adobe.photoshop',
    bytes: 4_299_405,
    pranchetaId,
    baixar: `/api/exportacoes/${ID}/arquivos/${indice}`,
  });
  const pronta = (ids: string[]) =>
    exportacao({
      estado: 'pronta',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [arquivo(0, 'Café Aurora - Feed.psd', ids[0] as string), arquivo(1, 'Café Aurora - Story.psd', ids[1] as string)],
      relatorio,
      expiraEm: '2026-10-08T12:00:00.000Z',
    });
  const idsDoDoc = () => doc().pranchetas.map((p) => p.id);

  it('cada arquivo é um link comum para o endereço estável de baixar, com nome e tamanho', () => {
    const e = pronta(idsDoDoc());
    montar({ exportador: { fase: 'terminou', pedido: PSD, exportacao: e, arquivos: e.arquivos } });

    const feed = screen.getByRole('link', { name: textos.resultado.baixarArquivo('Café Aurora - Feed.psd') });
    expect(feed.getAttribute('href')).toBe(`/api/exportacoes/${ID}/arquivos/0`);
    expect(screen.getByRole('link', { name: textos.resultado.baixarArquivo('Café Aurora - Story.psd') }).getAttribute('href')).toBe(`/api/exportacoes/${ID}/arquivos/1`);
    expect(screen.getAllByText('4,1 MB')).toHaveLength(2);
    expect(screen.getByText(textos.resultado.daVersao)).toBeDefined();
    // o relatório do que de fato saiu
    expect(screen.getByText(textos.relatorio.resumo(1, 1, 1))).toBeDefined();
  });

  it('nova exportação volta às opções', async () => {
    const e = pronta(idsDoDoc());
    const { exportador } = montar({ exportador: { fase: 'terminou', pedido: PSD, exportacao: e, arquivos: e.arquivos } });
    fireEvent.click(screen.getByRole('button', { name: textos.resultado.outra }));
    expect(exportador.limpar).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: textos.botao.pacote })).toBeDefined();
  });

  it('em parte: diz qual prancheta não exportou, deixa baixar a que saiu e oferece tentar só a que falhou', () => {
    const ids = idsDoDoc();
    const e = exportacao({
      estado: 'pronta_em_parte',
      progresso: { pranchetasProntas: 2, pranchetasNoTotal: 2 },
      arquivos: [arquivo(0, 'Café Aurora - Feed.psd', ids[0] as string)],
      falhas: [{ pranchetaId: ids[1] as string, codigo: 'erro_interno' }],
    });
    const { exportador } = montar({ exportador: { fase: 'terminou', pedido: PSD, exportacao: e, arquivos: e.arquivos } });

    expect(screen.getByText(textos.resultado.emParte(['Story'], ['Feed']))).toBeDefined();
    expect(screen.getByRole('link', { name: textos.resultado.baixarArquivo('Café Aurora - Feed.psd') })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: textos.resultado.tentarAsQueFalharam(['Story']) }));
    expect(exportador.tentarAsQueFalharam).toHaveBeenCalled();
  });

  it('arquivos já apagados (7 dias): não oferece link que vai falhar, pede para exportar de novo', () => {
    const e = pronta(idsDoDoc());
    montar({ exportador: { fase: 'terminou', pedido: PSD, exportacao: e, arquivos: e.arquivos }, agora: Date.parse('2026-10-09T00:00:00.000Z') });
    expect(screen.getByText(textos.resultado.apagados)).toBeDefined();
    expect(screen.queryByRole('link', { name: /Baixar/ })).toBeNull();
    expect(screen.getByRole('button', { name: textos.resultado.outra })).toBeDefined();
  });

  it('a aba ficou aberta e os arquivos venceram: o clique não navega para o erro, a tela passa a dizer que foram apagados', () => {
    const e = pronta(idsDoDoc());
    let relogio = Date.parse('2026-10-02T00:00:00.000Z');
    const documento = doc();
    const a = ambienteDeTeste(documento);
    const armazem = criarArmazem<EstadoDoExportador>({ fase: 'terminou', pedido: PSD, exportacao: e, arquivos: e.arquivos });
    const exportador = { armazem, exportar: vi.fn(), retomar: vi.fn(), tentarDeNovo: vi.fn(), tentarAsQueFalharam: vi.fn(), limpar: vi.fn() };
    const estado = criarArmazem<EstadoDaPecaAberta>({ salvamento: 'salvo', pendentes: 0, versao: 3, somenteLeitura: false });
    render(
      <DialogoDeExportar nomeDaPeca="Café Aurora" api={{ relatorio: vi.fn(), listar: vi.fn(async () => []) }} exportador={exportador} estado={estado} aoFechar={vi.fn()} agora={() => relogio} />,
      { wrapper: a.Moldura },
    );

    const link = screen.getByRole('link', { name: textos.resultado.baixarArquivo('Café Aurora - Feed.psd') });
    relogio = Date.parse('2026-10-09T00:00:00.000Z');
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByText(textos.resultado.apagados)).toBeDefined();
  });

  it('falhou: frase pelo código, tentar de novo é do exportador (que sabe se retoma ou pede outra), voltar leva às opções', async () => {
    const { exportador } = montar({ exportador: { fase: 'falhou', pedido: PSD, codigo: 'limite_de_exportacoes', arquivos: [] } });
    expect(screen.getByRole('alert').textContent).toContain(erros.doCodigo('limite_de_exportacoes'));
    fireEvent.click(screen.getByRole('button', { name: textos.falha.tentarDeNovo }));
    expect(exportador.tentarDeNovo).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: textos.falha.voltar }));
    expect(exportador.limpar).toHaveBeenCalled();
  });

  it('falha por conexão tem frase própria: não é a edição que travou', () => {
    montar({ exportador: { fase: 'falhou', pedido: PSD, codigo: 'sem_conexao', arquivos: [] } });
    expect(screen.getByRole('alert').textContent).toContain(textos.falha.semConexao);
  });
});
