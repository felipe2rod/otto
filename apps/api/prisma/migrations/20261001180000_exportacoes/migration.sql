-- Fatia 2: exportação pela fila. Pedido, andamento e arquivos gerados.
-- Volta: down.sql, na mesma pasta.

-- Criar chave estrangeira para uma tabela com FORCE ROW LEVEL SECURITY faz o PostgreSQL conferir a
-- tabela referenciada COMO O DONO, e o dono também está sob a política: sem escopo aberto, a
-- conferência falha ("unrecognized configuration parameter app.conta_id"). Esta sessão do migrador
-- abre um escopo de uma conta que não existe (não enxerga linha nenhuma) e o fecha no fim.
-- TODA migração que referencia tabela de negócio precisa disto.
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);

-- CreateEnum
CREATE TYPE "formato_de_exportacao" AS ENUM ('psd', 'png');

-- CreateEnum
CREATE TYPE "estado_da_exportacao" AS ENUM ('na_fila', 'rodando', 'pronta', 'pronta_em_parte', 'falhou');

-- CreateTable
CREATE TABLE "exportacoes" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "formato" "formato_de_exportacao" NOT NULL,
    "opcoes" JSONB NOT NULL,
    "estado" "estado_da_exportacao" NOT NULL DEFAULT 'na_fila',
    "pranchetas_no_total" INTEGER NOT NULL,
    "pranchetas_prontas" INTEGER NOT NULL DEFAULT 0,
    "falhas" JSONB NOT NULL DEFAULT '[]',
    "relatorio" JSONB,
    "erro_codigo" TEXT,
    "duracao_ms" INTEGER,
    "batimento_em" TIMESTAMPTZ(3),
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ(3),
    "terminada_em" TIMESTAMPTZ(3),
    "expira_em" TIMESTAMPTZ(3),

    CONSTRAINT "exportacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos_de_exportacao" (
    "conta_id" UUID NOT NULL,
    "exportacao_id" UUID NOT NULL,
    "indice" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "prancheta_id" TEXT,
    "chave_do_objeto" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_de_exportacao_pkey" PRIMARY KEY ("exportacao_id","indice")
);

-- CreateIndex
CREATE INDEX "exportacoes_conta_id_estado_idx" ON "exportacoes"("conta_id", "estado");

-- CreateIndex
CREATE INDEX "exportacoes_conta_id_documento_id_criada_em_idx" ON "exportacoes"("conta_id", "documento_id", "criada_em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exportacoes_id_conta_id_key" ON "exportacoes"("id", "conta_id");

-- AddForeignKey
ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_documento_id_conta_id_fkey" FOREIGN KEY ("documento_id", "conta_id") REFERENCES "documentos"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos_de_exportacao" ADD CONSTRAINT "arquivos_de_exportacao_exportacao_id_conta_id_fkey" FOREIGN KEY ("exportacao_id", "conta_id") REFERENCES "exportacoes"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Restrições que o Prisma não descreve
-- ============================================================================

-- UMA EXPORTAÇÃO POR VEZ POR CONTA, garantida pelo banco: duas linhas "rodando" da mesma conta
-- não coexistem, mesmo com defeito na aplicação ou dois workers ao mesmo tempo.
CREATE UNIQUE INDEX "exportacoes_uma_rodando_por_conta" ON "exportacoes"("conta_id") WHERE "estado" = 'rodando';

ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_progresso_valido" CHECK ("pranchetas_no_total" >= 1 AND "pranchetas_prontas" >= 0 AND "pranchetas_prontas" <= "pranchetas_no_total");
ALTER TABLE "arquivos_de_exportacao" ADD CONSTRAINT "arquivos_de_exportacao_medidas_validas" CHECK ("indice" >= 0 AND "bytes" >= 0);

-- ============================================================================
-- Permissões de otto_app. Sem DELETE: apagar arquivo vencido é do job de limpeza (fatia de produção),
-- que entra com a permissão que precisar.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON "exportacoes" TO otto_app;
GRANT SELECT, INSERT ON "arquivos_de_exportacao" TO otto_app;

-- ============================================================================
-- Isolamento por conta (ADR 023): ENABLE, FORCE, USING e WITH CHECK idênticos.
-- ============================================================================

ALTER TABLE "exportacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exportacoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "exportacoes"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "arquivos_de_exportacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "arquivos_de_exportacao" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "arquivos_de_exportacao"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

-- fecha o escopo aberto no começo desta migração
RESET app.conta_id;
