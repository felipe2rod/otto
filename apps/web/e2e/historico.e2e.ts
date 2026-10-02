// Desfazer e refazer são da API; recarregar a página mostra o que o servidor guardou.
import { editor as textos } from '../src/textos/editor';
import { camada } from './apoio/api';
import { CORES, expect, test } from './apoio/teste';

const NO_BLOCO = { x: 300, y: 250 };

test.describe('histórico', () => {
  test('peça sem nenhum lote: Desfazer e Refazer ficam desligados', async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca({ operacoes: 'vazia' }));
    await expect(editor.botaoDoTopo(textos.topo.desfazer)).toBeDisabled();
    await expect(editor.botaoDoTopo(textos.topo.refazer)).toBeDisabled();
  });

  test('Ctrl+Z desfaz, Ctrl+Shift+Z refaz, e os botões seguem o que a API diz', async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
    const x = async () => camada(await editor.servidor(), 'Bloco').x;
    await expect(editor.botaoDoTopo(textos.topo.refazer)).toBeDisabled();

    await editor.clicar(NO_BLOCO);
    await editor.teclar('Shift+ArrowRight');
    await expect.poll(x).toBe(110);

    await editor.teclar('Control+KeyZ');
    await expect.poll(x).toBe(100);
    await expect(editor.botaoDoTopo(textos.topo.refazer)).toBeEnabled();
    await expect(editor.campo(textos.propriedades.x)).toHaveValue('100');

    await editor.teclar('Control+Shift+KeyZ');
    await expect.poll(x).toBe(110);
    await expect(editor.botaoDoTopo(textos.topo.refazer)).toBeDisabled();

    // pelos botões do topo
    await editor.botaoDoTopo(textos.topo.desfazer).click();
    await expect.poll(x).toBe(100);
    await editor.botaoDoTopo(textos.topo.refazer).click();
    await expect.poll(x).toBe(110);
  });

  test('recarregar a página mostra a peça como o servidor a guardou', async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
    await editor.arrastar(NO_BLOCO, { x: 500, y: 250 });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').x).toBe(300);
    await expect(editor.salvamento).toHaveText(textos.topo.salvamento.salvo);

    await editor.page.reload();
    await editor.pronto();
    await editor.esperarCor({ x: 350, y: 250 }, CORES.bloco);
    await editor.esperarCor({ x: 150, y: 250 }, CORES.fundoDoFeed);
    await editor.linha('Bloco').click();
    await expect(editor.campo(textos.propriedades.x)).toHaveValue('300');
  });
});
