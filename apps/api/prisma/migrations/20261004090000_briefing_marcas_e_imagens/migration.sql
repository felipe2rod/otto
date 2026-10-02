-- Fatia 4: briefing. Marcas (o cadastro do cliente do designer), briefings salvos, o cache de 24 h das
-- buscas no banco de imagens, o vínculo da tarefa com o briefing salvo, a hora em que a tarefa entrou
-- na fila (para devolver à fila a que se perdeu) e a marca de "peça de exemplo".
-- Volta: down.sql, na mesma pasta.

-- Chave estrangeira para tabela com FORCE ROW LEVEL SECURITY: ver 20261001180000_exportacoes.
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);

-- Identidade de um cliente do designer. Tudo além do nome é opcional: marca sem identidade é estado válido.
-- É conteúdo da conta (ADR 031): nome, cores e restrições não vão para log nem para evento de uso.
CREATE TABLE "marcas" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "site" TEXT,
    -- { primaria?, destaque?, fundo?, texto? }, cada uma "#rrggbb"
    "cores" JSONB NOT NULL DEFAULT '{}',
    "fonte_de_titulo" TEXT,
    "fonte_de_texto" TEXT,
    -- hash de um arquivo DA CONTA (vetor ou imagem); a posse é conferida pelo caso de uso a cada gravação e a cada uso
    "logo_sha256" CHAR(64),
    -- lista de hashes de arquivos da conta
    "icones" JSONB NOT NULL DEFAULT '[]',
    "rodape" TEXT,
    "restricoes" JSONB NOT NULL DEFAULT '[]',
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- Formulário de briefing pela metade, reutilizável (ADR 033). `dados` é o RascunhoDeBriefing de @otto/shared.
CREATE TABLE "briefings" (
    "id" UUID NOT NULL,
    "conta_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "marca_id" UUID,
    "dados" JSONB NOT NULL,
    "cuidado" TEXT,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "briefings_pkey" PRIMARY KEY ("id")
);

-- Cache das buscas no banco de imagens (ADR 032: "requests must be cached for 24 hours"). É da PLATAFORMA:
-- a chave do Otto é uma só e o resultado de uma busca é o mesmo para qualquer conta. Sem conta_id e sem RLS
-- (exceção declarada em isolamento.excecoes.ts, motivo 'catalogo-global'). Não guarda o texto da busca:
-- `chave` é o SHA-256 de banco, consulta normalizada e filtros. Só cresce: busca nova é linha nova.
-- É também a prova de que um id "veio de busca": trazer só baixa endereço que está aqui.
CREATE TABLE "buscas_de_imagens" (
    "banco" TEXT NOT NULL,
    "chave" CHAR(64) NOT NULL,
    "buscada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- os resultados como o adaptador os devolveu, com os endereços do banco (uso interno do servidor)
    "resultados" JSONB NOT NULL,

    CONSTRAINT "buscas_de_imagens_pkey" PRIMARY KEY ("banco", "chave", "buscada_em")
);

ALTER TABLE "tarefas_do_agente" ADD COLUMN "briefing_id" UUID;
-- quando a tarefa entrou (ou voltou) para a fila: a que fica parada na fila é publicada de novo
ALTER TABLE "tarefas_do_agente" ADD COLUMN "enfileirada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- peça de exemplo semeada na conta nova. Arquivada, continua contando: o exemplo não volta sozinho.
ALTER TABLE "documentos" ADD COLUMN "de_exemplo" BOOLEAN NOT NULL DEFAULT false;

-- alvo das chaves estrangeiras compostas (id, conta_id)
CREATE UNIQUE INDEX "marcas_id_conta_id_key" ON "marcas"("id", "conta_id");
CREATE UNIQUE INDEX "briefings_id_conta_id_key" ON "briefings"("id", "conta_id");
-- a lista de marcas da conta, por nome
CREATE INDEX "marcas_conta_id_nome_idx" ON "marcas"("conta_id", "nome");
-- a lista de briefings da conta, do alterado mais recentemente para o mais antigo
CREATE INDEX "briefings_conta_id_alterado_em_idx" ON "briefings"("conta_id", "alterado_em" DESC);
-- "esta busca foi feita nas últimas 24 h?": banco e chave, a mais recente primeiro (é a chave primária)
-- "este id veio de alguma busca recente?": procura por contenção no JSON dos resultados
CREATE INDEX "buscas_de_imagens_resultados_idx" ON "buscas_de_imagens" USING GIN ("resultados" jsonb_path_ops);

ALTER TABLE "marcas" ADD CONSTRAINT "marcas_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- apagar a marca não apaga o briefing salvo nem a tarefa: só desfaz o vínculo (a coluna da conta fica)
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_marca_id_conta_id_fkey" FOREIGN KEY ("marca_id", "conta_id") REFERENCES "marcas"("id", "conta_id") ON DELETE SET NULL ("marca_id") ON UPDATE CASCADE;
ALTER TABLE "tarefas_do_agente" ADD CONSTRAINT "tarefas_do_agente_briefing_id_conta_id_fkey" FOREIGN KEY ("briefing_id", "conta_id") REFERENCES "briefings"("id", "conta_id") ON DELETE SET NULL ("briefing_id") ON UPDATE CASCADE;

ALTER TABLE "marcas" ADD CONSTRAINT "marcas_nome_preenchido" CHECK (length(btrim("nome")) > 0);
ALTER TABLE "marcas" ADD CONSTRAINT "marcas_logo_formato" CHECK ("logo_sha256" IS NULL OR "logo_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "marcas" ADD CONSTRAINT "marcas_listas_sao_listas" CHECK (jsonb_typeof("icones") = 'array' AND jsonb_typeof("restricoes") = 'array' AND jsonb_typeof("cores") = 'object');
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_nome_preenchido" CHECK (length(btrim("nome")) > 0);
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_cuidado_valido" CHECK ("cuidado" IS NULL OR "cuidado" IN ('direto', 'cuidadoso', 'autoral'));
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_usos_valido" CHECK ("usos" >= 0);
ALTER TABLE "buscas_de_imagens" ADD CONSTRAINT "buscas_de_imagens_chave_formato" CHECK ("chave" ~ '^[0-9a-f]{64}$');
ALTER TABLE "buscas_de_imagens" ADD CONSTRAINT "buscas_de_imagens_resultados_sao_lista" CHECK (jsonb_typeof("resultados") = 'array');

-- Marca e briefing salvo são cadastro: a conta altera e apaga. O cache de busca só cresce.
GRANT SELECT, INSERT, UPDATE, DELETE ON "marcas" TO otto_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "briefings" TO otto_app;
GRANT SELECT, INSERT ON "buscas_de_imagens" TO otto_app;

ALTER TABLE "marcas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marcas" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "marcas"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

ALTER TABLE "briefings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "briefings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_por_conta" ON "briefings"
  USING ("conta_id" = current_setting('app.conta_id')::uuid)
  WITH CHECK ("conta_id" = current_setting('app.conta_id')::uuid);

RESET app.conta_id;
