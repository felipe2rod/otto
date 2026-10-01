// Borda do navegador: carrega o CanvasKit em tempo de execução e liga o motor a um canvas WebGL.
// Nada aqui é importado por página pública: quem importa é o editor, por import() dinâmico.
// O WebAssembly e o script de cola NÃO entram no pacote de página nenhuma (ADR 019): são dois arquivos
// estáticos, servidos de uma pasta versionada, e buscados por este código quando o editor abre.
import type { CanvasKit, GrDirectContext, Surface } from 'canvaskit-wasm';
import { fabricaNaGpu } from './editor';
import { criarMotorSobreTela, type MotorDeRender, type OpcoesDoMotor, type RecursosDoRender, type Tela } from './motor';
import { VERSAO_DO_CANVASKIT } from './versao';

type Iniciar = (opcoes: { locateFile: (arquivo: string) => string }) => Promise<CanvasKit>;

/** Pasta padrão em que o app web serve canvaskit.js e canvaskit.wasm (copiados no build; ver arquivosDoMotor em node.ts). */
export const ENDERECO_PADRAO_DO_MOTOR = `/motor/${VERSAO_DO_CANVASKIT}/`;

let carregando: Promise<CanvasKit> | undefined;

/**
 * Carrega o motor uma vez por página. Insere o script de cola e instancia o WebAssembly, os dois do endereço dado.
 * Medido no spike: 12 a 20 ms o script, 64 a 140 ms o WebAssembly, sem contar a rede (2,3 MB em brotli).
 */
export function carregarCanvasKit(endereco: string = ENDERECO_PADRAO_DO_MOTOR): Promise<CanvasKit> {
  carregando ??= (async () => {
    const base = endereco.endsWith('/') ? endereco : `${endereco}/`;
    const global = globalThis as unknown as { CanvasKitInit?: Iniciar };
    if (!global.CanvasKitInit) {
      await new Promise<void>((resolver, rejeitar) => {
        const script = document.createElement('script');
        script.src = `${base}canvaskit.js`;
        script.onload = () => resolver();
        script.onerror = () => rejeitar(new Error(`Não foi possível baixar o motor de render de ${script.src}`));
        document.head.append(script);
      });
    }
    if (!global.CanvasKitInit) throw new Error('O script do motor de render carregou, mas não se registrou');
    return global.CanvasKitInit({ locateFile: (arquivo) => `${base}${arquivo}` });
  })().catch((erro: unknown) => {
    // falhou: a próxima chamada tenta de novo
    carregando = undefined;
    throw erro;
  });
  return carregando;
}

export class ErroSemWebGL extends Error {
  constructor() {
    super('Este navegador não entregou um contexto WebGL: o editor não abre sem ele (em raster de CPU faz de 7 a 30 quadros por segundo).');
    this.name = 'ErroSemWebGL';
  }
}

/** Tela WebGL sobre um canvas da página. Guarda o quadro anterior (preserveDrawingBuffer), para a região suja. */
export function telaWebGL(ck: CanvasKit, canvas: HTMLCanvasElement): Tela {
  const identificador = ck.GetWebGLContext(canvas, { antialias: 0, alpha: 1, depth: 0, stencil: 8, premultipliedAlpha: 1, preserveDrawingBuffer: 1 });
  const contexto: GrDirectContext | null = identificador ? ck.MakeWebGLContext(identificador) : null;
  if (!contexto) throw new ErroSemWebGL();
  // o cache de texturas padrão do Skia é pequeno para dezenas de imagens do tamanho da prancheta
  contexto.setResourceCacheLimitBytes(768 * 1024 * 1024);
  const criar = (): Surface => {
    const s = ck.MakeOnScreenGLSurface(contexto, canvas.width, canvas.height, ck.ColorSpace.SRGB);
    if (!s) throw new ErroSemWebGL();
    return s;
  };
  let superficie = criar();
  const ouvintes: ((e: Event) => void)[] = [];
  return {
    superficie: () => superficie,
    fabrica: (sessao) => fabricaNaGpu(sessao, () => superficie),
    redimensionar(largura, altura) {
      if (canvas.width === largura && canvas.height === altura) return;
      canvas.width = Math.max(1, largura);
      canvas.height = Math.max(1, altura);
      superficie.delete();
      superficie = criar();
    },
    guardaOQuadroAnterior: true,
    aoPerderContexto(aviso) {
      const ouvinte = (e: Event): void => {
        e.preventDefault();
        aviso();
      };
      ouvintes.push(ouvinte);
      canvas.addEventListener('webglcontextlost', ouvinte);
    },
    destruir() {
      for (const o of ouvintes) canvas.removeEventListener('webglcontextlost', o);
      superficie.delete();
      contexto.releaseResourcesAndAbandonContext();
      contexto.delete();
    },
  };
}

export interface OpcoesDoMotorNoNavegador extends OpcoesDoMotor {
  /** Pasta de onde vêm canvaskit.js e canvaskit.wasm. Padrão: ENDERECO_PADRAO_DO_MOTOR. */
  enderecoDoMotor?: string;
}

/** Cria o motor do editor sobre um canvas da página. É o que o editor chama: `criarMotor(canvas, recursos)`. */
export async function criarMotor(canvas: HTMLCanvasElement, recursos: RecursosDoRender, opcoes: OpcoesDoMotorNoNavegador = {}): Promise<MotorDeRender> {
  const ck = await carregarCanvasKit(opcoes.enderecoDoMotor);
  return criarMotorSobreTela(ck, telaWebGL(ck, canvas), recursos, opcoes);
}
