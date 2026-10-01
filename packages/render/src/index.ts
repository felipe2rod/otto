// Motor de render único do Otto (ADR 030, ADR 035): CanvasKit, com render de referência em CPU e prévia em GPU.
//
// Três entradas:
//   @otto/render            o motor, puro: recebe a instância do CanvasKit e bytes. Só importa TIPOS do canvaskit-wasm.
//   @otto/render/node       carrega o CanvasKit no Node (API e worker).
//   @otto/render/navegador  carrega o CanvasKit no navegador e cria o motor do editor sobre um canvas WebGL.
//
// Regras deste pacote (testes em testes/fronteira, na raiz):
// - não importa NestJS, Prisma, Next nem React;
// - recursos (bytes de imagem e de fonte) entram por parâmetro: quem confere a conta dona é quem chama;
// - sem estado entre sessões.
import { NOME_DO_PACOTE as DOCUMENTO } from '@otto/documento';

export const NOME_DO_PACOTE = '@otto/render' as const;

/** Pacotes do núcleo de que o render depende. */
export const DEPENDE_DE = [DOCUMENTO] as const;

export { type AjusteResolvido, funcaoDoAjuste, referenciaDeAjuste } from './ajustes';
export {
  codificarPng,
  desenharNos,
  desenharPrancheta,
  ErroDeAreaDoRender,
  enquadrar,
  extremosDoDegrade,
  LIMITE_DE_PIXELS,
  limitesDoNo,
  type MascaraEmPixels,
  naoDesenhado,
  type OpcoesDeDesenho,
  type OpcoesDeRender,
  type RecursoNaoDesenhado,
  type RecursosEmFalta,
  type RenderEmPixels,
  recursosEmFalta,
  renderizarMascara,
  renderizarPrancheta,
} from './compositor';
export { comparar, type Diferenca } from './diferenca';
export { aplicarPrevia, type CaixaDePrevia, type CameraEmPixels, CenaDoEditor, type ContadoresDoCache, type FabricaDeImagens, fabricaNaCpu, fabricaNaGpu, type PreviaDeGesto } from './editor';
export { MODOS_POR_SHADER, referenciaDeMesclagem } from './mesclagem';
export { type Camera, criarMotorSobreTela, type MotorDeRender, type OpcoesDoMotor, type RecursosDoRender, type Tela, telaDeCpu } from './motor';
export { nomePostScript, type RecursosOpenType, recursosOpenType } from './opentype';
export { sementeDe } from './ruido';
export { SENTINELA_DO_MOTOR } from './sentinela';
export { criarSessao, type FonteDeArquivo, type ImagemDeArquivo, type RecursosDaSessao, type Sessao } from './sessao';
export { escolherFonte, type MotorDeTexto, type TextoDoMotor, textoExibido } from './texto';
export { criarMedidor, criarMeiosDeVerificacao } from './verificacao';
export { MOTOR, VERSAO_DO_CANVASKIT } from './versao';
