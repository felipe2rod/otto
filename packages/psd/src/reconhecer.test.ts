// O reconhecimento da importação é o avesso da exportação: o que nosDaForma e cantosDaFoto gravam tem de voltar igual.
import type { NoImagem } from '@otto/documento';
import { describe, expect, it } from 'vitest';
import { mapearNos, nosDaForma, subcaminhosDe } from './caminho';
import { cantosDaFoto } from './montar';
import type { CaminhoDoArquivo } from './porta';
import { caixaDosCaminhos, caminhosEmD, girar, proporMascaras, reconhecerForma, reconhecerFoto } from './reconhecer';

const caminho = (forma: 'retangulo' | 'elipse', x: number, y: number, w: number, h: number, raio: number, graus = 0): CaminhoDoArquivo => ({
  aberto: false,
  regra: 'nao-zero',
  nos: mapearNos(nosDaForma(forma, x, y, w, h, raio), girar(graus, x + w / 2, y + h / 2)),
});

describe('forma: o caminho que a exportação grava volta como a forma do Otto', () => {
  it('retângulo, retângulo arredondado e elipse, sem rotação', () => {
    expect(reconhecerForma(caminho('retangulo', 20, 30, 100, 70, 0))).toEqual({ forma: 'retangulo', x: 20, y: 30, largura: 100, altura: 70, raio: 0, rotacao: 0 });
    expect(reconhecerForma(caminho('retangulo', 140, 20, 100, 70, 18))).toEqual({ forma: 'retangulo', x: 140, y: 20, largura: 100, altura: 70, raio: 18, rotacao: 0 });
    expect(reconhecerForma(caminho('elipse', 260, 20, 120, 70, 0))).toEqual({ forma: 'elipse', x: 260, y: 20, largura: 120, altura: 70, raio: 0, rotacao: 0 });
  });

  it('girados: o ângulo volta, entre -45° e 45° (a 120° é o mesmo retângulo a 30° com os lados trocados)', () => {
    expect(reconhecerForma(caminho('retangulo', 40, 210, 120, 50, 0, 12))).toEqual({ forma: 'retangulo', x: 40, y: 210, largura: 120, altura: 50, raio: 0, rotacao: 12 });
    expect(reconhecerForma(caminho('retangulo', 40, 210, 120, 50, 10, -8))).toMatchObject({ forma: 'retangulo', largura: 120, altura: 50, raio: 10, rotacao: -8 });
    expect(reconhecerForma(caminho('elipse', 0, 0, 80, 40, 0, 30))).toMatchObject({ forma: 'elipse', largura: 80, altura: 40, rotacao: 30 });
    expect(reconhecerForma(caminho('retangulo', 0, 0, 120, 50, 0, 120))).toMatchObject({ forma: 'retangulo', largura: 50, altura: 120, rotacao: 30 });
  });

  it('começando em outro nó, ou no sentido contrário (o Photoshop não começa onde o Otto começa)', () => {
    const c = caminho('retangulo', 10, 10, 60, 40, 8);
    const deslocado = { ...c, nos: [...c.nos.slice(3), ...c.nos.slice(0, 3)] };
    const invertido = { ...c, nos: [...c.nos].reverse().map((n) => ({ ...n, chegada: n.saida, saida: n.chegada })) };
    expect(reconhecerForma(deslocado)).toMatchObject({ x: 10, y: 10, largura: 60, altura: 40, raio: 8 });
    expect(reconhecerForma(invertido)).toMatchObject({ x: 10, y: 10, largura: 60, altura: 40, raio: 8 });
  });

  it('o que não é retângulo nem elipse do Otto não é reconhecido: paralelogramo, canto com raio diferente, caminho aberto, triângulo', () => {
    const reto = caminho('retangulo', 0, 0, 100, 50, 0);
    const inclinado = {
      ...reto,
      nos: reto.nos.map((n, i) =>
        i < 2
          ? {
              ...n,
              ancora: [n.ancora[0] + 20, n.ancora[1]] as [number, number],
              chegada: [n.chegada[0] + 20, n.chegada[1]] as [number, number],
              saida: [n.saida[0] + 20, n.saida[1]] as [number, number],
            }
          : n,
      ),
    };
    expect(reconhecerForma(inclinado)).toBeUndefined();
    const arredondado = caminho('retangulo', 0, 0, 100, 50, 10);
    const tortinho = { ...arredondado, nos: arredondado.nos.map((n, i) => (i === 2 ? { ...n, ancora: [n.ancora[0], n.ancora[1] + 6] as [number, number] } : n)) };
    expect(reconhecerForma(tortinho)).toBeUndefined();
    expect(reconhecerForma({ ...reto, aberto: true })).toBeUndefined();
    expect(reconhecerForma({ ...reto, nos: reto.nos.slice(0, 3) })).toBeUndefined();
  });
});

describe('caminho livre: vira o "d" de um vetor do Otto', () => {
  it('o "d" só tem M, C e Z, na origem pedida, e o leitor de caminhos da exportação o aceita', () => {
    const c = caminho('elipse', 110, 20, 80, 80, 0);
    const d = caminhosEmD([c], 110, 20);
    expect(d).toMatch(/^M40 0C[\dC. -]+Z$/);
    expect(d.replace(/[\d. -]/g, '')).toBe('MCCCCZ');
    expect(subcaminhosDe(d)).toHaveLength(1);
    // aberto: sem o segmento de volta e sem Z
    expect(caminhosEmD([{ ...c, aberto: true }], 0, 0).replace(/[\d. -]/g, '')).toBe('MCCC');
  });

  it('a caixa é a das curvas, não a dos controles', () => {
    expect(caixaDosCaminhos([caminho('elipse', 10, 20, 80, 40, 0)])).toEqual({ x: 10, y: 20, largura: 80, altura: 40 });
    // uma curva só, de (0,0) a (100,0), com os controles lá em cima: a curva sobe até 75, não até 100
    const arco: CaminhoDoArquivo = {
      aberto: true,
      regra: 'nao-zero',
      nos: [
        { chegada: [0, 0], ancora: [0, 0], saida: [0, 100], ligado: false },
        { chegada: [100, 100], ancora: [100, 0], saida: [100, 0], ligado: false },
      ],
    };
    expect(caixaDosCaminhos([arco])).toEqual({ x: 0, y: 0, largura: 100, altura: 75 });
  });
});

describe('foto: os quatro cantos que a exportação grava voltam como caixa, foco e aproximação', () => {
  const foto = (extra: Partial<NoImagem>): NoImagem => ({ x: 10, y: 10, largura: 120, altura: 130, rotacao: 0, ajuste: 'cobrir', foco: { x: 0.5, y: 0.5 }, zoom: 1, ...extra }) as NoImagem;
  const cantosNoArquivo = (no: NoImagem, w = 1280, h = 853): number[] => {
    const c = cantosDaFoto(w, h, no);
    const f = girar(no.rotacao, no.x + no.largura / 2, no.y + no.altura / 2);
    return [0, 2, 4, 6].flatMap((i) => f(c[i] as number, c[i + 1] as number));
  };
  const caixaDe = (no: NoImagem) => ({ forma: 'retangulo' as const, x: no.x, y: no.y, largura: no.largura, altura: no.altura, raio: 0, rotacao: no.rotacao });

  it('cobrir, com foco e aproximação', () => {
    for (const no of [foto({}), foto({ foco: { x: 0.7, y: 0.6 }, zoom: 1.3 }), foto({ x: 0, y: 0, largura: 400, altura: 300, foco: { x: 0.5, y: 0.2 } })]) {
      const lida = reconhecerFoto(cantosNoArquivo(no), 1280, 853, caixaDe(no));
      expect(lida).toMatchObject({ x: no.x, y: no.y, largura: no.largura, altura: no.altura, ajuste: 'cobrir', rotacao: 0 });
      expect(lida?.zoom).toBeCloseTo(no.zoom, 3);
      // o foco no eixo em que a foto não sobra não muda nada: só confere o eixo em que sobra
      const refeitos = cantosDaFoto(1280, 853, { ...no, ...lida } as NoImagem);
      cantosDaFoto(1280, 853, no).forEach((v, i) => {
        expect(refeitos[i]).toBeCloseTo(v, 0);
      });
    }
  });

  it('conter, e girada', () => {
    expect(reconhecerFoto(cantosNoArquivo(foto({ ajuste: 'conter' })), 1280, 853, caixaDe(foto({})))).toMatchObject({ ajuste: 'conter', x: 10, y: 10, largura: 120, altura: 130 });
    const girada = foto({ rotacao: 10, x: 175, y: 90, largura: 50, altura: 66, ajuste: 'conter' });
    expect(reconhecerFoto(cantosNoArquivo(girada, 600, 800), 600, 800, caixaDe(girada))).toMatchObject({ rotacao: 10, x: 175, y: 90, largura: 50, altura: 66 });
  });

  it('sem forma de corte: a caixa é a própria foto', () => {
    expect(reconhecerFoto([44, 37, 258, 37, 258, 275, 44, 275], 500, 556.07, undefined)).toMatchObject({ x: 44, y: 37, largura: 214, altura: 238, ajuste: 'cobrir', zoom: 1 });
  });

  it('o que o Otto não tem não é reconhecido: escala diferente nos dois eixos, espelhada, inclinada, foto que não cobre a caixa', () => {
    expect(reconhecerFoto([0, 0, 200, 0, 200, 50, 0, 50], 100, 100, undefined)).toBeUndefined();
    expect(reconhecerFoto([100, 0, 0, 0, 0, 100, 100, 100], 100, 100, undefined)).toBeUndefined();
    expect(reconhecerFoto([0, 0, 100, 0, 130, 100, 30, 100], 100, 100, undefined)).toBeUndefined();
    // a foto ocupa só um canto da caixa de corte
    expect(reconhecerFoto([0, 0, 50, 0, 50, 50, 0, 50], 100, 100, { forma: 'retangulo', x: 0, y: 0, largura: 200, altura: 200, raio: 0, rotacao: 0 })).toBeUndefined();
  });
});

describe('máscara: propostas a partir do plano de cobertura', () => {
  it('um retângulo sem borda suave: a proposta é o retângulo', () => {
    const plano = new Uint8Array(100 * 80);
    for (let y = 20; y < 60; y++) for (let x = 10; x < 70; x++) plano[y * 100 + x] = 255;
    expect(proporMascaras(plano, 100, 80, { x: 0, y: 0, w: 100, h: 80 })[0]).toEqual({
      tipo: 'forma',
      forma: 'retangulo',
      x: 10,
      y: 20,
      largura: 60,
      altura: 40,
      raio: 0,
      suavizar: 0,
      inverter: false,
    });
  });

  it('um degradê na vertical, do opaco em baixo ao transparente em cima: 90°, com o começo e o fim', () => {
    const plano = new Uint8Array(100 * 200);
    // a 90° o degradê do Otto vai de baixo para cima: opaco até 20% do caminho, transparente a partir de 90%
    for (let y = 0; y < 200; y++) {
      const t = (200 - (y + 0.5)) / 200;
      const v = Math.round(255 * Math.max(0, Math.min(1, (0.9 - t) / 0.7)));
      for (let x = 0; x < 100; x++) plano[y * 100 + x] = v;
    }
    const propostas = proporMascaras(plano, 100, 200, { x: 0, y: 0, w: 100, h: 200 });
    expect(propostas.find((m) => m.tipo === 'degrade')).toEqual({ tipo: 'degrade', angulo: 90, inicio: 0.2, fim: 0.9 });
  });

  it('plano uniforme: nenhuma proposta de degradê', () => {
    expect(proporMascaras(new Uint8Array(50 * 50).fill(255), 50, 50, { x: 0, y: 0, w: 50, h: 50 }).filter((m) => m.tipo === 'degrade')).toEqual([]);
  });
});
