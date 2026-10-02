// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marcas as textos } from '../textos/briefing';
import { CAFE, ID_DA_MARCA, servicosDeMentira } from './apoioDeTeste';
import { Marcas } from './Marcas';

afterEach(cleanup);

async function montar(...args: Parameters<typeof servicosDeMentira>) {
  const m = servicosDeMentira(...args);
  render(<Marcas servicos={m.servicos} />);
  await waitFor(() => expect(m.cadastros.marcas).toHaveBeenCalled());
  await act(async () => undefined);
  return m;
}
const lista = () => screen.getByRole('list', { name: textos.lista });
const campo = (nome: string) => screen.getByRole('textbox', { name: nome }) as HTMLInputElement;

describe('marcas', () => {
  it('lista as marcas da conta, com as cores, as fontes e o caminho para uma peça nova dela', async () => {
    await montar({}, { marcas: [CAFE] });
    const item = within(lista()).getByRole('listitem');
    expect(within(item).getByText('Café Aurora')).toBeDefined();
    expect(item.textContent).toContain('DM Serif Display');
    expect(item.querySelectorAll('[data-cor]')).toHaveLength(2);
    expect(
      within(item)
        .getByRole('link', { name: textos.novaPecaPara('Café Aurora') })
        .getAttribute('href'),
    ).toBe(`/editor/novo?marca=${ID_DA_MARCA}`);
  });

  it('marca sem identidade diz isso: não existe cor nem fonte padrão', async () => {
    await montar({}, { marcas: [{ ...CAFE, cores: undefined, fonteDeTitulo: undefined, fonteDeTexto: undefined }] });
    expect(within(lista()).getByText(textos.semIdentidade)).toBeDefined();
  });

  it('nenhuma marca: diz para que ela serve; falha de leitura é erro com "tentar de novo", nunca lista vazia', async () => {
    await montar();
    expect(screen.getByText(textos.vazio)).toBeDefined();
    cleanup();
    let vez = 0;
    const m = await montar({ cadastros: { marcas: vi.fn(async () => (++vez === 1 ? undefined : [CAFE])) } });
    expect(screen.getByRole('alert').textContent).toContain(textos.erro);
    expect(screen.queryByText(textos.vazio)).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.tentarDeNovo })));
    expect(within(lista()).getByText('Café Aurora')).toBeDefined();
    expect(m.cadastros.salvarMarca).not.toHaveBeenCalled();
  });

  it('nova marca: sem nome não salva e diz por quê; com nome, cria só com o que foi preenchido e aparece na lista', async () => {
    const { cadastros } = await montar();
    fireEvent.click(screen.getByRole('button', { name: textos.nova }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.salvar })));
    expect(screen.getByRole('alert').textContent).toBe(textos.faltaONome);
    expect(cadastros.salvarMarca).not.toHaveBeenCalled();

    fireEvent.change(campo(textos.campos.nome), { target: { value: 'Padaria Sol' } });
    fireEvent.change(campo(textos.campos.codigoDe(textos.campos.papeis.primaria as string)), { target: { value: '#C0392B' } });
    fireEvent.change(campo(textos.campos.rodape), { target: { value: '@padariasol' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.salvar })));
    expect(cadastros.salvarMarca).toHaveBeenCalledWith({ nome: 'Padaria Sol', cores: { primaria: '#C0392B' }, rodape: '@padariasol' }, undefined);
    expect(within(lista()).getByText('Padaria Sol')).toBeDefined();
    expect(screen.queryByRole('button', { name: textos.salvar })).toBeNull();
  });

  it('editar abre os campos com o que a marca tem e substitui a marca inteira ao salvar', async () => {
    const { cadastros } = await montar({}, { marcas: [CAFE] });
    fireEvent.click(screen.getByRole('button', { name: textos.editar('Café Aurora') }));
    expect(campo(textos.campos.nome).value).toBe('Café Aurora');
    expect((screen.getByRole('textbox', { name: textos.campos.restricoes }) as HTMLTextAreaElement).value).toBe('nunca foto de pessoa');
    fireEvent.change(campo(textos.campos.rodape), { target: { value: '@aurora' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.salvar })));
    expect(cadastros.salvarMarca).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Café Aurora', rodape: '@aurora', logo: { arquivo: CAFE.logo?.arquivo }, restricoes: ['nunca foto de pessoa'] }),
      ID_DA_MARCA,
    );
  });

  it('enviar o logo em SVG mostra o vetor como foi entendido e o que ficou de fora', async () => {
    const { arquivos, cadastros } = await montar({
      arquivos: {
        importarSvg: async () => ({
          ok: true,
          no: { tipo: 'vetor', moldura: [2, 1], caminhos: [] as never, origem: { arquivo: 'c'.repeat(64), nome: 'logo.svg' } },
          avisos: ['clip-path (1)'],
          miniatura: '<svg id="m"/>',
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: textos.nova }));
    fireEvent.change(campo(textos.campos.nome), { target: { value: 'Padaria Sol' } });
    const entrada = document.querySelector('input[type=file][accept*="png"]') as HTMLInputElement;
    await act(async () => fireEvent.change(entrada, { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } }));
    const miniatura = screen.getByRole('img', { name: textos.campos.logoComoEntendi }) as HTMLImageElement;
    expect(miniatura.src).toBe(`data:image/svg+xml,${encodeURIComponent('<svg id="m"/>')}`);
    expect(screen.getByRole('status').textContent).toBe(textos.campos.importadoComAvisos('clip-path (1)'));
    expect(arquivos.dados).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.salvar })));
    expect(cadastros.salvarMarca).toHaveBeenCalledWith({ nome: 'Padaria Sol', logo: { arquivo: 'c'.repeat(64) } }, undefined);
  });

  it('apagar pede confirmação com o nome, e só então apaga', async () => {
    const { cadastros } = await montar({}, { marcas: [CAFE] });
    fireEvent.click(screen.getByRole('button', { name: textos.editar('Café Aurora') }));
    fireEvent.click(screen.getByRole('button', { name: textos.apagar }));
    expect(cadastros.apagarMarca).not.toHaveBeenCalled();
    expect(screen.getByText(textos.confirmarApagar('Café Aurora'))).toBeDefined();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.apagar })));
    expect(cadastros.apagarMarca).toHaveBeenCalledWith(ID_DA_MARCA);
    expect(screen.getByText(textos.vazio)).toBeDefined();
  });

  it('recusa do servidor ao salvar: a tela diz, e o que foi digitado fica', async () => {
    await montar({ cadastros: { salvarMarca: async () => ({ ok: false, codigo: 'limite_de_cadastros' }) } });
    fireEvent.click(screen.getByRole('button', { name: textos.nova }));
    fireEvent.change(campo(textos.campos.nome), { target: { value: 'Padaria Sol' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.salvar })));
    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(campo(textos.campos.nome).value).toBe('Padaria Sol');
  });
});
