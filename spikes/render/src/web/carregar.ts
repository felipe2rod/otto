// Borda do navegador: busca o motor, as fontes e as imagens. O motor (src/motor) só recebe bytes.
import type { CanvasKit } from 'canvaskit-wasm';
import { FONTES_DO_SPIKE, IMAGENS_DO_SPIKE } from '../cenas/manifesto.ts';
import type { RecursosDaSessao } from '../motor/sessao.ts';

type Iniciar = (opcoes: { locateFile: (arquivo: string) => string }) => Promise<CanvasKit>;

export interface TemposDeCarga {
  /** baixar e executar o JavaScript de cola do motor */
  scriptMs: number;
  /** baixar, compilar e instanciar o WebAssembly */
  wasmMs: number;
  recursosMs: number;
}

/** O motor é buscado em tempo de execução, por quem abre o editor. Nenhuma página pública referencia estes arquivos. */
export async function carregarCanvasKit(): Promise<{ ck: CanvasKit; scriptMs: number; wasmMs: number }> {
  const t0 = performance.now();
  await new Promise<void>((resolver, rejeitar) => {
    const script = document.createElement('script');
    script.src = '/canvaskit/canvaskit.js';
    script.onload = () => resolver();
    script.onerror = () => rejeitar(new Error('Não foi possível baixar o motor de render'));
    document.head.append(script);
  });
  const t1 = performance.now();
  const iniciar = (globalThis as unknown as { CanvasKitInit: Iniciar }).CanvasKitInit;
  const ck = await iniciar({ locateFile: (arquivo) => `/canvaskit/${arquivo}` });
  return { ck, scriptMs: t1 - t0, wasmMs: performance.now() - t1 };
}

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar ${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function carregarRecursos(): Promise<RecursosDaSessao> {
  const [fontes, imagens] = await Promise.all([
    Promise.all(FONTES_DO_SPIKE.map(async (f) => ({ familia: f.familia, peso: f.peso, bytes: await bytes(`/fontes/${f.arquivo}`) }))),
    Promise.all(IMAGENS_DO_SPIKE.map(async (i) => ({ arquivo: i.arquivo, bytes: await bytes(`/recursos/${i.nome}`) }))),
  ]);
  return { fontes, imagens };
}

export function descreverGpu(): { fornecedor: string; renderizador: string; versao: string } | undefined {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return undefined;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    fornecedor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    renderizador: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    versao: String(gl.getParameter(gl.VERSION)),
  };
}

export async function enviar(caminho: string, corpo: Uint8Array | string): Promise<void> {
  await fetch(`/resultado/${caminho}`, { method: 'POST', body: corpo as BodyInit });
}
