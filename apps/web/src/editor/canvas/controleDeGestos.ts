// Gestos sobre o documento, fora do React: clicar seleciona (Shift+clique acrescenta), arrastar
// move a seleção, arrastar uma alça redimensiona e arrastar a pega de cima gira. Soltar vira UM lote
// do catálogo (ADR 027). Durante o gesto não nasce lote nem documento: só a prévia do motor muda
// (definirPrevia), no máximo uma vez por quadro, e nenhuma prancheta é recomposta.
import { acharEm, type Documento, type Operacao } from '@otto/documento';
import { loteDeMoverPorSeta, loteDeTransformar } from '../nucleo/acoes';
import { type Armazem, criarArmazem } from '../nucleo/armazem';
import { paraDocumento } from '../nucleo/camera';
import type { Interface } from '../nucleo/interface';
import type { SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import type { Visao } from '../nucleo/visao';
import { type AlvoDeTransformar, alvoDeTransformar, noPlano } from './alvo';
import type { PreviaDeGesto } from './motor';
import { capturar } from './ponteiro';
import { cursorDaPega, type Pega, pegaEm, type Quadro, transformar } from './transformacao';

/** Folga do clique e da alça, e a distância da pega de girar ao lado de cima, em pixels de tela. */
const FOLGA_DO_CLIQUE = 3;
export const FOLGA_DA_ALCA = 6;
export const DISTANCIA_DO_GIRO = 24;

export interface DependenciasDosGestos {
  visao: Pick<Visao, 'camera'>;
  interface: Pick<Interface, 'ferramentaEmUso' | 'selecionar' | 'alternarNaSelecao' | 'armazem'>;
  /** A sessão da peça aberta. Ausente enquanto a peça não abriu. */
  sessao(): SessaoDoDocumento<Documento, Operacao> | undefined;
  /** Onde a prévia do gesto é publicada. A área do canvas a entrega ao motor e às sobreposições. */
  previa: Armazem<PreviaDeGesto | null>;
  /** Dois cliques numa camada de texto: abrir a edição do texto no lugar. */
  aoEditarTexto?(id: string): void;
  /** Como pedir o próximo quadro. Padrão: requestAnimationFrame. */
  agendar?(quadro: () => void): void;
}

type Ponto = { x: number; y: number };
type Gesto =
  | { tipo: 'mover'; ids: string[]; telaX: number; telaY: number; dx: number; dy: number }
  /** Redimensionar ou girar: `de` e `ate` são pontos da prancheta, o mesmo sistema dos quadros das camadas. */
  | { tipo: 'transformar'; pega: Pega; alvo: AlvoDeTransformar; de: Ponto; ate: Ponto; shift: boolean };

export const criarArmazemDaPrevia = (): Armazem<PreviaDeGesto | null> => criarArmazem<PreviaDeGesto | null>(null);

export function ligarControleDeGestos(elemento: HTMLElement, deps: DependenciasDosGestos): () => void {
  const agendar = deps.agendar ?? ((quadro: () => void) => void requestAnimationFrame(quadro));
  let gesto: Gesto | null = null;
  let quadroPedido = false;

  const naArea = (e: { clientX: number; clientY: number }) => {
    const r = elemento.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** O ponteiro em coordenadas da prancheta do gesto. */
  const naPrancheta = (e: { clientX: number; clientY: number }, origem: Ponto): Ponto => {
    const p = paraDocumento(deps.visao.camera.obter(), naArea(e));
    return { x: p.x - origem.x, y: p.y - origem.y };
  };

  const medir = (e: { clientX: number; clientY: number; shiftKey?: boolean }) => {
    if (!gesto) return;
    if (gesto.tipo === 'mover') {
      // deslocamento desde o aperto, em unidades inteiras do documento
      const { zoom } = deps.visao.camera.obter();
      gesto.dx = Math.round((e.clientX - gesto.telaX) / zoom);
      gesto.dy = Math.round((e.clientY - gesto.telaY) / zoom);
    } else {
      gesto.ate = naPrancheta(e, gesto.alvo.origem);
      gesto.shift = e.shiftKey === true;
    }
  };

  /** O quadro novo de cada camada do gesto de redimensionar ou girar. */
  const quadrosNovos = (g: Extract<Gesto, { tipo: 'transformar' }>): Quadro[] =>
    transformar(
      g.alvo.folhas.map((f) => f.quadro),
      g.pega,
      { de: g.de, ate: g.ate, shift: g.shift },
    );

  const publicar = () => {
    quadroPedido = false;
    if (!gesto) return;
    if (gesto.tipo === 'mover') {
      if (gesto.dx === 0 && gesto.dy === 0 && deps.previa.obter() === null) return;
      deps.previa.definir({ ids: gesto.ids, dx: gesto.dx, dy: gesto.dy });
      return;
    }
    // Redimensionar e girar: a caixa nova de cada camada vai pela prévia do motor, que redesenha só
    // a camada tocada (o texto requebra, a foto reenquadra). Nenhum documento novo nasce no gesto.
    const novos = quadrosNovos(gesto);
    const caixas = Object.fromEntries(
      gesto.alvo.folhas.map((f, i) => [
        f.no.id,
        { x: novos[i]?.x ?? f.quadro.x, y: novos[i]?.y ?? f.quadro.y, largura: novos[i]?.w ?? f.quadro.w, altura: novos[i]?.h ?? f.quadro.h, rotacao: novos[i]?.rotacao ?? f.quadro.rotacao },
      ]),
    );
    deps.previa.definir({ ids: gesto.alvo.folhas.map((f) => f.no.id), dx: 0, dy: 0, caixas });
  };

  const encerrar = () => {
    gesto = null;
    deps.previa.definir(null);
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

    // 1. a pega da seleção (alça ou girar) ganha do que estiver embaixo dela
    if (editavel && !e.shiftKey) {
      const alvo = alvoDeTransformar(doc, selecao);
      const pega = alvo && pegaEm(noPlano(alvo.quadro, alvo.origem), ponto, FOLGA_DA_ALCA / camera.zoom, DISTANCIA_DO_GIRO / camera.zoom);
      if (alvo && pega) {
        const de = { x: ponto.x - alvo.origem.x, y: ponto.y - alvo.origem.y };
        gesto = { tipo: 'transformar', pega, alvo, de, ate: de, shift: false };
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

  /** Sem gesto em andamento, o cursor diz se o ponteiro está sobre uma pega. */
  const apontar = (e: PointerEvent) => {
    const sessao = deps.sessao();
    if (!sessao || sessao.obter().somenteLeitura || deps.interface.ferramentaEmUso() !== 'mover') return void elemento.style.removeProperty('cursor');
    const camera = deps.visao.camera.obter();
    const alvo = alvoDeTransformar(sessao.obter().visivel, deps.interface.armazem.obter().selecao);
    const pega = alvo && pegaEm(noPlano(alvo.quadro, alvo.origem), paraDocumento(camera, naArea(e)), FOLGA_DA_ALCA / camera.zoom, DISTANCIA_DO_GIRO / camera.zoom);
    if (alvo && pega) elemento.style.cursor = cursorDaPega(pega, alvo.quadro.rotacao);
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
        const novos = quadrosNovos(gesto);
        const lote = loteDeTransformar(
          gesto.alvo.folhas.map((f, i) => ({ no: f.no, antes: f.quadro, depois: novos[i] ?? f.quadro })),
          gesto.pega === 'girar' ? 'girar' : 'redimensionar',
        );
        if (lote) sessao.aplicar(lote.descricao, lote.operacoes);
      }
    }
    encerrar();
  };

  /** Dois cliques numa camada de texto abrem a edição do texto no lugar. */
  const aoClicarDuasVezes = (e: MouseEvent) => {
    const sessao = deps.sessao();
    if (!deps.aoEditarTexto || !sessao || sessao.obter().somenteLeitura || deps.interface.ferramentaEmUso() !== 'mover') return;
    const camera = deps.visao.camera.obter();
    const alvo = acharEm(sessao.obter().visivel, paraDocumento(camera, naArea(e)), { folga: FOLGA_DO_CLIQUE / camera.zoom });
    if (alvo?.no?.tipo !== 'texto') return;
    e.preventDefault();
    deps.interface.selecionar({ tipo: 'camadas', ids: [alvo.no.id] });
    deps.aoEditarTexto(alvo.no.id);
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
  elemento.addEventListener('dblclick', aoClicarDuasVezes);
  window.addEventListener('keydown', aoTeclar);
  return () => {
    elemento.removeEventListener('pointerdown', aoApertar);
    elemento.removeEventListener('mousedown', aoApertarOMouse);
    elemento.removeEventListener('dragstart', semArrasteNativo);
    elemento.removeEventListener('pointermove', aoMover);
    elemento.removeEventListener('pointerup', aoSoltar);
    elemento.removeEventListener('pointercancel', encerrar);
    elemento.removeEventListener('dblclick', aoClicarDuasVezes);
    window.removeEventListener('keydown', aoTeclar);
  };
}
