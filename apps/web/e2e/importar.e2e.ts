// Importar um PSD, de ponta a ponta, contra a pilha de verdade: o arquivo é conferido e importado pelo
// servidor (nada aqui é simulado). Os arquivos:
// - ida e volta: um PSD que o próprio Otto exportou, pedido pela API e baixado pelo navegador;
// - de fora do Otto: os de packages/psd/recursos-de-teste/psd-de-fora (licença MIT, ver o LEIA de lá):
//   artboards.psd (duas pranchetas, sem texto), grayscale.psd (recusado: não é RGB) e
//   text-carriage-return.psd (um texto em ArialMT, fonte que o Otto não tem).
//
// Todo arquivo é enviado com nome começado por "e2e": a limpeza desiste dos que ficarem sem importar, e
// as peças criadas são arquivadas no fim de cada teste.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { editor as textosDoEditor } from '../src/textos/editor';
import { importar as textos } from '../src/textos/importar';
import { pecas as textosDePecas } from '../src/textos/pecas';
import { camada, camadas } from './apoio/api';
import { tipoPelosBytes } from './apoio/arquivos';
import { CORES, centro, type Editor, expect, test } from './apoio/teste';

const DE_FORA = path.resolve(process.cwd(), '../../packages/psd/recursos-de-teste/psd-de-fora');
const t = textos.relatorio;
const codigo = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const ATE_IMPORTAR = { timeout: 90_000 };

const deFora = (arquivo: string): Promise<Buffer> => readFile(path.join(DE_FORA, arquivo));
const relatorio = (page: Page): Locator => page.getByRole('dialog', { name: t.titulo });
const fonte = (page: Page, postScript: string): Locator => page.getByRole('list', { name: textos.fontes.lista }).getByRole('listitem').filter({ hasText: postScript });
const botaoDeImportar = (page: Page): Locator => page.getByRole('button', { name: textos.acoes.importar, exact: true });

async function abrirATela(page: Page): Promise<void> {
  await page.goto('/editor/importar');
  await expect(page.locator('[data-zona-de-soltar]')).toBeVisible({ timeout: 60_000 });
}

async function enviar(page: Page, nome: string, bytes: Buffer): Promise<void> {
  await page.getByLabel(textos.escolher.rotulo).setInputFiles({ name: nome, mimeType: 'application/octet-stream', buffer: bytes });
}

/** Depois de "Importar": espera o editor abrir na peça nova, abre de novo pelo apoio (que conhece as pranchetas) e devolve o id. */
async function naPecaImportada(editor: Editor, descartar: { peca(id: string): void }): Promise<string> {
  await editor.page.waitForURL(/\/editor\/p\/[0-9a-f-]{36}$/, ATE_IMPORTAR);
  const id = editor.page.url().split('/').pop() as string;
  descartar.peca(id);
  await editor.abrir({ id });
  return id;
}

test.describe('importar PSD', () => {
  test.describe.configure({ timeout: 240_000 });

  test('ida e volta: o PSD que o Otto exportou volta pela tela, com o texto editável, e a peça importada pode ser editada', async ({ page, editor, criarPeca, api, descartar, limparImportacoes }) => {
    const nome = `e2e-ida-e-volta-${codigo()}`;
    limparImportacoes(nome);
    const original = await criarPeca();
    const [doFeed] = await api.exportarPsd(original.id);
    if (!doFeed) throw new Error('a exportação não trouxe arquivo');

    // a lista de peças leva à tela de importar
    await page.goto('/editor');
    await page.getByRole('link', { name: textosDePecas.importarPsd, exact: true }).click();
    await expect(page.locator('[data-zona-de-soltar]')).toBeVisible({ timeout: 60_000 });
    // o arquivo exportado é baixado pelo navegador, como o designer faria, e enviado de volta
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate((href) => {
        const link = document.createElement('a');
        link.href = href;
        document.body.append(link);
        link.click();
        link.remove();
      }, doFeed.baixar),
    ]);
    const bytes = await readFile(await download.path());
    expect(tipoPelosBytes(bytes)).toBe('psd');
    await enviar(page, `${nome}.psd`, bytes);

    // o arquivo e as fontes: as do Otto estão todas na biblioteca, não há o que escolher
    await expect(page.locator('[data-nome-do-arquivo]')).toHaveText(`${nome}.psd`, ATE_IMPORTAR);
    await expect(page.getByRole('textbox', { name: textos.arquivo.nomeDaPeca, exact: true })).toHaveValue(nome);
    const fontes = page.getByRole('list', { name: textos.fontes.lista }).getByRole('listitem');
    await expect(fontes.first()).toBeVisible();
    for (const item of await fontes.all()) await expect(item).toHaveAttribute('data-situacao', 'na_biblioteca');
    await expect(page.getByRole('list', { name: textos.fontes.lista }).getByRole('radio')).toHaveCount(0);
    await botaoDeImportar(page).click();

    const id = await naPecaImportada(editor, descartar);
    // o relatório aparece ao abrir a peça importada; nada ficou de fora e o texto veio editável
    await expect(relatorio(page)).toBeVisible();
    const importacao = await api.importacaoDaPeca(id);
    expect(importacao.relatorio?.camadas.filter((c) => c.destino === 'ignorado')).toEqual([]);
    expect(importacao.relatorio?.camadas.find((c) => c.camada === 'Título')).toMatchObject({ destino: 'editavel' });
    expect(importacao.relatorio?.emFalta.fontes).toEqual([]);
    await relatorio(page).getByRole('button', { name: t.fechar }).click();
    await expect(relatorio(page)).toHaveCount(0);

    // a peça é uma peça nova, na versão 0, sem histórico, e diz de onde veio
    const importada = await api.abrir(id);
    expect(importada).toMatchObject({ nome, versao: 0, podeDesfazer: false, importacaoId: importacao.id });
    expect(importada.arvore.pranchetas).toHaveLength(1);
    const titulo = camada(importada, 'Título');
    expect(titulo).toMatchObject({ tipo: 'texto', conteudo: 'Otto em teste', fonte: 'IBM Plex Sans' });
    expect(camada(importada, 'Bloco').tipo).toBe('forma');
    await expect(editor.botaoDoTopo(textosDoEditor.topo.desfazer)).toBeDisabled();
    // o canvas desenha a peça importada: o bloco está onde estava, com a cor dele
    await editor.esperarCor(centro(camada(original, 'Bloco')), CORES.bloco);

    // e ela é editável: uma seta move o texto, por operação do catálogo, e o histórico começa ali
    await editor.linha('Título').click();
    await editor.teclar('ArrowRight');
    await expect.poll(async () => camada(await api.abrir(id), 'Título').x).toBe((titulo.x ?? 0) + 1);
    await expect(editor.botaoDoTopo(textosDoEditor.topo.desfazer)).toBeEnabled();
  });

  test('um PSD de fora do Otto, com pranchetas: importa, mostra o relatório ao abrir, e o relatório continua consultável pela peça', async ({ page, editor, api, descartar, limparImportacoes }) => {
    const nome = `e2e-artboards-${codigo()}`;
    limparImportacoes(nome);
    await abrirATela(page);
    await enviar(page, `${nome}.psd`, await deFora('artboards.psd'));
    await expect(page.locator('[data-nome-do-arquivo]')).toHaveText(`${nome}.psd`, ATE_IMPORTAR);
    // arquivo sem texto: não há fonte para escolher, e a tela diz
    await expect(page.getByText(textos.fontes.semTexto)).toBeVisible();
    await botaoDeImportar(page).click();

    const id = await naPecaImportada(editor, descartar);
    const importada = await api.abrir(id);
    expect(importada.arvore.pranchetas.length).toBeGreaterThan(1);
    expect(importada.importacaoId).toBeTruthy();

    // o relatório, com as frases da tela (pelo código do aviso)
    const importacao = await api.importacaoDaPeca(id);
    await expect(relatorio(page)).toBeVisible();
    await expect(relatorio(page)).toContainText(t.doArquivo(`${nome}.psd`));
    for (const aviso of importacao.relatorio?.avisos ?? []) {
      const frase = t.observacoes.doCodigo[aviso.codigo];
      if (frase) await expect(relatorio(page)).toContainText(frase);
    }
    expect(importacao.relatorio?.avisos.map((a) => a.codigo)).toContain('fundo-transparente');
    // a tabela inteira das camadas do arquivo está no relatório
    await relatorio(page).locator('summary').click();
    await expect(relatorio(page).getByRole('row')).toHaveCount((importacao.relatorio?.camadas.length ?? 0) + 1);
    await relatorio(page).getByRole('button', { name: t.fechar }).click();

    // depois de visto, não abre sozinho de novo; e continua consultável pelo topo
    await page.reload();
    await editor.pronto();
    await expect(editor.botaoDoTopo(t.abrir)).toBeVisible();
    await expect(relatorio(page)).toHaveCount(0);
    await editor.botaoDoTopo(t.abrir).click();
    await expect(relatorio(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(relatorio(page)).toHaveCount(0);

    // na lista de peças ela aparece como qualquer outra
    await page.goto('/editor');
    await expect(page.getByRole('list', { name: textosDePecas.lista }).getByRole('listitem').filter({ hasText: nome })).toHaveCount(1);
  });

  test('arquivo recusado: o que não é PSD nem chega a ser enviado; o que não está em RGB diz o motivo e como converter', async ({ page, api }) => {
    const nome = `e2e-cinza-${codigo()}`;
    await abrirATela(page);
    const envios: string[] = [];
    page.on('request', (pedido) => {
      if (pedido.method() === 'POST' && new URL(pedido.url()).pathname === '/api/importacoes') envios.push(pedido.url());
    });

    await enviar(page, 'e2e-foto.png', Buffer.from('não é psd'));
    await expect(page.getByRole('alert').filter({ hasText: 'e2e-foto.png' })).toHaveText(textos.local.naoEPsd('e2e-foto.png'));
    expect(envios).toHaveLength(0);

    await enviar(page, `${nome}.psd`, await deFora('grayscale.psd'));
    const recusa = page.locator('[data-recusa]');
    await expect(recusa).toHaveAttribute('data-recusa', 'modo-de-cor', ATE_IMPORTAR);
    await expect(recusa).toContainText(textos.recusa.titulo(`${nome}.psd`));
    await expect(recusa).toContainText(textos.recusa.motivos['modo-de-cor'] as string);
    await expect(recusa.locator('[data-como-converter]')).toHaveText(textos.recusa.comoConverter['modo-de-cor'] as string);
    expect(envios).toHaveLength(1);
    // nada ficou guardado, e a tela continua pronta para outro arquivo
    expect((await api.importacoes()).some((i) => i.arquivo.nome === `${nome}.psd`)).toBe(false);
    await expect(page.locator('[data-zona-de-soltar]')).toBeVisible();
    await expect(botaoDeImportar(page)).toHaveCount(0);
  });

  test('fonte que o Otto não tem, deixando o texto virar imagem (o padrão): o relatório diz, e a camada fica apontada', async ({ page, editor, api, descartar, limparImportacoes }) => {
    const nome = `e2e-fonte-imagem-${codigo()}`;
    limparImportacoes(nome);
    await abrirATela(page);
    await enviar(page, `${nome}.psd`, await deFora('text-carriage-return.psd'));

    // a tela mostra qual fonte o arquivo pede e que o Otto não a tem, com o padrão marcado
    const arial = fonte(page, 'ArialMT');
    await expect(arial).toHaveAttribute('data-situacao', 'em_falta', ATE_IMPORTAR);
    await expect(arial.getByRole('radio', { name: textos.fontes.opcoes.imagem as string })).toBeChecked();
    await expect(arial).toHaveAttribute('data-destino', 'imagem');
    await expect(page.locator('[data-resumo-das-fontes]')).toHaveText(textos.fontes.resumo(0, 1));
    await botaoDeImportar(page).click();

    const id = await naPecaImportada(editor, descartar);
    const importacao = await api.importacaoDaPeca(id);
    // nada foi trocado: o pedido não citou fonte nenhuma
    expect(importacao.pedido?.fontes ?? []).toEqual([]);
    expect(importacao.relatorio?.emFalta.fontes.map((f) => f.postScript)).toEqual(['ArialMT']);
    const [doTexto] = importacao.relatorio?.camadas.filter((c) => c.mapeamento === 'psd:texto-sem-fonte') ?? [];
    expect(doTexto?.destino).toBe('imagem');

    // o relatório: virou imagem, por causa da fonte; "ver" leva à camada
    await expect(relatorio(page)).toBeVisible();
    await expect(relatorio(page).getByRole('heading', { name: t.virouImagem.titulo(1) })).toBeVisible();
    await expect(relatorio(page)).toContainText(t.virouImagem.fonteEmFalta('ArialMT'));
    await expect(relatorio(page).getByRole('heading', { name: t.fontes.emFalta(1) })).toBeVisible();
    await relatorio(page)
      .getByRole('button', { name: new RegExp(`^${t.verCamada('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
      .first()
      .click();
    await expect(relatorio(page)).toHaveCount(0);

    // no painel de Camadas a camada está selecionada e apontada como "veio como imagem"
    const selecionada = page.locator('[role=treeitem][aria-selected=true]');
    await expect(selecionada).toHaveCount(1);
    await expect(selecionada.locator('[data-veio-como-imagem]')).toHaveCount(1);
    await expect(editor.arvore.locator('[data-veio-como-imagem]')).toHaveCount(1);
    const nos = camadas((await api.abrir(id)).arvore.pranchetas.flatMap((p) => p.filhos));
    expect(nos.find((n) => n.id === doTexto?.idDoNo)?.tipo).toBe('imagem');
    expect(nos.some((n) => n.tipo === 'texto')).toBe(false);
  });

  test('fonte que o Otto não tem, trocando por outra: só importa depois de escolher a fonte, o texto vem editável, e o relatório diz a troca', async ({
    page,
    editor,
    api,
    descartar,
    limparImportacoes,
  }) => {
    const nome = `e2e-fonte-troca-${codigo()}`;
    limparImportacoes(nome);
    await abrirATela(page);
    await enviar(page, `${nome}.psd`, await deFora('text-carriage-return.psd'));

    const arial = fonte(page, 'ArialMT');
    await expect(arial).toHaveAttribute('data-situacao', 'em_falta', ATE_IMPORTAR);
    await arial.getByRole('radio', { name: textos.fontes.opcoes.substituir as string }).check();
    // nada é trocado em silêncio: sem dizer por qual fonte, não importa
    await expect(botaoDeImportar(page)).toBeDisabled();
    await expect(page.locator('[data-resumo-das-fontes]')).toHaveText(textos.fontes.faltaEscolher(1));
    await page.getByRole('combobox', { name: textos.fontes.trocarPor('ArialMT'), exact: true }).selectOption('Anton');
    await expect(arial).toHaveAttribute('data-destino', 'substituir');
    await expect(page.locator('[data-resumo-das-fontes]')).toHaveText(textos.fontes.resumo(1, 0));
    await botaoDeImportar(page).click();

    const id = await naPecaImportada(editor, descartar);
    const importacao = await api.importacaoDaPeca(id);
    expect(importacao.relatorio?.substituicoes).toMatchObject([{ pedida: 'ArialMT', usada: { familia: 'Anton' } }]);
    expect(importacao.relatorio?.emFalta.fontes).toEqual([]);
    // o texto veio editável, com a fonte escolhida
    const nos = camadas((await api.abrir(id)).arvore.pranchetas.flatMap((p) => p.filhos));
    expect(nos.filter((n) => n.tipo === 'texto').map((n) => n.fonte)).toEqual(['Anton']);

    await expect(relatorio(page)).toBeVisible();
    await expect(relatorio(page).getByRole('heading', { name: t.fontes.trocadas(1) })).toBeVisible();
    await expect(relatorio(page).getByRole('heading', { name: t.virouImagem.titulo(1) })).toHaveCount(0);
    await relatorio(page).getByRole('button', { name: t.fechar }).click();
    await expect(editor.arvore.locator('[data-veio-como-imagem]')).toHaveCount(0);
  });

  test('retomar: o arquivo enviado e não importado espera na tela; dá para continuar de onde parou, ou desistir dele', async ({ page, api, limparImportacoes }) => {
    const nome = `e2e-retomar-${codigo()}`;
    limparImportacoes(nome);
    await abrirATela(page);
    await enviar(page, `${nome}.psd`, await deFora('text-carriage-return.psd'));
    await expect(page.locator('[data-nome-do-arquivo]')).toHaveText(`${nome}.psd`, ATE_IMPORTAR);

    // sai sem importar e volta: o arquivo está esperando
    await page.goto('/editor');
    await abrirATela(page);
    const pendentes = page.getByRole('list', { name: textos.pendentes.lista });
    const item = pendentes.getByRole('listitem').filter({ hasText: `${nome}.psd` });
    await expect(item).toHaveCount(1);
    await item.getByRole('button', { name: textos.pendentes.continuar(`${nome}.psd`), exact: true }).click();
    // continua na tela de fontes, sem enviar de novo
    await expect(page.locator('[data-nome-do-arquivo]')).toHaveText(`${nome}.psd`);
    await expect(fonte(page, 'ArialMT')).toHaveAttribute('data-situacao', 'em_falta');

    // desistir pede confirmação, apaga o arquivo e volta à escolha
    await page.getByRole('button', { name: textos.acoes.desistir, exact: true }).click();
    await expect(page.getByText(textos.acoes.confirmarDesistir(`${nome}.psd`))).toBeVisible();
    await page.getByRole('button', { name: textos.pendentes.desistirCurto, exact: true }).click();
    await expect(page.locator('[data-zona-de-soltar]')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: `${nome}.psd` })).toHaveCount(0);
    expect((await api.importacoes()).filter((i) => i.arquivo.nome === `${nome}.psd` && i.estado === 'enviada')).toEqual([]);
  });
});
