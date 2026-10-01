/**
 * Versão do CanvasKit com que os goldens foram gerados. Trocar a versão refaz os goldens: o raster pode mudar.
 * Um teste confere que é a mesma do pacote instalado.
 */
export const VERSAO_DO_CANVASKIT = '0.42.0';

/** Nome e versão do motor: entram no registro da tarefa e na chave de qualquer cache de render. */
export const MOTOR = { nome: 'canvaskit-wasm', versao: VERSAO_DO_CANVASKIT } as const;
