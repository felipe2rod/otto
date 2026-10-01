// Câmera do canvas: onde o documento aparece na área e em que escala. Funções puras.
// A câmera é do editor, não do motor: o motor recebe a câmera pronta (docs/mvp/frontend.md, seção 4).

export interface Camera {
  /** Posição, em pixels de tela, da origem do documento dentro da área do canvas. */
  x: number;
  y: number;
  /** Pixels de tela por unidade do documento. */
  zoom: number;
}

export interface Ponto {
  x: number;
  y: number;
}

export interface Area {
  largura: number;
  altura: number;
}

export interface Caixa extends Area, Ponto {}

export const ZOOM_MINIMO = 0.05;
export const ZOOM_MAXIMO = 8;
export const CAMERA_DE_REPOUSO: Camera = { x: 100, y: 100, zoom: 1 };

const limitar = (zoom: number): number => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, zoom));

export function paraDocumento(camera: Camera, naTela: Ponto): Ponto {
  return { x: (naTela.x - camera.x) / camera.zoom, y: (naTela.y - camera.y) / camera.zoom };
}

export function paraTela(camera: Camera, noDocumento: Ponto): Ponto {
  return { x: camera.x + noDocumento.x * camera.zoom, y: camera.y + noDocumento.y * camera.zoom };
}

export function deslocar(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** Multiplica o zoom por `fator`, mantendo parado o ponto do documento que está sob `naTela`. */
export function zoomNoPonto(camera: Camera, naTela: Ponto, fator: number): Camera {
  const zoom = limitar(camera.zoom * fator);
  const fixo = paraDocumento(camera, naTela);
  return { zoom, x: naTela.x - fixo.x * zoom, y: naTela.y - fixo.y * zoom };
}

/** Vai para 100% mantendo parado o centro da área. */
export function zoomEmCem(camera: Camera, area: Area): Camera {
  return zoomNoPonto(camera, { x: area.largura / 2, y: area.altura / 2 }, 1 / camera.zoom);
}

/** Centraliza o conteúdo na área, com margem em pixels de tela. Nunca amplia além de 100%. */
export function enquadrar(area: Area, conteudo: Caixa | undefined, margem: number): Camera {
  if (!conteudo || conteudo.largura <= 0 || conteudo.altura <= 0) return { ...CAMERA_DE_REPOUSO, x: margem, y: margem };
  const zoom = limitar(Math.min((area.largura - 2 * margem) / conteudo.largura, (area.altura - 2 * margem) / conteudo.altura, 1));
  return {
    zoom,
    x: (area.largura - conteudo.largura * zoom) / 2 - conteudo.x * zoom,
    y: (area.altura - conteudo.altura * zoom) / 2 - conteudo.y * zoom,
  };
}
