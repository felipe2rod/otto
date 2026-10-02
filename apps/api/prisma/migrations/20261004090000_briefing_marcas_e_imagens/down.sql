-- Volta da migração 20261004090000_briefing_marcas_e_imagens. Apaga as marcas, os briefings salvos e o
-- cache de busca de imagens. As imagens já trazidas continuam sendo arquivos das contas.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261004090000_briefing_marcas_e_imagens';
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);
ALTER TABLE "tarefas_do_agente" DROP CONSTRAINT IF EXISTS "tarefas_do_agente_briefing_id_conta_id_fkey";
ALTER TABLE "tarefas_do_agente" DROP COLUMN IF EXISTS "briefing_id";
ALTER TABLE "tarefas_do_agente" DROP COLUMN IF EXISTS "enfileirada_em";
ALTER TABLE "documentos" DROP COLUMN IF EXISTS "de_exemplo";
DROP TABLE IF EXISTS "buscas_de_imagens";
DROP TABLE IF EXISTS "briefings";
DROP TABLE IF EXISTS "marcas";
RESET app.conta_id;
