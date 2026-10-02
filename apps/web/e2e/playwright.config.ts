// Testes de navegador (Playwright) contra a pilha inteira: borda, web, api, worker, banco e
// armazenamento. Rodam no serviço "navegador" do compose: `docker compose run --rm navegador`.
//
// O navegador do contêiner não tem placa de vídeo: o motor roda em WebGL por software
// (SwiftShader). Por isso NENHUM teste daqui mede quadros por segundo.
import { defineConfig } from '@playwright/test';

const pagina = process.env.E2E_PAGINA ?? 'http://localhost:8080';
// "MAP localhost:8080 borda:8080, ...": dentro do compose o navegador vê os endereços do designer
const mapaDeHosts = process.env.E2E_MAPA_DE_HOSTS;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  outputDir: './resultado/artefatos',
  globalSetup: './apoio/aquecer.ts',
  // O servidor é o de desenvolvimento (compila sob demanda) e o WebGL é por software: folga no tempo.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Um arquivo por trabalhador, testes do arquivo em ordem. A conta de desenvolvimento é uma só e a
  // fila faz uma exportação por vez: mais trabalhadores não ganham tempo e disputam a fila.
  fullyParallel: false,
  workers: Number(process.env.E2E_TRABALHADORES ?? 3),
  // Na integração contínua uma falha é repetida uma vez, com rastro: a pilha de desenvolvimento
  // recarrega sozinha quando um arquivo muda e pode derrubar uma requisição no meio.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { outputFolder: './resultado/relatorio', open: 'never' }]],
  use: {
    baseURL: pagina,
    viewport: { width: 1600, height: 1000 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', ...(mapaDeHosts ? [`--host-resolver-rules=${mapaDeHosts}`] : [])],
    },
  },
});
