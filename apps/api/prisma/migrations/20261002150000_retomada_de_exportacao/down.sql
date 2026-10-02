-- Volta da migração 20261002150000_retomada_de_exportacao. Não perde dado de exportação.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261002150000_retomada_de_exportacao';
REVOKE DELETE ON "arquivos_de_exportacao" FROM otto_app;
ALTER TABLE "exportacoes" DROP CONSTRAINT IF EXISTS "exportacoes_tentativas_validas";
ALTER TABLE "exportacoes" DROP COLUMN IF EXISTS "tentativas";
