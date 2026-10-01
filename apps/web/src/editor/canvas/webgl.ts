// O editor só é fluido com WebGL (docs/tecnico/spike-render.md: o raster de CPU faz de 7 a 30
// quadros por segundo). Sem WebGL o editor avisa, em vez de abrir lento.

type FabricaDeCanvas = () => Pick<HTMLCanvasElement, 'getContext'>;

export function temWebGL(criarCanvas: FabricaDeCanvas = () => document.createElement('canvas')): boolean {
  try {
    const canvas = criarCanvas();
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
