-- Fatia 0: o chão do banco. Conta, documento, versão, lote e arquivo (ADR 023, 027, 035).
-- A parte de tabelas, índices e chaves foi gerada pelo Prisma a partir do schema.prisma.
-- Restrições CHECK, permissões, RLS e a conta fixa são escritas à mão, no fim deste arquivo.
-- Volta: down.sql, na mesma pasta.

-- CreateEnum
CREATE TYPE "autoria_do_lote" AS ENUM ('designer', 'agente');

-- CreateEnum
CREATE TYPE "tipo_de_lote" AS ENUM ('edicao', 'reversao');

-- CreateEnum
CREATE TYPE "especie_de_arquivo" AS ENUM ('imagem', 'vetor', 'mascara');

-- CreateTable
CREATE TABLE "contas" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "versao_atual" INTEGER NOT NULL DEFAULT 0,
    "versao_do_formato" INTEGER NOT NULL,
    "pranchetas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arquivado_em" TIMESTAMPTZ(3),

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versoes_de_documento" (
    "conta_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "arvore" JSONB,
    "bytes" INTEGER NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versoes_de_documento_pkey" PRIMARY KEY ("documento_id","versao")
);

-- CreateTable
CREATE TABLE "lotes_de_operacoes" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "autoria" "autoria_do_lote" NOT NULL,
    "tarefa_id" UUID,
    "tipo" "tipo_de_lote" NOT NULL DEFAULT 'edicao',
    "reverte_ate_versao" INTEGER,
    "desfeito_por" UUID,
    "descricao" TEXT NOT NULL,
    "operacoes" JSONB NOT NULL,
    "tocados" JSONB NOT NULL,
    "chave_do_cliente" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_de_operacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "largura" INTEGER,
    "altura" INTEGER,
    "especie" "especie_de_arquivo" NOT NULL,
    "origem_banco" TEXT,
    "origem_id_externo" TEXT,
    "origem_autor" TEXT,
    "origem_licenca" TEXT,
    "origem_url" TEXT,
    "nome_original" TEXT,
    "chave_do_objeto" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_conta_id_alterado_em_idx" ON "documentos"("conta_id", "alterado_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_id_conta_id_key" ON "documentos"("id", "conta_id");

-- CreateIndex
CREATE INDEX "lotes_de_operacoes_conta_id_tarefa_id_idx" ON "lotes_de_operacoes"("conta_id", "tarefa_id");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_de_operacoes_documento_id_versao_key" ON "lotes_de_operacoes"("documento_id", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_de_operacoes_conta_id_documento_id_chave_do_cliente_key" ON "lotes_de_operacoes"("conta_id", "documento_id", "chave_do_cliente");

-- CreateIndex
CREATE UNIQUE INDEX "arquivos_conta_id_sha256_key" ON "arquivos"("conta_id", "sha256");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versoes_de_documento" ADD CONSTRAINT "versoes_de_documento_documento_id_conta_id_fkey" FOREIGN KEY ("documento_id", "conta_id") REFERENCES "documentos"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_de_operacoes" ADD CONSTRAINT "lotes_de_operacoes_documento_id_conta_id_fkey" FOREIGN KEY ("documento_id", "conta_id") REFERENCES "documentos"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Restrições que o Prisma não descreve
-- ============================================================================

-- o hash é SHA-256 em hexadecimal minúsculo; a chave do objeto nasce dele, nunca de texto do cliente
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_sha256_formato" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_medidas_positivas" CHECK ("bytes" > 0 AND ("largura" IS NULL OR "largura" > 0) AND ("altura" IS NULL OR "altura" > 0));
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_versao_nao_negativa" CHECK ("versao_atual" >= 0);
ALTER TABLE "versoes_de_documento" ADD CONSTRAINT "versoes_de_documento_versao_nao_negativa" CHECK ("versao" >= 0);
-- a versão 0 é o documento vazio; todo lote produz uma versão a partir de 1
ALTER TABLE "lotes_de_operacoes" ADD CONSTRAINT "lotes_de_operacoes_versao_positiva" CHECK ("versao" >= 1);
-- lote do agente sempre diz de qual tarefa veio (ADR 027, autoria em cada lote)
ALTER TABLE "lotes_de_operacoes" ADD CONSTRAINT "lotes_de_operacoes_agente_tem_tarefa" CHECK ("autoria" <> 'agente' OR "tarefa_id" IS NOT NULL);
-- lote de reversão sempre diz até que versão voltou
ALTER TABLE "lotes_de_operacoes" ADD CONSTRAINT "lotes_de_operacoes_reversao_tem_alvo" CHECK (("tipo" = 'reversao') = ("reverte_ate_versao" IS NOT NULL));

-- ============================================================================
-- Permissões de otto_app (API e worker). O que não está aqui, ele não faz.
-- O histórico é só de acréscimo: sem DELETE em lote, versão, documento ou conta.
-- otto_operacao não recebe nada nesta fatia (ADR 031: estas tabelas são conteúdo).
-- ============================================================================

GRANT SELECT ON "contas" TO otto_app;
GRANT SELECT, INSERT, UPDATE ON "documentos" TO otto_app;
GRANT SELECT, INSERT ON "versoes_de_documento" TO otto_app;
GRANT SELECT, INSERT ON "lotes_de_operacoes" TO otto_app;
-- desfazer marca o lote revertido; nada mais num lote gravado muda
GRANT UPDATE ("desfeito_por") ON "lotes_de_operacoes" TO otto_app;
GRANT SELECT, INSERT ON "arquivos" TO otto_app;

-- ============================================================================
-- Conta fixa do MVP (ADR 035, itens 4 e 7; aceito pelo Felipe em 2026-10-02):
-- sem login, existe uma conta só, semeada aqui, e o servidor resolve o escopo sempre para ela.
-- Inserida antes de ligar o RLS, porque depois nem o dono escreve sem escopo aberto.
-- ============================================================================

INSERT INTO "contas" ("id", "nome") VALUES ('01990000-0000-7000-8000-000000000001', 'Conta do MVP');

-- ============================================================================
-- Isolamento por conta (ADR 023, decisão 3). ENABLE e FORCE: com FORCE, nem o dono da tabela
-- escapa da política. USING e WITH CHECK idênticos: ler e gravar fora do escopo falham igual.
-- current_setting sem o segundo argumento: sem escopo aberto, a consulta dá erro, não lista vazia.
-- ============================================================================

ALTER TABLE "contas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "contas"
  USING ("id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "documentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "documentos"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "versoes_de_documento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "versoes_de_documento" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "versoes_de_documento"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "lotes_de_operacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_de_operacoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "lotes_de_operacoes"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "arquivos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "arquivos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "arquivos"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);
