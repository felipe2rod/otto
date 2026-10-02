// A guarda do ADR 019, medida no navegador: o site público não baixa o WebAssembly do motor nem
// código do editor. O teste de build confere o pacote gerado; este confere o que o navegador de fato
// pede ao abrir a página. (Roda contra o servidor de desenvolvimento: a guarda do pacote de produção
// continua sendo `scripts/conferir-pacote-publico.ts`, no build.)
import type { Page } from '@playwright/test';
import { SENTINELA_DO_MOTOR } from '../../../packages/render/src/sentinela';
import { SENTINELA_DO_EDITOR } from '../src/editor/sentinela';
import { editor as textos } from '../src/textos/editor';
import { expect, test } from './apoio/teste';

/** Tudo o que a página baixou: endereços, e o texto de cada script. */
async function oQueBaixou(page: Page, caminho: string, pronto: () => Promise<void>) {
  const enderecos: string[] = [];
  const scripts: Promise<string>[] = [];
  page.on('response', (resposta) => {
    enderecos.push(new URL(resposta.url()).pathname);
    if (resposta.request().resourceType() === 'script') scripts.push(resposta.text().catch(() => ''));
  });
  await page.goto(caminho);
  await pronto();
  // O servidor de desenvolvimento mantém uma conexão aberta (recarga automática): a rede nunca fica
  // "ociosa". Espera dois segundos sem resposta nova.
  for (let antes = -1; antes !== enderecos.length; ) {
    antes = enderecos.length;
    await page.waitForTimeout(2000);
  }
  return { enderecos, scripts: await Promise.all(scripts) };
}

test.describe('site público', () => {
  test('não baixa .wasm, nada da pasta do motor nem código do editor', async ({ page }) => {
    const { enderecos, scripts } = await oQueBaixou(page, '/', async () => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    expect(enderecos.filter((e) => e.endsWith('.wasm') || e.startsWith('/motor/'))).toEqual([]);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((codigo) => codigo.includes(SENTINELA_DO_EDITOR) || codigo.includes(SENTINELA_DO_MOTOR))).toHaveLength(0);
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('o mesmo detector acha o motor e o editor na página do editor (o teste de cima não passa por ser cego)', async ({ page, criarPeca }) => {
    const peca = await criarPeca();
    const { enderecos, scripts } = await oQueBaixou(page, `/editor/p/${peca.id}`, async () => {
      await expect(page.getByRole('banner').locator('[role=status][data-estado]')).toHaveText(textos.topo.salvamento.salvo, { timeout: 90_000 });
    });

    expect(enderecos.some((e) => e.endsWith('.wasm') && e.startsWith('/motor/'))).toBe(true);
    expect(scripts.some((codigo) => codigo.includes(SENTINELA_DO_EDITOR))).toBe(true);
  });

  test('o editor pede para não ser indexado; o site público, não', async ({ page }) => {
    await page.goto('/editor');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.goto('/');
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
  });
});
