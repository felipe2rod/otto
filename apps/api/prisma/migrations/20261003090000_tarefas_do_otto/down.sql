-- Volta da migração 20261003090000_tarefas_do_otto. Apaga as tarefas, as entradas, os eventos, o
-- registro de custo e as pendências. Os lotes que as tarefas gravaram ficam no histórico das peças.
-- Rodar como otto_migrador, e depois:
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261003090000_tarefas_do_otto';
DROP TABLE IF EXISTS "consumo_diario_do_modelo";
DROP TABLE IF EXISTS "pendencias";
DROP TABLE IF EXISTS "chamadas_ao_modelo";
DROP TABLE IF EXISTS "eventos_de_tarefa";
DROP TABLE IF EXISTS "entradas_de_tarefa";
DROP TABLE IF EXISTS "tarefas_do_agente";
DROP TYPE IF EXISTS "estado_da_pendencia";
DROP TYPE IF EXISTS "estado_da_tarefa";
