-- Fatia 3: a tarefa do Otto. A tarefa, a entrada (o único texto que a equipe pode ler), a linha do
-- tempo que o designer vê, o custo de cada chamada ao modelo, as pendências da peça e o contador
-- diário de tokens da plataforma.
-- Volta: down.sql, na mesma pasta.

-- Chave estrangeira para tabela com FORCE ROW LEVEL SECURITY: ver 20261001180000_exportacoes.
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);

CREATE TYPE "estado_da_tarefa" AS ENUM ('na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao', 'aceita', 'desfeita', 'cancelada', 'falhou');
CREATE TYPE "estado_da_pendencia" AS ENUM ('aberta', 'resolvida', 'dispensada');

CREATE TABLE "tarefas_do_agente" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "esforco" TEXT,
    "estado" "estado_da_tarefa" NOT NULL DEFAULT 'na_fila',
    -- qual parte está na fila ou rodando: 'preparo' (entender e planejar) ou 'execucao' (fazer e conferir)
    "fase" TEXT NOT NULL DEFAULT 'preparo',
    "fim" TEXT,
    "erro_codigo" TEXT,
    "etapa" JSONB,
    "etapas" JSONB NOT NULL DEFAULT '[]',
    -- direção, cartão, plano e motivos do "pode" (Preparo de @otto/agente): conteúdo do trabalho
    "preparo" JSONB,
    "aprovada_em" TIMESTAMPTZ(3),
    "versao_inicial" INTEGER NOT NULL,
    "versao_final" INTEGER,
    "lotes" INTEGER NOT NULL DEFAULT 0,
    "tocados" JSONB NOT NULL DEFAULT '[]',
    -- resumo, pendências e se foi conferida (Entrega de @otto/agente): conteúdo do trabalho
    "entrega" JSONB,
    "conferida" BOOLEAN,
    -- o custo (ADR 029, item 5): só números e códigos
    "modelo" TEXT,
    "chamadas" INTEGER NOT NULL DEFAULT 0,
    "tokens_de_entrada" BIGINT NOT NULL DEFAULT 0,
    "tokens_de_cache_lidos" BIGINT NOT NULL DEFAULT 0,
    "tokens_de_cache_criados" BIGINT NOT NULL DEFAULT 0,
    "tokens_de_saida" BIGINT NOT NULL DEFAULT 0,
    "imagens_enviadas" INTEGER NOT NULL DEFAULT 0,
    "voltas_de_conferencia" INTEGER NOT NULL DEFAULT 0,
    "lotes_recusados" INTEGER NOT NULL DEFAULT 0,
    "duracao_ms" INTEGER NOT NULL DEFAULT 0,
    "custo_estimado_micro_usd" BIGINT,
    -- aceita, desfeita, aceita_em_parte: o resultado que fecha o registro de custo
    "resultado" TEXT,
    "ids_do_preparo" INTEGER NOT NULL DEFAULT 0,
    -- a sequência do último evento gravado: é dela que sai a do próximo, na mesma transação
    "ultimo_evento" INTEGER NOT NULL DEFAULT -1,
    -- "tentar de novo": a tarefa que esta refaz
    "origem_id" UUID,
    "cancelamento_pedido_em" TIMESTAMPTZ(3),
    "batimento_em" TIMESTAMPTZ(3),
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMPTZ(3),
    "terminada_em" TIMESTAMPTZ(3),
    "decidida_em" TIMESTAMPTZ(3),

    CONSTRAINT "tarefas_do_agente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entradas_de_tarefa" (
    "tarefa_id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    -- EntradaDaTarefa: o pedido ou o briefing preenchido
    "entrada" JSONB NOT NULL,
    -- o que o designer escreveu em "ajustar a direção", na ordem
    "ajustes" JSONB NOT NULL DEFAULT '[]',
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entradas_de_tarefa_pkey" PRIMARY KEY ("tarefa_id")
);

CREATE TABLE "eventos_de_tarefa" (
    "tarefa_id" UUID NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "conta_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_de_tarefa_pkey" PRIMARY KEY ("tarefa_id", "sequencia")
);

CREATE TABLE "chamadas_ao_modelo" (
    "tarefa_id" UUID NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "conta_id" UUID NOT NULL,
    "papel" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens_de_entrada" INTEGER NOT NULL,
    "tokens_de_cache_lidos" INTEGER NOT NULL,
    "tokens_de_cache_criados" INTEGER NOT NULL,
    "tokens_de_saida" INTEGER NOT NULL,
    "imagens" INTEGER NOT NULL,
    "duracao_ms" INTEGER NOT NULL,
    "resultado" TEXT NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamadas_ao_modelo_pkey" PRIMARY KEY ("tarefa_id", "sequencia")
);

CREATE TABLE "pendencias" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "camadas" JSONB NOT NULL DEFAULT '[]',
    "prancheta" TEXT,
    "origem" TEXT NOT NULL,
    "regra" TEXT,
    "gravidade" TEXT,
    "estado" "estado_da_pendencia" NOT NULL DEFAULT 'aberta',
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechada_em" TIMESTAMPTZ(3),

    CONSTRAINT "pendencias_pkey" PRIMARY KEY ("id")
);

-- Contador da PLATAFORMA: o limite diário do fornecedor de inferência é um só para todas as contas.
-- Sem conta_id e sem RLS (exceção declarada em isolamento.excecoes.ts, motivo 'contador-global'):
-- só números e data, nenhum dado de conta.
CREATE TABLE "consumo_diario_do_modelo" (
    "dia" DATE NOT NULL,
    "tokens" BIGINT NOT NULL DEFAULT 0,
    "chamadas" INTEGER NOT NULL DEFAULT 0,
    -- o que o fornecedor disse que resta no dia, na última resposta que trouxe o número
    "restante_no_fornecedor" BIGINT,
    "visto_em" TIMESTAMPTZ(3),

    CONSTRAINT "consumo_diario_do_modelo_pkey" PRIMARY KEY ("dia")
);

-- alvo de chave estrangeira composta
CREATE UNIQUE INDEX "tarefas_do_agente_id_conta_id_key" ON "tarefas_do_agente"("id", "conta_id");
-- as tarefas de uma peça, da mais nova para a mais velha (a lista do painel e a tarefa viva)
CREATE INDEX "tarefas_do_agente_conta_id_documento_id_criada_em_idx" ON "tarefas_do_agente"("conta_id", "documento_id", "criada_em" DESC);
-- "tarefas hoje" da conta e as que estão na fila
CREATE INDEX "tarefas_do_agente_conta_id_criada_em_idx" ON "tarefas_do_agente"("conta_id", "criada_em" DESC);
-- as pendências abertas de uma peça
CREATE INDEX "pendencias_conta_id_documento_id_estado_idx" ON "pendencias"("conta_id", "documento_id", "estado");
CREATE INDEX "pendencias_conta_id_tarefa_id_idx" ON "pendencias"("conta_id", "tarefa_id");

ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_documento_id_conta_id_fkey" FOREIGN KEY ("documento_id", "conta_id") REFERENCES "documentos"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entradas_de_tarefa" ADD CONSTRAINT "entradas_de_tarefa_tarefa_id_conta_id_fkey" FOREIGN KEY ("tarefa_id", "conta_id") REFERENCES "tarefas_do_agente"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eventos_de_tarefa" ADD CONSTRAINT "eventos_de_tarefa_tarefa_id_conta_id_fkey" FOREIGN KEY ("tarefa_id", "conta_id") REFERENCES "tarefas_do_agente"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chamadas_ao_modelo" ADD CONSTRAINT "chamadas_ao_modelo_tarefa_id_conta_id_fkey" FOREIGN KEY ("tarefa_id", "conta_id") REFERENCES "tarefas_do_agente"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_tarefa_id_conta_id_fkey" FOREIGN KEY ("tarefa_id", "conta_id") REFERENCES "tarefas_do_agente"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_documento_id_conta_id_fkey" FOREIGN KEY ("documento_id", "conta_id") REFERENCES "documentos"("id", "conta_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Restrições que o Prisma não descreve
-- ============================================================================

-- UMA TAREFA VIVA POR PEÇA, garantida pelo banco (docs/mvp/experiencia.md, 2.2).
CREATE UNIQUE INDEX "tarefas_do_agente_uma_viva_por_documento" ON "tarefas_do_agente"("documento_id")
  WHERE "estado" IN ('na_fila', 'preparando', 'aguardando_confirmacao', 'rodando', 'em_revisao');
-- UMA TAREFA TRABALHANDO POR CONTA, garantida pelo banco, com um ou com dez workers.
CREATE UNIQUE INDEX "tarefas_do_agente_uma_trabalhando_por_conta" ON "tarefas_do_agente"("conta_id")
  WHERE "estado" IN ('preparando', 'rodando');

ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_tipo_valido" CHECK ("tipo" IN ('briefing', 'criar', 'pedido', 'ajuste'));
ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_fase_valida" CHECK ("fase" IN ('preparo', 'execucao'));
ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_fim_valido" CHECK ("fim" IS NULL OR "fim" IN ('entregue', 'cancelada', 'erro', 'limite_de_passos', 'limite_de_custo', 'limite_de_tempo', 'interrompida'));
ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_contagens_validas" CHECK ("versao_inicial" >= 0 AND "lotes" >= 0 AND "chamadas" >= 0);
-- sem "pode", a produção não entra na fila: fase de execução exige preparo guardado
ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_execucao_tem_preparo" CHECK ("fase" <> 'execucao' OR "preparo" IS NOT NULL);
ALTER TABLE "pendencias" ADD CONSTRAINT "pendencias_origem_valida" CHECK ("origem" IN ('otto', 'verificacao', 'sistema'));
ALTER TABLE "consumo_diario_do_modelo" ADD CONSTRAINT "consumo_diario_do_modelo_nao_negativo" CHECK ("tokens" >= 0 AND "chamadas" >= 0);

-- ============================================================================
-- Permissões de otto_app. Evento, chamada e entrada só crescem: sem UPDATE e sem DELETE.
-- (A entrada ganha UPDATE só na coluna dos ajustes do "pode".)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON "tarefas_do_agente" TO otto_app;
GRANT SELECT, INSERT ON "entradas_de_tarefa" TO otto_app;
GRANT UPDATE ("ajustes") ON "entradas_de_tarefa" TO otto_app;
GRANT SELECT, INSERT ON "eventos_de_tarefa" TO otto_app;
GRANT SELECT, INSERT ON "chamadas_ao_modelo" TO otto_app;
GRANT SELECT, INSERT, UPDATE ON "pendencias" TO otto_app;
GRANT SELECT, INSERT, UPDATE ON "consumo_diario_do_modelo" TO otto_app;

-- ============================================================================
-- Isolamento por conta (ADR 023): ENABLE, FORCE, USING e WITH CHECK idênticos.
-- ============================================================================

ALTER TABLE "tarefas_do_agente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tarefas_do_agente" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "tarefas_do_agente"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "entradas_de_tarefa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entradas_de_tarefa" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "entradas_de_tarefa"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "eventos_de_tarefa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_de_tarefa" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "eventos_de_tarefa"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "chamadas_ao_modelo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chamadas_ao_modelo" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "chamadas_ao_modelo"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "pendencias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pendencias" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "pendencias"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

RESET app.conta_id;
