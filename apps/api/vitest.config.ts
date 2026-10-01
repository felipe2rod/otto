import { defineProject } from 'vitest/config';

// Os testes de testes/banco falam com o PostgreSQL de teste (serviço "banco", base otto_teste).
// Rodam dentro do contêiner: docker compose run --rm teste
export default defineProject({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts', 'testes/**/*.test.ts'],
    globalSetup: ['testes/banco/preparar-banco-de-teste.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
