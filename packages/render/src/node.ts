// Borda do Node (API e worker): carrega o CanvasKit do pacote instalado. É o único arquivo deste pacote
// que toca módulo do Node; o motor (index.ts) só recebe a instância e bytes.
// O navegador não importa este arquivo: lá a carga é por navegador.ts.
import { createRequire } from 'node:module';
import path from 'node:path';
import type { CanvasKit } from 'canvaskit-wasm';
import { VERSAO_DO_CANVASKIT } from './versao';

const require = createRequire(import.meta.url);

type Iniciar = (opcoes: { locateFile: (arquivo: string) => string }) => Promise<CanvasKit>;

/**
 * Variantes que o pacote canvaskit-wasm publica. A "padrao" (7,3 MB) só codifica PNG;
 * a "completa" (8,2 MB) também codifica JPEG e WebP. As duas dão os mesmos pixels (medido no spike).
 */
export type Variante = 'padrao' | 'completa';

function pastaDoMotor(variante: Variante): string {
  const base = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
  return variante === 'completa' ? path.join(base, 'full') : base;
}

/**
 * Cria uma instância do motor, com memória própria (128 MB reservados de início). Leva de 50 a 80 ms.
 * O worker cria uma por job ou por thread; a API cria uma por processo, para o medidor de texto.
 */
export async function carregarCanvasKit(variante: Variante = 'padrao'): Promise<CanvasKit> {
  const pasta = pastaDoMotor(variante);
  const iniciar = require(path.join(pasta, 'canvaskit.js')) as Iniciar;
  return iniciar({ locateFile: (arquivo) => path.join(pasta, arquivo) });
}

/**
 * Os dois arquivos que o navegador precisa buscar em tempo de execução, e onde estão no disco.
 * O app web os copia para uma pasta estática versionada (ex.: public/motor/<versão>/) no build:
 * assim o WebAssembly nunca entra no pacote de página nenhuma (ADR 019).
 */
export function arquivosDoMotor(variante: Variante = 'padrao'): { versao: string; arquivos: { nome: string; caminho: string }[] } {
  const pasta = pastaDoMotor(variante);
  return { versao: VERSAO_DO_CANVASKIT, arquivos: ['canvaskit.js', 'canvaskit.wasm'].map((nome) => ({ nome, caminho: path.join(pasta, nome) })) };
}
