// Exportar: o relatório antes do botão, cada formato, o pacote, o download (com o tipo conferido
// pelos BYTES do arquivo, não pelo nome), as recentes, a retomada depois de recarregar e as falhas.
import { readFile } from 'node:fs/promises';
import type { Locator, Page, Route } from '@playwright/test';
import { editor as textosDoEditor } from '../src/textos/editor';
import { erros } from '../src/textos/erros';
import { exportar as textos } from '../src/textos/exportar';
import { buscarDeVerdade } from './apoio/api';
import { lerPng, nomesNoZip, tipoPelosBytes } from './apoio/arquivos';
import { CORES, type Editor, expect, test } from './apoio/teste';

type Formato = 'psd' | 'pdf' | 'svg' | 'png';
const dialogo = (page: Page) => page.getByRole('dialog');
const links = (page: Page) => dialogo(page).locator('a[href^="/api/exportacoes/"]');
const botaoDoPacote = (page: Page) => dialogo(page).getByRole('button', { name: textos.botao.pacote });
const soArquivos = (page: Page, formato: Formato) => dialogo(page).getByRole('button', { name: textos.botao.soArquivos(textos.sigla[formato]) });

/** Abre o diálogo e escolhe o formato; devolve quando o relatório chegou (o botão ligou). */
async function abrirExportar(editor: Editor, formato: Formato): Promise<void> {
  await editor.botaoDoTopo(textosDoEditor.topo.exportar).click();
  await dialogo(editor.page).getByRole('radio', { name: textos.formato[formato], exact: true }).check();
  await expect(botaoDoPacote(editor.page)).toBeEnabled();
}

/** Clica no link e devolve os bytes do arquivo que o navegador baixou. */
async function baixar(page: Page, link: Locator): Promise<{ nome: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { nome: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

async function baixarTodos(page: Page, quantos: number): Promise<{ nome: string; bytes: Buffer }[]> {
  // peça de duas pranchetas leva de 1 a 3 s; o limite cobre a fila ocupada por outro teste
  await expect(links(page)).toHaveCount(quantos, { timeout: 90_000 });
  const arquivos: { nome: string; bytes: Buffer }[] = [];
  for (let i = 0; i < quantos; i++) arquivos.push(await baixar(page, links(page).nth(i)));
  // baixar não tira o designer do editor
  await expect(dialogo(page)).toBeVisible();
  return arquivos;
}

test.describe('exportar', () => {
  test.beforeEach(async ({ criarPeca, editor }) => {
    // nome fixo: o título do teste viraria nome da peça, e o nome aparece no diálogo
    await editor.abrir(await criarPeca({ nome: `e2e exportar ${Date.now().toString(36)}` }));
    await editor.esperarCor({ x: 300, y: 250 }, CORES.bloco);
  });

  test('o relatório vem antes do botão: enquanto ele não chega, não dá para exportar', async ({ editor }) => {
    const { page } = editor;
    let liberar: (() => void) | undefined;
    const segurado = new Promise<void>((seguir) => (liberar = seguir));
    await page.route('**/exportacoes/relatorio', async (rota) => {
      await segurado;
      await rota.continue();
    });

    await editor.botaoDoTopo(textosDoEditor.topo.exportar).click();
    await expect(dialogo(page)).toBeVisible();
    await expect(botaoDoPacote(page)).toBeDisabled();
    await expect(soArquivos(page, 'psd')).toBeDisabled();

    liberar?.();
    await expect(botaoDoPacote(page)).toBeEnabled();
    // as duas fontes do texto da peça vão no pacote
    await expect(dialogo(page).getByRole('region', { name: textos.relatorio.pacote.titulo(2, 2) })).toBeVisible();
  });

  test('PSD: um arquivo por prancheta, e cada um é um PSD de verdade', async ({ editor }) => {
    await abrirExportar(editor, 'psd');
    await soArquivos(editor.page, 'psd').click();
    const arquivos = await baixarTodos(editor.page, 2);
    expect(arquivos.map((a) => tipoPelosBytes(a.bytes))).toEqual(['psd', 'psd']);
    for (const a of arquivos) expect(a.nome).toMatch(/\.psd$/);
  });

  test('PSD com todas as pranchetas num arquivo só', async ({ editor }) => {
    await abrirExportar(editor, 'psd');
    await dialogo(editor.page).getByRole('radio', { name: textos.arquivos.juntas, exact: true }).check();
    await soArquivos(editor.page, 'psd').click();
    const [arquivo] = await baixarTodos(editor.page, 1);
    expect(tipoPelosBytes(arquivo?.bytes ?? Buffer.alloc(0))).toBe('psd');
  });

  test('PDF: por padrão um arquivo com todas as pranchetas; por prancheta, um arquivo de cada', async ({ editor }) => {
    await abrirExportar(editor, 'pdf');
    await expect(dialogo(editor.page).getByRole('radio', { name: textos.arquivos.juntasNoPdf, exact: true })).toBeChecked();
    await soArquivos(editor.page, 'pdf').click();
    const [junto] = await baixarTodos(editor.page, 1);
    expect(tipoPelosBytes(junto?.bytes ?? Buffer.alloc(0))).toBe('pdf');

    await dialogo(editor.page).getByRole('button', { name: textos.resultado.outra }).click();
    await dialogo(editor.page).getByRole('radio', { name: textos.formato.pdf, exact: true }).check();
    await dialogo(editor.page).getByRole('radio', { name: textos.arquivos['por-prancheta'], exact: true }).check();
    await expect(soArquivos(editor.page, 'pdf')).toBeEnabled();
    await soArquivos(editor.page, 'pdf').click();
    const separados = await baixarTodos(editor.page, 2);
    expect(separados.map((a) => tipoPelosBytes(a.bytes))).toEqual(['pdf', 'pdf']);
  });

  test('SVG: um arquivo por prancheta', async ({ editor }) => {
    await abrirExportar(editor, 'svg');
    await soArquivos(editor.page, 'svg').click();
    const arquivos = await baixarTodos(editor.page, 2);
    expect(arquivos.map((a) => tipoPelosBytes(a.bytes))).toEqual(['svg', 'svg']);
  });

  test('PNG em 2×: uma imagem por prancheta, com o dobro do tamanho dela', async ({ editor }) => {
    await abrirExportar(editor, 'png');
    await dialogo(editor.page).getByRole('radio', { name: textos.escala[2], exact: true }).check();
    await soArquivos(editor.page, 'png').click();
    const arquivos = await baixarTodos(editor.page, 2);
    expect(arquivos.map((a) => tipoPelosBytes(a.bytes))).toEqual(['png', 'png']);
    const feed = lerPng(arquivos[0]?.bytes ?? Buffer.alloc(0));
    expect([feed.largura, feed.altura]).toEqual([2160, 2700]);
    // o Bloco está lá, no dobro da posição
    expect(feed.pixel(600, 500).slice(0, 3)).toEqual([...CORES.bloco]);
  });

  test('pacote: um .zip com os arquivos do formato, a pasta de fontes e o relatório', async ({ editor }) => {
    await abrirExportar(editor, 'psd');
    await botaoDoPacote(editor.page).click();
    const [pacote] = await baixarTodos(editor.page, 1);
    expect(tipoPelosBytes(pacote?.bytes ?? Buffer.alloc(0))).toBe('zip');
    const nomes = nomesNoZip(pacote?.bytes ?? Buffer.alloc(0));
    expect(nomes.filter((n) => n.endsWith('.psd'))).toHaveLength(2);
    expect(nomes.filter((n) => n.startsWith('Fontes/'))).toHaveLength(2);
    expect(nomes.filter((n) => n.endsWith('.md'))).toHaveLength(1);
  });

  test('depois de exportar, a exportação aparece nas recentes, com o link do arquivo', async ({ editor }) => {
    await abrirExportar(editor, 'svg');
    await soArquivos(editor.page, 'svg').click();
    await expect(links(editor.page)).toHaveCount(2, { timeout: 90_000 });
    await dialogo(editor.page).getByRole('button', { name: textos.resultado.outra }).click();

    const recentes = dialogo(editor.page).getByRole('region', { name: textos.recentes.titulo(1) });
    await recentes.locator('summary').click();
    await expect(recentes.getByRole('listitem')).toHaveCount(1);
    const { bytes } = await baixar(editor.page, recentes.getByRole('link').first());
    expect(tipoPelosBytes(bytes)).toBe('svg');
  });

  test('fechar o diálogo não interrompe: o topo avisa quando fica pronto e leva de volta aos arquivos', async ({ editor }) => {
    await abrirExportar(editor, 'psd');
    await soArquivos(editor.page, 'psd').click();
    await dialogo(editor.page).getByRole('button', { name: textos.fechar }).click();
    await expect(dialogo(editor.page)).toHaveCount(0);

    const pronto = editor.botaoDoTopo(textos.topo.pronto);
    await expect(pronto).toBeVisible({ timeout: 90_000 });
    await pronto.click();
    await expect(links(editor.page)).toHaveCount(2);
  });

  test('recarregar a página com a exportação em curso: o editor volta a acompanhá-la sem pedir outra', async ({ editor, api }) => {
    const { page } = editor;
    await abrirExportar(editor, 'psd');
    await soArquivos(page, 'psd').click();
    await expect(links(page)).toHaveCount(2, { timeout: 90_000 });
    const [exportacao] = await api.exportacoes(editor.pecaId);

    // A exportação desta peça leva 1 a 3 s: termina antes de a página recarregar. Para a retomada ser
    // certa de acontecer, a LISTA que o editor lê ao abrir diz que ela ainda está rodando; a consulta
    // seguinte é a de verdade, e traz os arquivos.
    await page.route(`**/api/documentos/${editor.pecaId}/exportacoes`, async (rota: Route) => {
      if (rota.request().method() !== 'GET') return rota.continue();
      const resposta = await buscarDeVerdade(rota);
      const corpo = (await resposta.json()) as { itens: Record<string, unknown>[] };
      const primeira = corpo.itens[0];
      if (primeira) Object.assign(primeira, { estado: 'rodando', arquivos: [], progresso: { pranchetasProntas: 1, pranchetasNoTotal: 2 } });
      await rota.fulfill({ response: resposta, json: corpo });
    });
    const pedidos: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && /\/exportacoes$/.test(new URL(r.url()).pathname) && pedidos.push(r.url()));

    await page.reload();
    await editor.pronto();
    const pronto = editor.botaoDoTopo(textos.topo.pronto);
    await expect(pronto).toBeVisible({ timeout: 60_000 });
    await pronto.click();
    await expect(links(page)).toHaveCount(2);
    await expect(links(page).first()).toHaveAttribute('href', new RegExp(`/api/exportacoes/${exportacao?.id}/arquivos/0$`));
    expect(pedidos).toEqual([]);
  });

  test('fonte que a licença não deixa levar: o relatório do pacote diz qual não vai e por quê', async ({ editor }) => {
    const { page } = editor;
    // Nenhuma fonte da biblioteca de desenvolvimento tem licença que proíba: a resposta do relatório é
    // alterada aqui para a primeira fonte vir como "não incluída".
    await page.route('**/exportacoes/relatorio', async (rota) => {
      const resposta = await buscarDeVerdade(rota);
      const corpo = (await resposta.json()) as { pacote?: { fontes: Record<string, unknown>[] } };
      const fonte = corpo.pacote?.fontes[0];
      if (fonte) Object.assign(fonte, { incluida: false, motivo: 'licenca_nao_permite', licenca: 'Licença de teste' });
      delete fonte?.arquivo;
      await rota.fulfill({ response: resposta, json: corpo });
    });

    await abrirExportar(editor, 'psd');
    const secao = dialogo(page).getByRole('region', { name: textos.relatorio.pacote.titulo(1, 2) });
    await expect(secao).toBeVisible();
    await expect(secao).toContainText(textos.relatorio.pacote.motivos.licenca_nao_permite('Licença de teste'));
  });

  test('exportação que falha no servidor: a tela diz por quê, e tentar de novo entrega os arquivos', async ({ editor }) => {
    const { page } = editor;
    // a consulta do andamento responde que a exportação foi interrompida
    await page.route(/\/api\/exportacoes\/[0-9a-f-]+$/, async (rota) => {
      const resposta = await buscarDeVerdade(rota);
      const corpo = { ...((await resposta.json()) as Record<string, unknown>), estado: 'falhou', erro: { codigo: 'interrompida' }, arquivos: [] };
      await rota.fulfill({ response: resposta, json: corpo });
    });

    await abrirExportar(editor, 'psd');
    await soArquivos(page, 'psd').click();
    await expect(dialogo(page).getByRole('alert')).toContainText(erros.doCodigo('interrompida'), { timeout: 60_000 });
    await expect(links(page)).toHaveCount(0);

    await page.unroute(/\/api\/exportacoes\/[0-9a-f-]+$/);
    await dialogo(page).getByRole('button', { name: textos.falha.tentarDeNovo }).click();
    await expect(links(page)).toHaveCount(2, { timeout: 90_000 });
  });

  test('exportação que sai em parte: diz qual prancheta não exportou, deixa baixar a que saiu e tenta só a que falhou', async ({ editor }) => {
    const { page } = editor;
    const quadrado = (await editor.servidor()).arvore.pranchetas[1];
    // a consulta do andamento diz que o arquivo da segunda prancheta não saiu
    await page.route(/\/api\/exportacoes\/[0-9a-f-]+$/, async (rota) => {
      const resposta = await buscarDeVerdade(rota);
      const corpo = (await resposta.json()) as { estado: string; arquivos: { pranchetaId?: string }[]; falhas: unknown[] };
      if (corpo.estado === 'pronta')
        Object.assign(corpo, { estado: 'pronta_em_parte', arquivos: corpo.arquivos.filter((a) => a.pranchetaId !== quadrado?.id), falhas: [{ pranchetaId: quadrado?.id, codigo: 'erro_interno' }] });
      await rota.fulfill({ response: resposta, json: corpo });
    });
    const pedidos: unknown[] = [];
    page.on('request', (r) => r.method() === 'POST' && /\/exportacoes$/.test(new URL(r.url()).pathname) && pedidos.push(r.postDataJSON()));

    await abrirExportar(editor, 'psd');
    await soArquivos(page, 'psd').click();
    const tentar = dialogo(page).getByRole('button', { name: textos.resultado.tentarAsQueFalharam(['Quadrado']) });
    await expect(tentar).toBeVisible({ timeout: 90_000 });
    await expect(links(page)).toHaveCount(1);

    await page.unroute(/\/api\/exportacoes\/[0-9a-f-]+$/);
    await tentar.click();
    await expect(links(page)).toHaveCount(2, { timeout: 90_000 });
    // o segundo pedido foi só da prancheta que tinha falhado
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1]).toMatchObject({ formato: 'psd', pranchetas: [quadrado?.id] });
  });

  test('nenhuma frase do diálogo cita o Photoshop nem o Illustrator, em nenhum formato', async ({ editor }) => {
    for (const formato of ['psd', 'pdf', 'svg', 'png'] as const) {
      if (formato === 'psd') await abrirExportar(editor, formato);
      else {
        await dialogo(editor.page).getByRole('radio', { name: textos.formato[formato], exact: true }).check();
        await expect(botaoDoPacote(editor.page)).toBeEnabled();
      }
      await expect(dialogo(editor.page)).not.toContainText(/photoshop|illustrator|adobe/i);
    }
  });
});
