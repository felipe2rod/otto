import { defineConfig } from 'vitest/config';

// Um projeto por pacote. Pacote novo com teste: acrescente a pasta aqui.
// Rodar tudo: pnpm test. Um pacote só: pnpm --filter @otto/documento test.
export default defineConfig({
  test: {
    projects: [
      'packages/agente',
      'packages/documento',
      'packages/psd',
      'packages/render',
      'packages/shared',
      'apps/api',
      'apps/web',
      {
        test: {
          name: 'fronteira',
          root: '.',
          include: ['testes/fronteira/**/*.test.ts'],
        },
      },
      {
        // Conjunto de avaliação do agente (ADR 029, item 6). Não é pacote do workspace: fica fora da imagem.
        test: {
          name: 'avaliacao',
          root: '.',
          include: ['avaliacao/**/*.test.ts'],
        },
      },
    ],
  },
});
