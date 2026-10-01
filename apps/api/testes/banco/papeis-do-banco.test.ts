// Os três papéis do ADR 023 (decisão 3) e o que cada um não pode.
import { describe, expect, it } from 'vitest';
import { comoApp, comoMigrador, tabelasDoEsquema } from './conexoes';

describe('papéis do banco', () => {
  it('existem otto_migrador, otto_app e otto_operacao; nenhum é superusuário nem ignora RLS', async () => {
    await comoMigrador(async (c) => {
      const r = await c.query<{ nome: string; super: boolean; ignora: boolean; cria_papel: boolean; cria_banco: boolean }>(
        `SELECT rolname AS nome, rolsuper AS super, rolbypassrls AS ignora, rolcreaterole AS cria_papel, rolcreatedb AS cria_banco
         FROM pg_roles WHERE rolname IN ('otto_migrador', 'otto_app', 'otto_operacao') ORDER BY 1`,
      );
      expect(r.rows.map((p) => p.nome)).toEqual(['otto_app', 'otto_migrador', 'otto_operacao']);
      for (const p of r.rows) expect(p, p.nome).toMatchObject({ super: false, ignora: false, cria_papel: false, cria_banco: false });
    });
  });

  it('otto_app não é dono de nenhuma tabela; o dono é o migrador', async () => {
    await comoMigrador(async (c) => {
      const r = await c.query<{ tabela: string; dono: string }>(`SELECT tablename AS tabela, tableowner AS dono FROM pg_tables WHERE schemaname = 'public'`);
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.filter((t) => t.dono !== 'otto_migrador')).toEqual([]);
    });
  });

  it('otto_app não cria tabela no esquema', async () => {
    await comoApp(async (c) => {
      const pode = await c.query<{ pode: boolean }>(`SELECT has_schema_privilege('otto_app', 'public', 'CREATE') AS pode`);
      expect(pode.rows[0]?.pode).toBe(false);
      await expect(c.query('CREATE TABLE tentativa (id int)')).rejects.toThrow(/permission denied/);
    });
  });

  it('otto_app não enxerga a tabela de controle de migração', async () => {
    await comoApp(async (c) => {
      await expect(c.query('SELECT * FROM _prisma_migrations')).rejects.toThrow(/permission denied/);
    });
  });

  it('o histórico é só de acréscimo também no banco: otto_app não tem DELETE em lote nem em versão, nem TRUNCATE em nada', async () => {
    await comoMigrador(async (c) => {
      for (const tabela of ['lotes_de_operacoes', 'versoes_de_documento', 'documentos', 'contas']) {
        const r = await c.query<{ pode: boolean }>(`SELECT has_table_privilege('otto_app', $1, 'DELETE') AS pode`, [`public.${tabela}`]);
        expect(r.rows[0]?.pode, `DELETE em ${tabela}`).toBe(false);
      }
      for (const tabela of await tabelasDoEsquema(c)) {
        const r = await c.query<{ pode: boolean }>(`SELECT has_table_privilege('otto_app', $1, 'TRUNCATE') AS pode`, [`public.${tabela}`]);
        expect(r.rows[0]?.pode, `TRUNCATE em ${tabela}`).toBe(false);
      }
    });
  });

  it('otto_operacao não lê nenhuma tabela de conteúdo (ADR 031): nesta fatia, nenhuma tabela', async () => {
    await comoMigrador(async (c) => {
      for (const tabela of await tabelasDoEsquema(c)) {
        const r = await c.query<{ pode: boolean }>(`SELECT has_table_privilege('otto_operacao', $1, 'SELECT') AS pode`, [`public.${tabela}`]);
        expect(r.rows[0]?.pode, `SELECT em ${tabela}`).toBe(false);
      }
    });
  });

  it('não existe função SECURITY DEFINER fora da lista permitida (sem login, a lista está vazia)', async () => {
    // ADR 023, decisão 2.5: quando o login entrar, a lista passa a ter exatamente os resolvedores de conta.
    const PERMITIDAS: string[] = [];
    await comoMigrador(async (c) => {
      const r = await c.query<{ nome: string }>(`SELECT p.proname AS nome FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1`);
      expect(r.rows.map((f) => f.nome)).toEqual(PERMITIDAS);
    });
  });
});
