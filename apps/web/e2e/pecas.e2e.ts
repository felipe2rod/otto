// A lista de peças: listar, criar, renomear, duplicar e excluir. Cada teste usa uma peça com nome
// próprio (com um código que não se repete) e a encontra por esse nome, sem depender das outras.
import type { Page } from '@playwright/test';
import { pecas as textos } from '../src/textos/pecas';
import { expect, test } from './apoio/teste';

const codigo = () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const lista = (page: Page) => page.getByRole('list', { name: textos.lista });
const item = (page: Page, nome: string) => lista(page).getByRole('listitem').filter({ hasText: nome });

test.describe('peças', () => {
  test('a lista mostra a peça da conta, com o link para o editor', async ({ page, criarPeca }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome });
    await page.goto('/editor');

    const cartao = item(page, nome);
    await expect(cartao).toHaveCount(1);
    await expect(cartao.getByRole('link')).toHaveAttribute('href', `/editor/p/${peca.id}`);
    await expect(cartao).toContainText(textos.formatos(2));
  });

  test('"Nova peça" cria a peça e abre o editor nela', async ({ page, api }) => {
    await page.goto('/editor');
    await page.getByRole('button', { name: textos.novaPeca }).click();
    await page.waitForURL(/\/editor\/p\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() as string;
    try {
      const peca = await api.abrir(id);
      expect(peca.arvore.pranchetas).toEqual([]);
      await expect(page.locator('[data-area-do-canvas]')).toBeVisible();
    } finally {
      await api.arquivar(id);
    }
  });

  test('renomear troca o nome na lista e no servidor', async ({ page, api, criarPeca }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome });
    await page.goto('/editor');

    await item(page, nome).locator('summary').click();
    await item(page, nome).getByRole('button', { name: textos.renomear }).click();
    const novo = `${nome} renomeada`;
    await page.getByRole('textbox', { name: textos.novoNome(nome) }).fill(novo);
    await page.getByRole('button', { name: textos.salvar }).click();

    await expect(item(page, novo)).toHaveCount(1);
    await expect.poll(async () => (await api.abrir(peca.id)).nome).toBe(novo);
  });

  test('duplicar cria outra peça, que aparece na lista', async ({ page, api, criarPeca }) => {
    const nome = codigo();
    await criarPeca({ nome });
    await page.goto('/editor');

    await item(page, nome).first().locator('summary').click();
    await item(page, nome).first().getByRole('button', { name: textos.duplicar }).click();
    await expect(item(page, nome)).toHaveCount(2);

    const doServidor = (await api.listar()).filter((p) => p.nome.includes(nome));
    expect(doServidor).toHaveLength(2);
    // a cópia também é do teste: arquiva as duas (a original sai pelo `criarPeca`)
    for (const p of doServidor) await api.arquivar(p.id);
  });

  test('excluir pede confirmação e tira a peça da lista', async ({ page, api, criarPeca }) => {
    const nome = codigo();
    const peca = await criarPeca({ nome });
    await page.goto('/editor');

    await item(page, nome).locator('summary').click();
    await item(page, nome).getByRole('button', { name: textos.excluir }).click();
    // só a confirmação exclui: até aqui a peça continua lá
    expect((await api.listar()).some((p) => p.id === peca.id)).toBe(true);
    await item(page, nome).getByRole('button', { name: textos.excluir }).last().click();

    await expect(item(page, nome)).toHaveCount(0);
    await expect.poll(async () => (await api.listar()).some((p) => p.id === peca.id)).toBe(false);
  });
});
