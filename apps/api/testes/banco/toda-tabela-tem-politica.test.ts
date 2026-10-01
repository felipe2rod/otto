// Toda tabela com conta_id tem RLS ligado, FORCE e política com USING e WITH CHECK sobre app.conta_id
// (ADR 023, item 6.2). Roda contra o banco migrado: pega a migração que cria tabela e esquece a política.
import { describe, expect, it } from 'vitest';
import { TABELAS_SEM_CONTA_ID } from '../../prisma/isolamento.excecoes';
import { comoMigrador, tabelasDoEsquema } from './conexoes';

const catalogos = Object.entries(TABELAS_SEM_CONTA_ID)
  .filter(([, e]) => e.motivo === 'catalogo-global')
  .map(([tabela]) => tabela);

describe('toda tabela tem política', () => {
  it('toda tabela de negócio tem RLS com FORCE', async () => {
    const semRls = await comoMigrador(async (c) => {
      const r = await c.query<{ nome: string; rls: boolean; force: boolean }>(
        `SELECT c.relname AS nome, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
      );
      expect(r.rows.length).toBeGreaterThan(0);
      return r.rows.filter((t) => !catalogos.includes(t.nome) && !(t.rls && t.force)).map((t) => t.nome);
    });
    expect(semRls).toEqual([]);
  });

  it('toda tabela tem ao menos uma política, e toda política confere app.conta_id no USING e no WITH CHECK', async () => {
    await comoMigrador(async (c) => {
      const tabelas = await tabelasDoEsquema(c);
      const politicas = await c.query<{ tabela: string; nome: string; comando: string; papeis: string; usando: string | null; conferindo: string | null }>(
        `SELECT tablename AS tabela, policyname AS nome, cmd AS comando, roles::text AS papeis, qual AS usando, with_check AS conferindo
         FROM pg_policies WHERE schemaname = 'public'`,
      );
      for (const tabela of tabelas.filter((t) => !catalogos.includes(t))) {
        const dela = politicas.rows.filter((p) => p.tabela === tabela);
        expect(dela.length, `${tabela} sem política`).toBeGreaterThan(0);
        for (const p of dela) {
          const coluna = tabela in TABELAS_SEM_CONTA_ID ? 'id' : 'conta_id';
          const esperado = new RegExp(`\\(?${coluna} = \\(?current_setting\\('app\\.conta_id'::text\\)\\)?::uuid\\)?`);
          expect(p.usando ?? '', `${tabela}.${p.nome}: USING`).toMatch(esperado);
          expect(p.conferindo ?? '', `${tabela}.${p.nome}: WITH CHECK`).toMatch(esperado);
          expect(p.comando, `${tabela}.${p.nome}: vale para todo comando`).toBe('ALL');
        }
      }
    });
  });

  it('catálogo global: otto_app lê e acrescenta, e não altera, não apaga nem esvazia', async () => {
    expect(catalogos.length).toBeGreaterThan(0);
    await comoMigrador(async (c) => {
      const existentes = await tabelasDoEsquema(c);
      for (const tabela of catalogos) {
        expect(existentes, `${tabela} está nas exceções e não existe no banco`).toContain(tabela);
        for (const [privilegio, esperado] of [
          ['SELECT', true],
          ['UPDATE', false],
          ['DELETE', false],
          ['TRUNCATE', false],
        ] as const) {
          const r = await c.query<{ pode: boolean }>(`SELECT has_table_privilege('otto_app', $1, $2) AS pode`, [`public.${tabela}`, privilegio]);
          expect(r.rows[0]?.pode, `${privilegio} em ${tabela}`).toBe(esperado);
        }
      }
    });
  });

  it('nenhuma política usa current_setting com o segundo argumento (ausência de escopo tem de ser erro, não vazio silencioso)', async () => {
    await comoMigrador(async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_policies WHERE schemaname = 'public' AND (qual ~ 'current_setting\\([^)]*,' OR with_check ~ 'current_setting\\([^)]*,')`,
      );
      expect(r.rows[0]?.n).toBe('0');
    });
  });
});
