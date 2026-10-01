// Cria (ou atualiza) o esquema da fila e as filas, com o papel MIGRADOR, e dá a otto_app só o que
// ele precisa para publicar e consumir. Roda no passo de migração, nunca na API nem no worker:
// otto_app não cria esquema nem tabela (ADR 023).
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import type { NomeDaFila } from '../../barramento-de-eventos';
import { CONFIGURACAO_DAS_FILAS, ESQUEMA_DA_FILA, POLITICA_DAS_FILAS } from './barramento-com-pg-boss';

export async function prepararEsquemaDaFila(urlDoMigrador: string): Promise<{ filas: string[] }> {
  const boss = new PgBoss({ connectionString: urlDoMigrador, schema: ESQUEMA_DA_FILA, supervise: false, schedule: false, max: 2 });
  boss.on('error', () => undefined);
  await boss.start();
  const filas: string[] = [];
  try {
    for (const [nome, c] of Object.entries(CONFIGURACAO_DAS_FILAS) as [NomeDaFila, (typeof CONFIGURACAO_DAS_FILAS)[NomeDaFila]][]) {
      const opcoes = { expireInSeconds: c.expiraEmSegundos, retryLimit: c.tentativas, retryDelay: c.reentregaEmSegundos };
      const existente = await boss.getQueue(nome);
      if (existente && existente.policy !== POLITICA_DAS_FILAS) {
        // a política de uma fila não se altera: recria. Os trabalhos pendentes se perdem, e as exportações
        // deles ficam "na_fila" (só aconteceu uma vez, antes de qualquer usuário: ver barramento-com-pg-boss.ts)
        await boss.deleteQueue(nome);
        await boss.createQueue(nome, { policy: POLITICA_DAS_FILAS, ...opcoes });
      } else if (existente) await boss.updateQueue(nome, opcoes);
      else await boss.createQueue(nome, { policy: POLITICA_DAS_FILAS, ...opcoes });
      filas.push(nome);
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 10_000 });
  }

  // otto_app lê e escreve linha da fila; não cria nem altera tabela
  const cliente = new pg.Client({ connectionString: urlDoMigrador });
  await cliente.connect();
  try {
    await cliente.query(`GRANT USAGE ON SCHEMA ${ESQUEMA_DA_FILA} TO otto_app`);
    await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${ESQUEMA_DA_FILA} TO otto_app`);
    await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${ESQUEMA_DA_FILA} TO otto_app`);
    await cliente.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${ESQUEMA_DA_FILA} TO otto_app`);
  } finally {
    await cliente.end();
  }
  return { filas };
}
