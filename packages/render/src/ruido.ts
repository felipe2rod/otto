// Ruído por posição: o valor depende só da célula (x, y), do canal e da semente.
// O ruído da POC era uma sequência (um sorteio depois do outro, pixel a pixel): não serve à GPU, que calcula
// cada pixel sozinho. Este é uma função: o laço de pixel (CPU) e o shader (GPU) chegam ao mesmo grão.
//
// A conta só usa inteiros abaixo de 2^24, que o ponto flutuante de 32 bits da GPU representa sem erro:
// dois polinômios de permutação aninhados (módulos 289 e 361, à maneira do ruído de Gustavson e McEwan),
// combinados para o padrão só se repetir a cada 104.329 px.

/** Resto de inteiro que não erra quando x é múltiplo exato de y (a divisão da GPU pode dar 1,9999999). */
const resto = (x: number, y: number): number => x - y * Math.floor((x + 0.5) / y);
const permutar289 = (x: number): number => resto((34 * x + 1) * x, 289);
const permutar361 = (x: number): number => resto((38 * x + 1) * x, 361);

/** Ruído uniforme em [0, 1) para a célula (ix, iy), o canal (0, 1 ou 2) e a semente (inteiro abaixo de 104.729). */
export function ruidoEm(ix: number, iy: number, canal: number, semente: number): number {
  const s = semente + canal * 71;
  const a = permutar289(resto(permutar289(resto(permutar289(resto(ix, 289)) + resto(iy, 289), 289)) + resto(s, 289), 289));
  const b = permutar361(resto(permutar361(resto(permutar361(resto(ix, 361)) + resto(iy, 361), 361)) + resto(s, 361), 361));
  return resto(a * 361 + b * 289, 104329) / 104329;
}

/** A mesma conta, em SkSL. */
export const RUIDO_SKSL = `
float resto(float x, float y) { return x - y * floor((x + 0.5) / y); }
float permutar289(float x) { return resto((34.0 * x + 1.0) * x, 289.0); }
float permutar361(float x) { return resto((38.0 * x + 1.0) * x, 361.0); }
float ruidoEm(vec2 celula, float canal, float semente) {
  float s = semente + canal * 71.0;
  float a = permutar289(resto(permutar289(resto(permutar289(resto(celula.x, 289.0)) + resto(celula.y, 289.0), 289.0)) + resto(s, 289.0), 289.0));
  float b = permutar361(resto(permutar361(resto(permutar361(resto(celula.x, 361.0)) + resto(celula.y, 361.0), 361.0)) + resto(s, 361.0), 361.0));
  return resto(a * 361.0 + b * 289.0, 104329.0) / 104329.0;
}`;

/** Semente do grão de uma camada: sai do id dela, para o mesmo documento dar sempre o mesmo grão. */
export function sementeDe(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 104729;
}
