-- Volta da migração 20261001120000_fontes_e_contagem_de_operacoes.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261001120000_fontes_e_contagem_de_operacoes';
DROP TABLE IF EXISTS "fontes_da_biblioteca";
ALTER TABLE "lotes_de_operacoes" DROP COLUMN IF EXISTS "quantidade_de_operacoes";
