import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'agente',
    include: ['src/**/*.test.ts'],
  },
});
