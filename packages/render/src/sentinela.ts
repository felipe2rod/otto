// Marca do código do motor (ADR 019). Está em todo pacote que carrega o motor, porque o motor a carrega consigo
// (MotorDeRender.sentinela). O teste do pacote público do app web falha se a encontrar em script de página pública.
//
// Não é segredo e não é texto de tela: é só uma sequência que não aparece em nenhum outro lugar.
// Este arquivo não traz nada de outro arquivo, para o script de conferência poder lê-lo sem empacotador.
export const SENTINELA_DO_MOTOR = 'otto-sentinela-do-motor-4c81e2d7';
