// Gestos sobre o documento, fora do React: clicar seleciona; arrastar mostra a prévia do motor;
// soltar vira UM lote do catálogo (ADR 027). Durante o arraste não nasce documento novo nem lote:
// só a prévia muda, e no máximo uma vez por quadro (docs/mvp/frontend.md, seção 6).
//
// Só "mover" tem prévia no motor. Redimensionar e girar pela alça entram quando ela existir.
import { caixaDe, type Documento, type Operacao } from '@otto/documento';
import { type Armazem, criarArmazem } from '../nucleo/armazem';
import { paraDocumento } from '../nucleo/camera';
import type { Interface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import type { Visao } from '../nucleo/visao';
import { acharEm } from './alvo';
import type { PreviaDeGesto } from './motor';
import { capturar } from './ponteiro';

export interface DependenciasDosGestos {
  visao: Pick<Visao, 'camera'>;
  interface: Pick<Interface, 'ferramentaEmUso' | 'selecionar'>;
  /** A sessão da peça aberta. Ausente enquanto a peça não abriu. */
  sessao(): SessaoDoDocumento<Documento, Operacao> | undefined;
  /** Onde a prévia do arraste é publicada. A área do canvas a entrega ao motor e às sobreposições. */
  previa: Armazem<PreviaDeGesto | null>;
  /** Descrição do lote, como aparece no histórico. Vem de textos/. */
  descrever(nomeDaCamada: string): string;
  /** Como pedir o próximo quadro. Padrão: requestAnimationFrame. */
  agendar?(quadro: () => void): void;
}

interface Arraste {
  id: string;
  nome: string;
  /** posição da caixa da camada quando o gesto começou */
  x: number;
  y: number;
  /** onde o ponteiro apertou, em pixels de tela */
  telaX: number;
  telaY: number;
  dx: number;
  dy: number;
}

export const criarArmazemDaPrevia = (): Armazem<PreviaDeGesto | null> => criarArmazem<PreviaDeGesto | null>(null);

export function ligarControleDeGestos(elemento: HTMLElement, deps: DependenciasDosGestos): () => void {
  const agendar = deps.agendar ?? ((quadro: () => void) => void requestAnimationFrame(quadro));
  let arraste: Arraste | null = null;
  let quadroPedido = false;

  const naArea = (e: { clientX: number; clientY: number }) => {
    const r = elemento.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Deslocamento do ponteiro em unidades inteiras do documento. */
  const medir = (e: { clientX: number; clientY: number }) => {
    if (!arraste) return;
    const { zoom } = deps.visao.camera.obter();
    arraste.dx = Math.round((e.clientX - arraste.telaX) / zoom);
    arraste.dy = Math.round((e.clientY - arraste.telaY) / zoom);
  };

  const publicar = () => {
    quadroPedido = false;
    if (!arraste || (arraste.dx === 0 && arraste.dy === 0 && deps.previa.obter() === null)) return;
    deps.previa.definir({ ids: [arraste.id], dx: arraste.dx, dy: arraste.dy });
  };

  const encerrar = () => {
    arraste = null;
    deps.previa.definir(null);
  };

  const aoApertar = (e: PointerEvent) => {
    // mão e botão do meio são da câmera (controleDaCamera.ts)
    if (e.button !== 0 || deps.interface.ferramentaEmUso() !== 'mover') return;
    const sessao = deps.sessao();
    if (!sessao) return;
    const doc = sessao.obter().visivel;
    const alvo = acharEm(doc, paraDocumento(deps.visao.camera.obter(), naArea(e)));
    if (!alvo) return deps.interface.selecionar(null);
    if (!alvo.no) return deps.interface.selecionar({ tipo: 'prancheta', id: alvo.prancheta.id });

    deps.interface.selecionar({ tipo: 'camadas', ids: [alvo.no.id] });
    const caixa = caixaDe(alvo.no);
    if (!caixa || sessao.obter().somenteLeitura) return;
    arraste = { id: alvo.no.id, nome: alvo.no.nome, x: caixa.x, y: caixa.y, telaX: e.clientX, telaY: e.clientY, dx: 0, dy: 0 };
    capturar(elemento, e);
  };

  const aoMover = (e: PointerEvent) => {
    if (!arraste) return;
    medir(e);
    if (quadroPedido) return;
    quadroPedido = true;
    agendar(publicar);
  };

  const aoSoltar = (e: PointerEvent) => {
    if (!arraste) return;
    medir(e);
    const { id, nome, x, y, dx, dy } = arraste;
    if (dx !== 0 || dy !== 0) {
      // A ordem importa: a sessão publica o documento novo (o motor o recebe na hora, por assinatura)
      // e SÓ DEPOIS a prévia encerra. Ao contrário, a camada piscaria no lugar antigo por um quadro.
      deps.sessao()?.aplicar(deps.descrever(nome), [{ op: 'mover', alvo: id, x: x + dx, y: y + dy }]);
    }
    encerrar();
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && arraste) encerrar();
  };

  elemento.addEventListener('pointerdown', aoApertar);
  elemento.addEventListener('pointermove', aoMover);
  elemento.addEventListener('pointerup', aoSoltar);
  elemento.addEventListener('pointercancel', encerrar);
  window.addEventListener('keydown', aoTeclar);
  return () => {
    elemento.removeEventListener('pointerdown', aoApertar);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSoltar);
    elemento.removeEventListener('pointercancel', encerrar);
    window.removeEventListener('keydown', aoTeclar);
  };
}
