// @vitest-environment jsdom
import type { ImagemTrazida, ResultadoDaBuscaDeImagens } from '@otto/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiDeImagens } from '../api/imagens';
import { imagens as textos } from '../textos/briefing';
import { BuscaDeImagens } from './BuscaDeImagens';

afterEach(cleanup);

const SHA = 'a'.repeat(64);
const RESULTADO: ResultadoDaBuscaDeImagens = {
  banco: { id: 'banco-de-teste', nome: 'Banco de Teste', licenca: 'Licença livre', ladoMaximo: 1280 },
  itens: [
    {
      banco: 'banco-de-teste',
      id: '42',
      descricao: 'pão, padaria',
      largura: 853,
      altura: 1280,
      autor: 'Fulana',
      pagina: 'https://exemplo.test/foto/42',
      previa: '/api/imagens/banco-de-teste/42/previa',
    },
    { banco: 'banco-de-teste', id: '43', descricao: 'café', largura: 1280, altura: 853, autor: 'Beltrano', pagina: 'https://exemplo.test/foto/43', previa: '/api/imagens/banco-de-teste/43/previa' },
  ],
};
const TRAZIDA: ImagemTrazida = {
  sha256: SHA,
  tipo: 'image/jpeg',
  largura: 853,
  altura: 1280,
  bytes: 1000,
  origem: { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', pagina: 'https://exemplo.test/foto/42' },
  no: { tipo: 'imagem', arquivo: SHA, larguraOriginal: 853, alturaOriginal: 1280, origem: { banco: 'Banco de Teste', autor: 'Fulana', licenca: 'Licença livre', url: '' } },
};

function montar(api: Partial<ApiDeImagens> = {}, opcoes: { cheio?: boolean; aoTrazer?: () => boolean | undefined } = {}) {
  const buscar = vi.fn(api.buscar ?? (async () => ({ ok: true as const, resultado: RESULTADO })));
  const trazer = vi.fn(api.trazer ?? (async () => ({ ok: true as const, imagem: TRAZIDA })));
  const aoTrazer = vi.fn(opcoes.aoTrazer ?? (() => undefined));
  render(<BuscaDeImagens api={{ buscar, trazer }} aoTrazer={aoTrazer} cheio={opcoes.cheio ?? false} />);
  const procurar = async (texto: string) => {
    fireEvent.change(screen.getByRole('searchbox', { name: textos.campo }), { target: { value: texto } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.buscar })));
  };
  return { buscar, trazer, aoTrazer, procurar };
}

describe('busca no banco de imagens', () => {
  it('sem texto não busca; com texto, busca com a orientação escolhida', async () => {
    const { buscar, procurar } = montar();
    expect((screen.getByRole('button', { name: textos.buscar }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: textos.orientacao }), { target: { value: 'vertical' } });
    await procurar('padaria');
    expect(buscar).toHaveBeenCalledWith('padaria', 'vertical');
  });

  it('Enter no campo busca, sem enviar o formulário que estiver em volta', async () => {
    const aoEnviar = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const buscar = vi.fn(async () => ({ ok: true as const, resultado: RESULTADO }));
    render(
      <form onSubmit={aoEnviar}>
        <BuscaDeImagens api={{ buscar, trazer: vi.fn() }} aoTrazer={() => undefined} />
      </form>,
    );
    const campo = screen.getByRole('searchbox', { name: textos.campo });
    fireEvent.change(campo, { target: { value: 'padaria' } });
    const tecla = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => void campo.dispatchEvent(tecla));
    expect(buscar).toHaveBeenCalledWith('padaria', 'todas');
    expect(tecla.defaultPrevented).toBe(true);
    expect(aoEnviar).not.toHaveBeenCalled();
    expect(document.querySelector('form form')).toBeNull();
  });

  it('os resultados trazem a origem, a licença, o autor, as medidas e o link da página de cada imagem', async () => {
    const { procurar } = montar();
    await procurar('padaria');
    const origem = document.querySelector('[data-origem-das-imagens]')?.textContent ?? '';
    expect(origem).toContain('Banco de Teste');
    expect(origem).toContain('Licença livre');
    expect(origem).toContain(textos.ladoMaximo(1280));
    const itens = within(screen.getByRole('list', { name: textos.resultados })).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    const primeiro = within(itens[0] as HTMLElement);
    expect(primeiro.getByText(textos.autor('Fulana'))).toBeDefined();
    expect(primeiro.getByText(textos.medidas(853, 1280))).toBeDefined();
    expect(primeiro.getByRole('link', { name: textos.verNoBanco('Banco de Teste') }).getAttribute('href')).toBe('https://exemplo.test/foto/42');
    // a prévia é rota nossa: o navegador não fala com o banco
    expect(primeiro.getByRole('img').getAttribute('src')).toBe('/api/imagens/banco-de-teste/42/previa');
  });

  it('usar traz a imagem para a conta (pelo id do resultado) e a entrega com a origem; depois ela fica marcada', async () => {
    const { trazer, aoTrazer, procurar } = montar();
    await procurar('padaria');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.trazerEsta('Fulana') })));
    expect(trazer).toHaveBeenCalledWith({ banco: 'banco-de-teste', id: '42' });
    expect(aoTrazer).toHaveBeenCalledWith(TRAZIDA, RESULTADO.itens[0]);
    const botao = screen.getByRole('button', { name: textos.trazerEsta('Fulana') }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent).toBe(textos.trazida);
    expect((screen.getByRole('button', { name: textos.trazerEsta('Beltrano') }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('imagem que não entrou (o destino recusou) não fica marcada como usada', async () => {
    const { procurar } = montar({}, { aoTrazer: () => false });
    await procurar('padaria');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.trazerEsta('Fulana') })));
    expect(screen.getByRole('button', { name: textos.trazerEsta('Fulana') }).textContent).toBe(textos.trazer);
  });

  it('banco fora do ar, limite e busca vazia têm frase própria; o código nunca aparece', async () => {
    const fora = montar({ buscar: async () => ({ ok: false, codigo: 'banco_de_imagens_indisponivel' }) });
    await fora.procurar('padaria');
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.banco_de_imagens_indisponivel);
    cleanup();
    const estranho = montar({ buscar: async () => ({ ok: false, codigo: 'codigo_novo' }) });
    await estranho.procurar('padaria');
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.padrao);
    cleanup();
    const vazio = montar({ buscar: async () => ({ ok: true, resultado: { ...RESULTADO, itens: [] } }) });
    await vazio.procurar('xyzzy');
    expect(screen.getByRole('status').textContent).toBe(textos.nenhum);
    expect(document.querySelector('[data-origem-das-imagens]')).toBeNull();
  });

  it('imagem que saiu da busca: a recusa de trazer é dita, e as outras continuam disponíveis', async () => {
    const { procurar, aoTrazer } = montar({ trazer: async () => ({ ok: false, codigo: 'imagem_nao_buscada' }) });
    await procurar('padaria');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: textos.trazerEsta('Fulana') })));
    expect(screen.getByRole('alert').textContent).toBe(textos.erros.imagem_nao_buscada);
    expect(aoTrazer).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: textos.trazerEsta('Beltrano') }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('com o destino cheio, nenhuma imagem pode ser trazida', async () => {
    const { procurar } = montar({}, { cheio: true });
    await procurar('padaria');
    expect((screen.getByRole('button', { name: textos.trazerEsta('Fulana') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
