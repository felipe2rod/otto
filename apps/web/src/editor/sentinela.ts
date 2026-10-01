// Marca do código do editor (ADR 019, guarda 2). O editor a escreve no próprio elemento raiz, então
// ela está em todo pacote que carrega o editor. scripts/conferir-pacote-publico.ts falha o build se
// a encontrar em qualquer script que uma página pública carregue.
//
// Não é segredo e não é texto de tela: é só uma sequência que não aparece em nenhum outro lugar.
// Este arquivo não importa nada, para o script de conferência poder lê-lo sem empacotador.
export const SENTINELA_DO_EDITOR = 'otto-sentinela-do-editor-7f3a9c1e';
