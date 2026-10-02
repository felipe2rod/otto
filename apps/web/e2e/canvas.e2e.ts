// O canvas desenhou a peça? Conferido por PIXEL em pontos conhecidos de uma peça que o próprio teste
// monta, não por imagem de referência: a peça é de cores chapadas, então o pixel certo no lugar certo
// prova geometria, ordem e cor sem depender de antisserrilhado, de fonte nem do desenho da interface
// (que vai mudar). Imagem de referência quebraria a cada ajuste do motor ou da tela sem dizer o quê.
import { editor as textos } from '../src/textos/editor';
import { CORES, expect, test } from './apoio/teste';

test.describe('canvas', () => {
  test('desenha as formas, a foto e o fundo de cada prancheta no lugar certo', async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());

    await editor.esperarCor({ x: 300, y: 250 }, CORES.bloco);
    await editor.esperarCor({ x: 750, y: 300 }, CORES.disco);
    await editor.esperarCor({ x: 300, y: 1100 }, CORES.foto);
    await editor.esperarCor({ x: 1000, y: 1300 }, CORES.fundoDoFeed);
    // a elipse não ocupa o canto da caixa dela: ali aparece o fundo
    await editor.esperarCor({ x: 606, y: 156 }, CORES.fundoDoFeed);
    // a segunda prancheta fica ao lado, com a faixa em cima e o fundo branco embaixo
    await editor.esperarCor({ x: 540, y: 100 }, CORES.faixa, { prancheta: 1 });
    await editor.esperarCor({ x: 540, y: 900 }, [255, 255, 255], { prancheta: 1 });
  });

  test('desenha o texto com a fonte da biblioteca: há tinta na caixa do título e nenhuma fora dela', async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor({ x: 300, y: 250 }, CORES.bloco);

    await expect.poll(() => editor.pixelsEscuros({ x: 100, y: 560, largura: 880, altura: 160 }), { timeout: 60_000 }).toBeGreaterThan(200);
    expect(await editor.pixelsEscuros({ x: 600, y: 950, largura: 400, altura: 300 })).toBe(0);
    // nenhuma fonte ficou por carregar: a faixa de fonte em falta não apareceu
    await expect(editor.page.getByRole('button', { name: textos.avisos.tentarFonteDeNovo })).toHaveCount(0);
  });

  test('fonte que não chegou: uma faixa diz qual, a camada ganha a marca, e "tentar de novo" desenha o texto', async ({ criarPeca, editor }) => {
    const { page } = editor;
    await page.route('**/api/fontes/*/*/arquivo', (rota) => rota.abort());
    await editor.abrir(await criarPeca());
    await editor.esperarCor({ x: 300, y: 250 }, CORES.bloco);

    const tentarDeNovo = page.getByRole('button', { name: textos.avisos.tentarFonteDeNovo });
    await expect(tentarDeNovo).toBeVisible();
    await expect(editor.linha('Título').getByRole('img', { name: textos.camadas.fonteEmFalta })).toBeVisible();
    // sem a fonte o texto não é desenhado: o motor não troca de fonte em silêncio
    expect(await editor.pixelsEscuros({ x: 100, y: 560, largura: 880, altura: 160 })).toBe(0);

    await page.unroute('**/api/fontes/*/*/arquivo');
    await tentarDeNovo.click();
    await expect(tentarDeNovo).toHaveCount(0);
    await expect.poll(() => editor.pixelsEscuros({ x: 100, y: 560, largura: 880, altura: 160 }), { timeout: 60_000 }).toBeGreaterThan(200);
  });
});
