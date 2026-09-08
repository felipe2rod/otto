# 009 — Stack técnica

Status: aceita (itens do Felipe) / escolhida por Claude, reversível (o resto)
Data: 2026-09-08
Quem decide: Felipe

## Decidido pelo Felipe

| Item | Escolha |
|---|---|
| Banco | **PostgreSQL** (DigitalOcean Managed, ADR 005) |
| Empacotamento | **Docker** |
| Adaptador HTTP do NestJS | **Express** |
| Mensageria | **Kafka, se necessário** |

"O resto pode escolher." As escolhas abaixo são de Claude. Cada uma cabe atrás de uma porta e pode ser trocada sem tocar no núcleo.

## Escolhido por Claude

| Item | Escolha | Por quê, em uma linha | Alternativa se doer |
|---|---|---|---|
| **Quando Kafka é necessário** | **Não na v1.** Fila em PostgreSQL com **pg-boss** | Um componente a menos para operar e pagar. A v1 tem um consumidor de eventos (o próprio Otto). Kafka entra quando houver **segundo consumidor independente** (analytics, cargo novo reagindo a evento) ou quando a fila em Postgres passar de um limite medido, não suposto | DigitalOcean oferece Kafka gerenciado (conferir plano mínimo antes). A troca é um adaptador da porta `BarramentoDeEventos` |
| **ORM** | **Prisma** | Migrações maduras, receita oficial no NestJS, tipagem gerada. Repositório é porta; Prisma fica no adaptador | Drizzle, se o custo do client gerado ou o SQL escondido incomodar |
| **Validação** | **zod** | Um esquema serve DTO no backend e formulário no frontend, pelo pacote compartilhado | class-validator, padrão do Nest, se zod atrapalhar o pipe |
| **Framework do frontend** | **Next.js** (App Router) | A landing precisa de SEO e a mesma stack serve o painel. Um deploy, um repositório de componentes | Vite + React Router para o painel, se o Next pesar |
| **Repositório** | **Monorepo com pnpm workspaces**: `apps/api`, `apps/web`, `packages/shared` | Tipos e esquemas zod compartilhados; um lockfile | Turborepo em cima, só se o build ficar lento |
| **Testes backend** | **Jest** | Padrão do Nest, sem atrito | Vitest |
| **Testes frontend** | **Vitest + Testing Library** | Rápido, nativo do ecossistema Vite que o Next usa | Jest |
| **Lint e formatação** | **Biome** | Uma ferramenta, rápida, sem conflito de plugin | ESLint + Prettier |
| **Log** | **pino** via nestjs-pino | Estruturado, barato, sem conteúdo de mensagem em texto claro por padrão | — |
| **Node** | LTS ativa no momento do bootstrap, fixada em `.nvmrc` e no Dockerfile | Previsibilidade | — |
| **Docker local** | `docker compose` com postgres, api e web | Sobe o ambiente com um comando | — |
| **Deploy** | DigitalOcean App Platform a partir do Dockerfile (ADR 005, a validar) | Sem servidor para operar | Droplet com compose, se App Platform falhar na validação |

## Regras que acompanham a stack

- **Prisma nunca aparece em caso de uso.** Repositório é interface no núcleo; a implementação Prisma é provider no módulo. Trocar de ORM é trocar um adaptador.
- **Express é detalhe do Nest.** Nenhum código fora do módulo HTTP importa `express`.
- **Toda fila, hoje ou com Kafka, passa pela porta `BarramentoDeEventos`.** O caso de uso publica evento; quem consome é adaptador.
- **O webhook da Meta grava o evento e responde.** O processamento sai da fila. Isso já é exigência de idempotência e latência (agente de backend, regras 7 e 8).
- **Dockerfile multi-stage**, imagem final sem dependência de desenvolvimento, usuário não-root.

## Consequências

- O especialista em backend carrega `nestjs`, `nodejs`, `typescript` e passa a tratar Prisma, Express, pg-boss e Docker como decididos. Não recomenda mais alternativa para eles.
- O especialista em React passa a tratar Next.js como decidido.
- `docs/tecnico/infraestrutura.md` atualizado.

## Gatilho de revisão

- Adotar Kafka quando surgir um segundo consumidor independente de eventos, ou quando a fila em Postgres exigir mais de um worker por conta de latência medida.
- Rever Prisma se uma consulta crítica precisar de SQL que o Prisma não expressa sem `queryRaw` recorrente.
- Rever Next.js se o painel não precisar de SSR e o build do Next dominar o tempo de deploy.
