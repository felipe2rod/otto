// Edição no canvas com mouse e teclado de verdade. Todo gesto vira operação do catálogo: cada teste
// confere o que o SERVIDOR guardou depois do gesto, e, onde importa, o pixel do canvas.
import { editor as textos } from '../src/textos/editor';
import { exportar as textosDeExportar } from '../src/textos/exportar';
import { camada, camadas } from './apoio/api';
import { CORES, centro, expect, test } from './apoio/teste';

const p = textos.propriedades;
/** Bloco: retângulo em (100, 100), 400×300. Disco: elipse em (600, 150), 300×300. */
const NO_BLOCO = { x: 300, y: 250 };
const NO_DISCO = { x: 750, y: 300 };

test.describe('edição no canvas', () => {
  test.beforeEach(async ({ criarPeca, editor }) => {
    await editor.abrir(await criarPeca());
    await editor.esperarCor(NO_BLOCO, CORES.bloco);
  });

  test('arrastar move a camada: um lote, e o canvas a mostra no lugar novo', async ({ editor }) => {
    const antes = await editor.servidor();
    await editor.arrastar(NO_BLOCO, { x: 360, y: 290 });

    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ x: 160, y: 140, largura: 400, altura: 300 });
    expect((await editor.servidor()).versao).toBe(antes.versao + 1);
    expect(await editor.selecionadas()).toEqual(['Bloco']);
    // longe das alças da seleção, que são desenhadas por cima
    await editor.esperarCor({ x: 500, y: 400 }, CORES.bloco);
    await editor.esperarCor({ x: 130, y: 120 }, CORES.fundoDoFeed);
  });

  test('setas movem 1 unidade e Shift+seta move 10', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.teclar('ArrowRight');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').x).toBe(101);
    await editor.teclar('Shift+ArrowDown');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ x: 101, y: 110 });
  });

  test('Delete remove a camada selecionada', async ({ editor }) => {
    await editor.clicar(NO_DISCO);
    await editor.teclar('Delete');
    await expect.poll(async () => camadas((await editor.servidor()).arvore.pranchetas[0]?.filhos ?? []).map((n) => n.nome)).not.toContain('Disco');
    await editor.esperarCor(NO_DISCO, CORES.fundoDoFeed);
  });

  test('a alça do canto redimensiona; com Shift mantém a proporção', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.arrastar({ x: 500, y: 400 }, { x: 600, y: 450 });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ x: 100, y: 100, largura: 500, altura: 350 });
    await editor.esperarCor({ x: 580, y: 430 }, CORES.bloco);

    // 500×350 com Shift e +100 na largura: 600×420
    await editor.arrastar({ x: 600, y: 450 }, { x: 700, y: 455 }, { shift: true });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ largura: 600, altura: 420 });
  });

  test('a pega de cima gira em torno do centro; com Shift trava em passos de 15°', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.girar({ x: 300, y: 100 }, NO_BLOCO, 40);
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').rotacao ?? 0).toBeGreaterThan(38);
    const girado = camada(await editor.servidor(), 'Bloco');
    expect(girado.rotacao).toBeLessThan(42);
    // girar em torno do centro não muda posição nem tamanho
    expect(girado).toMatchObject({ x: 100, y: 100, largura: 400, altura: 300 });

    await editor.teclar('Control+KeyZ');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').rotacao).toBe(0);
    await editor.girar({ x: 300, y: 100 }, NO_BLOCO, 40, true);
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').rotacao).toBe(45);
  });

  test('camada já girada: a alça trabalha no sentido dela, e o lado oposto não sai do lugar', async ({ editor, api }) => {
    await api.lote(editor.pecaId, [{ op: 'alterar', alvo: camada(await editor.servidor(), 'Bloco').id, props: { rotacao: 90 } }]);
    await editor.page.reload();
    await editor.pronto();
    await editor.esperarCor(NO_BLOCO, CORES.bloco);

    // girado 90°, o lado leste (largura) aponta para baixo: a alça leste fica em (300, 450)
    await editor.clicar(NO_BLOCO);
    await editor.arrastar({ x: 300, y: 450 }, { x: 300, y: 550 });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ largura: 500, altura: 300, rotacao: 90 });
    // o lado oeste continua em y = 50: o centro desceu 50
    const meio = centro(camada(await editor.servidor(), 'Bloco'));
    expect(meio.x).toBeCloseTo(300, 1);
    expect(meio.y).toBeCloseTo(300, 1);
  });

  test('Shift+clique seleciona várias, e arrastar uma move todas num lote só', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.clicarComShift(NO_DISCO);
    expect(await editor.selecionadas()).toEqual(['Bloco', 'Disco']);

    const antes = (await editor.servidor()).versao;
    await editor.arrastar(NO_BLOCO, { x: 350, y: 270 });
    await expect.poll(async () => camada(await editor.servidor(), 'Disco')).toMatchObject({ x: 650, y: 170 });
    expect(camada(await editor.servidor(), 'Bloco')).toMatchObject({ x: 150, y: 120 });
    expect((await editor.servidor()).versao).toBe(antes + 1);
  });

  test('várias camadas: a alça do conjunto redimensiona todas na mesma proporção', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.clicarComShift(NO_DISCO);
    // o conjunto vai de (100, 100) a (900, 450): 800×350. +80 e +35 são 10% nos dois eixos
    await editor.arrastar({ x: 900, y: 450 }, { x: 980, y: 485 });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ x: 100, y: 100, largura: 440, altura: 330 });
    expect(camada(await editor.servidor(), 'Disco')).toMatchObject({ x: 650, y: 155, largura: 330, altura: 330 });
  });

  test('várias camadas: girar pelo conjunto gira cada uma em torno do centro dele', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.clicarComShift(NO_DISCO);
    // centro do conjunto: (500, 275)
    await editor.girar({ x: 500, y: 100 }, { x: 500, y: 275 }, 88, true);

    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').rotacao).toBe(90);
    const peca = await editor.servidor();
    expect(camada(peca, 'Disco').rotacao).toBe(90);
    // o centro do Bloco (300, 250) gira 90° em torno de (500, 275): vai para (525, 75)
    expect(centro(camada(peca, 'Bloco')).x).toBeCloseTo(525, 1);
    expect(centro(camada(peca, 'Bloco')).y).toBeCloseTo(75, 1);
    expect(centro(camada(peca, 'Disco')).x).toBeCloseTo(475, 1);
    expect(centro(camada(peca, 'Disco')).y).toBeCloseTo(525, 1);
  });

  test('Ctrl+J duplica: a cópia nasce logo acima da original e fica selecionada', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.teclar('Control+KeyJ');
    await expect.poll(async () => (await editor.servidor()).arvore.pranchetas[0]?.filhos.length).toBe(6);
    const nomes = (await editor.servidor()).arvore.pranchetas[0]?.filhos.map((n) => n.nome) ?? [];
    expect(nomes).toHaveLength(6);
    expect(nomes[0]).toBe('Bloco');
    expect(nomes[2]).toBe('Disco');
    // a selecionada agora é a cópia, não a original
    await expect.poll(() => editor.selecionadas()).toEqual([nomes[1]]);
  });

  test('Ctrl+G agrupa as selecionadas, Ctrl+J duplica o grupo inteiro e Ctrl+Shift+G desagrupa', async ({ editor }) => {
    await editor.clicar(NO_BLOCO);
    await editor.clicarComShift(NO_DISCO);
    await editor.teclar('Control+KeyG');
    await expect.poll(async () => (await editor.servidor()).arvore.pranchetas[0]?.filhos.filter((n) => n.tipo === 'grupo').map((g) => g.filhos?.map((f) => f.nome))).toEqual([['Bloco', 'Disco']]);
    const grupo = (await editor.servidor()).arvore.pranchetas[0]?.filhos.find((n) => n.tipo === 'grupo');
    await expect.poll(() => editor.selecionadas()).toEqual([grupo?.nome]);

    // duplicar o grupo: um grupo novo com as duas camadas dentro
    await editor.teclar('Control+KeyJ');
    await expect.poll(async () => (await editor.servidor()).arvore.pranchetas[0]?.filhos.filter((n) => n.tipo === 'grupo').map((g) => g.filhos?.length)).toEqual([2, 2]);

    // desfaz a cópia, seleciona o grupo de novo e desagrupa
    await editor.teclar('Control+KeyZ');
    await expect.poll(async () => (await editor.servidor()).arvore.pranchetas[0]?.filhos.filter((n) => n.tipo === 'grupo')).toHaveLength(1);
    await editor.linha(grupo?.nome ?? '').click();
    await editor.teclar('Control+Shift+KeyG');
    await expect.poll(async () => (await editor.servidor()).arvore.pranchetas[0]?.filhos.filter((n) => n.tipo === 'grupo')).toHaveLength(0);
    await expect.poll(() => editor.selecionadas()).toEqual(['Bloco', 'Disco']);
  });

  test('grupo selecionado tem alças: redimensionar o grupo redimensiona as camadas de dentro', async ({ editor, api }) => {
    const peca = await editor.servidor();
    await api.lote(editor.pecaId, [{ op: 'agrupar', alvos: [camada(peca, 'Bloco').id, camada(peca, 'Disco').id], nome: 'Formas' }]);
    await editor.page.reload();
    await editor.pronto();
    await editor.esperarCor(NO_BLOCO, CORES.bloco);

    await editor.linha('Formas').click();
    await editor.arrastar({ x: 900, y: 450 }, { x: 980, y: 485 });
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco')).toMatchObject({ largura: 440, altura: 330 });
    expect(camada(await editor.servidor(), 'Disco')).toMatchObject({ x: 650, largura: 330 });
  });

  test('dois cliques num texto abrem a edição no lugar; Ctrl+Enter grava, Esc desiste', async ({ editor }) => {
    const noTitulo = { x: 540, y: 640 };
    const ponto = await editor.naTela(noTitulo);
    await editor.page.mouse.dblclick(ponto.x, ponto.y);
    const campo = editor.page.getByRole('textbox', { name: textos.canvas.editarTexto('Título') });
    await expect(campo).toBeFocused();
    await expect(campo).toHaveValue('Otto em teste');

    await campo.fill('Texto novo');
    await campo.press('Control+Enter');
    await expect(campo).toHaveCount(0);
    await expect.poll(async () => camada(await editor.servidor(), 'Título').conteudo).toBe('Texto novo');

    // Enter com a camada selecionada abre de novo; Esc sai sem gravar
    const versao = (await editor.servidor()).versao;
    await editor.teclar('Enter');
    await expect(campo).toBeFocused();
    await campo.fill('não vale');
    await campo.press('Escape');
    await expect(campo).toHaveCount(0);
    expect((await editor.servidor()).versao).toBe(versao);
    expect(camada(await editor.servidor(), 'Título').conteudo).toBe('Texto novo');
  });

  test('Propriedades: cada campo confirmado vira um lote, e o canvas acompanha', async ({ editor }) => {
    await editor.linha('Bloco').click();
    await expect(editor.campo(p.x)).toHaveValue('100');

    await editor.campo(p.x).fill('250');
    await editor.campo(p.x).press('Enter');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').x).toBe(250);
    await editor.esperarCor({ x: 150, y: 220 }, CORES.fundoDoFeed);
    // (560, 120) fica fora do Disco, que está por cima do Bloco mais à direita
    await editor.esperarCor({ x: 560, y: 130 }, CORES.bloco);

    await editor.campo(p.opacidade).fill('50');
    await editor.campo(p.opacidade).press('Enter');
    await expect.poll(async () => camada(await editor.servidor(), 'Bloco').opacidade).toBe(0.5);

    await editor.campo(p.nome).fill('Tijolo');
    await editor.campo(p.nome).press('Enter');
    await expect(editor.linha('Tijolo')).toBeVisible();
    await expect.poll(async () => camadas((await editor.servidor()).arvore.pranchetas[0]?.filhos ?? []).map((n) => n.nome)).toContain('Tijolo');
  });

  test('Propriedades de texto: o conteúdo e o tamanho mudam a camada', async ({ editor }) => {
    await editor.linha('Legenda').click();
    // o rótulo envolve a área de texto, então o nome acessível dela leva o conteúdo junto: sem `exact`
    const conteudo = editor.page.getByRole('textbox', { name: p.conteudo });
    await conteudo.fill('outra linha');
    await conteudo.blur();
    await expect.poll(async () => camada(await editor.servidor(), 'Legenda').conteudo).toBe('outra linha');

    await editor.campo(p.tamanho).fill('60');
    await editor.campo(p.tamanho).press('Enter');
    await expect.poll(async () => camada(await editor.servidor(), 'Legenda').tamanho).toBe(60);
  });
});

test.describe('texto com peso que a biblioteca não tem', () => {
  test('Propriedades diz o peso pedido e o que está sendo usado, e o relatório de exportação também', async ({ criarPeca, editor }) => {
    // a biblioteca tem a DM Serif Display só em 400
    const operacoes = [
      { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#ffffff' },
      {
        op: 'criarNo',
        prancheta: 'Feed',
        no: { tipo: 'texto', nome: 'Chamada', conteudo: 'Peso trocado', fonte: 'DM Serif Display', peso: 700, tamanho: 120, x: 100, y: 200, largura: 880, altura: 300, cor: '#17171c' },
      },
    ];
    await editor.abrir(await criarPeca({ nome: `e2e peso ${Date.now().toString(36)}`, operacoes }));
    await editor.linha('Chamada').click();
    await expect(editor.page.getByText(p.pesoTrocado(700, 400))).toBeVisible();
    // o campo continua mostrando o peso do documento
    // o rótulo envolve a lista, então o nome acessível dela leva as opções junto: pelo começo do nome
    await expect(editor.page.getByRole('combobox', { name: new RegExp(`^${p.peso}`) })).toHaveValue('700');

    await editor.botaoDoTopo(textos.topo.exportar).click();
    const relatorio = editor.page.getByRole('dialog').getByRole('region', { name: textosDeExportar.relatorio.pesosTrocados.titulo(1) });
    await expect(relatorio).toContainText(textosDeExportar.relatorio.pesosTrocados.item('Feed / Chamada', 'DM Serif Display', 700, 400));
  });
});
