// Toda tabela de negócio tem conta_id (ADR 023, item 6.1). Estático: lê o schema.prisma.
// Tabela nova entra sozinha nesta suíte. Exceção é diff visível em isolamento.excecoes.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABELAS_SEM_CONTA_ID } from '../../prisma/isolamento.excecoes';

const schema = readFileSync(path.resolve(import.meta.dirname, '../../prisma/schema.prisma'), 'utf8');

interface Modelo {
  nome: string;
  tabela: string;
  corpo: string;
}

function modelos(): Modelo[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => {
    const corpo = m[2] as string;
    return { nome: m[1] as string, corpo, tabela: /@@map\("([^"]+)"\)/.exec(corpo)?.[1] ?? (m[1] as string) };
  });
}

describe('toda tabela tem conta_id', () => {
  it('o schema tem modelos (a suíte não passa por falta do que conferir)', () => {
    expect(modelos().length).toBeGreaterThan(0);
  });

  it('todo modelo tem a coluna conta_id obrigatória, do tipo uuid, ou está na lista de exceções', () => {
    const semConta = modelos()
      .filter((m) => !/^\s*contaId\s+String\s+@map\("conta_id"\)\s+@db\.Uuid\b/m.test(m.corpo))
      .map((m) => m.tabela);
    expect(semConta.sort()).toEqual(Object.keys(TABELAS_SEM_CONTA_ID).sort());
  });

  it('toda exceção tem justificativa escrita e corresponde a uma tabela que existe', () => {
    const tabelas = new Set(modelos().map((m) => m.tabela));
    for (const [tabela, excecao] of Object.entries(TABELAS_SEM_CONTA_ID)) {
      expect(tabelas.has(tabela), `${tabela} está nas exceções e não existe no schema`).toBe(true);
      expect(excecao.justificativa.length, `${tabela} sem justificativa`).toBeGreaterThan(20);
    }
  });

  it('toda tabela filha referencia a mãe por chave composta (id, conta_id)', () => {
    const relacoes = modelos().flatMap((m) =>
      [...m.corpo.matchAll(/@relation\(fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/g)].map((r) => ({ tabela: m.tabela, campos: r[1] as string, referencias: r[2] as string })),
    );
    expect(relacoes.length).toBeGreaterThan(0);
    for (const r of relacoes) {
      // a relação com a própria conta é por conta_id; todas as outras levam conta_id junto
      if (r.referencias.trim() === 'id' && r.campos.trim() === 'contaId') continue;
      expect(r.campos, `${r.tabela}: relação sem conta_id`).toContain('contaId');
      expect(r.referencias, `${r.tabela}: relação sem conta_id`).toContain('contaId');
    }
  });
});
