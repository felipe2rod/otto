/** Qual dos dois processos é este: o que atende HTTP ou o que consome a fila. */
export type Servico = 'api' | 'worker';
export const SERVICO = Symbol('SERVICO');
export const CONFIGURACAO = Symbol('CONFIGURACAO');
