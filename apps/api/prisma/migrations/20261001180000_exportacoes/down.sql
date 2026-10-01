-- Volta da migração 20261001180000_exportacoes. Apaga os registros de exportação (os arquivos no
-- armazenamento ficam: apague o prefixo contas/*/exportacoes à parte).
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261001180000_exportacoes';
DROP TABLE IF EXISTS "arquivos_de_exportacao";
DROP TABLE IF EXISTS "exportacoes";
DROP TYPE IF EXISTS "estado_da_exportacao";
DROP TYPE IF EXISTS "formato_de_exportacao";
