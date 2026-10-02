import { Operacao } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ferramentasDoAgente, OPERACOES_DO_CATALOGO } from './ferramentas';
import { CAPACIDADES_MINIMAS, type Capacidades } from './prompt/repertorio';

const TUDO: Capacidades = { bancoDeImagens: true, sujeito: true, texturas: true, buscaDeFontes: true };
const nomes = (fs: { nome: string }[]) => fs.map((f) => f.nome);

describe('ferramentas do agente', () => {
  it('com tudo: ler, mudar, ver, conferir, imagens, fontes, texturas, sujeito e entregar', () => {
    expect(nomes(ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }))).toEqual([
      'resumirDocumento',
      'aplicarOperacoes',
      'renderizar',
      'verificar',
      'buscarImagens',
      'trazerImagem',
      'detectarSujeito',
      'buscarFontes',
      'listarTexturas',
      'entregar',
    ]);
  });

  it('o que o ambiente não tem não é oferecido', () => {
    expect(nomes(ferramentasDoAgente({ modo: 'tarefa', capacidades: CAPACIDADES_MINIMAS }))).toEqual(['resumirDocumento', 'aplicarOperacoes', 'renderizar', 'verificar', 'entregar']);
  });

  it('no ajuste pontual são três: o documento já vem na mensagem e a conferência é do sistema', () => {
    expect(nomes(ferramentasDoAgente({ modo: 'ajuste', capacidades: TUDO }))).toEqual(['aplicarOperacoes', 'renderizar', 'entregar']);
  });

  it('a lista é sempre a mesma para o mesmo ambiente (ordem estável, para o cache)', () => {
    expect(JSON.stringify(ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }))).toBe(JSON.stringify(ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO })));
  });

  it('toda descrição diz quando usar', () => {
    // que nenhuma cita fornecedor é conferido em avaliacao/src/ambiente.test.ts, com a lista de testes/fronteira
    for (const f of ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO })) {
      expect(f.descricao.length, f.nome).toBeGreaterThan(60);
      expect(f.descricao, f.nome).toContain('Quando usar');
    }
  });

  it('aplicarOperacoes traz um lote bom e um erro corrigido como exemplo', () => {
    const f = ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }).find((x) => x.nome === 'aplicarOperacoes');
    expect(f?.descricao).toContain('Exemplo de lote');
    expect(f?.descricao).toContain('Exemplo de erro');
    expect(f?.descricao).toContain('simular');
  });

  it('entregar pede resumo e pendências com tipo e camadas', () => {
    const f = ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }).find((x) => x.nome === 'entregar');
    const p = ((f?.parametros ?? {}) as { properties: Record<string, { items?: { properties?: Record<string, unknown> } }> }).properties;
    expect(Object.keys(p)).toEqual(['resumo', 'pendencias']);
    expect(Object.keys(p.pendencias?.items?.properties ?? {})).toEqual(['texto', 'tipo', 'camadas']);
  });
});

describe('o esquema das operações mostrado ao modelo acompanha o catálogo', () => {
  const doCatalogo = (z.toJSONSchema(Operacao, { io: 'input', unrepresentable: 'any' }) as unknown as { oneOf: { properties: { op: { const: string } } }[] }).oneOf.map((o) => o.properties.op.const);

  it('a lista de operações do agente é a do catálogo, sem faltar nem sobrar', () => {
    expect([...OPERACOES_DO_CATALOGO].sort()).toEqual([...doCatalogo].sort());
    expect(OPERACOES_DO_CATALOGO).toContain('duplicar');
    expect(OPERACOES_DO_CATALOGO).toContain('transferir');
  });

  it('na tarefa, o esquema completo do catálogo, com duplicar e transferir', () => {
    const f = ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }).find((x) => x.nome === 'aplicarOperacoes');
    const texto = JSON.stringify(f?.parametros);
    expect(texto).toContain('"duplicar"');
    expect(texto).toContain('"transferir"');
    expect(texto).toContain('"simular"');
    expect(texto).not.toContain('$schema');
  });

  it('na tarefa, o esquema compacto é uma opção (para medir), e mantém "simular"', () => {
    const f = ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO, esquemaDasOperacoes: 'compacto' }).find((x) => x.nome === 'aplicarOperacoes');
    const texto = JSON.stringify(f?.parametros);
    expect(texto.length).toBeLessThan(3000);
    expect(texto).toContain('"simular"');
    for (const op of OPERACOES_DO_CATALOGO) expect(texto, op).toContain(`"${op}"`);
  });

  it('no ajuste, um esquema compacto: só o nome de cada operação (a sintaxe está nas receitas e o erro volta legível)', () => {
    const completo = JSON.stringify(ferramentasDoAgente({ modo: 'tarefa', capacidades: TUDO }).find((x) => x.nome === 'aplicarOperacoes')?.parametros);
    const compacto = JSON.stringify(ferramentasDoAgente({ modo: 'ajuste', capacidades: TUDO }).find((x) => x.nome === 'aplicarOperacoes')?.parametros);
    expect(compacto.length).toBeLessThan(completo.length / 5);
    for (const op of OPERACOES_DO_CATALOGO) expect(compacto, op).toContain(`"${op}"`);
  });
});
