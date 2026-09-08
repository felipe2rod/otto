# 008 — Backend em NestJS

Status: aceita
Data: 2026-09-08
Quem decide: Felipe

## Contexto

O backend seria em Node.js com TypeScript, com framework a decidir entre NestJS, Fastify puro e Hono. Felipe decidiu por NestJS em 2026-09-08.

## Decisão

- **NestJS** sobre Node.js, TypeScript estrito.
- **Nest na borda, nunca no núcleo.** Controller, guard, pipe, interceptor e módulo são adaptadores. Casos de uso, portas de contexto (ADR 006), regras de saldo (ADR 004) e regras de caráter (ADR 002) ficam em classes puras, sem decorator, testáveis sem o container do Nest.
- Um módulo por contexto delimitado (conversa, saldo, contexto do negócio, empresa, inferência), não por tabela.
- Portas de contexto como interfaces com token de injeção; adaptadores como providers.

## Ainda aberto dentro desta decisão

- Adaptador HTTP: Express (padrão) ou Fastify.
- ORM ou query builder.
- Fila e agendamento.

O especialista em backend recomenda cada um em até cinco linhas quando a tarefa exigir, e para.

## Consequências

- A skill local `nestjs` passa a ser carregada sempre pelo agente `especialista-backend`.
- A validação do ADR 005 (primeira entrega técnica) é feita em NestJS.
- Frontend continua em React, com framework (Next, Vite) ainda não decidido.

## Gatilho de revisão

Se o container do Nest começar a aparecer dentro de caso de uso ou de regra de negócio, a arquitetura está vazando. Refatorar antes de continuar, não depois.
