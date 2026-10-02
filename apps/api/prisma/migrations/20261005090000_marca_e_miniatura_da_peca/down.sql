-- Volta da migração 20261005090000_marca_e_miniatura_da_peca. As miniaturas guardadas no armazenamento
-- (contas/<conta>/miniaturas/) ficam órfãs: apague pelo prefixo.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261005090000_marca_e_miniatura_da_peca';
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);
DROP INDEX IF EXISTS "buscas_de_imagens_buscada_em_idx";
REVOKE DELETE ON "buscas_de_imagens" FROM otto_app;
DROP INDEX IF EXISTS "documentos_conta_id_marca_id_alterado_em_idx";
ALTER TABLE "documentos" DROP CONSTRAINT IF EXISTS "documentos_marca_id_conta_id_fkey";
ALTER TABLE "documentos" DROP COLUMN IF EXISTS "miniatura_pedida_em";
ALTER TABLE "documentos" DROP COLUMN IF EXISTS "miniatura_versao";
ALTER TABLE "documentos" DROP COLUMN IF EXISTS "marca_id";
RESET app.conta_id;
