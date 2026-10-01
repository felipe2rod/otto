// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { paraDocumento } from '../nucleo/camera';
import { criarInterface, type Interface } from '../nucleo/interface';
import { criarVisao, type Visao } from '../nucleo/visao';
import { ligarControleDaCamera } from './controleDaCamera';

let elemento: HTMLElement;
let visao: Visao;
let iface: Interface;
let desligar: () => void;

beforeEach(() => {
  document.body.innerHTML = '';
  elemento = document.createElement('div');
  document.body.append(elemento);
  // a área começa em (10, 20) na página: o controle tem de descontar isso
  elemento.getBoundingClientRect = () => ({ left: 10, top: 20, width: 800, height: 600, right: 810, bottom: 620, x: 10, y: 20, toJSON: () => ({}) });
  visao = criarVisao();
  visao.camera.definir({ x: 0, y: 0, zoom: 1 });
  iface = criarInterface();
  desligar = ligarControleDaCamera(elemento, visao, iface);
});

const roda = (init: WheelEventInit) => {
  const evento = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  elemento.dispatchEvent(evento);
  return evento;
};
const ponteiro = (tipo: string, init: MouseEventInit) => elemento.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, ...init }));

describe('controle da câmera: roda', () => {
  it('a roda sozinha move a vista', () => {
    roda({ deltaX: 30, deltaY: 50 });
    expect(visao.camera.obter()).toEqual({ x: -30, y: -50, zoom: 1 });
  });

  it('Ctrl+roda dá zoom no ponto sob o cursor e impede o zoom da página', () => {
    const cursor = { x: 300, y: 200 }; // dentro da área: (310, 220) na página
    const antes = paraDocumento(visao.camera.obter(), cursor);

    const evento = roda({ deltaY: -100, ctrlKey: true, clientX: 310, clientY: 220 });

    expect(evento.defaultPrevented).toBe(true);
    expect(visao.camera.obter().zoom).toBeGreaterThan(1);
    const depois = paraDocumento(visao.camera.obter(), cursor);
    expect(depois.x).toBeCloseTo(antes.x);
    expect(depois.y).toBeCloseTo(antes.y);
  });

  it('Alt+roda também dá zoom', () => {
    roda({ deltaY: 100, altKey: true, clientX: 10, clientY: 20 });
    expect(visao.camera.obter().zoom).toBeLessThan(1);
  });
});

describe('controle da câmera: arrastar', () => {
  it('com a ferramenta de mover, arrastar com o botão esquerdo não move a vista', () => {
    ponteiro('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    ponteiro('pointermove', { clientX: 150, clientY: 130 });
    ponteiro('pointerup', {});
    expect(visao.camera.obter()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('com a mão, arrastar move a vista pela distância do ponteiro', () => {
    iface.escolherFerramenta('mao');
    ponteiro('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    ponteiro('pointermove', { clientX: 150, clientY: 130 });
    ponteiro('pointermove', { clientX: 160, clientY: 90 });
    ponteiro('pointerup', {});
    ponteiro('pointermove', { clientX: 500, clientY: 500 });

    expect(visao.camera.obter()).toEqual({ x: 60, y: -10, zoom: 1 });
  });

  it('espaço apertado vale como mão', () => {
    iface.segurarMao(true);
    ponteiro('pointerdown', { button: 0, clientX: 0, clientY: 0 });
    ponteiro('pointermove', { clientX: 5, clientY: 5 });
    expect(visao.camera.obter()).toMatchObject({ x: 5, y: 5 });
  });

  it('o botão do meio move a vista com qualquer ferramenta', () => {
    ponteiro('pointerdown', { button: 1, clientX: 0, clientY: 0 });
    ponteiro('pointermove', { clientX: -20, clientY: 10 });
    expect(visao.camera.obter()).toMatchObject({ x: -20, y: 10 });
  });

  it('com a ferramenta de zoom, clicar aproxima e Alt+clicar afasta', () => {
    iface.escolherFerramenta('zoom');
    ponteiro('pointerdown', { button: 0, clientX: 310, clientY: 220 });
    ponteiro('pointerup', {});
    const aproximado = visao.camera.obter().zoom;
    expect(aproximado).toBeGreaterThan(1);

    ponteiro('pointerdown', { button: 0, altKey: true, clientX: 310, clientY: 220 });
    expect(visao.camera.obter().zoom).toBeLessThan(aproximado);
  });

  it('depois de desligar, nada mais mexe na câmera', () => {
    desligar();
    roda({ deltaX: 30, deltaY: 50 });
    expect(visao.camera.obter()).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
