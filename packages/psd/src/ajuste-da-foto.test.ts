// O ajuste de cor da foto (brilho, contraste, saturação) vai para o PSD como Níveis e Misturador de canais.
// Aqui a conta que o Photoshop faz com esses dois ajustes é refeita e comparada com a do motor do Otto.
import { referenciaDeAjusteDeCor } from '@otto/render';
import { describe, expect, it } from 'vitest';
import { brilhoEContrasteDe, saturacaoDe } from './desmontar';
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

describe('de volta: do Níveis e do Misturador de canais para o ajuste de cor da foto (importação)', () => {
  it('toda saturação inteira volta num valor que dá o mesmo Misturador', () => {
    for (let s = -100; s <= 100; s++) {
      if (s === 0) continue;
      const m = misturaDaSaturacao(s);
      const voltou = saturacaoDe(m);
      expect(voltou, `saturação ${s}`).toBeDefined();
      expect(misturaDaSaturacao(voltou as number), `saturação ${s}`).toEqual(m);
      // e, fora o arredondamento dos pesos, é a mesma saturação
      expect(Math.abs((voltou as number) - s), `saturação ${s}`).toBeLessThanOrEqual(1);
    }
  });

  it('um Misturador que não é de saturação (canais trocados, constante, monocromático) não é reconhecido', () => {
    const base = misturaDaSaturacao(-40);
    expect(saturacaoDe({ ...base, vermelho: { ...base.vermelho, constante: 10 } })).toBeUndefined();
    expect(saturacaoDe({ ...base, vermelho: base.verde })).toBeUndefined();
    expect(
      saturacaoDe({
        vermelho: { vermelho: 100, verde: 0, azul: 0, constante: 0 },
        verde: { vermelho: 0, verde: 100, azul: 0, constante: 0 },
        azul: { vermelho: 0, verde: 0, azul: 100, constante: 0 },
      }),
    ).toBeUndefined();
  });

  it('todo par de brilho e contraste inteiros volta num par que dá o mesmo Níveis (quando a reta não é plana)', () => {
    let iguais = 0;
    let total = 0;
    for (let b = -100; b <= 100; b += 7) {
      for (let c = -100; c <= 100; c += 3) {
        if (b === 0 && c === 0) continue;
        const n = niveisDoBrilhoEContraste(b, c);
        // reta plana (uma cor só): não há par a recuperar, e a camada fica como Níveis
        if (n.pretoDeEntrada === 0 && n.brancoDeEntrada === 255 && n.pretoDeSaida === n.brancoDeSaida) continue;
        total++;
        const voltou = brilhoEContrasteDe(n);
        if (!voltou) continue;
        expect(niveisDoBrilhoEContraste(voltou.brilho, voltou.contraste), `brilho ${b}, contraste ${c}`).toEqual(n);
        iguais++;
      }
    }
    // os poucos que não voltam ficam como camada de Níveis presa à foto: a aparência é a mesma, a árvore não
    expect(iguais / total).toBeGreaterThan(0.97);
  });

  it('Níveis com gama, ou que não é a reta de brilho e contraste, não é reconhecido', () => {
    expect(brilhoEContrasteDe({ tipo: 'niveis', pretoDeEntrada: 10, brancoDeEntrada: 240, gama: 1.2, pretoDeSaida: 0, brancoDeSaida: 255 })).toBeUndefined();
    expect(brilhoEContrasteDe({ tipo: 'niveis', pretoDeEntrada: 0, brancoDeEntrada: 255, gama: 1, pretoDeSaida: 200, brancoDeSaida: 20 })).toBeUndefined();
  });
});
