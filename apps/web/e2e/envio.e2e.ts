// Enviar imagem e SVG pelo botão de inserir, as recusas, e trocar a imagem de uma camada.
import { editor as textos } from '../src/textos/editor';
import { camada, camadas } from './apoio/api';
import { PNG_QUEBRADO, png, SVG_DE_FORMAS, SVG_SO_DE_TEXTO } from './apoio/arquivos';
import { CORES, centro, type Editor, expect, test } from './apoio/teste';

const LARANJA = [230, 126, 34] as const;
const AZUL = [41, 98, 255] as const;
const arquivo = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
const inserir = (editor: Editor) => editor.page.getByLabel(textos.ferramentas.inserir);
const nomesDoFeed = async (editor: Editor) => camadas((await editor.servidor()).arvore.pranchetas[0]?.filhos ?? []).map((n) => n.nome);

test.describe('envio de arquivo', () => {
  test.beforeEach(async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor({ x: 300, y: 250 }, CORES.bloco);
  });

  test('uma imagem vira camada, selecionada, e o canvas a desenha', async ({ editor }) => {
    await inserir(editor).setInputFiles(arquivo('laranja.png', 'image/png', png(300, 200, LARANJA)));

    await expect.poll(() => nomesDoFeed(editor)).toContain('laranja');
    const nova = camada(await editor.servidor(), 'laranja');
    expect(nova).toMatchObject({ tipo: 'imagem', largura: 300, altura: 200 });
    await expect.poll(() => editor.selecionadas()).toEqual(['laranja']);
    await editor.esperarCor(centro(nova), LARANJA);
  });

  test('um SVG vira camada de vetor', async ({ editor }) => {
    await inserir(editor).setInputFiles(arquivo('marca.svg', 'image/svg+xml', SVG_DE_FORMAS));
    await expect.poll(() => nomesDoFeed(editor)).toContain('marca');
    expect(camada(await editor.servidor(), 'marca').tipo).toBe('vetor');
  });

  for (const [caso, recusado] of [
    ['arquivo que não é imagem nem SVG', arquivo('notas.txt', 'text/plain', Buffer.from('não é imagem'))],
    ['SVG só com texto, sem forma para importar', arquivo('so-texto.svg', 'image/svg+xml', SVG_SO_DE_TEXTO)],
    ['PNG corrompido', arquivo('quebrada.png', 'image/png', PNG_QUEBRADO)],
  ] as const) {
    test(`recusa: ${caso}. A tela diz qual arquivo, e a peça não muda`, async ({ editor }) => {
      const versao = (await editor.servidor()).versao;
      await inserir(editor).setInputFiles(recusado);
      // a frase é da tela e vai mudar; o que o teste prende é o aviso de erro citando o arquivo
      await expect(editor.alerta).toContainText(recusado.name);
      expect((await editor.servidor()).versao).toBe(versao);
    });
  }

  test('trocar a imagem de uma camada de foto muda só o arquivo: a caixa fica', async ({ editor }) => {
    const antes = camada(await editor.servidor(), 'Foto');
    await editor.linha('Foto').click();
    await editor.page.getByLabel(textos.propriedades.trocarImagem).setInputFiles(arquivo('azul.png', 'image/png', png(640, 480, AZUL)));

    await expect.poll(async () => camada(await editor.servidor(), 'Foto').arquivo).not.toBe(antes.arquivo);
    expect(camada(await editor.servidor(), 'Foto')).toMatchObject({ x: antes.x, y: antes.y, largura: antes.largura, altura: antes.altura, larguraOriginal: 640 });
    await editor.esperarCor(centro(antes), AZUL);
  });

  // Defeito achado por esta suíte: com a API fora do ar na hora de buscar a imagem, a camada ficava
  // cinza até recarregar a página. Agora o editor pede de novo sozinho.
  test('imagem que falhou ao carregar é pedida de novo sozinha: a camada sai do cinza sem recarregar', async ({ editor }) => {
    const { page } = editor;
    let falhas = 0;
    await page.route('**/api/arquivos/*', async (rota) => {
      if (rota.request().method() === 'GET' && falhas === 0) {
        falhas++;
        return rota.fulfill({ status: 502, body: '' });
      }
      await rota.continue();
    });

    const foto = camada(await editor.servidor(), 'Foto');
    await editor.linha('Foto').click();
    await page.getByLabel(textos.propriedades.trocarImagem).setInputFiles(arquivo('azul.png', 'image/png', png(640, 480, AZUL)));
    await expect.poll(() => falhas).toBe(1);

    await editor.esperarCor(centro(foto), AZUL);
  });
});
