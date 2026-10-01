// O motor tem dois jeitos de calcular modo de mesclagem não nativo e camada de ajuste:
// por shader (SkSL), que é o da GPU, e por laço de pixel, que é o do raster de CPU.
// Os dois precisam dar o mesmo resultado, ou o editor (GPU) e o servidor (CPU) divergem.
import { beforeAll, describe, expect, it } from 'vitest';
import { cenasDeParidade } from '../src/cenas/cenas.ts';
import { renderizarPrancheta } from '../src/motor/compositor.ts';
import { ajustarPremultiplicado, mesclarPremultiplicado } from '../src/motor/pixel.ts';
import { referenciaDeAjuste } from '../src/motor/ajustes.ts';
import { MODOS_POR_SHADER, referenciaDeMesclagem } from '../src/motor/mesclagem.ts';
import { criarSessao, type Sessao } from '../src/motor/sessao.ts';
import type { Ajuste, No } from '../src/motor/tipos.ts';
import { canvasKit, carregarFontes, carregarImagens } from '../src/node/carregar.ts';
import { diferencaMaxima, pixelsAleatorios, prancheta } from './apoio.ts';

let sessao: Sessao;
beforeAll(async () => {
  sessao = criarSessao(await canvasKit(), { fontes: await carregarFontes(), imagens: await carregarImagens() });
});

const premultiplicar = (d: Uint8Array): Uint8Array => {
  const s = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    s[i] = Math.round(d[i]! * a);
    s[i + 1] = Math.round(d[i + 1]! * a);
    s[i + 2] = Math.round(d[i + 2]! * a);
    s[i + 3] = d[i + 3]!;
  }
  return s;
};
const desfazer = (d: Uint8Array): Uint8Array => {
  const s = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    s[i] = a ? Math.round((d[i]! * 255) / a) : 0;
    s[i + 1] = a ? Math.round((d[i + 1]! * 255) / a) : 0;
    s[i + 2] = a ? Math.round((d[i + 2]! * 255) / a) : 0;
    s[i + 3] = a;
  }
  return s;
};

describe('laço de pixel sobre memória premultiplicada', () => {
  const LADO = 64;
  const fundo = pixelsAleatorios(LADO * LADO, 11, 'opaco');
  const cima = pixelsAleatorios(LADO * LADO, 23, 'opaco');

  for (const modo of MODOS_POR_SHADER) {
    it(`${modo}: igual à fórmula de referência, a 1 nível`, () => {
      for (const opacidade of [1, 0.6]) {
        const destino = premultiplicar(fundo);
        mesclarPremultiplicado(destino, LADO, 0, 0, premultiplicar(cima), LADO, LADO, modo, opacidade);
        expect(diferencaMaxima(desfazer(destino), referenciaDeMesclagem(fundo, cima, modo, opacidade))).toBeLessThanOrEqual(1);
      }
    });
  }

  it('mescla só a região da origem, no deslocamento pedido', () => {
    const destino = new Uint8Array(8 * 8 * 4).fill(255);
    const origem = new Uint8Array(2 * 2 * 4).fill(255);
    mesclarPremultiplicado(destino, 8, 3, 4, origem, 2, 2, 'subtrair', 1);
    const em = (x: number, y: number): number => destino[(y * 8 + x) * 4]!;
    expect(em(3, 4)).toBe(0);
    expect(em(4, 5)).toBe(0);
    expect(em(2, 4)).toBe(255);
    expect(em(5, 5)).toBe(255);
  });

  const ajustes: Ajuste[] = [
    { tipo: 'matiz-saturacao', matiz: 40, saturacao: 30, luminosidade: -10 },
    { tipo: 'brilho-contraste', brilho: 20, contraste: 40 },
    { tipo: 'niveis', pretoDeEntrada: 30, brancoDeEntrada: 220, gama: 1.4, pretoDeSaida: 10, brancoDeSaida: 245 },
    { tipo: 'preto-e-branco' },
  ];
  for (const ajuste of ajustes) {
    it(`ajuste ${ajuste.tipo}: igual à fórmula de referência, a 1 nível`, () => {
      const destino = premultiplicar(fundo);
      const cobertura = new Uint8Array(fundo.length).fill(255);
      ajustarPremultiplicado(destino, cobertura, ajuste, 1);
      expect(diferencaMaxima(destino, referenciaDeAjuste(fundo, ajuste))).toBeLessThanOrEqual(1);
    });
  }

  it('ajuste respeita a cobertura (máscara × opacidade)', () => {
    const destino = new Uint8Array([200, 40, 40, 255, 200, 40, 40, 255]);
    const cobertura = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0]);
    ajustarPremultiplicado(destino, cobertura, { tipo: 'preto-e-branco' }, 1);
    expect(destino[0]).toBe(destino[1]);
    expect([...destino.slice(4, 8)]).toEqual([200, 40, 40, 255]);
  });
});

describe('os dois cálculos dão o mesmo render', () => {
  const comparar = (filhos: No[], largura = 300, altura = 300): number => {
    const p = prancheta(largura, altura, filhos, '#3b6ea5');
    return diferencaMaxima(renderizarPrancheta(sessao, p, { calculo: 'pixel' }).rgba, renderizarPrancheta(sessao, p, { calculo: 'shader' }).rgba);
  };
  const foto: No = { id: 'f', nome: 'f', tipo: 'imagem', arquivo: 'foto-paisagem', x: 0, y: 0, largura: 300, altura: 300, ajuste: 'cobrir' };
  const disco = (extra: object): No => ({ id: 'd', nome: 'd', tipo: 'forma', forma: 'elipse', x: 40, y: 40, largura: 200, altura: 180, preenchimento: { tipo: 'radial', angulo: 0, paradas: [{ cor: '#ffd166', posicao: 0 }, { cor: '#118ab2', posicao: 1, opacidade: 0.6 }] }, ...extra }) as No;

  for (const modo of MODOS_POR_SHADER) {
    it(`${modo} com opacidade, borda antisserrilhada e sombra: no máximo 2 níveis`, () => {
      expect(comparar([foto, disco({ modoDeMesclagem: modo, opacidade: 0.8, sombra: { cor: '#000000', opacidade: 0.5, angulo: 120, distancia: 8, desfoque: 10 } })])).toBeLessThanOrEqual(2);
    });
  }

  it('grupo com modo por cálculo próprio, com filho que também usa: no máximo 2 níveis', () => {
    expect(comparar([foto, { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'luz-linear', opacidade: 0.7, filhos: [disco({}), { ...disco({ modoDeMesclagem: 'subtrair' }), id: 'd2', x: 120 } as No] }])).toBeLessThanOrEqual(2);
  });

  it('ajuste dentro de grupo isolado só enxerga o grupo: no máximo 2 níveis', () => {
    expect(comparar([foto, { id: 'g', nome: 'g', tipo: 'grupo', modoDeMesclagem: 'normal', opacidade: 0.9, filhos: [disco({}), { id: 'aj', nome: 'aj', tipo: 'ajuste', ajuste: { tipo: 'matiz-saturacao', matiz: 90, saturacao: 20, luminosidade: 0 } }] }])).toBeLessThanOrEqual(2);
  });

  it('máscara de recorte com modo por cálculo próprio na camada presa: no máximo 2 níveis', () => {
    expect(comparar([foto, disco({}), { id: 'r', nome: 'r', tipo: 'forma', forma: 'retangulo', x: 0, y: 100, largura: 300, altura: 100, preenchimento: '#ff3366', recortadaNaDeBaixo: true, modoDeMesclagem: 'luz-intensa' }])).toBeLessThanOrEqual(2);
  });

  const mascaras = {
    'sem máscara': undefined,
    'em degradê': { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.8 },
    'de forma suave': { tipo: 'forma', forma: 'elipse', x: 60, y: 60, largura: 180, altura: 180, raio: 0, suavizar: 12, inverter: false },
    'de forma invertida': { tipo: 'forma', forma: 'elipse', x: 60, y: 60, largura: 180, altura: 180, raio: 0, suavizar: 12, inverter: true },
  } as const;
  for (const [nome, mascara] of Object.entries(mascaras)) {
    it(`um ajuste ${nome}, com opacidade: no máximo 1 nível`, () => {
      const matiz: No = { id: 'a1', nome: 'a1', tipo: 'ajuste', opacidade: 0.8, ajuste: { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30, luminosidade: 0 }, ...(mascara ? { mascara } : {}) };
      const niveis: No = { id: 'a2', nome: 'a2', tipo: 'ajuste', opacidade: 0.7, ajuste: { tipo: 'niveis', pretoDeEntrada: 20, brancoDeEntrada: 200, gama: 1.3, pretoDeSaida: 0, brancoDeSaida: 255 }, ...(mascara ? { mascara } : {}) };
      expect(comparar([foto, matiz])).toBeLessThanOrEqual(1);
      expect(comparar([foto, niveis])).toBeLessThanOrEqual(1);
    });
  }

  it('ajustes empilhados somam o arredondamento: 1 nível por operação vira até 4 com dois ajustes que aumentam contraste', () => {
    // medido no spike: cada ajuste sozinho difere em 1 nível; o segundo ajuste amplia a diferença do primeiro
    const d = comparar([
      foto,
      { id: 'a1', nome: 'a1', tipo: 'ajuste', ajuste: { tipo: 'matiz-saturacao', matiz: 150, saturacao: 30, luminosidade: 0 }, mascara: mascaras['em degradê'] },
      { id: 'a2', nome: 'a2', tipo: 'ajuste', opacidade: 0.7, ajuste: { tipo: 'niveis', pretoDeEntrada: 20, brancoDeEntrada: 200, gama: 1.3, pretoDeSaida: 0, brancoDeSaida: 255 }, mascara: mascaras['de forma invertida'] },
    ]);
    expect(d).toBeLessThanOrEqual(4);
  });

  // limite por cena: 2 níveis, e 4 na cena que empilha quatro camadas de ajuste
  for (const [nome, limite] of [['mesclagem', 2], ['mascaras', 2], ['ajustes', 4], ['peca', 2]] as const) {
    it(`cena "${nome}" inteira: no máximo ${limite} níveis`, () => {
      const cena = cenasDeParidade().find((c) => c.nome === nome)!;
      const a = renderizarPrancheta(sessao, cena.prancheta, { calculo: 'pixel' });
      const b = renderizarPrancheta(sessao, cena.prancheta, { calculo: 'shader' });
      expect(diferencaMaxima(a.rgba, b.rgba)).toBeLessThanOrEqual(limite);
    }, 120_000);
  }
});
