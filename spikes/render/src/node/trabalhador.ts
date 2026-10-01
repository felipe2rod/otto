// Render fora da linha principal (R9): este arquivo roda dentro de um worker_thread.
// Recebe os bytes dos recursos e a prancheta, devolve os pixels. A linha principal continua livre
// para bater sinal de vida e ouvir cancelamento enquanto o render corre.
import { parentPort, workerData } from 'node:worker_threads';
import { renderizarPrancheta } from '../motor/compositor.ts';
import { criarSessao, type RecursosDaSessao } from '../motor/sessao.ts';
import type { Prancheta } from '../motor/tipos.ts';
import { carregarCanvasKit } from './carregar.ts';

const { recursos, prancheta } = workerData as { recursos: RecursosDaSessao; prancheta: Prancheta };
const t0 = performance.now();
const ck = await carregarCanvasKit();
const sessao = criarSessao(ck, recursos);
const preparoMs = performance.now() - t0;
const t1 = performance.now();
const r = renderizarPrancheta(sessao, prancheta);
const renderMs = performance.now() - t1;
sessao.destruir();
parentPort!.postMessage({ largura: r.largura, altura: r.altura, rgba: r.rgba, preparoMs, renderMs }, [r.rgba.buffer as ArrayBuffer]);
