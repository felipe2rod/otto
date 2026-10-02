// O painel do Otto, de ponta a ponta, com o modelo roteirizado (nenhuma chamada a modelo de verdade):
// pedir, o "pode", a espera com a peça travada, a revisão, aceitar, desfazer, o ajuste rápido,
// interromper e retomar depois de recarregar.
//
// O roteiro é escolhido pelo TIPO do pedido, não pelo texto. O de BRIEFING (dois formatos, a partir de
// uma peça vazia) define a direção, pede o "pode" e monta Feed e Story; o de AJUSTE altera o Título do
// Feed. Aqui a tarefa de briefing começa pela API, com o MESMO corpo que o formulário manda (versão 1,
// fechado), para estes testes cuidarem só do painel; o caminho inteiro pela tela (marca, formulário,
// "pode", revisão) está em briefing.e2e.ts. O campo de pedir é conferido no ajuste rápido, no pedido maior
// (que chega ao "pode"), no pedido livre em peça vazia e nas recusas.
//
// A conta roda UMA tarefa por vez: os testes daqui rodam em ordem, e a peça de cada teste é limpa no
// fim (a tarefa viva é cancelada ou desfeita antes de arquivar).
import type { Locator, Page } from '@playwright/test';
import { erros } from '../src/textos/erros';
import { otto as textos } from '../src/textos/otto';
import { pecas as textosDePecas } from '../src/textos/pecas';
import { type Api, camada, camadas, type PecaDoServidor } from './apoio/api';
import { distancia, type Editor, expect, test } from './apoio/teste';

/** O verde do bloco que o roteiro monta no topo do Feed (o token "primaria" do briefing gravado). */
const VERDE = [15, 59, 44] as const;
/** Um ponto do Feed dentro do bloco verde, à esquerda da margem dos textos. */
const NO_BLOCO = { x: 30, y: 420 };
/** A tarefa roteirizada leva perto de meio minuto; a folga é para a máquina ocupada. */
const ATE_TERMINAR = { timeout: 150_000 };
const ATE_O_PODE = { timeout: 90_000 };

const codigo = () => `e2e-otto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const painel = (page: Page): Locator => page.getByRole('region', { name: textos.titulo, exact: true });
const estado = (page: Page, qual: string): Locator => painel(page).locator(`[data-estado-da-tarefa="${qual}"]`);
const botao = (page: Page, nome: string): Locator => painel(page).getByRole('button', { name: nome, exact: true });
const trava = (page: Page): Locator => page.locator('[data-trava-do-otto]');
const resultado = (page: Page, qual: string): Locator => painel(page).locator(`[data-resultado="${qual}"]`);

async function pedir(page: Page, texto: string, tipo?: 'ajuste' | 'pedido'): Promise<void> {
  if (tipo) await painel(page).getByRole('radio', { name: textos.pedir.tipos[tipo] }).check();
  await painel(page).getByRole('textbox', { name: textos.pedir.campo }).fill(texto);
  await botao(page, textos.pedir.enviar).click();
}

/** O formulário de briefing, como o editor o manda: dois formatos, sem imagem. É o que o roteiro de briefing responde. */
const BRIEFING = {
  tipo: 'briefing',
  cuidado: 'cuidadoso',
  briefing: {
    versao: 1,
    nome: 'Novo horário',
    formatos: [
      { nome: 'Feed', largura: 1080, altura: 1350 },
      { nome: 'Story', largura: 1080, altura: 1920 },
    ],
    textos: { titulo: 'Abrimos às 7h', subtitulo: 'Café coado na hora, de segunda a sábado', chamada: 'Venha tomar o seu', rodape: '@cafeaurora · Rua das Flores, 120' },
    imagens: { fonte: 'nenhuma' },
  },
};

/** Pede o briefing de dois formatos numa peça vazia, espera o Otto pedir o "pode" e abre o editor nela. */
async function abrirNoPode(editor: Editor, api: Api, peca: PecaDoServidor): Promise<void> {
  await pedirOBriefing(api, peca);
  await editor.abrir(peca);
  await expect(estado(editor.page, 'aguardando_confirmacao')).toBeVisible(ATE_O_PODE);
}

async function pedirOBriefing(api: Api, peca: PecaDoServidor): Promise<void> {
  await api.pedirTarefa(peca.id, BRIEFING);
  await expect.poll(async () => (await api.tarefaViva(peca.id))?.estado, ATE_O_PODE).toBe('aguardando_confirmacao');
}

test.describe('Otto', () => {
  test.describe.configure({ timeout: 360_000 });

  test('briefing de dois formatos: o "pode", a espera com a peça travada, a revisão, o aceite e voltar para antes da tarefa', async ({ editor, criarPeca, api }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome, operacoes: 'vazia' });
    const { page } = editor;

    // ---------- o "pode" ----------
    await abrirNoPode(editor, api, peca);
    await expect(botao(page, textos.pode.aprovar)).toBeVisible();
    await expect(botao(page, textos.pode.ajustar)).toBeVisible();
    await expect(botao(page, textos.pode.cancelar)).toBeVisible();
    await expect(page).toHaveTitle(textos.aba.aguardando(nome));
    // nada mudou na peça, e ela está travada (na tela, com o motivo, e no servidor)
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
    await expect(trava(page)).toContainText(textos.trava.aguardando);
    expect(await api.tentarLote(peca.id, [{ op: 'criarPrancheta', nome: 'Por fora', largura: 100, altura: 100 }])).toEqual({ status: 409, codigo: 'documento_em_tarefa' });

    // ---------- a espera ----------
    await botao(page, textos.pode.aprovar).click();
    const etapas = painel(page).getByRole('list', { name: textos.espera.etapas });
    await expect(etapas.locator('[aria-current=step]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    // (outro arquivo de teste pode estar com uma tarefa na frente: na fila, o botão é o de cancelar)
    await expect(botao(page, textos.espera.interromper).or(botao(page, textos.espera.cancelar))).toBeVisible();
    await expect(trava(page)).toContainText(textos.trava.trabalhando);
    // o tempo aparece (segundos ou minutos), no painel e no título da aba
    await expect(painel(page).locator('[data-estado-da-tarefa]')).toContainText(/\d+ (s|min)/);
    await expect(page).toHaveTitle(/\d+ (s|min)/);

    // os lotes chegam à tela enquanto ele trabalha: a camada aparece no painel e o canvas a desenha
    await expect(editor.linha('Bloco').first()).toBeVisible({ timeout: 60_000 });
    await editor.esperarCor(NO_BLOCO, VERDE);
    // editar durante a tarefa não vai: a tela diz por quê e nada é enviado
    await editor.linha('Bloco').first().click();
    await editor.teclar('ArrowRight');
    await expect(editor.alerta).toContainText(textos.trava.trabalhando);

    // ---------- a revisão ----------
    await expect(estado(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    await expect(estado(page, 'em_revisao')).not.toHaveAttribute('data-parou', 'sim');
    await expect(page).toHaveTitle(textos.aba.pronto(nome));
    await expect(trava(page)).toContainText(textos.trava.emRevisao);
    const criada = await api.abrir(peca.id);
    expect(criada.arvore.pranchetas.map((p) => p.nome)).toEqual(['Feed', 'Story']);
    expect(camada(criada, 'Bloco').x, 'a tecla durante a tarefa não moveu a camada').toBe(0);
    // as camadas do Otto ficam marcadas em Camadas; as pranchetas novas podem ser vistas ou descartadas
    await expect(editor.arvore.locator('[data-otto]').first()).toBeVisible();
    await expect(botao(page, textos.revisao.verPrancheta('Feed'))).toBeVisible();
    await expect(botao(page, textos.revisao.descartarPrancheta('Story'))).toBeVisible();
    // a pendência que ele declarou vem antes dos botões
    const pendencias = (await api.tarefaViva(peca.id))?.pendencias.length ?? 0;
    expect(pendencias).toBeGreaterThan(0);
    await expect(painel(page).getByRole('heading', { name: textos.revisao.pendencias(pendencias) })).toBeVisible();

    // segurar mostra a peça de antes (vazia); soltar volta
    const antes = botao(page, textos.revisao.verOAntes);
    const caixa = await antes.boundingBox();
    if (!caixa) throw new Error('falta o botão de ver o antes');
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    const camera = await editor.area.getAttribute('data-camera');
    expect(await editor.tintaDasSobreposicoes()).toBeGreaterThan(0);
    await page.mouse.down();
    await expect(page.locator('[data-selo-do-antes]')).toBeVisible();
    // a peça de antes era vazia: nem rótulo de prancheta, nem contorno do Otto por cima
    await expect.poll(() => editor.tintaDasSobreposicoes(), { message: 'as sobreposições são as da peça de antes' }).toBe(0);
    await expect.poll(async () => distancia(await editor.corEm(NO_BLOCO), VERDE), { message: 'o canvas mostra a peça de antes' }).toBeGreaterThan(40);
    await page.mouse.up();
    await expect(page.locator('[data-selo-do-antes]')).toHaveCount(0);
    await editor.esperarCor(NO_BLOCO, VERDE);
    expect(await editor.area.getAttribute('data-camera'), 'comparar não mexe na câmera').toBe(camera);
    expect(await editor.tintaDasSobreposicoes()).toBeGreaterThan(0);

    // ---------- aceitar ----------
    await botao(page, textos.revisao.aceitar).click();
    await expect(resultado(page, 'aceita')).toBeVisible();
    await expect(trava(page)).toHaveCount(0);
    await expect(editor.arvore.locator('[data-otto]')).toHaveCount(0);
    expect((await api.tarefas(peca.id)).viva).toBeUndefined();

    // a edição voltou; e "voltar para antes desta tarefa" avisa que levaria junto o que o designer fez depois
    await editor.linha('Rodapé').first().click();
    const rodape = camada(await api.abrir(peca.id), 'Rodapé');
    await editor.teclar('ArrowRight');
    await expect.poll(async () => camada(await api.abrir(peca.id), 'Rodapé').x).toBe((rodape.x ?? 0) + 1);
    await botao(page, textos.resultado.voltarParaAntes).click();
    await expect(botao(page, textos.resultado.voltarMesmoAssim)).toBeVisible();
    expect((await api.abrir(peca.id)).arvore.pranchetas, 'nada é desfeito antes de o designer confirmar').toHaveLength(2);
    await botao(page, textos.resultado.voltarMesmoAssim).click();
    await expect(resultado(page, 'desfeita')).toBeVisible();
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
    expect((await api.tarefas(peca.id)).itens.map((t) => t.estado)).toEqual(['desfeita']);
  });

  test('ajuste rápido: sem "pode", direto para a revisão; só a camada mexida fica marcada, e desfazer tudo volta a peça', async ({ editor, criarPeca, api }) => {
    // O roteiro do ajuste põe em azul a primeira camada de texto da peça. A peça padrão tem DUAS
    // pranchetas: o ciclo confere a que mudou (o defeito de conferir a última foi corrigido).
    const AZUL = '#1f5fbf';
    const peca = await criarPeca({ nome: codigo() });
    await editor.abrir(peca);
    const { page } = editor;
    const textosDaPeca = (p: PecaDoServidor) => camadas(p.arvore.pranchetas.flatMap((x) => x.filhos)).filter((n) => n.tipo === 'texto');
    const antes = textosDaPeca(await api.abrir(peca.id)).map((n) => [n.nome, n.cor]);
    // antes de pedir: quantas tarefas a conta já pediu hoje, e o botão só pede com texto
    const limites = await api.limitesDeTarefa();
    await expect(painel(page)).toContainText(textos.pedir.tarefasHoje(limites.tarefasHoje, limites.tarefasPorDia));
    await expect(botao(page, textos.pedir.enviar)).toBeDisabled();

    // chega à revisão sem ninguém ter aprovado nada: o ajuste rápido não pede o "pode"
    const aprovacoes: string[] = [];
    page.on('request', (pedido) => {
      if (pedido.method() === 'POST' && /\/api\/tarefas\/[^/]+\/aprovar$/.test(new URL(pedido.url()).pathname)) aprovacoes.push(pedido.url());
    });
    await pedir(page, 'deixa o título em azul', 'ajuste');
    await expect(estado(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    await expect(estado(page, 'em_revisao')).not.toHaveAttribute('data-parou', 'sim');
    expect(aprovacoes).toEqual([]);
    const ajuste = await api.tarefaViva(peca.id);
    expect(ajuste?.fim).toBe('entregue');
    // uma camada de texto ficou azul, e só ela está marcada como do Otto
    const azuis = textosDaPeca(await api.abrir(peca.id)).filter((n) => String(n.cor).toLowerCase() === AZUL);
    expect(azuis).toHaveLength(1);
    const mexida = azuis[0]?.nome ?? '';
    await expect(editor.arvore.locator('[data-otto]')).toHaveCount(1);
    await expect(editor.linha(mexida).locator('[data-otto], [role=img]').first()).toBeVisible();
    // as pendências (se a verificação acusou contraste) vêm contadas antes dos botões; zero também é dito
    await expect(painel(page).getByRole('heading', { name: textos.revisao.pendencias(ajuste?.pendencias.length ?? 0) })).toBeVisible();
    // a edição continua travada até a revisão ser resolvida
    await editor.linha(mexida).click();
    await editor.teclar('ArrowRight');
    await expect(editor.alerta).toContainText(textos.trava.emRevisao);

    // desfazer tudo: a peça volta para antes do ajuste, de uma vez
    await botao(page, textos.revisao.desfazer).click();
    await expect(resultado(page, 'desfeita')).toBeVisible();
    await expect(trava(page)).toHaveCount(0);
    await expect(editor.arvore.locator('[data-otto]')).toHaveCount(0);
    expect(textosDaPeca(await api.abrir(peca.id)).map((n) => [n.nome, n.cor])).toEqual(antes);
    expect((await api.tarefas(peca.id)).itens.map((t) => t.estado)).toEqual(['desfeita']);
  });

  test('pedido maior pelo campo: chega ao "pode", cria as pranchetas novas, e dá para descartar uma na revisão', async ({ editor, criarPeca, api }) => {
    const peca = await criarPeca({ nome: codigo() });
    await editor.abrir(peca);
    const { page } = editor;
    const antes = (await api.abrir(peca.id)).arvore.pranchetas.map((p) => p.nome);

    await pedir(page, 'faz também um quadrado e um banner com o aviso do novo horário', 'pedido');
    // o plano mexe em mais de uma prancheta: o Otto pede o "pode", e nada mudou na peça
    await expect(estado(page, 'aguardando_confirmacao')).toBeVisible(ATE_O_PODE);
    await expect(trava(page)).toContainText(textos.trava.aguardando);
    expect((await api.abrir(peca.id)).arvore.pranchetas.map((p) => p.nome)).toEqual(antes);
    expect((await api.tarefaViva(peca.id))?.confirmacao).toBeTruthy();
    await botao(page, textos.pode.aprovar).click();

    await expect(estado(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    const criadas = (await api.abrir(peca.id)).arvore.pranchetas.filter((p) => !antes.includes(p.nome));
    expect(criadas).toHaveLength(2);
    // o que já existia não foi tocado
    expect(camada(await api.abrir(peca.id), 'Bloco')).toMatchObject(camada(peca, 'Bloco'));
    const [fica, sai] = criadas as [(typeof criadas)[0], (typeof criadas)[0]];

    // descartar uma prancheta: pede confirmação, e só ela sai; a outra continua em revisão
    await botao(page, textos.revisao.descartarPrancheta(sai.nome)).click();
    await expect(painel(page).getByText(textos.revisao.confirmarDescarte(sai.nome))).toBeVisible();
    await painel(page).getByRole('button', { name: textos.revisao.descartar, exact: true }).click();
    await expect.poll(async () => (await api.abrir(peca.id)).arvore.pranchetas.map((p) => p.nome)).toEqual([...antes, fica.nome]);
    await expect(editor.linha(sai.nome)).toHaveCount(0);
    await expect(estado(page, 'em_revisao')).toBeVisible();

    await botao(page, textos.revisao.aceitar).click();
    await expect(resultado(page, 'aceita')).toBeVisible();
    await expect(trava(page)).toHaveCount(0);
    expect((await api.abrir(peca.id)).arvore.pranchetas.map((p) => p.nome)).toEqual([...antes, fica.nome]);
  });

  test('pedido livre numa peça vazia, pelo campo: cria um formato só, sem "pode", e vai para a revisão', async ({ editor, criarPeca, api }) => {
    const peca = await criarPeca({ nome: codigo(), operacoes: 'vazia' });
    await editor.abrir(peca);
    const { page } = editor;
    // peça vazia não tem "ajuste rápido" nem "pedido maior": o pedido cria a peça
    await expect(painel(page).getByRole('radio')).toHaveCount(0);
    await pedir(page, 'aviso do novo horário, só com tipografia: abrimos às 7h');

    await expect(estado(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    const criada = await api.abrir(peca.id);
    expect(criada.arvore.pranchetas).toHaveLength(1);
    expect(camadas(criada.arvore.pranchetas[0]?.filhos ?? []).length).toBeGreaterThan(3);
    await expect(editor.arvore.locator('[data-otto]').first()).toBeVisible();
    // o Otto declara o que escreveu por conta própria: a pendência aparece antes dos botões
    const tarefa = await api.tarefaViva(peca.id);
    expect(tarefa?.pendencias.length).toBeGreaterThan(0);
    await expect(painel(page).getByRole('heading', { name: textos.revisao.pendencias(tarefa?.pendencias.length ?? 0) })).toBeVisible();

    await botao(page, textos.revisao.desfazer).click();
    await expect(resultado(page, 'desfeita')).toBeVisible();
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
  });

  test('ajuste que não começou (peça sem texto): o painel diz que nada mudou e devolve o campo de pedir', async ({ editor, criarPeca, api }) => {
    // no modelo roteirizado, o ajuste precisa de uma camada de texto; sem ela a tarefa falha antes de alterar
    const peca = await criarPeca({
      nome: codigo(),
      operacoes: [
        { op: 'criarPrancheta', nome: 'Feed', largura: 1080, altura: 1350, fundo: '#f4efe3' },
        { op: 'criarNo', prancheta: 'Feed', no: { tipo: 'forma', nome: 'Bloco', forma: 'retangulo', x: 100, y: 100, largura: 400, altura: 300, preenchimento: '#c0392b' } },
      ],
    });
    await editor.abrir(peca);
    const { page } = editor;
    await pedir(page, 'deixa o título em azul', 'ajuste');
    await expect(resultado(page, 'falhou')).toBeVisible(ATE_TERMINAR);
    await expect(trava(page)).toHaveCount(0);
    await expect(botao(page, textos.resultado.tentarDeNovo)).toBeVisible();
    await expect(painel(page).getByRole('textbox', { name: textos.pedir.campo })).toBeVisible();
    expect(camada(await api.abrir(peca.id), 'Bloco')).toMatchObject({ x: 100, y: 100 });
    expect((await api.tarefas(peca.id)).viva).toBeUndefined();
  });

  test('interromper no meio: o que já foi feito fica para revisar, dito como não terminado, e sai inteiro ao desfazer', async ({ editor, criarPeca, api }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome, operacoes: 'vazia' });
    const { page } = editor;

    await abrirNoPode(editor, api, peca);
    await botao(page, textos.pode.aprovar).click();
    // espera ele ter feito alguma coisa, e para
    await expect(editor.linha('Bloco').first()).toBeVisible({ timeout: 60_000 });
    await botao(page, textos.espera.interromper).click();

    const revisao = estado(page, 'em_revisao');
    await expect(revisao).toBeVisible(ATE_TERMINAR);
    await expect(revisao).toHaveAttribute('data-parou', 'sim');
    await expect(page).toHaveTitle(textos.aba.naoTerminou(nome));
    const parada = await api.tarefaViva(peca.id);
    expect(parada?.fim).not.toBe('entregue');
    expect(parada?.lotes).toBeGreaterThan(0);
    // o que ele fez está na peça e marcado; dá para tentar de novo ou desfazer
    await expect(editor.arvore.locator('[data-otto]').first()).toBeVisible();
    await expect(botao(page, textos.revisao.tentarDeNovo)).toBeVisible();

    // na lista de peças ela não aparece como "pronto para revisar": parou no meio
    await page.goto('/editor');
    const cartao = page.getByRole('list', { name: textosDePecas.lista }).getByRole('listitem').filter({ hasText: nome });
    await expect(cartao).toContainText(textosDePecas.estadoDaTarefa.naoTerminou);
    await expect(cartao).not.toContainText(textosDePecas.estadoDaTarefa.em_revisao);
    await cartao.getByRole('link').first().click();
    await page.waitForURL(`**/editor/p/${peca.id}`);
    await editor.pronto();

    await botao(page, textos.revisao.desfazer).click();
    await expect(resultado(page, 'desfeita')).toBeVisible();
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
    await expect(painel(page).getByRole('textbox', { name: textos.pedir.campo })).toBeVisible();
  });

  test('retomar: a lista de peças mostra a tarefa, e recarregar no "pode", na espera e na revisão volta ao mesmo ponto', async ({ editor, criarPeca, api }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome, operacoes: 'vazia' });
    const { page } = editor;
    await pedirOBriefing(api, peca);

    // a lista diz que a peça espera o "pode"
    await page.goto('/editor');
    const cartao = page.getByRole('list', { name: textosDePecas.lista }).getByRole('listitem').filter({ hasText: nome });
    await expect(cartao).toContainText(textosDePecas.estadoDaTarefa.aguardando_confirmacao);

    // volta pela lista: o cartão do "pode" está lá, com a peça travada
    await cartao.getByRole('link').first().click();
    await page.waitForURL(`**/editor/p/${peca.id}`);
    editor.pecaId = peca.id;
    await editor.pronto();
    await expect(estado(page, 'aguardando_confirmacao')).toBeVisible();
    await expect(trava(page)).toContainText(textos.trava.aguardando);
    await botao(page, textos.pode.aprovar).click();

    // recarrega no meio do trabalho: as etapas e o que já foi feito continuam na tela, e a peça segue travada
    await expect(editor.linha('Bloco').first()).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await editor.pronto();
    await expect(painel(page).locator('[data-estado-da-tarefa]')).toBeVisible();
    await expect(trava(page)).toBeVisible();
    await expect(editor.linha('Bloco').first()).toBeVisible();
    await expect(painel(page).locator('[data-tipo="lote"]').first()).toBeAttached();

    // termina com a aba recarregada; recarregar na revisão continua na revisão
    await expect(estado(page, 'em_revisao')).toBeVisible(ATE_TERMINAR);
    await page.reload();
    await editor.pronto();
    await expect(estado(page, 'em_revisao')).toBeVisible();
    await expect(editor.arvore.locator('[data-otto]').first()).toBeVisible();
    await page.goto('/editor');
    await expect(cartao).toContainText(textosDePecas.estadoDaTarefa.em_revisao);
    await cartao.getByRole('link').first().click();
    await editor.pronto();

    // aceita, e depois volta para antes da tarefa: a peça fica vazia de novo
    await botao(page, textos.revisao.aceitar).click();
    await expect(resultado(page, 'aceita')).toBeVisible();
    await botao(page, textos.resultado.voltarParaAntes).click();
    await expect(resultado(page, 'desfeita')).toBeVisible();
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
  });

  test('no "pode": pedir ajuste da direção volta ao "pode", e cancelar não muda a peça', async ({ editor, criarPeca, api }) => {
    const peca = await criarPeca({ nome: codigo(), operacoes: 'vazia' });
    const { page } = editor;
    await abrirNoPode(editor, api, peca);
    const primeira = await api.tarefaViva(peca.id);

    await botao(page, textos.pode.ajustar).click();
    await painel(page).getByRole('textbox', { name: textos.pode.oQueMuda }).fill('mais sóbrio, sem o disco');
    await botao(page, textos.pode.mandarAjuste).click();
    // a direção é refeita e o "pode" é pedido de novo, na mesma tarefa
    await expect
      .poll(async () => {
        const t = await api.tarefaViva(peca.id);
        return t?.estado === 'aguardando_confirmacao' && t.ultimoEvento > (primeira?.ultimoEvento ?? 0);
      }, ATE_O_PODE)
      .toBe(true);
    await expect(estado(page, 'aguardando_confirmacao')).toBeVisible(ATE_O_PODE);
    expect((await api.tarefaViva(peca.id))?.id).toBe(primeira?.id);

    await botao(page, textos.pode.cancelar).click();
    await expect(resultado(page, 'cancelada')).toBeVisible();
    await expect(trava(page)).toHaveCount(0);
    expect((await api.abrir(peca.id)).arvore.pranchetas).toEqual([]);
    expect((await api.tarefas(peca.id)).viva).toBeUndefined();
  });

  test('recusas: sem limite o botão não pede, e a recusa do servidor é dita no painel (sem gastar tarefa)', async ({ editor, criarPeca }) => {
    const peca = await criarPeca({ nome: codigo() });
    const { page } = editor;
    let pedidos = 0;
    await page.route('**/api/documentos/*/tarefas', async (rota) => {
      if (rota.request().method() !== 'POST') return rota.fallback();
      pedidos++;
      await rota.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ codigo: 'tarefa_em_andamento' }) });
    });
    await editor.abrir(peca);

    // peça com conteúdo: dá para escolher entre ajuste rápido e pedido maior
    await expect(painel(page).getByRole('radio')).toHaveCount(2);
    await pedir(page, 'título em azul', 'pedido');
    await expect(painel(page).getByRole('alert')).toContainText(erros.doCodigo('tarefa_em_andamento'));
    expect(pedidos).toBe(1);
    await expect(trava(page)).toHaveCount(0);
    // o pedido não se perde: continua no campo para mandar de novo
    await expect(painel(page).getByRole('textbox', { name: textos.pedir.campo })).toHaveValue('título em azul');

    // a conta no limite do dia: o painel diz antes de o designer escrever, e o botão não envia
    await page.route('**/api/tarefas/limites', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ podeEnviar: false, motivo: 'limite_da_conta', tarefasHoje: 30, tarefasPorDia: 30, naFila: 0, naFilaNoMaximo: 3 }),
      }),
    );
    await page.reload();
    await editor.pronto();
    await expect(painel(page).getByRole('alert')).toContainText(textos.pedir.semLimite.limite_da_conta(30));
    await painel(page).getByRole('textbox', { name: textos.pedir.campo }).fill('título em azul');
    await expect(botao(page, textos.pedir.enviar)).toBeDisabled();
    expect(pedidos).toBe(1);
  });
});
