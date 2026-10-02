-- Mais de um worker: a exportação de um worker que morreu é retomada por outro.
-- Volta: down.sql, na mesma pasta.
--
-- Índice: nenhum novo. A retomada chega por id (o trabalho da fila reentregue).

-- Quantas vezes a exportação começou a rodar. 1 é o normal; 2 é uma retomada. Com isto a exportação
-- que derruba o worker (falta de memória) não é retomada para sempre.
ALTER TABLE "exportacoes" ADD COLUMN "tentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_tentativas_validas" CHECK ("tentativas" >= 0);

-- Retomar é recomeçar do zero: as linhas dos arquivos da tentativa que morreu são apagadas e
-- regravadas. É a única tabela em que otto_app apaga linha: ela não é histórico (o histórico do
-- documento continua sem DELETE), é o resultado de um trabalho que pode ser refeito.
GRANT DELETE ON "arquivos_de_exportacao" TO otto_app;
