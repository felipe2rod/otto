// O caminho padrão do produto, de ponta a ponta (ADR 033): cadastrar a marca, preencher o formulário de
// briefing, o "pode", a espera, a revisão e aceitar. Mais: briefing salvo e reuso, rascunho local, o
// aviso de ampliação da foto, a busca no banco de imagens (no formulário e no editor) e a fonte do
// catálogo no painel de Propriedades.
//
// A tarefa roda com o modelo roteirizado (nenhuma chamada a modelo de verdade). A busca de imagens e o
// catálogo de fontes são SIMULADOS aqui: os testes não dependem do banco de imagens nem do catálogo de
// verdade. A resposta simulada usa um banco com nome de teste: a tela mostra o nome que o servidor manda.
import type { Locator, Page } from '@playwright/test';
import { briefing as textos, fontes as textosDeFontes, imagens as textosDeImagens, marcas as textosDeMarcas } from '../src/textos/briefing';
import { editor as textosDoEditor } from '../src/textos/editor';
import { otto as textosDoOtto } from '../src/textos/otto';
import { pecas as textosDePecas } from '../src/textos/pecas';
import { type Api, buscarDeVerdade, camada, camadas } from './apoio/api';
import { png } from './apoio/arquivos';
import { CORES, type Editor, expect, test } from './apoio/teste';

const codigo = (prefixo = 'e2e') => `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const ATE_O_PODE = { timeout: 90_000 };
const ATE_TERMINAR = { timeout: 150_000 };
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H90V90H10Z" fill="#0f3b2c"/><path d="M30 30H70V70H30Z" fill="#f4c430"/></svg>';
const BANCO = { id: 'banco-de-teste', nome: 'Banco de Teste', licenca: 'Licença de teste', ladoMaximo: 1280 };

const formulario = (page: Page): Locator => page.getByRole('form', { name: textos.titulo });
const titulo = (page: Page): Locator => page.getByRole('textbox', { name: new RegExp(`^${textos.campos.titulo}`) });
const formato = (page: Page, nome: string): Locator => formulario(page).getByRole('button', { name: new RegExp(`^${nome} \\d`) });
const fonteDasImagens = (page: Page, qual: string): Locator => page.getByRole('radio', { name: textos.imagens.fontes[qual] as string });
const criar = (page: Page): Locator => page.getByRole('button', { name: new RegExp(`^${textos.rodape.criar}`) });
const painelDoOtto = (page: Page): Locator => page.getByRole('region', { name: textosDoOtto.titulo, exact: true });
const estadoDaTarefa = (page: Page, qual: string): Locator => painelDoOtto(page).locator(`[data-estado-da-tarefa="${qual}"]`);
const fotos = (page: Page): Locator => page.getByRole('list', { name: textos.imagens.lista }).getByRole('listitem');

async function abrirOFormulario(page: Page, consulta = ''): Promise<void> {
  await page.goto(`/editor/novo${consulta}`);
  await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
}

/** Depois de "Criar a peça": espera o editor abrir na peça nova e devolve o id dela. */
async function noEditor(editor: Editor): Promise<string> {
  await editor.page.waitForURL(/\/editor\/p\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = editor.page.url().split('/').pop() as string;
  editor.pecaId = id;
  return id;
}

/**
 * Simula o banco de imagens: a busca devolve um resultado só, a prévia é um PNG, e "trazer" entrega um
 * arquivo que o teste enviou de verdade para a conta (o hash precisa existir para a peça usá-lo).
 */
async function simularOBanco(page: Page, api: Api, cor: readonly [number, number, number]): Promise<{ sha256: string; buscas: () => string[] }> {
  const arquivo = await api.enviarImagem(png(640, 480, cor));
  const buscas: string[] = [];
  await page.route(/\/api\/imagens\/busca\?/, async (rota) => {
    buscas.push(new URL(rota.request().url()).search);
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        banco: BANCO,
        itens: [
          {
            banco: BANCO.id,
            id: '42',
            descricao: 'pão quente, padaria',
            largura: 640,
            altura: 480,
            autor: 'Fulana de Teste',
            pagina: 'https://exemplo.test/foto/42',
            previa: `/api/imagens/${BANCO.id}/42/previa`,
          },
        ],
      }),
    });
  });
  await page.route(`**/api/imagens/${BANCO.id}/42/previa`, (rota) => rota.fulfill({ status: 200, contentType: 'image/png', body: png(64, 48, cor) }));
  await page.route('**/api/imagens/trazer', async (rota) => {
    const origem = { banco: BANCO.nome, autor: 'Fulana de Teste', licenca: BANCO.licenca };
    await rota.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sha256: arquivo.sha256,
        tipo: 'image/png',
        largura: 640,
        altura: 480,
        bytes: 1000,
        origem: { ...origem, pagina: 'https://exemplo.test/foto/42' },
        no: { tipo: 'imagem', arquivo: arquivo.sha256, larguraOriginal: 640, alturaOriginal: 480, origem: { ...origem, url: '' } },
      }),
    });
  });
  return { sha256: arquivo.sha256, buscas: () => buscas };
}

async function buscarEUsar(onde: Locator): Promise<void> {
  await onde.getByRole('searchbox', { name: textosDeImagens.campo }).fill('padaria');
  await onde.getByRole('button', { name: textosDeImagens.buscar, exact: true }).click();
  // a origem, o autor e a licença estão à vista nos resultados
  await expect(onde.locator('[data-origem-das-imagens]')).toContainText(BANCO.nome);
  await expect(onde.locator('[data-origem-das-imagens]')).toContainText(BANCO.licenca);
  const resultado = onde.getByRole('list', { name: textosDeImagens.resultados }).getByRole('listitem').first();
  await expect(resultado).toContainText(textosDeImagens.autor('Fulana de Teste'));
  await expect(resultado.getByRole('link', { name: textosDeImagens.verNoBanco(BANCO.nome) })).toHaveAttribute('href', 'https://exemplo.test/foto/42');
  await resultado.getByRole('button', { name: textosDeImagens.trazerEsta('Fulana de Teste') }).click();
}

test.describe('briefing', () => {
  test.describe.configure({ timeout: 360_000 });

  test('do cadastro da marca à peça aceita: marca, formulário, o "pode", a espera, a revisão e aceitar', async ({ page, editor, api, descartar }) => {
    const nomeDaMarca = codigo('e2e marca');
    const nomeDaPeca = codigo('e2e peça');

    // ---------- a marca ----------
    await page.goto('/editor/marcas');
    await page.getByRole('button', { name: textosDeMarcas.nova }).click();
    await page.getByRole('textbox', { name: textosDeMarcas.campos.nome, exact: true }).fill(nomeDaMarca);
    await page.getByRole('textbox', { name: textosDeMarcas.campos.codigoDe(textosDeMarcas.campos.papeis.primaria as string) }).fill('#0f3b2c');
    await page.getByRole('textbox', { name: textosDeMarcas.campos.rodape }).fill('@marcadeteste');
    await page.getByRole('textbox', { name: textosDeMarcas.campos.restricoes }).fill('nunca foto de pessoa');
    // o logo em SVG aparece como o Otto o entendeu, antes de salvar
    await page.locator('input[type=file][accept*="png"]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(LOGO) });
    await expect(page.getByRole('img', { name: textosDeMarcas.campos.logoComoEntendi })).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    await page.getByRole('button', { name: textosDeMarcas.salvar }).click();

    const daLista = page.getByRole('list', { name: textosDeMarcas.lista }).getByRole('listitem').filter({ hasText: nomeDaMarca });
    await expect(daLista).toHaveCount(1);
    const marca = (await api.marcas()).find((m) => m.nome === nomeDaMarca);
    expect(marca).toMatchObject({ cores: { primaria: '#0f3b2c' }, rodape: '@marcadeteste', restricoes: ['nunca foto de pessoa'] });
    expect((marca?.logo as { arquivo?: string } | undefined)?.arquivo).toMatch(/^[0-9a-f]{64}$/);
    if (marca) descartar.marca(marca.id);

    // ---------- o formulário ----------
    await daLista.getByRole('link', { name: textosDeMarcas.novaPecaPara(nomeDaMarca) }).click();
    await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('combobox', { name: textos.marca.rotulo })).toHaveValue(marca?.id ?? '');
    await expect(page.locator('[data-resumo-da-marca] [data-cor]')).toHaveCount(1);
    // vazio: o botão não envia, e a tela diz o que falta
    await expect(criar(page)).toBeDisabled();
    await expect(page.locator('[data-falta]')).toHaveAttribute('data-falta', 'titulo formato imagem');

    await titulo(page).fill('Abrimos às 7h');
    await page.getByRole('textbox', { name: textos.campos.nome }).fill(nomeDaPeca);
    await formato(page, 'Feed').click();
    await formato(page, 'Story').click();
    await fonteDasImagens(page, 'nenhuma').check();
    await expect(page.locator('[data-falta]')).toHaveCount(0);
    await criar(page).click();

    // ---------- o "pode" ----------
    const pecaId = await noEditor(editor);
    descartar.peca(pecaId);
    await editor.pronto();
    await expect(estadoDaTarefa(page, 'aguardando_confirmacao')).toBeVisible(ATE_O_PODE);
    // o que chegou ao servidor é o formulário, com a marca aplicada por ele
    const viva = await api.tarefaViva(pecaId);
    const tarefa = await api.tarefa(viva?.id ?? '');
    expect(tarefa.entrada).toMatchObject({
      tipo: 'briefing',
      briefing: { versao: 1, marcaId: marca?.id, textos: { titulo: 'Abrimos às 7h', rodape: '@marcadeteste' }, imagens: { fonte: 'nenhuma' } },
    });
    expect(((tarefa.entrada.briefing?.formatos ?? []) as { nome: string }[]).map((f) => f.nome)).toEqual(['Feed', 'Story']);
    expect((await api.abrir(pecaId)).nome).toBe(nomeDaPeca);

    // ---------- a espera, a revisão e o aceite ----------
    await painelDoOtto(page).getByRole('button', { name: textosDoOtto.pode.aprovar, exact: true }).click();
    await expect(painelDoOtto(page).getByRole('list', { name: textosDoOtto.espera.etapas })).toBeVisible({ timeout: 60_000 });
    await expect(estadoDaTarefa(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    await expect(estadoDaTarefa(page, 'em_revisao')).not.toHaveAttribute('data-parou', 'sim');
    // na revisão, a verificação diz qual prancheta foi conferida
    await expect(painelDoOtto(page).locator('[data-tipo="verificacao"]').first()).toBeAttached();
    await painelDoOtto(page).getByRole('button', { name: textosDoOtto.revisao.aceitar, exact: true }).click();
    await expect(painelDoOtto(page).locator('[data-resultado="aceita"]')).toBeVisible();

    const aceita = await api.abrir(pecaId);
    expect(aceita.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story']);
    expect(camadas(aceita.arvore.pranchetas[0]?.filhos ?? []).length).toBeGreaterThan(3);
    expect((await api.tarefas(pecaId)).itens.map((t) => t.estado)).toEqual(['aceita']);

    // ---------- "nova peça com este briefing", a partir da tarefa aceita ----------
    await painelDoOtto(page).getByRole('link', { name: textosDoOtto.resultado.comEsteBriefing }).click();
    await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
    await expect(titulo(page)).toHaveValue('Abrimos às 7h');
    await expect(formato(page, 'Story')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('combobox', { name: textos.marca.rotulo })).toHaveValue(marca?.id ?? '');
    // o rodapé veio da marca: não é repetido no formulário, e aparece como sendo dela
    await expect(page.getByRole('textbox', { name: textos.campos.rodape })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: textos.campos.rodape })).toHaveAttribute('placeholder', textos.campos.rodapeDaMarca('@marcadeteste'));
  });

  test('briefing salvo: salvar pela metade, começar dele, e a peça dele conta o uso; o menu da peça reabre o mesmo briefing', async ({ page, editor, api, descartar }) => {
    const nomeDoBriefing = codigo('e2e briefing');
    await abrirOFormulario(page);
    await formato(page, 'Feed').click();
    await formato(page, 'Story').click();
    await fonteDasImagens(page, 'nenhuma').check();
    await page.getByRole('button', { name: textos.rodape.salvar }).click();
    await page.getByRole('textbox', { name: textos.rodape.nomeDoBriefing }).fill(nomeDoBriefing);
    await page.getByRole('button', { name: textos.rodape.salvarComEsteNome, exact: true }).click();
    await expect(page.getByText(textos.rodape.salvo(nomeDoBriefing))).toBeVisible();
    const salvo = (await api.briefings()).find((b) => b.nome === nomeDoBriefing);
    expect(salvo?.usos).toBe(0);
    if (!salvo) throw new Error('o briefing não foi salvo');
    descartar.briefing(salvo.id);
    // sem título, o briefing salvo vale: é o formulário pela metade
    expect((await api.briefing(salvo.id)).dados).toMatchObject({ versao: 1, imagens: { fonte: 'nenhuma' } });

    // em outra visita: começar em branco e escolher o briefing salvo
    await page.evaluate(() => window.localStorage.clear());
    await abrirOFormulario(page);
    await expect(formato(page, 'Feed')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('combobox', { name: textos.comecarDe.rotulo }).selectOption(salvo.id);
    await expect(formato(page, 'Feed')).toHaveAttribute('aria-pressed', 'true');
    await expect(formato(page, 'Story')).toHaveAttribute('aria-pressed', 'true');
    await expect(fonteDasImagens(page, 'nenhuma')).toBeChecked();
    await expect(page.locator('[data-falta]')).toHaveAttribute('data-falta', 'titulo');

    const nomeDaPeca = codigo('e2e peça');
    await titulo(page).fill('Fechado no feriado');
    await page.getByRole('textbox', { name: textos.campos.nome }).fill(nomeDaPeca);
    await criar(page).click();
    const pecaId = await noEditor(editor);
    descartar.peca(pecaId);
    await editor.pronto();
    await expect(estadoDaTarefa(page, 'aguardando_confirmacao')).toBeVisible(ATE_O_PODE);
    await expect.poll(async () => (await api.briefing(salvo.id)).usos).toBe(1);

    // cancela no "pode" (nada muda na peça) e reusa o briefing dela pelo menu do cartão
    await painelDoOtto(page).getByRole('button', { name: textosDoOtto.pode.cancelar, exact: true }).click();
    await expect(painelDoOtto(page).locator('[data-resultado="cancelada"]')).toBeVisible();
    await page.goto('/editor');
    const cartao = page.getByRole('list', { name: textosDePecas.lista }).getByRole('listitem').filter({ hasText: nomeDaPeca });
    await cartao.locator('summary').click();
    await cartao.getByRole('link', { name: textosDePecas.comEsteBriefing }).click();
    await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
    await expect(titulo(page)).toHaveValue('Fechado no feriado');
    await expect(formato(page, 'Story')).toHaveAttribute('aria-pressed', 'true');
  });

  test('rascunho: fechar a aba sem enviar não perde o que foi digitado, e dá para começar em branco', async ({ page }) => {
    await abrirOFormulario(page);
    await titulo(page).fill('Promoção de inverno');
    await formato(page, 'Banner').click();
    await page.reload();
    await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
    await expect(titulo(page)).toHaveValue('Promoção de inverno');
    await expect(formato(page, 'Banner')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-rascunho-recuperado]')).toBeVisible();

    await page.getByRole('button', { name: textos.rascunho.limpar }).click();
    await expect(titulo(page)).toHaveValue('');
    await page.reload();
    await expect(formulario(page)).toBeVisible({ timeout: 60_000 });
    await expect(titulo(page)).toHaveValue('');
    await expect(page.locator('[data-rascunho-recuperado]')).toHaveCount(0);
  });

  test('foto pequena para o formato: o formulário mostra as medidas e quanto ela será ampliada, e não bloqueia; no máximo três formatos', async ({ page }) => {
    await abrirOFormulario(page);
    await titulo(page).fill('Foto pequena');
    await formato(page, 'Story').click();
    await page.locator('[data-enviar-fotos]').setInputFiles({ name: 'produto.png', mimeType: 'image/png', buffer: png(400, 300, CORES.foto) });
    const foto = fotos(page).first();
    await expect(foto.locator('[data-medidas]')).toHaveText(textos.imagens.medidas(400, 300));
    // 400×300 para cobrir 1080×1920: o maior entre 1080/400 e 1920/300, que é 6,4 (640%)
    await expect(foto.locator('[data-ampliacao]')).toContainText(textos.imagens.ampliada('Story', 6.4));
    await expect(criar(page)).toBeEnabled();

    // o que não é imagem é recusado ali mesmo, e a foto boa fica
    await page.locator('[data-enviar-fotos]').setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(fotos(page)).toHaveCount(2);
    await expect(fotos(page).nth(1)).toHaveAttribute('data-estado', 'falhou');
    await expect(criar(page)).toBeEnabled();

    await formato(page, 'Feed').click();
    await formato(page, 'Quadrado').click();
    await expect(formato(page, 'Banner')).toBeDisabled();
    await expect(formato(page, 'Capa')).toBeDisabled();
  });

  test('busca no banco de imagens dentro do formulário (resposta simulada): a foto escolhida entra com a origem e vai no briefing pelo hash', async ({ page, editor, api, descartar }) => {
    const banco = await simularOBanco(page, api, CORES.disco);
    await abrirOFormulario(page);
    await titulo(page).fill('Pão quente às 6h');
    await formato(page, 'Quadrado').click();
    await page.getByRole('button', { name: textos.imagens.buscar }).click();
    await buscarEUsar(formulario(page));
    expect(banco.buscas()[0]).toContain('q=padaria');

    const foto = fotos(page).first();
    await expect(foto.locator('[data-origem]')).toHaveText(textos.imagens.origem(BANCO.nome, 'Fulana de Teste'));
    await expect(foto.locator('[data-medidas]')).toHaveText(textos.imagens.medidas(640, 480));
    // a foto de banco chega pequena: o aviso de ampliação vale para ela também
    await expect(foto.locator('[data-ampliacao]')).toBeVisible();

    await criar(page).click();
    const pecaId = await noEditor(editor);
    descartar.peca(pecaId);
    // a tarefa pode terminar depressa (um formato só não pede o "pode"): pega a da peça, viva ou não
    await expect.poll(async () => (await api.tarefas(pecaId)).itens.length, { timeout: 30_000 }).toBe(1);
    const tarefa = await api.tarefa((await api.tarefas(pecaId)).itens[0]?.id ?? '');
    expect(tarefa.entrada.briefing?.imagens).toEqual({ fonte: 'minhas', arquivos: [banco.sha256] });
  });

  test('busca no banco de imagens dentro do editor (resposta simulada): a imagem vira camada, com banco, autor e licença', async ({ editor, criarPeca, api }) => {
    const peca = await criarPeca();
    const banco = await simularOBanco(editor.page, api, CORES.disco);
    await editor.abrir(peca);
    const { page } = editor;
    await page.getByRole('toolbar', { name: textosDoEditor.ferramentas.rotulo }).getByRole('button', { name: textosDeImagens.abrir }).click();
    const dialogo = page.getByRole('dialog', { name: textosDeImagens.titulo });
    await buscarEUsar(dialogo);
    await dialogo.getByRole('button', { name: textosDeImagens.fechar }).click();
    await expect(dialogo).toHaveCount(0);

    // a camada nasceu por operação do catálogo, está selecionada e guarda de onde veio
    await expect(editor.linha('pão quente')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => camadas((await editor.servidor()).arvore.pranchetas[0]?.filhos ?? []).some((n) => n.nome === 'pão quente')).toBe(true);
    const no = camada(await editor.servidor(), 'pão quente');
    expect(no).toMatchObject({
      tipo: 'imagem',
      arquivo: banco.sha256,
      larguraOriginal: 640,
      alturaOriginal: 480,
      origem: { banco: BANCO.nome, autor: 'Fulana de Teste', licenca: BANCO.licenca, url: '' },
    });
    // nenhum endereço do banco entra no documento
    expect(JSON.stringify(await editor.servidor())).not.toContain('exemplo.test');
    // o canvas desenha a imagem trazida (o centro da camada tem a cor dela)
    await editor.esperarCor({ x: (no.x ?? 0) + (no.largura ?? 0) / 2, y: (no.y ?? 0) + (no.altura ?? 0) / 2 }, CORES.disco, { tolerancia: 24 });
  });

  test('fonte do catálogo no painel de Propriedades: diz que está baixando e troca a fonte da camada quando ela chega', async ({ editor, criarPeca }) => {
    const peca = await criarPeca();
    const { page } = editor;
    // O catálogo de verdade não entra no teste: uma família que a biblioteca já tem é mostrada como
    // "do catálogo, ainda não baixada", e o pedido que a traria é segurado para o estado aparecer.
    const FAMILIA = 'Anton';
    await page.route(/\/api\/fontes\?catalogo=1$/, async (rota) => {
      const resposta = await buscarDeVerdade(rota);
      const lista = (await resposta.json()) as { itens: { familia: string; naBiblioteca?: boolean }[] };
      expect(lista.itens.some((f) => f.familia === FAMILIA)).toBe(true);
      await rota.fulfill({ response: resposta, json: { itens: lista.itens.map((f) => (f.familia === FAMILIA ? { ...f, naBiblioteca: false } : f)) } });
    });
    let soltar: (() => void) | undefined;
    const segurado = new Promise<void>((seguir) => (soltar = seguir));
    let pedidos = 0;
    await page.route(`**/api/fontes/${FAMILIA}/*`, async (rota) => {
      if (rota.request().url().endsWith('/arquivo')) return rota.fallback();
      pedidos++;
      await segurado;
      await rota.fulfill({ response: await buscarDeVerdade(rota) });
    });

    await editor.abrir(peca);
    await editor.linha('Legenda').click();
    const fonte = page.getByRole('combobox', { name: textosDoEditor.propriedades.fonte, exact: true });
    const noCatalogo = fonte.locator(`optgroup[label="${textosDeFontes.doCatalogo}"] option[value="${FAMILIA}"]`);
    await expect(noCatalogo).toHaveCount(1);
    await fonte.selectOption(FAMILIA);

    await expect(page.locator('[data-baixando-fonte]')).toHaveText(textosDeFontes.baixando(FAMILIA));
    await expect(fonte).toBeDisabled();
    expect(camada(await editor.servidor(), 'Legenda').fonte, 'a camada só muda quando a fonte chega').toBe('IBM Plex Sans');
    expect(pedidos).toBe(1);

    soltar?.();
    await expect(page.locator('[data-baixando-fonte]')).toHaveCount(0);
    await expect(fonte).toHaveValue(FAMILIA);
    await expect.poll(async () => camada(await editor.servidor(), 'Legenda').fonte).toBe(FAMILIA);
    // chegou: agora ela é da biblioteca
    await expect(noCatalogo).toHaveCount(0);
    await expect(fonte.locator(`optgroup[label="${textosDeFontes.naBiblioteca}"] option[value="${FAMILIA}"]`)).toHaveCount(1);
  });
});
