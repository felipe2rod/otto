// RASCUNHO: texto de interface ainda sem revisão do guardião da marca. Não é texto final.
// A API manda código, nunca frase (docs/mvp/backend.md, seção 7.1). A frase que o designer lê é
// montada aqui, em linguagem do ofício, nunca o erro cru.

const GENERICO = 'Não consegui fazer isso agora. Tente de novo em instantes.';

const frases: Readonly<Record<string, string>> = {
  versao_desatualizada: 'Esta peça foi alterada em outra aba. Recarreguei a versão atual; sua última alteração não entrou.',
  documento_em_tarefa: 'O Otto está trabalhando nesta peça. A edição volta quando ele terminar.',
  catalogo_desatualizado: 'O Otto foi atualizado enquanto esta página estava aberta. Recarregue a página para continuar.',
  sem_conexao: 'Sem conexão. A edição volta quando a conexão voltar.',
  somente_leitura: 'Esta peça está aberta só para leitura.',
  nada_para_desfazer: 'Nada para desfazer.',
  nada_para_refazer: 'Nada para refazer.',
  lote_invalido: 'Essa alteração não pôde ser aplicada. A peça voltou ao que estava.',
  conflito_local: 'Uma alteração feita em seguida não cabia mais e foi desfeita.',
  arquivo_desconhecido: 'A peça usa uma imagem que não está na sua conta. A alteração não entrou.',
  documento_grande_demais: 'A peça ficaria grande demais com essa alteração. Ela não entrou.',
  corpo_grande_demais: 'Essa alteração é grande demais para enviar de uma vez. Ela não entrou.',
  pedido_invalido: 'Esse nome não foi aceito. Use até 120 caracteres.',
  nao_encontrado: 'Essa peça não existe mais.',
  // exportação
  nada_para_exportar: 'Esta peça não tem prancheta para exportar.',
  prancheta_desconhecida: 'Uma das pranchetas escolhidas não existe mais na peça. Escolha de novo.',
  limite_de_exportacoes: 'Já há exportações demais na fila desta conta. Espere uma terminar e tente de novo.',
  fila_indisponivel: 'Não consegui pôr a exportação na fila agora. Tente de novo em instantes.',
  exportacao_expirada: 'Os arquivos desta exportação já foram apagados. Exporte de novo.',
  exportacao_nao_pronta: 'O arquivo ainda não está pronto.',
  exportacao_falhou: 'Não consegui exportar esta peça. Tente de novo.',
};

export const erros = {
  generico: GENERICO,
  /** Frase para um código da API. Código sem frase própria cai na genérica: nunca aparece o código cru. */
  doCodigo: (codigo: string): string => frases[codigo] ?? GENERICO,
} as const;
