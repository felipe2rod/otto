// Testes da própria varredura: se ela não acusar a violação, os testes de fronteira passam sem conferir nada.
import { describe, expect, it } from 'vitest';
import { importsDe, nomesDeFornecedorEm, violacoesDoNucleo } from './varredura';

describe('importsDe', () => {
  it('lê import estático, import de tipo, import dinâmico, export de e require', () => {
    const fonte = `
      import { z } from 'zod';
      import type { Injectable } from "@nestjs/common";
      export * from './esquema';
      const fs = await import('node:fs/promises');
      const pg = require('pg');
    `;
    expect(importsDe(fonte)).toEqual(['zod', '@nestjs/common', './esquema', 'node:fs/promises', 'pg']);
  });

  it('não confunde texto comum com import', () => {
    expect(importsDe(`const frase = "importa de 'longe'";`)).toEqual([]);
  });
});

describe('violacoesDoNucleo', () => {
  it('acusa NestJS, Prisma, Next e driver de banco em qualquer pacote do núcleo', () => {
    for (const modulo of ['@nestjs/common', '@prisma/client', 'prisma', 'next', 'next/server', 'express', 'pg']) {
      expect(violacoesDoNucleo('render', [modulo])).toEqual([modulo]);
    }
  });

  it('acusa módulo do Node nos pacotes que também rodam no navegador', () => {
    expect(violacoesDoNucleo('documento', ['node:fs', 'node:crypto', 'fs', 'path'])).toEqual(['node:fs', 'node:crypto', 'fs', 'path']);
    expect(violacoesDoNucleo('shared', ['node:fs'])).toEqual(['node:fs']);
  });

  it('deixa passar zod, caminho relativo e outro pacote do núcleo', () => {
    expect(violacoesDoNucleo('documento', ['zod', './esquema', '../operacoes', '@otto/shared'])).toEqual([]);
  });

  it('o núcleo não importa a API nem o web', () => {
    expect(violacoesDoNucleo('documento', ['@otto/api', '@otto/web'])).toEqual(['@otto/api', '@otto/web']);
  });
});

describe('nomesDeFornecedorEm', () => {
  it('acusa nome de fornecedor em código, comentário ou texto, sem diferenciar maiúscula', () => {
    expect(nomesDeFornecedorEm(`const url = 'https://inference.do-ai.run'; // DigitalOcean`)).toEqual(['digitalocean', 'do-ai.run']);
    expect(nomesDeFornecedorEm(`import Anthropic from '@anthropic-ai/sdk'`)).toEqual(['anthropic']);
    expect(nomesDeFornecedorEm(`criarPixabay(chave)`)).toEqual(['pixabay']);
  });

  it('não acusa tecnologia da plataforma (ADR 020, limite 6)', () => {
    expect(nomesDeFornecedorEm(`import { PrismaClient } from './gerado'; // PostgreSQL, NestJS, zod`)).toEqual([]);
  });
});
