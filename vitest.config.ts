import { defineConfig } from 'vitest/config';

// Um projeto por pacote. Pacote novo com teste: acrescente a pasta aqui.
// Rodar tudo: pnpm test. Um pacote só: pnpm --filter @otto/documento test.
export default defineConfig({
  test: {
    projects: [
      'packages/documento',
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
    ],
  },
});
