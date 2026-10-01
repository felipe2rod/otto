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

function montar(opcoes: { respostas?: ResultadoDoRelatorio[]; exportador?: EstadoDoExportador; pendentes?: number; agora?: number } = {}) {
  const documento = doc();
  const a = ambienteDeTeste(documento);
  const respostas = [...(opcoes.respostas ?? [])];
  const pedirRelatorio = vi.fn(async (_pedido: unknown): Promise<ResultadoDoRelatorio> => respostas.shift() ?? { ok: true, relatorio });
  const armazemDoExportador = criarArmazem<EstadoDoExportador>(opcoes.exportador ?? { fase: 'parado' });
  const exportador = { armazem: armazemDoExportador, exportar: vi.fn(), tentarDeNovo: vi.fn(), tentarAsQueFalharam: vi.fn(), limpar: vi.fn(() => armazemDoExportador.definir({ fase: 'parado' })) };
  const estado = criarArmazem<EstadoDaPecaAberta>({ salvamento: opcoes.pendentes ? 'salvando' : 'salvo', pendentes: opcoes.pendentes ?? 0, versao: 3, somenteLeitura: false });
  const aoFechar = vi.fn();
  render(
    <DialogoDeExportar
      nomeDaPeca="Café Aurora"
      api={{ relatorio: pedirRelatorio }}
      exportador={exportador}
      estado={estado}
      aoFechar={aoFechar}
      agora={() => opcoes.agora ?? Date.parse('2026-10-01T12:00:10.000Z')}
    />,
    { wrapper: a.Moldura },
  );
  const ids = documento.pranchetas.map((p) => p.id);
  return { pedirRelatorio, exportador, armazemDoExportador, estado, aoFechar, ids };
}
const botaoDeExportar = () => screen.getByRole('button', { name: textos.botao.psd });

describe('exportar: o relatório vem antes do botão', () => {
  it('abre montando o relatório, com o botão desligado; o relatório chega e libera o botão', async () => {
    const { pedirRelatorio } = montar();
    expect(screen.getByRole('dialog', { name: textos.daPeca('Café Aurora') })).toBeDefined();
    expect(screen.getByText(textos.relatorio.montando)).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);

    expect(await screen.findByText(textos.relatorio.resumo(1, 1, 1))).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', false);
    // todas as pranchetas: o pedido não cita nenhuma
    expect(pedirRelatorio).toHaveBeenCalledWith(PSD);
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

  it('a tela não diz nada sobre o Photoshop: nenhum PSD do Otto foi conferido lá', async () => {
    montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    expect(document.body.textContent).not.toMatch(/photoshop/i);
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
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ formato: 'png', escala: 1, semFundo: false }));

    fireEvent.click(screen.getByRole('radio', { name: textos.escala[2] }));
    fireEvent.click(screen.getByRole('checkbox', { name: textos.semFundo }));
    expect(screen.getByRole('button', { name: textos.botao.png })).toBeDefined();
    // tamanho e fundo não mudam o relatório: não há pedido novo por causa deles
    expect(pedirRelatorio).toHaveBeenCalledTimes(2);
  });

  it('tirar uma prancheta manda só as que ficaram; sem nenhuma, não há o que exportar', async () => {
    const { pedirRelatorio, ids } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('checkbox', { name: textos.pranchetas.item('Story', 1080, 1920) }));
    await waitFor(() => expect(pedirRelatorio).toHaveBeenLastCalledWith({ ...PSD, pranchetas: [ids[0]] }));

    fireEvent.click(screen.getByRole('checkbox', { name: textos.pranchetas.item('Feed', 1080, 1350) }));
    expect(screen.getByText(textos.pranchetas.nenhuma)).toBeDefined();
    expect(botaoDeExportar()).toHaveProperty('disabled', true);
    expect(pedirRelatorio).toHaveBeenCalledTimes(2);
  });

  it('Exportar manda o pedido escolhido ao exportador', async () => {
    const { exportador } = montar();
    await screen.findByText(textos.relatorio.resumo(1, 1, 1));
    fireEvent.click(screen.getByRole('radio', { name: textos.arquivos.juntas }));
    fireEvent.click(botaoDeExportar());
    expect(exportador.exportar).toHaveBeenCalledWith({ formato: 'psd', arquivos: 'juntas' });
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
    expect(screen.queryByRole('button', { name: textos.botao.psd })).toBeNull();
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
    expect(await screen.findByRole('button', { name: textos.botao.psd })).toBeDefined();
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
    const exportador = { armazem, exportar: vi.fn(), tentarDeNovo: vi.fn(), tentarAsQueFalharam: vi.fn(), limpar: vi.fn() };
    const estado = criarArmazem<EstadoDaPecaAberta>({ salvamento: 'salvo', pendentes: 0, versao: 3, somenteLeitura: false });
    render(<DialogoDeExportar nomeDaPeca="Café Aurora" api={{ relatorio: vi.fn() }} exportador={exportador} estado={estado} aoFechar={vi.fn()} agora={() => relogio} />, { wrapper: a.Moldura });

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
