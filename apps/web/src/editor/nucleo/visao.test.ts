import { describe, expect, it, vi } from 'vitest';
import { paraDocumento } from './camera';
import { criarVisao, MARGEM_DO_ENQUADRE, PASSO_DE_ZOOM } from './visao';

describe('visão do canvas', () => {
  it('enquadra o conteúdo na área que o canvas informou', () => {
    const visao = criarVisao();
    visao.definirArea({ largura: 1000, altura: 800 });

    visao.enquadrar({ x: 0, y: 0, largura: 2000, altura: 1000 });

    const esperado = (1000 - 2 * MARGEM_DO_ENQUADRE) / 2000;
    expect(visao.camera.obter().zoom).toBeCloseTo(esperado);
  });

  it('zoom por passo mantém parado o centro da área', () => {
    const visao = criarVisao();
    visao.definirArea({ largura: 1000, altura: 800 });
    const centro = { x: 500, y: 400 };
    const antes = paraDocumento(visao.camera.obter(), centro);

    visao.zoomPorPasso(1);

    expect(visao.camera.obter().zoom).toBeCloseTo(PASSO_DE_ZOOM);
    const depois = paraDocumento(visao.camera.obter(), centro);
    expect(depois.x).toBeCloseTo(antes.x);
    expect(depois.y).toBeCloseTo(antes.y);

    visao.zoomPorPasso(-1);
    expect(visao.camera.obter().zoom).toBeCloseTo(1);
  });

  it('vai para 100%', () => {
    const visao = criarVisao();
    visao.definirArea({ largura: 1000, altura: 800 });
    visao.zoomPorPasso(1);
    visao.zoomEmCem();
    expect(visao.camera.obter().zoom).toBe(1);
  });

  it('mudar a área não avisa quem assina a câmera', () => {
    const visao = criarVisao();
    const ouvinte = vi.fn();
    visao.camera.assinar(ouvinte);
    visao.definirArea({ largura: 640, altura: 480 });
    expect(ouvinte).not.toHaveBeenCalled();
    expect(visao.area()).toEqual({ largura: 640, altura: 480 });
  });
});
