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

export const criarMotor: FabricaDeMotor = async (canvas, recursos) => {
  const { criarMotor: criarNoNavegador } = await import('@otto/render/navegador');
  // Fundo transparente: o canvas fica vazado fora das pranchetas e a área de trabalho (cor e
  // pontilhado) é do CSS do editor, por baixo dele.
  const motor = await criarNoNavegador(canvas, recursos, { fundo: 'transparente' });
  // Só em desenvolvimento: o motor fica à mão no console, para ler os contadores ao medir quadros.
  if (process.env.NODE_ENV === 'development') (window as unknown as { __ottoMotor?: MotorDeRender }).__ottoMotor = motor;
  return motor;
};

/** O motor recusa abrir sem WebGL com um erro deste nome (ErroSemWebGL, de @otto/render/navegador). */
export const ehFaltaDeWebGL = (erro: unknown): boolean => erro instanceof Error && erro.name === 'ErroSemWebGL';
