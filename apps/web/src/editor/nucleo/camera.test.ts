import { describe, expect, it } from 'vitest';
import { deslocar, enquadrar, paraDocumento, paraTela, ZOOM_MAXIMO, ZOOM_MINIMO, zoomEmCem, zoomNoPonto } from './camera';

describe('câmera', () => {
  it('converte ponto da tela em ponto do documento e de volta', () => {
    const camera = { x: 100, y: 50, zoom: 0.5 };
    expect(paraDocumento(camera, { x: 300, y: 250 })).toEqual({ x: 400, y: 400 });
    expect(paraTela(camera, { x: 400, y: 400 })).toEqual({ x: 300, y: 250 });
  });

  it('desloca pela distância em pixels de tela, sem mexer no zoom', () => {
    expect(deslocar({ x: 10, y: 10, zoom: 2 }, 5, -3)).toEqual({ x: 15, y: 7, zoom: 2 });
  });

  it('zoom mantém parado o ponto do documento que está sob o cursor', () => {
    const camera = { x: 100, y: 50, zoom: 0.5 };
    const cursor = { x: 300, y: 250 };
    const antes = paraDocumento(camera, cursor);

    const depois = zoomNoPonto(camera, cursor, 2);

    expect(depois.zoom).toBe(1);
    expect(paraDocumento(depois, cursor)).toEqual(antes);
  });

  it('zoom não passa do mínimo nem do máximo', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    expect(zoomNoPonto(camera, { x: 0, y: 0 }, 1000).zoom).toBe(ZOOM_MAXIMO);
    expect(zoomNoPonto(camera, { x: 0, y: 0 }, 0.0001).zoom).toBe(ZOOM_MINIMO);
  });

  it('enquadrar centraliza o conteúdo com margem e nunca amplia além de 100%', () => {
    const area = { largura: 1000, altura: 800 };

    const grande = enquadrar(area, { x: 0, y: 0, largura: 2000, altura: 1000 }, 100);
    expect(grande.zoom).toBe(0.4);
    expect(grande.x).toBe(100);
    expect(grande.y).toBe(200);

    const pequeno = enquadrar(area, { x: 0, y: 0, largura: 200, altura: 100 }, 100);
    expect(pequeno.zoom).toBe(1);
    expect(pequeno.x).toBe(400);
    expect(pequeno.y).toBe(350);
  });

  it('enquadrar sem conteúdo devolve a câmera de repouso', () => {
    expect(enquadrar({ largura: 1000, altura: 800 }, undefined, 100)).toEqual({ x: 100, y: 100, zoom: 1 });
  });

  it('100% mantém parado o centro da área', () => {
    const area = { largura: 1000, altura: 800 };
    const camera = { x: 100, y: 50, zoom: 0.5 };
    const centro = { x: 500, y: 400 };
    const antes = paraDocumento(camera, centro);

    const cem = zoomEmCem(camera, area);

    expect(cem.zoom).toBe(1);
    expect(paraDocumento(cem, centro)).toEqual(antes);
  });
});
