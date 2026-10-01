// Gestos sobre o documento, fora do React: clicar seleciona (Shift+clique acrescenta), arrastar
// move a seleção com a prévia do motor, e arrastar uma alça redimensiona. Soltar vira UM lote do
// catálogo (ADR 027). Durante o gesto não nasce lote: só a prévia (ou o documento ao vivo) muda, e
// no máximo uma vez por quadro (docs/mvp/frontend.md, seção 6).
//
// Mover usa a prévia do motor (definirPrevia): zero recomposição. Redimensionar não tem prévia no
// motor, então o gesto publica um documento temporário ("ao vivo") e o motor redesenha a prancheta
// tocada a cada quadro. É mais caro; a medida está no relatório da rodada.
import { acharEm, aplicarLote, type Documento, type No, type Operacao } from '@otto/documento';
import { loteDeMoverPorSeta, loteDeRedimensionar } from '../nucleo/acoes';
import { type Armazem, criarArmazem } from '../nucleo/armazem';
import { paraDocumento } from '../nucleo/camera';
import type { Interface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import type { Visao } from '../nucleo/visao';
import { type Alca, alcaEm, redimensionar } from './alcas';
import { noDaAlca } from './alvo';
import type { PreviaDeGesto } from './motor';
import { capturar } from './ponteiro';

/** Folga do clique e da alça, em pixels de tela. */
const FOLGA_DO_CLIQUE = 3;
export const FOLGA_DA_ALCA = 6;

export interface DependenciasDosGestos {
  visao: Pick<Visao, 'camera'>;
  interface: Pick<Interface, 'ferramentaEmUso' | 'selecionar' | 'alternarNaSelecao' | 'armazem'>;
  /** A sessão da peça aberta. Ausente enquanto a peça não abriu. */
  sessao(): SessaoDoDocumento<Documento, Operacao> | undefined;
  /** Onde a prévia do arraste é publicada. A área do canvas a entrega ao motor e às sobreposições. */
  previa: Armazem<PreviaDeGesto | null>;
  /** O documento temporário de um redimensionamento em andamento. Nulo fora do gesto. */
  aoVivo: Armazem<Documento | null>;
  /** Como pedir o próximo quadro. Padrão: requestAnimationFrame. */
  agendar?(quadro: () => void): void;
}

type Gesto =
  | { tipo: 'mover'; ids: string[]; telaX: number; telaY: number; dx: number; dy: number }
  | { tipo: 'redimensionar'; no: No; alca: Alca; caixa: { x: number; y: number; w: number; h: number }; telaX: number; telaY: number; dx: number; dy: number; proporcional: boolean };

export const criarArmazemDaPrevia = (): Armazem<PreviaDeGesto | null> => criarArmazem<PreviaDeGesto | null>(null);
export const criarArmazemAoVivo = (): Armazem<Documento | null> => criarArmazem<Documento | null>(null);

export function ligarControleDeGestos(elemento: HTMLElement, deps: DependenciasDosGestos): () => void {
  const agendar = deps.agendar ?? ((quadro: () => void) => void requestAnimationFrame(quadro));
  let gesto: Gesto | null = null;
  let quadroPedido = false;

  const naArea = (e: { clientX: number; clientY: number }) => {
    const r = elemento.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Deslocamento do ponteiro desde o aperto, em unidades do documento. */
  const medir = (e: { clientX: number; clientY: number; shiftKey?: boolean }) => {
    if (!gesto) return;
    const { zoom } = deps.visao.camera.obter();
    gesto.dx = (e.clientX - gesto.telaX) / zoom;
    gesto.dy = (e.clientY - gesto.telaY) / zoom;
    if (gesto.tipo === 'mover') {
      // mover anda em unidades inteiras; redimensionar arredonda a caixa (alcas.ts)
      gesto.dx = Math.round(gesto.dx);
      gesto.dy = Math.round(gesto.dy);
    } else gesto.proporcional = e.shiftKey === true;
  };

  /** A caixa nova do redimensionamento em andamento, e o documento com ela aplicada. */
  const redimensionado = (g: Extract<Gesto, { tipo: 'redimensionar' }>, doc: Documento) => {
    const caixa = redimensionar(g.caixa, g.alca, g.dx, g.dy, { proporcional: g.proporcional });
    const lote = loteDeRedimensionar(g.no, caixa);
    const r = aplicarLote(doc, lote.operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'ao-vivo' });
    return { lote, doc: r.ok ? r.doc : undefined };
  };

  const publicar = () => {
    quadroPedido = false;
    if (!gesto) return;
    if (gesto.tipo === 'mover') {
      if (gesto.dx === 0 && gesto.dy === 0 && deps.previa.obter() === null) return;
      deps.previa.definir({ ids: gesto.ids, dx: gesto.dx, dy: gesto.dy });
      return;
    }
    const doc = deps.sessao()?.obter().visivel;
    const novo = doc && redimensionado(gesto, doc).doc;
    if (novo) deps.aoVivo.definir(novo);
  };

  const encerrar = () => {
    gesto = null;
    deps.previa.definir(null);
    deps.aoVivo.definir(null);
  };

  const aoApertar = (e: PointerEvent) => {
    // mão e botão do meio são da câmera (controleDaCamera.ts)
    if (e.button !== 0 || deps.interface.ferramentaEmUso() !== 'mover') return;
    const sessao = deps.sessao();
    if (!sessao) return;
    const doc = sessao.obter().visivel;
    const camera = deps.visao.camera.obter();
    const ponto = paraDocumento(camera, naArea(e));
    const { selecao } = deps.interface.armazem.obter();
    const editavel = !sessao.obter().somenteLeitura;

    // 1. a alça da camada selecionada (uma só, sem rotação) ganha do que estiver embaixo dela
    if (editavel && !e.shiftKey) {
      const comAlcas = noDaAlca(doc, selecao);
      const alca = comAlcas && alcaEm(comAlcas.caixaNoPlano, ponto, FOLGA_DA_ALCA / camera.zoom);
      if (comAlcas && alca) {
        gesto = { tipo: 'redimensionar', no: comAlcas.no, alca, caixa: comAlcas.caixa, telaX: e.clientX, telaY: e.clientY, dx: 0, dy: 0, proporcional: false };
        capturar(elemento, e);
        return;
      }
    }

    // 2. a camada sob o ponteiro
    const alvo = acharEm(doc, ponto, { folga: FOLGA_DO_CLIQUE / camera.zoom });
    if (e.shiftKey) {
      if (alvo?.no) deps.interface.alternarNaSelecao(alvo.no.id);
      return;
    }
    if (!alvo) return deps.interface.selecionar(null);
    if (!alvo.no) return deps.interface.selecionar({ tipo: 'prancheta', id: alvo.prancheta.id });

    // clicar numa camada que já está na seleção mantém a seleção (para arrastar todas); fora dela, troca
    const jaSelecionada = selecao?.tipo === 'camadas' && selecao.ids.includes(alvo.no.id);
    const ids = jaSelecionada ? [...selecao.ids] : [alvo.no.id];
    if (!jaSelecionada) deps.interface.selecionar({ tipo: 'camadas', ids });
    if (!editavel) return;
    gesto = { tipo: 'mover', ids, telaX: e.clientX, telaY: e.clientY, dx: 0, dy: 0 };
    capturar(elemento, e);
  };

  const CURSOR: Readonly<Record<Alca, string>> = { n: 'ns-resize', s: 'ns-resize', l: 'ew-resize', o: 'ew-resize', ne: 'nesw-resize', so: 'nesw-resize', no: 'nwse-resize', se: 'nwse-resize' };

  /** Sem gesto em andamento, o cursor diz se o ponteiro está sobre uma alça. */
  const apontar = (e: PointerEvent) => {
    const sessao = deps.sessao();
    if (!sessao || sessao.obter().somenteLeitura || deps.interface.ferramentaEmUso() !== 'mover') return void elemento.style.removeProperty('cursor');
    const camera = deps.visao.camera.obter();
    const comAlcas = noDaAlca(sessao.obter().visivel, deps.interface.armazem.obter().selecao);
    const alca = comAlcas && alcaEm(comAlcas.caixaNoPlano, paraDocumento(camera, naArea(e)), FOLGA_DA_ALCA / camera.zoom);
    if (alca) elemento.style.cursor = CURSOR[alca];
    else elemento.style.removeProperty('cursor');
  };

  const aoMover = (e: PointerEvent) => {
    if (!gesto) return apontar(e);
    medir(e);
    if (quadroPedido) return;
    quadroPedido = true;
    agendar(publicar);
  };

  const aoSoltar = (e: PointerEvent) => {
    if (!gesto) return;
    medir(e);
    const sessao = deps.sessao();
    const doc = sessao?.obter().visivel;
    // A ordem importa: a sessão publica o documento novo (o motor o recebe na hora, por assinatura)
    // e SÓ DEPOIS a prévia encerra. Ao contrário, a camada piscaria no lugar antigo por um quadro.
    if (sessao && doc) {
      if (gesto.tipo === 'mover') {
        if (gesto.dx !== 0 || gesto.dy !== 0) {
          const lote = loteDeMoverPorSeta(doc, { tipo: 'camadas', ids: gesto.ids }, gesto.dx, gesto.dy);
          if (lote) sessao.aplicar(lote.descricao, lote.operacoes);
        }
      } else {
        const { lote } = redimensionado(gesto, doc);
        const novo = redimensionar(gesto.caixa, gesto.alca, gesto.dx, gesto.dy, { proporcional: gesto.proporcional });
        const mudou = novo.x !== gesto.caixa.x || novo.y !== gesto.caixa.y || novo.w !== gesto.caixa.w || novo.h !== gesto.caixa.h;
        if (mudou) sessao.aplicar(lote.descricao, lote.operacoes);
      }
    }
    encerrar();
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && gesto) encerrar();
  };

  // O Shift+clique do navegador estende a seleção de TEXTO da página, e apertar em cima dela começa
  // um arraste nativo, que cancela o ponteiro no meio do gesto. Aqui o Shift+clique é só da seleção
  // de camadas: o padrão é impedido, e o foco (que o padrão daria) é posto à mão.
  const aoApertarOMouse = (e: MouseEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    elemento.focus({ preventScroll: true });
  };
  const semArrasteNativo = (e: Event) => e.preventDefault();

  elemento.addEventListener('pointerdown', aoApertar);
  elemento.addEventListener('mousedown', aoApertarOMouse);
  elemento.addEventListener('dragstart', semArrasteNativo);
  elemento.addEventListener('pointermove', aoMover);
  elemento.addEventListener('pointerup', aoSoltar);
  elemento.addEventListener('pointercancel', encerrar);
  window.addEventListener('keydown', aoTeclar);
  return () => {
    elemento.removeEventListener('pointerdown', aoApertar);
    elemento.removeEventListener('mousedown', aoApertarOMouse);
    elemento.removeEventListener('dragstart', semArrasteNativo);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSoltar);
    elemento.removeEventListener('pointercancel', encerrar);
    window.removeEventListener('keydown', aoTeclar);
  };
}
