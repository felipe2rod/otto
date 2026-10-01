import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

// Testes do web: regra de estado e de câmera em TypeScript puro, componentes com Testing Library.
// O padrão é o ambiente do Node, que é rápido. Teste que precisa de DOM começa com
//   // @vitest-environment jsdom
// Canvas, WebGL e WebAssembly não existem aqui: isso só vale testado no navegador (docs/mvp/frontend.md, seção 8).
export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'testes/**/*.test.ts'],
    // o nome da classe sai como está no módulo CSS: o teste confere estado por papel e texto, não por classe
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
