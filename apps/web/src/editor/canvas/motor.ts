// A porta do motor de render, vista do editor. É o ÚNICO arquivo do web que importa @otto/render:
// tudo o mais importa daqui `criarMotor` e os tipos.
//
// Os tipos vêm da raiz do pacote, que só importa TIPOS do CanvasKit. O motor de verdade vem de
// @otto/render/navegador por import() dinâmico: ele insere <script src="/motor/<versão>/canvaskit.js">,
// que busca o .wasm da mesma pasta. Os dois arquivos são estáticos (scripts/copiar-motor.ts os põe
// em public/motor/), então o WebAssembly não entra no pacote de página nenhuma (ADR 019).
import type { MotorDeRender, RecursosDoRender } from '@otto/render';

export type { Camera, MotorDeRender, PreviaDeGesto, RecursoNaoDesenhado, RecursosDoRender, RecursosEmFalta } from '@otto/render';
// O que o documento usa e o motor ainda não desenha. É função pura sobre a árvore: a raiz do pacote
// só importa TIPOS do CanvasKit, então trazê-la para cá não traz o WebAssembly.
export { naoDesenhado } from '@otto/render';

export type FabricaDeMotor = (canvas: HTMLCanvasElement, recursos: RecursosDoRender) => Promise<MotorDeRender>;

/**
 * Cor da área de trabalho, atrás das pranchetas. Quem a pinta é o motor (ele limpa o canvas inteiro
 * a cada quadro, sem transparência), então a cor do editor entra por aqui. É a mesma do CSS da área,
 * que aparece enquanto o motor não carregou.
 */
export const FUNDO_DA_AREA = '#121211';

export const criarMotor: FabricaDeMotor = async (canvas, recursos) => {
  const { criarMotor: criarNoNavegador } = await import('@otto/render/navegador');
  return criarNoNavegador(canvas, recursos, { fundo: FUNDO_DA_AREA });
};

/** O motor recusa abrir sem WebGL com um erro deste nome (ErroSemWebGL, de @otto/render/navegador). */
export const ehFaltaDeWebGL = (erro: unknown): boolean => erro instanceof Error && erro.name === 'ErroSemWebGL';
