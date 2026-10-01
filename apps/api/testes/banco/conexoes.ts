// Conexões dos testes de banco. Falam com a base de TESTE (otto_teste), nunca com a de desenvolvimento.
// As duas URLs só existem no serviço "teste" do compose.
import { randomUUID } from 'node:crypto';
import { lerContaId } from '@otto/shared';
import pg from 'pg';
import { EscopoDaConta } from '../../src/plataforma/escopo/escopo-da-conta';

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} ausente: os testes de banco rodam por "docker compose run --rm teste"`);
  if (!/\/otto_teste(\?|$)/.test(valor)) throw new Error(`${nome} precisa apontar para a base otto_teste`);
  return valor;
}

export const urlDoMigradorDeTeste = (): string => exigir('BANCO_DE_TESTE_URL_MIGRADOR');
export const urlDoAppDeTeste = (): string => exigir('BANCO_DE_TESTE_URL_APP');

export async function comoMigrador<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return conectado(urlDoMigradorDeTeste(), fn);
}

export async function comoApp<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return conectado(urlDoAppDeTeste(), fn);
}

async function conectado<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

/** Tabelas de negócio do esquema public: tudo, menos o controle de migração. */
export async function tabelasDoEsquema(c: pg.Client): Promise<string[]> {
  const r = await c.query<{ nome: string }>(
    `SELECT c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations' ORDER BY 1`,
  );
  return r.rows.map((l) => l.nome);
}

/**
 * Cria uma conta nova na base de teste e devolve o escopo dela. Conta só nasce pelo migrador:
 * otto_app não tem INSERT em contas. Cada teste usa contas próprias, então rodam em paralelo.
 */
export async function criarContaDeTeste(nome = 'Conta de teste'): Promise<EscopoDaConta> {
  const id = randomUUID();
  await comoMigrador(async (c) => {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('app.conta_id', $1, true)`, [id]);
    await c.query('INSERT INTO contas (id, nome) VALUES ($1, $2)', [id, nome]);
    await c.query('COMMIT');
  });
  return EscopoDaConta.abrir(lerContaId(id));
}
