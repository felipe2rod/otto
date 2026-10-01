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
  quadros = [];
  ordem = [];
  sessao.assinar(() => ordem.push('documento'));
  previa.assinar(() => ordem.push(previa.obter() ? 'previa' : 'fim-da-previa'));
  desligar = ligarControleDeGestos(elemento, { visao, interface: iface, sessao: () => sessao, previa, agendar: (q) => quadros.push(q), descrever: (nome) => `mover ${nome}` });
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
