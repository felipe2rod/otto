-- Fechamento da fatia 2: SVG e PDF na fila de exportação, e a limpeza dos arquivos vencidos.
-- Volta: down.sql, na mesma pasta.
--
-- Índice: nenhum novo. A lista de exportações de uma peça usa o índice que já existe
-- (conta_id, documento_id, criada_em DESC); a limpeza chega por id (um trabalho da fila por
-- exportação, agendado para o vencimento), então não há varredura por expira_em para indexar.

-- Valor novo de enumeração não pode ser usado na mesma transação em que nasce: esta migração só cria.
ALTER TYPE "formato_de_exportacao" ADD VALUE IF NOT EXISTS 'svg';
ALTER TYPE "formato_de_exportacao" ADD VALUE IF NOT EXISTS 'pdf';

-- Quando os arquivos da exportação foram apagados do armazenamento. As linhas ficam (nome, tamanho e
-- relatório são o registro do que foi exportado); só os bytes vão embora.
ALTER TABLE "exportacoes" ADD COLUMN "arquivos_removidos_em" TIMESTAMPTZ(3);

-- Permissões: nenhuma nova. otto_app já tem UPDATE em exportacoes (coluna nova incluída) e continua
-- sem DELETE: a limpeza apaga objeto no armazenamento e marca a linha, não apaga registro.
