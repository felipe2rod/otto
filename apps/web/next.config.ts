import path from 'node:path';
import type { NextConfig } from 'next';

const RAIZ_DO_MONOREPO = path.join(import.meta.dirname, '../..');

/** Extensão das páginas que só existem em desenvolvimento (hoje, a bancada do editor). */
const EXTENSAO_SO_DE_DESENVOLVIMENTO = 'dev.tsx';

const config: NextConfig = {
  // Página com nome terminado em ".dev.tsx" só é rota com `next dev`. No build de produção a
  // extensão não é aceita e o arquivo é ignorado: a rota não existe e nada dela entra em pacote.
  pageExtensions: process.env.NODE_ENV === 'development' ? [EXTENSAO_SO_DE_DESENVOLVIMENTO, 'tsx', 'ts'] : ['tsx', 'ts'],
  // Imagem de produção: só o servidor e o que ele de fato usa (docker/Dockerfile, alvo "web").
  output: 'standalone',
  // Os pacotes do workspace são consumidos pelo código-fonte TypeScript, sem passo de build.
  transpilePackages: ['@otto/documento', '@otto/render', '@otto/shared'],
  // A raiz do monorepo: o node_modules de verdade (pnpm) mora acima de apps/web.
  turbopack: { root: RAIZ_DO_MONOREPO },
  outputFileTracingRoot: RAIZ_DO_MONOREPO,
  poweredByHeader: false,
  // Só vale no desenvolvimento. A página é aberta pela borda (localhost:8080), não pela porta do
  // Next; sem isto o Next bloqueia a conexão de recarga a quente e NENHUM componente de cliente
  // termina de carregar (o editor fica parado em "Abrindo o editor…").
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  // O motor de render fica em pasta com a versão no nome (scripts/copiar-motor.ts): pode ficar em
  // cache para sempre. São 7 MB de WebAssembly que o editor não deve baixar de novo a cada visita.
  async headers() {
    return [{ source: '/motor/:caminho*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }];
  },
  // O navegador fala com /api na mesma origem, e quem roteia é a borda (docker/borda/Caddyfile):
  // de propósito, não há reescrita de /api aqui.
};

export default config;
