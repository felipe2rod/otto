-- Volta da migração 20261001000000_chao. Apaga TUDO que ela criou, inclusive os dados.
-- Rodar como otto_migrador, e depois apagar a linha dela em _prisma_migrations:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261001000000_chao';
DROP TABLE IF EXISTS "arquivos";
DROP TABLE IF EXISTS "lotes_de_operacoes";
DROP TABLE IF EXISTS "versoes_de_documento";
DROP TABLE IF EXISTS "documentos";
DROP TABLE IF EXISTS "contas";
DROP TYPE IF EXISTS "especie_de_arquivo";
DROP TYPE IF EXISTS "tipo_de_lote";
DROP TYPE IF EXISTS "autoria_do_lote";
