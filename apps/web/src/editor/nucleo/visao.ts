// A visão do canvas: a câmera num armazém próprio e os comandos que precisam do tamanho da área.
// A área não fica no armazém de propósito: ela muda ao redimensionar a janela e ninguém precisa
// renderizar por isso.
import { type Armazem, criarArmazem } from './armazem';
import { type Area, CAMERA_DE_REPOUSO, type Caixa, type Camera, enquadrar, zoomEmCem, zoomNoPonto } from './camera';

export const MARGEM_DO_ENQUADRE = 72;
export const PASSO_DE_ZOOM = 1.25;

export interface Visao {
  camera: Armazem<Camera>;
  area(): Area;
  definirArea(area: Area): void;
  enquadrar(conteudo: Caixa | undefined): void;
  zoomEmCem(): void;
  zoomPorPasso(sentido: 1 | -1): void;
}

export function criarVisao(): Visao {
  const camera = criarArmazem<Camera>(CAMERA_DE_REPOUSO);
  let area: Area = { largura: 0, altura: 0 };
  const centro = () => ({ x: area.largura / 2, y: area.altura / 2 });
  return {
    camera,
    area: () => area,
    definirArea(nova) {
      area = nova;
    },
    enquadrar: (conteudo) => camera.definir(enquadrar(area, conteudo, MARGEM_DO_ENQUADRE)),
    zoomEmCem: () => camera.definir((c) => zoomEmCem(c, area)),
    zoomPorPasso: (sentido) => camera.definir((c) => zoomNoPonto(c, centro(), sentido === 1 ? PASSO_DE_ZOOM : 1 / PASSO_DE_ZOOM)),
  };
}
