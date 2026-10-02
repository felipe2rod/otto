-- Rodada de adoção depois da fatia 4: a marca da peça (para a lista filtrar por marca), a miniatura da peça
-- (render da primeira prancheta, feito pelo worker) e a limpeza do cache de busca de imagens.
-- Volta: down.sql, na mesma pasta.

-- Chave estrangeira para tabela com FORCE ROW LEVEL SECURITY: ver 20261001180000_exportacoes.
SELECT set_config('app.conta_id', '00000000-0000-0000-0000-000000000000', false);

-- a marca com que a peça foi criada pelo formulário de briefing. Apagada a marca, vira nulo.
ALTER TABLE "documentos" ADD COLUMN "marca_id" UUID;
-- a versão da peça que a miniatura guardada mostra. Nulo: ainda não há miniatura.
ALTER TABLE "documentos" ADD COLUMN "miniatura_versao" INTEGER;
-- quando a última miniatura foi pedida: é o freio que impede um render a cada tecla
ALTER TABLE "documentos" ADD COLUMN "miniatura_pedida_em" TIMESTAMPTZ(3);

ALTER TABLE "documentos" ADD CONSTRAINT "documentos_marca_id_conta_id_fkey" FOREIGN KEY ("marca_id", "conta_id") REFERENCES "marcas"("id", "conta_id") ON DELETE SET NULL ("marca_id") ON UPDATE CASCADE;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_miniatura_versao_valida" CHECK ("miniatura_versao" IS NULL OR "miniatura_versao" >= 0);

-- a lista de peças de uma marca, da alterada mais recentemente para a mais antiga (só as que têm marca)
CREATE INDEX "documentos_conta_id_marca_id_alterado_em_idx" ON "documentos"("conta_id", "marca_id", "alterado_em" DESC) WHERE "marca_id" IS NOT NULL;

-- O cache de busca de imagens deixa de só crescer: a busca vencida é apagada quando outra é guardada.
-- (A tabela passa do motivo 'catalogo-global' para 'cache-global' em isolamento.excecoes.ts: sem dado de
-- conta, e otto_app acrescenta e apaga, mas não altera linha.)
GRANT DELETE ON "buscas_de_imagens" TO otto_app;
-- "o que venceu?": por data, para a limpeza não varrer a tabela
CREATE INDEX "buscas_de_imagens_buscada_em_idx" ON "buscas_de_imagens"("buscada_em");

RESET app.conta_id;
