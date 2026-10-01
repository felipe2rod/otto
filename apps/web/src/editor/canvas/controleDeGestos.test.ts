// @vitest-environment jsdom
// Todo gesto vira operação do catálogo (ADR 027). Aqui: clicar seleciona, arrastar mostra a prévia
// do motor sem criar documento, soltar aplica UM lote "mover".
import { caixaDe, type Documento, type Operacao } from '@otto/documento';
import { beforeEach, describe, expect, it } from 'vitest';
import { montarDocumentoDeExemplo } from '../bancada/documentoDeExemplo';
import { criarArmazem } from '../nucleo/armazem';
import { aplicadorDoCatalogo } from '../nucleo/catalogo';
import { criarInterface, type Interface } from '../nucleo/interface';
import { criarSessaoDoDocumento, type LoteDoEditor, type SessaoDoDocumento } from '../nucleo/sessaoDoDocumento';
import { criarVisao, type Visao } from '../nucleo/visao';
import { ligarControleDeGestos } from './controleDeGestos';
import type { PreviaDeGesto } from './motor';

const inicial = montarDocumentoDeExemplo({ hash: 'a'.repeat(64), largura: 1200, altura: 800 });
const camada = inicial.pranchetas[0]?.filhos.at(-1);
if (!camada) throw new Error('o documento de exemplo precisa de camada');
const caixa = caixaDe(camada);
if (!caixa) throw new Error('a camada do topo precisa de caixa');
/** Um ponto dentro da camada do topo da primeira prancheta, em unidades do documento. */
const dentro = { x: caixa.x + 4, y: caixa.y + 4 };

let elemento: HTMLElement;
let visao: Visao;
let iface: Interface;
let sessao: SessaoDoDocumento<Documento, Operacao>;
let enviados: LoteDoEditor<Operacao>[];
let previa: ReturnType<typeof criarArmazem<PreviaDeGesto | null>>;
let aoVivo: ReturnType<typeof criarArmazem<Documento | null>>;
let quadros: (() => void)[];
/** O que aconteceu, em ordem: é o que prova que o documento chega ao motor antes de a prévia encerrar. */
let ordem: string[];
let desligar: () => void;

const rodarQuadro = () => {
  const pendentes = quadros;
  quadros = [];
  for (const q of pendentes) q();
};

beforeEach(() => {
  document.body.innerHTML = '';
  elemento = document.createElement('div');
  document.body.append(elemento);
  elemento.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
  visao = criarVisao();
  // zoom de 50%: 1 pixel de tela vale 2 unidades do documento
  visao.camera.definir({ x: 0, y: 0, zoom: 0.5 });
  iface = criarInterface();
  enviados = [];
  let n = 0;
  sessao = criarSessaoDoDocumento<Documento, Operacao>(
    { doc: inicial, versao: 1 },
    {
      aplicar: aplicadorDoCatalogo(() => undefined),
      enviar: async (lote) => {
        enviados.push(lote);
        return { tipo: 'confirmado', versao: lote.versaoBase + 1 };
      },
      recarregar: async () => ({ doc: inicial, versao: 1 }),
      gerarId: () => `lote-${++n}`,
    },
  );
  previa = criarArmazem<PreviaDeGesto | null>(null);
  aoVivo = criarArmazem<Documento | null>(null);
  aoVivo.assinar(() => ordem.push(aoVivo.obter() ? 'ao-vivo' : 'fim-do-ao-vivo'));
  quadros = [];
  ordem = [];
  sessao.assinar(() => ordem.push('documento'));
  previa.assinar(() => ordem.push(previa.obter() ? 'previa' : 'fim-da-previa'));
  desligar = ligarControleDeGestos(elemento, { visao, interface: iface, sessao: () => sessao, previa, aoVivo, agendar: (q) => quadros.push(q) });
});

/** Ponteiro em unidades do documento (o teste converte para tela pelo zoom de 50%). */
const ponteiro = (tipo: string, noDocumento: { x: number; y: number }, init: MouseEventInit = {}) =>
  elemento.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, clientX: noDocumento.x * 0.5, clientY: noDocumento.y * 0.5, ...init }));

describe('gestos: selecionar', () => {
  it('clicar numa camada a seleciona', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointerup', dentro);
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [camada.id] });
    expect(enviados).toEqual([]);
  });

  it('clicar na prancheta, fora das camadas, seleciona a prancheta; fora de tudo, limpa', () => {
    const feed = inicial.pranchetas[0];
    ponteiro('pointerdown', { x: (feed?.largura ?? 0) - 2, y: (feed?.altura ?? 0) - 2 });
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'prancheta', id: feed?.id });

    ponteiro('pointerdown', { x: -500, y: -500 });
    expect(iface.armazem.obter().selecao).toBeNull();
  });

  it('com a mão ou com o botão do meio, o clique é da câmera: não seleciona', () => {
    iface.escolherFerramenta('mao');
    ponteiro('pointerdown', dentro);
    expect(iface.armazem.obter().selecao).toBeNull();

    iface.escolherFerramenta('mover');
    ponteiro('pointerdown', dentro, { button: 1 });
    expect(iface.armazem.obter().selecao).toBeNull();
  });
});

describe('gestos: arrastar', () => {
  it('mostra a prévia em unidades do documento, sem criar documento nem lote', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 40, y: dentro.y - 20 });
    rodarQuadro();

    expect(previa.obter()).toEqual({ ids: [camada.id], dx: 40, dy: -20 });
    expect(sessao.obter().visivel).toBe(inicial);
    expect(enviados).toEqual([]);
  });

  it('vários movimentos no mesmo quadro viram uma prévia só, com o último valor', () => {
    ponteiro('pointerdown', dentro);
    for (let i = 1; i <= 10; i++) ponteiro('pointermove', { x: dentro.x + i * 6, y: dentro.y });
    expect(quadros).toHaveLength(1);
    rodarQuadro();

    expect(ordem.filter((o) => o === 'previa')).toHaveLength(1);
    expect(previa.obter()?.dx).toBe(60);
  });

  it('soltar aplica UM lote "mover" com a posição nova, e só depois encerra a prévia', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 40, y: dentro.y - 20 });
    rodarQuadro();
    ordem = [];
    ponteiro('pointerup', { x: dentro.x + 40, y: dentro.y - 20 });

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ descricao: `mover ${camada.nome}`, operacoes: [{ op: 'mover', alvo: camada.id, x: caixa.x + 40, y: caixa.y - 20 }] });
    // o motor recebe o documento novo ANTES de a prévia encerrar: do contrário a camada pisca no lugar antigo
    expect(ordem).toEqual(['documento', 'fim-da-previa']);
    const movida = sessao.obter().visivel.pranchetas[0]?.filhos.at(-1);
    expect(movida && caixaDe(movida)).toMatchObject({ x: caixa.x + 40, y: caixa.y - 20 });
  });

  it('soltar usa a posição do ponteiro ao soltar, mesmo que o último quadro não tenha rodado', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 100, y: dentro.y });
    ponteiro('pointerup', { x: dentro.x + 100, y: dentro.y });

    expect(enviados[0]?.operacoes).toEqual([{ op: 'mover', alvo: camada.id, x: caixa.x + 100, y: caixa.y }]);
    rodarQuadro();
    expect(previa.obter()).toBeNull();
  });

  it('arraste menor que uma unidade do documento não vira lote', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 0.4, y: dentro.y });
    rodarQuadro();
    ponteiro('pointerup', { x: dentro.x + 0.4, y: dentro.y });

    expect(enviados).toEqual([]);
    expect(previa.obter()).toBeNull();
  });

  it('Esc cancela: a camada volta e nenhum lote sai', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 40, y: dentro.y });
    rodarQuadro();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ponteiro('pointerup', { x: dentro.x + 40, y: dentro.y });

    expect(previa.obter()).toBeNull();
    expect(enviados).toEqual([]);
    expect(sessao.obter().visivel).toBe(inicial);
  });

  it('peça só para leitura: seleciona, mas não arrasta', () => {
    sessao.definirSomenteLeitura(true);
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 40, y: dentro.y });
    rodarQuadro();
    ponteiro('pointerup', { x: dentro.x + 40, y: dentro.y });

    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [camada.id] });
    expect(previa.obter()).toBeNull();
    expect(enviados).toEqual([]);
  });

  it('depois de desligar, nada mais acontece', () => {
    desligar();
    ponteiro('pointerdown', dentro);
    expect(iface.armazem.obter().selecao).toBeNull();
  });
});

describe('gestos: seleção múltipla', () => {
  const outra = inicial.pranchetas[0]?.filhos.at(-2);
  const caixaDaOutra = outra && caixaDe(outra);
  if (!outra || !caixaDaOutra) throw new Error('o documento de exemplo precisa de duas camadas');
  // um ponto que só a segunda camada cobre (ela fica abaixo do título, mais embaixo na prancheta)
  const naOutra = { x: caixaDaOutra.x + 4, y: caixaDaOutra.y + caixaDaOutra.h - 4 };

  it('Shift+clique acrescenta a camada à seleção, e Shift+clique de novo tira', () => {
    ponteiro('pointerdown', dentro);
    ponteiro('pointerup', dentro);
    ponteiro('pointerdown', naOutra, { shiftKey: true });
    ponteiro('pointerup', naOutra, { shiftKey: true });
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [camada.id, outra.id] });

    ponteiro('pointerdown', dentro, { shiftKey: true });
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [outra.id] });
  });

  it('Shift+clique não começa arraste', () => {
    ponteiro('pointerdown', dentro, { shiftKey: true });
    ponteiro('pointermove', { x: dentro.x + 40, y: dentro.y }, { shiftKey: true });
    rodarQuadro();
    expect(previa.obter()).toBeNull();
  });

  it('arrastar uma camada da seleção move todas: uma prévia e UM lote, com um `mover` por camada', () => {
    iface.selecionar({ tipo: 'camadas', ids: [camada.id, outra.id] });
    ponteiro('pointerdown', dentro);
    ponteiro('pointermove', { x: dentro.x + 20, y: dentro.y + 10 });
    rodarQuadro();
    expect(previa.obter()).toEqual({ ids: [camada.id, outra.id], dx: 20, dy: 10 });

    ponteiro('pointerup', { x: dentro.x + 20, y: dentro.y + 10 });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.operacoes).toEqual([
      { op: 'mover', alvo: camada.id, x: caixa.x + 20, y: caixa.y + 10 },
      { op: 'mover', alvo: outra.id, x: caixaDaOutra.x + 20, y: caixaDaOutra.y + 10 },
    ]);
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [camada.id, outra.id] });
  });

  // Visto no navegador: o Shift+clique estendia a seleção de TEXTO da página, e o aperto seguinte
  // sobre ela virava arraste nativo do navegador, que cancela o ponteiro no meio do gesto.
  it('o Shift+clique não deixa o navegador estender a seleção de texto, e o foco continua na área', () => {
    elemento.tabIndex = -1;
    const aperto = new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey: true });
    elemento.dispatchEvent(aperto);
    expect(aperto.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(elemento);

    const comum = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    elemento.dispatchEvent(comum);
    expect(comum.defaultPrevented).toBe(false);
  });

  it('o navegador não começa arraste nativo dentro da área', () => {
    const arraste = new Event('dragstart', { bubbles: true, cancelable: true });
    elemento.dispatchEvent(arraste);
    expect(arraste.defaultPrevented).toBe(true);
  });

  it('clicar numa camada fora da seleção troca a seleção por ela', () => {
    iface.selecionar({ tipo: 'camadas', ids: [outra.id] });
    ponteiro('pointerdown', dentro);
    expect(iface.armazem.obter().selecao).toEqual({ tipo: 'camadas', ids: [camada.id] });
  });
});

describe('gestos: redimensionar pela alça', () => {
  /** O canto sudeste da camada do topo. */
  const sudeste = { x: caixa.x + caixa.w, y: caixa.y + caixa.h };
  const selecionar = () => iface.selecionar({ tipo: 'camadas', ids: [camada.id] });
  const camadaAoVivo = () => aoVivo.obter()?.pranchetas[0]?.filhos.at(-1);

  it('arrastar a alça mostra a camada no tamanho novo AO VIVO, sem lote e sem trocar o documento da sessão', () => {
    selecionar();
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + 60, y: sudeste.y + 30 });
    rodarQuadro();

    expect(camadaAoVivo()).toMatchObject({ x: caixa.x, y: caixa.y, largura: caixa.w + 60, altura: caixa.h + 30 });
    expect(sessao.obter().visivel).toBe(inicial);
    expect(enviados).toEqual([]);
    expect(previa.obter()).toBeNull();
    // as outras pranchetas são os mesmos objetos: o motor só recompõe a que mudou
    expect(aoVivo.obter()?.pranchetas[1]).toBe(inicial.pranchetas[1]);
  });

  it('soltar grava UM lote `alterar` com posição e tamanho, e o documento chega antes de o "ao vivo" encerrar', () => {
    selecionar();
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + 60, y: sudeste.y + 30 });
    rodarQuadro();
    ordem = [];
    ponteiro('pointerup', { x: sudeste.x + 60, y: sudeste.y + 30 });

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.operacoes).toEqual([{ op: 'alterar', alvo: camada.id, props: { x: caixa.x, y: caixa.y, largura: caixa.w + 60, altura: caixa.h + 30 } }]);
    expect(ordem).toEqual(['documento', 'fim-do-ao-vivo']);
  });

  it('com Shift, o canto mantém a proporção', () => {
    selecionar();
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + caixa.w, y: sudeste.y }, { shiftKey: true });
    rodarQuadro();
    expect(camadaAoVivo()).toMatchObject({ largura: caixa.w * 2, altura: caixa.h * 2 });
  });

  it('vários movimentos no mesmo quadro viram um documento ao vivo só', () => {
    selecionar();
    ponteiro('pointerdown', sudeste);
    ordem = [];
    for (let i = 1; i <= 8; i++) ponteiro('pointermove', { x: sudeste.x + i * 10, y: sudeste.y });
    rodarQuadro();
    expect(ordem).toEqual(['ao-vivo']);
  });

  it('Esc cancela: a camada volta ao tamanho e nenhum lote sai', () => {
    selecionar();
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + 60, y: sudeste.y });
    rodarQuadro();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ponteiro('pointerup', { x: sudeste.x + 60, y: sudeste.y });

    expect(aoVivo.obter()).toBeNull();
    expect(enviados).toEqual([]);
  });

  it('sem camada selecionada, ou com a peça só para leitura, o canto é um clique comum', () => {
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + 60, y: sudeste.y });
    rodarQuadro();
    expect(aoVivo.obter()).toBeNull();

    sessao.definirSomenteLeitura(true);
    selecionar();
    ponteiro('pointerdown', sudeste);
    ponteiro('pointermove', { x: sudeste.x + 60, y: sudeste.y });
    rodarQuadro();
    expect(aoVivo.obter()).toBeNull();
  });
});
