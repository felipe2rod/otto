-- Fatia 1: biblioteca de fontes (catálogo global) e contagem de operações por lote.
-- Volta: down.sql, na mesma pasta.

-- O histórico lista os lotes sem carregar as operações (um vetor importado pesa MB).
ALTER TABLE "lotes_de_operacoes" ADD COLUMN "quantidade_de_operacoes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fontes_da_biblioteca" (
    "id" UUID NOT NULL,
    "familia" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "nome_postscript" TEXT,
    "sha256" CHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "chave_do_objeto" TEXT NOT NULL,
    "licenca" TEXT,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fontes_da_biblioteca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: é a busca do editor e do medidor (família e peso), e impede fonte repetida
CREATE UNIQUE INDEX "fontes_da_biblioteca_familia_peso_key" ON "fontes_da_biblioteca"("familia", "peso");

ALTER TABLE "fontes_da_biblioteca" ADD CONSTRAINT "fontes_da_biblioteca_sha256_formato" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "fontes_da_biblioteca" ADD CONSTRAINT "fontes_da_biblioteca_peso_valido" CHECK ("peso" BETWEEN 1 AND 1000);

-- Catálogo global (exceção declarada em prisma/isolamento.excecoes.ts): sem conta_id e sem RLS,
-- porque não guarda nada de conta nenhuma. otto_app lê e acrescenta (o worker vai baixar fonte
-- sob demanda na fatia do briefing); não altera nem apaga.
GRANT SELECT, INSERT ON "fontes_da_biblioteca" TO otto_app;
