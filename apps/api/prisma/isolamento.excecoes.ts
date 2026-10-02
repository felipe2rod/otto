// Tabelas SEM a coluna conta_id (ADR 023, decisão 1). Lista fechada: acrescentar uma linha aqui é
// diff visível no PR e exige justificativa. Tabela de negócio não entra; só catálogo global.
// O esquema da fila (pgboss) e a tabela de controle de migração ficam fora do schema.prisma.
//
// Dois motivos possíveis, e cada um tem a sua garantia conferida em teste:
// - 'propria-conta': a tabela é a conta; o RLS confere a chave primária;
// - 'catalogo-global': igual para todas as contas; sem RLS, e otto_app não altera nem apaga linha;
// - 'contador-global': um número da plataforma inteira; sem RLS, e a tabela só tem coluna de número e de data
//   (nenhum texto, nenhum JSON, nenhum id): não há como guardar dado de conta nela.
export interface ExcecaoDeIsolamento {
  motivo: 'propria-conta' | 'catalogo-global' | 'contador-global';
  justificativa: string;
}

export const TABELAS_SEM_CONTA_ID: Record<string, ExcecaoDeIsolamento> = {
  buscas_de_imagens: {
    motivo: 'catalogo-global',
    justificativa:
      'Cache de 24 h das buscas no banco de imagens (ADR 032): o resultado de uma busca é o mesmo para qualquer conta e a chave do Otto é uma só. Não guarda o texto da busca (a chave é um hash) nem dado de conta. Só cresce.',
  },
  contas: { motivo: 'propria-conta', justificativa: 'É a própria conta: participa do RLS pela chave primária (id = app.conta_id).' },
  consumo_diario_do_modelo: {
    motivo: 'contador-global',
    justificativa: 'Tokens gastos por dia na plataforma: o limite diário do fornecedor de inferência é um só para todas as contas, e conferi-lo exige somar todas.',
  },
  fontes_da_biblioteca: { motivo: 'catalogo-global', justificativa: 'Fontes de licença aberta do Otto, iguais para todas as contas. Não guarda nada de conta nenhuma.' },
};
