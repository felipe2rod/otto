-- Volta da migração 20261002090000_exportacao_vetorial_e_limpeza.
-- O PostgreSQL não remove valor de enumeração: o tipo é recriado. As exportações em SVG e PDF são
-- APAGADAS (os arquivos delas no armazenamento ficam: apague à parte os de contas/*/exportacoes).
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261002090000_exportacao_vetorial_e_limpeza';
BEGIN;
-- o dono também está sob a política (FORCE): para apagar linha de qualquer conta, ela é suspensa aqui dentro
ALTER TABLE "arquivos_de_exportacao" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "exportacoes" NO FORCE ROW LEVEL SECURITY;
DELETE FROM "arquivos_de_exportacao" WHERE "exportacao_id" IN (SELECT "id" FROM "exportacoes" WHERE "formato"::text IN ('svg', 'pdf'));
DELETE FROM "exportacoes" WHERE "formato"::text IN ('svg', 'pdf');
ALTER TABLE "exportacoes" DROP COLUMN IF EXISTS "arquivos_removidos_em";
ALTER TYPE "formato_de_exportacao" RENAME TO "formato_de_exportacao_velho";
CREATE TYPE "formato_de_exportacao" AS ENUM ('psd', 'png');
ALTER TABLE "exportacoes" ALTER COLUMN "formato" TYPE "formato_de_exportacao" USING "formato"::text::"formato_de_exportacao";
DROP TYPE "formato_de_exportacao_velho";
ALTER TABLE "exportacoes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "arquivos_de_exportacao" FORCE ROW LEVEL SECURITY;
COMMIT;
