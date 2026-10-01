# syntax=docker/dockerfile:1
# Imagens do Otto (ADR 009, 035). Contexto de build: a raiz do monorepo.
# Alvo "dev": só ferramentas; o código entra por montagem e cada node_modules é volume nomeado,
# porque o disco do repositório (exFAT) recusa link simbólico e o pnpm vive de link simbólico.
ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-slim AS base
# Debian (glibc), não Alpine: uma base só para tudo que tem binário nativo.
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# openssl: o motor de migração do Prisma procura a biblioteca do sistema.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# A versão do pnpm é a mesma do campo "packageManager" do package.json da raiz.
RUN corepack enable \
 && corepack prepare pnpm@12.8.1 --activate \
 # o pnpm 12 baixa o binário nativo na primeira execução: faz isso aqui, não em cada contêiner
 && pnpm --version \
 && chmod -R a+rX /opt/corepack
WORKDIR /workspace

# ---------- desenvolvimento ----------
FROM base AS dev
# Cada volume nomeado herda o dono da pasta que já existe na imagem: sem isto ele nasce do root
# e o usuário "node" (id 1000, o mesmo do disco montado) não consegue instalar.
# Pacote novo no workspace: acrescente a pasta aqui e o volume em compose.yaml.
RUN mkdir -p \
      /workspace/node_modules \
      /workspace/apps/api/node_modules \
      /workspace/apps/web/node_modules \
      /workspace/apps/web/.next \
      /workspace/packages/documento/node_modules \
      /workspace/packages/psd/node_modules \
      /workspace/packages/render/node_modules \
      /workspace/packages/shared/node_modules \
      /dados/arquivos \
 && chown -R node:node /workspace /dados
USER node

# ---------- produção ----------
# Dependências primeiro, código depois: mudar código não reinstala nada (cache de camada, ADR 019).
FROM base AS deps
ENV CI=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/documento/package.json packages/documento/
COPY packages/psd/package.json packages/psd/
COPY packages/render/package.json packages/render/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json biome.json vitest.config.ts ./
COPY apps/api apps/api
COPY packages packages
COPY testes testes
# Os testes de fronteira rodam aqui: se o núcleo importar framework ou um nome de fornecedor
# vazar do adaptador, a imagem não sai.
RUN pnpm --filter @otto/api banco:gerar \
 && pnpm test:fronteira \
 && pnpm --filter @otto/api typecheck \
 && pnpm --filter @otto/api build
# Só as dependências de produção da API, numa pasta isolada, sem link para fora dela.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @otto/api deploy --prod /saida

# API e worker: a mesma imagem, com comando diferente. Sem ferramenta de build, sem código-fonte,
# sem a URL do papel migrador.
FROM base AS servidor
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /saida/node_modules ./node_modules
COPY --from=build --chown=node:node /saida/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
# fontes base da biblioteca do Otto, semeadas por `node dist/semear-biblioteca.mjs` depois da migração
COPY --from=build --chown=node:node /workspace/apps/api/recursos ./recursos
RUN mkdir -p /dados/arquivos && chown node:node /dados/arquivos
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=4s --retries=6 --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORTA||3000)+'/api/saude/vivo').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# worker:   CMD ["node", "dist/worker.mjs"]
# semeadura: CMD ["node", "dist/semear-biblioteca.mjs"]  (uma vez por deploy, depois da migração)
CMD ["node", "dist/main.mjs"]

# Migração: passo separado do início da API, com o papel migrador. É o único lugar em que a
# variável BANCO_URL_MIGRADOR existe.
FROM build AS migracao
WORKDIR /workspace/apps/api
USER node
# chama a ferramenta direto: o pnpm, como usuário sem privilégio, tentaria reconciliar o node_modules
# 1. migrações; 2. esquema da fila (pg-boss), criado pelo migrador e liberado para o papel da aplicação
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx src/comandos/preparar-fila.ts"]

# ---------- web: site público e editor (Next em modo standalone, ADR 019) ----------
# Parte de "deps", não de "build": o web não precisa do build da API.
FROM deps AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
# O site público é estático: o endereço entra no HTML (Open Graph, sitemap) na hora do build.
ARG ENDERECO_PUBLICO=https://ottobr.ai
ENV ENDERECO_PUBLICO=${ENDERECO_PUBLICO}
COPY tsconfig.base.json biome.json ./
COPY packages packages
COPY testes testes
COPY apps/web apps/web
# 1. testes do web: regras de estado, fronteira do site público pelo código-fonte, texto literal;
# 2. build, que termina com o teste de pacote por sentinela: se uma página pública alcançar o
#    editor ou um .wasm, a imagem não sai (ADR 019, guarda 2). As páginas públicas são geradas
#    aqui, sem API no ar: `dynamic = 'error'` no layout do site garante que isso é possível;
# 3. tipos, depois do build (o next-env.d.ts é gerado por ele).
RUN pnpm --filter @otto/web test \
 && pnpm --filter @otto/web build \
 && pnpm --filter @otto/web typecheck

# Só o servidor standalone e os estáticos. Sem código-fonte, sem dependência de desenvolvimento.
FROM base AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # o server.js escuta em localhost por padrão, e o health check bate de fora (ADR 019, armadilhas)
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/standalone ./
# o standalone não leva os estáticos: vão ao lado do server.js
COPY --from=web-build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
# o motor de render (canvaskit.js e canvaskit.wasm), copiado para public/motor/<versão>/ no build:
# é arquivo estático, buscado só pelo editor, fora de qualquer pacote de página (ADR 019)
COPY --from=web-build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# robots.txt é estático e não toca a API: diz só que o processo está atendendo
HEALTHCHECK --interval=10s --timeout=4s --retries=6 --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/robots.txt').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Em tempo de execução precisa de API_ENDERECO_INTERNO (a lista de peças é renderizada no servidor).
CMD ["node", "apps/web/server.js"]
