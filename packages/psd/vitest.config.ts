import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'psd',
    include: ['src/**/*.test.ts'],
    // cada exportação renderiza de verdade: com a suíte inteira rodando em paralelo, 5 s não bastam
    testTimeout: 60_000,
  },
});
