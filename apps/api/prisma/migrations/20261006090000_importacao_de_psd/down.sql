-- Volta da migração 20261006090000_importacao_de_psd. As peças importadas continuam existindo (perdem só o vínculo
-- e o relatório). Os arquivos enviados e ainda não importados (contas/<conta>/importacoes/) ficam órfãos no
-- armazenamento: apague pelo prefixo.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261006090000_importacao_de_psd';
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);
DROP INDEX IF EXISTS "documentos_uma_por_importacao";
ALTER TABLE "documentos" DROP CONSTRAINT IF EXISTS "documentos_importacao_id_conta_id_fkey";
ALTER TABLE "documentos" DROP COLUMN IF EXISTS "importacao_id";
DROP TABLE IF EXISTS "importacoes";
DROP TYPE IF EXISTS "estado_da_importacao";
RESET app.conta_id;
