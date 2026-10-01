// Gestos de câmera, fora do React: roda, mão e clique da ferramenta de zoom.
// Liga nos eventos do elemento e escreve direto no armazém da câmera. Nenhum componente
// renderiza por causa de um movimento do mouse (docs/mvp/frontend.md, seção 6).
import { deslocar, zoomNoPonto } from '../nucleo/camera';
import type { Interface } from '../nucleo/interface';
import { PASSO_DE_ZOOM, type Visao } from '../nucleo/visao';
import { capturar } from './ponteiro';

const SENSIBILIDADE_DA_RODA = 0.0025;
const BOTAO_DO_MEIO = 1;

export function ligarControleDaCamera(elemento: HTMLElement, visao: Pick<Visao, 'camera'>, iface: Pick<Interface, 'ferramentaEmUso'>): () => void {
  let arrastando: { x: number; y: number } | null = null;

  const naArea = (e: { clientX: number; clientY: number }) => {
    const r = elemento.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const aoRolar = (e: WheelEvent) => {
    // dentro do canvas a roda é do editor: sem isto, Ctrl+roda dá zoom na página inteira
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) visao.camera.definir((c) => zoomNoPonto(c, naArea(e), Math.exp(-e.deltaY * SENSIBILIDADE_DA_RODA)));
    else visao.camera.definir((c) => deslocar(c, -e.deltaX, -e.deltaY));
  };

  const aoApertar = (e: PointerEvent) => {
    const ferramenta = iface.ferramentaEmUso();
    if (e.button === BOTAO_DO_MEIO || (e.button === 0 && ferramenta === 'mao')) {
      arrastando = { x: e.clientX, y: e.clientY };
      capturar(elemento, e);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && ferramenta === 'zoom') visao.camera.definir((c) => zoomNoPonto(c, naArea(e), e.altKey ? 1 / PASSO_DE_ZOOM : PASSO_DE_ZOOM));
  };

  const aoMover = (e: PointerEvent) => {
    if (!arrastando) return;
    const dx = e.clientX - arrastando.x;
    const dy = e.clientY - arrastando.y;
    arrastando = { x: e.clientX, y: e.clientY };
    visao.camera.definir((c) => deslocar(c, dx, dy));
  };

  const aoSoltar = () => {
    arrastando = null;
  };

  elemento.addEventListener('wheel', aoRolar, { passive: false });
  elemento.addEventListener('pointerdown', aoApertar);
  elemento.addEventListener('pointermove', aoMover);
  elemento.addEventListener('pointerup', aoSoltar);
  elemento.addEventListener('pointercancel', aoSoltar);
  return () => {
    elemento.removeEventListener('wheel', aoRolar);
    elemento.removeEventListener('pointerdown', aoApertar);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSoltar);
    elemento.removeEventListener('pointercancel', aoSoltar);
  };
}
