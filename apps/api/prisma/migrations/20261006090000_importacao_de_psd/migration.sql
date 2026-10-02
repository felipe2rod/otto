-- Importação de PSD (ADR 028, item 4; docs/mvp/backend.md, 17.14): o arquivo enviado, o pedido, o andamento e o
-- relatório. A peça criada aponta para a importação de onde nasceu.
-- Volta: down.sql, na mesma pasta.

-- ver a nota da migração 20261001180000_exportacoes: chave estrangeira para tabela com FORCE ROW LEVEL SECURITY
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);

CREATE TYPE "estado_da_importacao" AS ENUM ('enviada', 'na_fila', 'rodando', 'pronta', 'falhou', 'descartada');

CREATE TABLE "importacoes" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "estado" "estado_da_importacao" NOT NULL DEFAULT 'enviada',
    -- nome do arquivo no computador da pessoa: é conteúdo, fica sob RLS e nunca vai para log
    "nome_do_arquivo" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "formato" TEXT NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "camadas" INTEGER NOT NULL,
    -- nomes PostScript que o texto do arquivo pede: conteúdo
    "fontes" JSONB NOT NULL DEFAULT '[]',
    -- o pedido de importação (nome da peça, marca, escolha por fonte)
    "pedido" JSONB,
    "chave_do_objeto" TEXT NOT NULL,
    "relatorio" JSONB,
    "erro_codigo" TEXT,
    "erro_motivo" TEXT,
    "erro_mensagem" TEXT,
    "duracao_ms" INTEGER,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "batimento_em" TIMESTAMPTZ(3),
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pedida_em" TIMESTAMPTZ(3),
    "iniciada_em" TIMESTAMPTZ(3),
    "terminada_em" TIMESTAMPTZ(3),
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "arquivo_removido_em" TIMESTAMPTZ(3),

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- alvo da chave estrangeira composta de documentos
CREATE UNIQUE INDEX "importacoes_id_conta_id_key" ON "importacoes"("id", "conta_id");
-- quantas a conta tem abertas (limite) e quais pararam (baixa): sempre por conta e estado
CREATE INDEX "importacoes_conta_id_estado_idx" ON "importacoes"("conta_id", "estado");
-- a lista das recentes da conta, da mais nova para a mais velha
CREATE INDEX "importacoes_conta_id_criada_em_idx" ON "importacoes"("conta_id", "criada_em" DESC);

ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- UMA IMPORTAÇÃO POR VEZ POR CONTA, garantida pelo banco (o mesmo molde da exportação).
CREATE UNIQUE INDEX "importacoes_uma_rodando_por_conta" ON "importacoes"("conta_id") WHERE "estado" = 'rodando';

ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_medidas_validas" CHECK ("bytes" > 0 AND "largura" > 0 AND "altura" > 0 AND "camadas" >= 0 AND "tentativas" >= 0);
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_formato_valido" CHECK ("formato" IN ('psd', 'psb'));

-- A peça que nasceu de uma importação. Uma importação cria no máximo UMA peça, garantido pelo banco: é o que
-- torna idempotente o worker que caiu depois de criar a peça e antes de fechar a importação.
ALTER TABLE "documentos" ADD COLUMN "importacao_id" UUID;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_importacao_id_conta_id_fkey" FOREIGN KEY ("importacao_id", "conta_id") REFERENCES "importacoes"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- acha a peça de uma importação (consulta e retomada) e impede a segunda; parcial porque quase nenhuma peça vem de PSD
CREATE UNIQUE INDEX "documentos_uma_por_importacao" ON "documentos"("importacao_id") WHERE "importacao_id" IS NOT NULL;

-- Sem DELETE: a linha fica como registro; o que se apaga é o arquivo, no armazenamento.
GRANT SELECT, INSERT, UPDATE ON "importacoes" TO otto_app;

ALTER TABLE "importacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "importacoes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "importacoes"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

RESET app.conta_id;
