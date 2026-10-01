import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'documento',
    include: ['src/**/*.test.ts'],
  },
});
