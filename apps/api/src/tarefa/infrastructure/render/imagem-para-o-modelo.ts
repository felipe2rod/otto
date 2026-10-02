// Do render para o que o modelo vê: JPEG do render e redução de foto. Roda dentro da thread de render.
//
// PARA O ESPECIALISTA-GRAFICO: as duas funções vieram de avaliacao/src/ambiente.ts porque @otto/render não
// exporta nenhuma delas. Deveriam morar lá, ao lado de codificarPng.
import type { RenderEmPixels, Sessao } from '@otto/render';

const QUALIDADE_DO_RENDER = 85;
const QUALIDADE_DA_PREVIA = 82;

export function codificarJpeg(sessao: Sessao, render: RenderEmPixels): Uint8Array {
  const { ck } = sessao;
  const img = ck.MakeImage(
    { width: render.largura, height: render.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB },
    render.rgba,
    render.largura * 4,
  );
  if (!img) throw new Error('não foi possível montar a imagem do render');
  const bytes = img.encodeToBytes(ck.ImageFormat.JPEG, QUALIDADE_DO_RENDER);
  img.delete();
  if (!bytes) throw new Error('este motor não codifica JPEG: carregue a variante completa');
  return bytes;
}

/** Reduz uma foto para o modelo ver: lado maior de `ladoMaximo`, em JPEG. undefined se o motor não abre o arquivo. */
export function reduzirFoto(sessao: Sessao, bytes: Uint8Array, ladoMaximo: number): { jpeg: Uint8Array; largura: number; altura: number } | undefined {
  const { ck } = sessao;
  const img = ck.MakeImageFromEncoded(bytes);
  if (!img) return undefined;
  const escala = Math.min(1, ladoMaximo / Math.max(img.width(), img.height()));
  const largura = Math.max(1, Math.round(img.width() * escala));
  const altura = Math.max(1, Math.round(img.height() * escala));
  const superficie = ck.MakeSurface(largura, altura);
  if (!superficie) {
    img.delete();
    return undefined;
  }
  const tinta = new ck.Paint();
  superficie.getCanvas().drawImageRectOptions(img, ck.XYWHRect(0, 0, img.width(), img.height()), ck.XYWHRect(0, 0, largura, altura), ck.FilterMode.Linear, ck.MipmapMode.Linear, tinta);
  const reduzida = superficie.makeImageSnapshot();
  const jpeg = reduzida.encodeToBytes(ck.ImageFormat.JPEG, QUALIDADE_DA_PREVIA);
  tinta.delete();
  reduzida.delete();
  superficie.delete();
  img.delete();
  return jpeg ? { jpeg, largura, altura } : undefined;
}
