// O ajuste de cor da foto (brilho, contraste, saturação) vai para o PSD como Níveis e Misturador de canais.
// Aqui a conta que o Photoshop faz com esses dois ajustes é refeita e comparada com a do motor do Otto.
import { referenciaDeAjusteDeCor } from '@otto/render';
import { describe, expect, it } from 'vitest';
import { misturaDaSaturacao, niveisDoBrilhoEContraste } from './montar';

/** Níveis do Photoshop com gama 1: a entrada é esticada entre o preto e o branco de entrada, e levada à faixa de saída. */
function niveis(v: number, n: ReturnType<typeof niveisDoBrilhoEContraste>): number {
  const t = Math.min(1, Math.max(0, (v - n.pretoDeEntrada) / (n.brancoDeEntrada - n.pretoDeEntrada)));
  return Math.round(n.pretoDeSaida + t * (n.brancoDeSaida - n.pretoDeSaida));
}
/** Misturador de canais do Photoshop: soma dos canais em porcento, mais a constante. */
function mistura(cor: [number, number, number], m: ReturnType<typeof misturaDaSaturacao>): [number, number, number] {
  const canal = (k: { vermelho: number; verde: number; azul: number; constante: number }): number =>
    Math.min(255, Math.max(0, Math.round((k.vermelho * cor[0] + k.verde * cor[1] + k.azul * cor[2]) / 100 + (k.constante / 100) * 255)));
  return [canal(m.vermelho), canal(m.verde), canal(m.azul)];
}

const CORES: [number, number, number][] = [];
for (const r of [0, 4, 21, 64, 128, 190, 250, 255]) for (const g of [0, 15, 90, 128, 200, 255]) for (const b of [0, 12, 100, 180, 255]) CORES.push([r, g, b]);
const doMotor = (cor: [number, number, number], ajuste: { brilho: number; contraste: number; saturacao: number }): number[] =>
  [...referenciaDeAjusteDeCor(Uint8Array.from([...cor, 255]), ajuste)].slice(0, 3);

describe('ajuste de cor da foto, como o Photoshop o refaz', () => {
  it('brilho e contraste como Níveis: a no máximo 2 níveis da conta do motor', () => {
    let maior = 0;
    for (const [brilho, contraste] of [
      [0, 10],
      [5, 12],
      [10, 20],
      [-82, -15],
      [0, 12],
      [30, 0],
      [-30, 0],
      [0, -60],
      [0, 100],
      [-100, 100],
      [100, -100],
      [40, 70],
    ] as const) {
      const n = niveisDoBrilhoEContraste(brilho, contraste);
      expect(n.brancoDeEntrada).toBeGreaterThan(n.pretoDeEntrada);
      for (const cor of CORES) {
        const esperado = doMotor(cor, { brilho, contraste, saturacao: 0 });
        cor.forEach((v, k) => {
          maior = Math.max(maior, Math.abs(niveis(v, n) - (esperado[k] as number)));
        });
      }
    }
    expect(maior).toBeLessThanOrEqual(2);
  });

  it('o preto que o Photoshop mostrava cinza: com contraste +10, o nível 4 vai a zero, como no motor', () => {
    const n = niveisDoBrilhoEContraste(0, 10);
    expect(niveis(4, n)).toBe(0);
    expect(doMotor([4, 0, 0], { brilho: 0, contraste: 10, saturacao: 0 })).toEqual([0, 0, 0]);
  });

  it('saturação como Misturador de canais: a no máximo 2 níveis da conta do motor, e o cinza continua cinza', () => {
    let maior = 0;
    for (const saturacao of [-100, -40, -35, -15, 6, 8, 50, 100]) {
      const m = misturaDaSaturacao(saturacao);
      for (const k of [m.vermelho, m.verde, m.azul]) expect(k.vermelho + k.verde + k.azul).toBe(100);
      expect(mistura([128, 128, 128], m)).toEqual([128, 128, 128]);
      for (const cor of CORES) {
        const esperado = doMotor(cor, { brilho: 0, contraste: 0, saturacao });
        mistura(cor, m).forEach((v, k) => {
          maior = Math.max(maior, Math.abs(v - (esperado[k] as number)));
        });
      }
    }
    expect(maior).toBeLessThanOrEqual(2);
  });

  it('os dois em sequência (Níveis embaixo, Misturador em cima) dão o ajuste inteiro do motor', () => {
    let maior = 0;
    const ajuste = { brilho: 5, contraste: 12, saturacao: 6 };
    for (const cor of CORES) {
      const n = niveisDoBrilhoEContraste(ajuste.brilho, ajuste.contraste);
      const depois = mistura([niveis(cor[0], n), niveis(cor[1], n), niveis(cor[2], n)], misturaDaSaturacao(ajuste.saturacao));
      const esperado = doMotor(cor, ajuste);
      depois.forEach((v, k) => {
        maior = Math.max(maior, Math.abs(v - (esperado[k] as number)));
      });
    }
    expect(maior).toBeLessThanOrEqual(3);
  });
});
