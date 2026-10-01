// Diferença entre dois renders do mesmo tamanho, em RGBA de 8 bits não premultiplicado.

export interface Diferenca {
  largura: number;
  altura: number;
  /** maior diferença de um canal, em níveis de 0 a 255 */
  maxima: number;
  /** pixels com qualquer diferença */
  diferentes: number;
  /** pixels com diferença acima de 2, 8 e 32 níveis em algum canal */
  acimaDe2: number;
  acimaDe8: number;
  acimaDe32: number;
  /** média da diferença absoluta por canal, na imagem inteira */
  media: number;
  porcentagemDiferente: number;
}

export function comparar(a: Uint8Array, b: Uint8Array, largura: number, altura: number): { d: Diferenca; mapa: Uint8Array } {
  const mapa = new Uint8Array(a.length);
  let maxima = 0;
  let diferentes = 0;
  let acimaDe2 = 0;
  let acimaDe8 = 0;
  let acimaDe32 = 0;
  let soma = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) {
      const v = Math.abs(a[i + k]! - b[i + k]!);
      soma += v;
      if (v > d) d = v;
    }
    if (d > 0) diferentes++;
    if (d > 2) acimaDe2++;
    if (d > 8) acimaDe8++;
    if (d > 32) acimaDe32++;
    if (d > maxima) maxima = d;
    // mapa: a diferença ampliada, em vermelho, sobre a imagem em cinza escuro
    const cinza = Math.round((a[i]! + a[i + 1]! + a[i + 2]!) / 12);
    mapa[i] = d > 0 ? Math.min(255, 96 + d * 20) : cinza;
    mapa[i + 1] = cinza;
    mapa[i + 2] = cinza;
    mapa[i + 3] = 255;
  }
  const total = largura * altura;
  return { d: { largura, altura, maxima, diferentes, acimaDe2, acimaDe8, acimaDe32, media: Math.round((soma / a.length) * 10000) / 10000, porcentagemDiferente: Math.round((diferentes / total) * 100000) / 1000 }, mapa };
}
