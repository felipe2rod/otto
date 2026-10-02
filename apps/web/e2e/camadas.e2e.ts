// O painel de Camadas: arrastar para reordenar, para dentro e para fora de grupo e para outra
// prancheta; ocultar, renomear e selecionar várias.
import { editor as textos } from '../src/textos/editor';
import { camada, ordem } from './apoio/api';
import { CORES, type Editor, expect, test } from './apoio/teste';

const NO_BLOCO = { x: 300, y: 250 };

test.describe('painel de camadas', () => {
  test.beforeEach(async ({ criarPeca, editor, api }) => {
    const peca = await criarPeca();
    // Título e Legenda num grupo: de baixo para cima fica Bloco, Disco, Textos{Título Legenda}, Foto
    await api.lote(peca.id, [{ op: 'agrupar', alvos: [camada(peca, 'Título').id, camada(peca, 'Legenda').id], nome: 'Textos' }]);
    await editor.abrir(peca);
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
  });
  /** As camadas de uma prancheta no servidor, de baixo para cima, com as de grupo entre chaves. */
  const doFeed = async (editor: Editor, prancheta = 0) => ordem((await editor.servidor()).arvore.pranchetas[prancheta]?.filhos ?? []);

  test('arrastar uma linha para cima de outra muda a ordem das camadas', async ({ editor }) => {
    expect(await doFeed(editor)).toBe('Bloco Disco Textos{Título Legenda} Foto');
    // o painel mostra de cima para baixo: soltar o Bloco na metade de cima do Disco o põe acima dele
    await editor.arrastarLinha('Bloco', 'Disco', 0.2);
    await expect.poll(() => doFeed(editor)).toBe('Disco Bloco Textos{Título Legenda} Foto');
  });

  test('soltar no meio de um grupo põe a camada dentro; soltar ao lado de uma de fora, tira', async ({ editor }) => {
    await editor.arrastarLinha('Foto', 'Textos', 0.5);
    await expect.poll(() => doFeed(editor)).toBe('Bloco Disco Textos{Título Legenda Foto}');

    await editor.arrastarLinha('Foto', 'Disco', 0.8);
    await expect.poll(() => doFeed(editor)).toBe('Bloco Foto Disco Textos{Título Legenda}');
  });

  test('soltar numa prancheta leva a camada para ela, e o canvas a mostra lá', async ({ editor }) => {
    await editor.arrastarLinha('Bloco', 'Quadrado', 0.5);
    await expect.poll(() => doFeed(editor, 1)).toBe('Faixa Bloco');
    expect(await doFeed(editor)).toBe('Disco Textos{Título Legenda} Foto');
    // mesma posição, agora na segunda prancheta
    await editor.esperarCor(NO_BLOCO, CORES.bloco, { prancheta: 1 });
    await editor.esperarCor(NO_BLOCO, CORES.fundoDoFeed);
  });

  test('ocultar tira a camada do canvas sem apagá-la; mostrar a traz de volta', async ({ editor }) => {
    await editor.linha('Bloco').getByRole('button', { name: textos.camadas.ocultar }).click();
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').visivel).toBe(false);
    await editor.esperarCor(NO_BLOCO, CORES.fundoDoFeed);

    await editor.linha('Bloco').getByRole('button', { name: textos.camadas.mostrar }).click();
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
  });

  test('selecionar uma camada não tira as linhas do lugar (senão o segundo clique de um duplo clique cai em outra)', async ({ editor }) => {
    const antes = await editor.linha('Disco').boundingBox();
    await editor.linha('Disco').click();
    await expect(editor.campo(textos.propriedades.x)).toBeVisible();
    expect(await editor.linha('Disco').boundingBox()).toEqual(antes);
  });

  test('dois cliques no nome renomeia a camada', async ({ editor }) => {
    await editor.linha('Disco').getByText('Disco', { exact: true }).dblclick();
    const campo = editor.page.getByRole('textbox', { name: textos.camadas.novoNome('Disco') });
    await campo.fill('Bola');
    await campo.press('Enter');
    await expect(editor.linha('Bola')).toBeVisible();
    await expect.poll(() => doFeed(editor)).toBe('Bloco Bola Textos{Título Legenda} Foto');
  });

  test('Shift+clique no painel seleciona várias, e a seleção feita no canvas aparece no painel', async ({ editor }) => {
    await editor.linha('Bloco').click();
    await editor.linha('Disco').click({ modifiers: ['Shift'] });
    expect(await editor.selecionadas()).toEqual(['Bloco', 'Disco']);

    await editor.clicar({ x: 300, y: 1100 });
    await expect(editor.linha('Foto')).toHaveAttribute('aria-selected', 'true');
    expect(await editor.selecionadas()).toEqual(['Foto']);
  });

  test('agrupar em níveis diferentes não manda lote: a tela avisa', async ({ editor }) => {
    const versao = (await editor.servidor()).versao;
    await editor.linha('Bloco').click();
    await editor.linha('Título').click({ modifiers: ['Shift'] });
    await editor.page.getByRole('button', { name: textos.camadas.agrupar, exact: true }).click();
    await expect(editor.alerta).toBeVisible();
    expect((await editor.servidor()).versao).toBe(versao);
  });
});
