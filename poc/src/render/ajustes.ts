// Ajuste de cor da foto, aplicado em pixel. A ordem é a da pilha que vai para o PSD
// (camadas de ajuste com máscara de recorte sobre a foto): brilho/contraste, matiz/saturação, mapa de degradê.
// As fórmulas aproximam as do Photoshop; o PSD guarda o ajuste editável e o Photoshop recalcula.

export interface AjusteDeCor {
  /** -100 a 100 */
  brilho: number;
  /** -100 a 100 */
  contraste: number;
  /** -100 (preto e branco) a 100 */
  saturacao: number;
  /** mapa de degradê de duas cores: sombras e luzes */
  duotone?: { sombras: string; luzes: string };
}

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const limitar = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function aplicarAjusteDeCor(dados: Uint8ClampedArray, a: AjusteDeCor): void {
  const b = a.brilho * 1.5;
  // contraste em torno do cinza médio
  const c = a.contraste >= 0 ? 1 + a.contraste / 50 : 1 + a.contraste / 100;
  const s = 1 + a.saturacao / 100;
  const escuro = a.duotone ? hex(a.duotone.sombras) : undefined;
  const claro = a.duotone ? hex(a.duotone.luzes) : undefined;
  for (let i = 0; i < dados.length; i += 4) {
    let r = dados[i]!;
    let g = dados[i + 1]!;
    let bl = dados[i + 2]!;
    if (b !== 0 || c !== 1) {
      r = limitar((r - 128) * c + 128 + b);
      g = limitar((g - 128) * c + 128 + b);
      bl = limitar((bl - 128) * c + 128 + b);
    }
    if (s !== 1) {
      const cinza = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = limitar(cinza + (r - cinza) * s);
      g = limitar(cinza + (g - cinza) * s);
      bl = limitar(cinza + (bl - cinza) * s);
    }
    if (escuro && claro) {
      const t = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
      r = escuro[0] + (claro[0] - escuro[0]) * t;
      g = escuro[1] + (claro[1] - escuro[1]) * t;
      bl = escuro[2] + (claro[2] - escuro[2]) * t;
    }
    dados[i] = r;
    dados[i + 1] = g;
    dados[i + 2] = bl;
  }
}

export function ajusteNeutro(a: AjusteDeCor | undefined): boolean {
  return !a || (a.brilho === 0 && a.contraste === 0 && a.saturacao === 0 && !a.duotone);
}
