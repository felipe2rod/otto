// O que a exportação (packages/psd) pede ao motor além do render da prancheta: a máscara como imagem de cobertura,
// o nome PostScript da fonte, a regra de escolha do arquivo de fonte e o PNG.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { No } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ajuste, FOTO, forma, grupo, idDe, imagem, novaSessao, peca, SUJEITO_DA_FOTO } from './apoio-de-teste';
import { codificarPng, renderizarMascara, renderizarPrancheta } from './compositor';
import { nomePostScript } from './opentype';
import type { Sessao } from './sessao';
import { escolherFonte } from './texto';

let ck: CanvasKit;
let sessao: Sessao;
beforeAll(async () => {
  ({ ck, sessao } = await novaSessao());
});

const fonte = (arquivo: string) => new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../recursos-de-teste/fontes', arquivo)));

describe('nome PostScript da fonte', () => {
  it('lê o nome que o Photoshop procura', () => {
    expect(nomePostScript(fonte('Anton-Regular.ttf'))).toBe('Anton-Regular');
    expect(nomePostScript(fonte('IBMPlexSans-Bold.ttf'))).toBe('IBMPlexSans-Bold');
    expect(nomePostScript(fonte('DMSerifDisplay-Regular.ttf'))).toBe('DMSerifDisplay-Regular');
  });

  it('arquivo que não é fonte, ou cortado, devolve undefined, sem exceção', () => {
    expect(nomePostScript(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(nomePostScript(new Uint8Array(0))).toBeUndefined();
    expect(nomePostScript(fonte('Anton-Regular.ttf').slice(0, 300))).toBeUndefined();
  });
});

describe('escolha do arquivo de fonte', () => {
  const fontes = [
    { familia: 'Plex', peso: 400 },
    { familia: 'Plex', peso: 700 },
    { familia: 'Anton', peso: 400 },
  ];
  it('o peso mais próximo dentro da família; empate fica com o primeiro; sem a família, nada', () => {
    expect(escolherFonte(fontes, 'Plex', 700)).toEqual({ familia: 'Plex', peso: 700 });
    expect(escolherFonte(fontes, 'Plex', 600)).toEqual({ familia: 'Plex', peso: 700 });
    expect(escolherFonte(fontes, 'Plex', 300)).toEqual({ familia: 'Plex', peso: 400 });
    expect(escolherFonte(fontes, 'Plex', 550)).toEqual({ familia: 'Plex', peso: 400 });
    expect(escolherFonte(fontes, 'Anton', 700)).toEqual({ familia: 'Anton', peso: 400 });
    expect(escolherFonte(fontes, 'Helvetica', 400)).toBeUndefined();
  });
});

describe('máscara como imagem de cobertura', () => {
  /** A máscara vale se, aplicada a uma camada branca sobre preto, der o que o render dá. */
  function confere(no: Parameters<typeof peca>[0][number]) {
    const { doc, p } = peca([no], { fundo: '#000000' });
    const m = renderizarMascara(sessao, doc, p, p.filhos[0] as No);
    const r = renderizarPrancheta(sessao, doc, p);
    return { m, r, p };
  }

  it('nó sem máscara: undefined', () => {
    const { doc, p } = peca([forma('f', 0, 0, 50, 50, '#ffffff')]);
    expect(renderizarMascara(sessao, doc, p, p.filhos[0] as No)).toBeUndefined();
  });

  it('máscara de forma e em degradê: a cobertura é o que o render mostra de uma camada branca sobre preto', () => {
    for (const mascara of [
      { tipo: 'forma', forma: 'elipse', x: 40, y: 40, largura: 100, altura: 80, suavizar: 6 },
      { tipo: 'forma', forma: 'retangulo', x: 60, y: 60, largura: 80, altura: 80, raio: 12, inverter: true },
      { tipo: 'degrade', angulo: 0, inicio: 0.2, fim: 0.9 },
      { tipo: 'degrade', angulo: 90, inicio: 0, fim: 1 },
    ]) {
      const { m, r, p } = confere(forma('f', 0, 0, 200, 200, '#ffffff', { mascara }));
      expect(m?.largura).toBe(p.largura);
      expect(m?.altura).toBe(p.altura);
      let maior = 0;
      for (let i = 0; i < p.largura * p.altura; i++) maior = Math.max(maior, Math.abs((m?.cobertura[i] as number) - (r.rgba[i * 4] as number)));
      expect(maior).toBeLessThanOrEqual(1);
    }
  });

  it('máscara de sujeito: a cobertura é o alfa da máscara, com o enquadramento da foto; fora da foto, zero', () => {
    const { doc, p } = peca([imagem('foto', FOTO, 20, 20, 160, 120, { mascara: { tipo: 'sujeito', arquivo: SUJEITO_DA_FOTO } })], { fundo: '#000000' });
    const m = renderizarMascara(sessao, doc, p, p.filhos[0] as No);
    const r = renderizarPrancheta(sessao, doc, p, { fundo: false });
    expect(m).toBeDefined();
    let maior = 0;
    for (let i = 0; i < p.largura * p.altura; i++) maior = Math.max(maior, Math.abs((m?.cobertura[i] as number) - (r.rgba[i * 4 + 3] as number)));
    // a foto é opaca: o alfa do render é a própria cobertura
    expect(maior).toBeLessThanOrEqual(1);
    expect(m?.cobertura[5 * 200 + 5]).toBe(0);
  });

  it('em grupo, a máscara em degradê vale sobre a caixa do conteúdo; em camada de ajuste, sobre a prancheta', () => {
    const { doc, p } = peca([
      grupo('g', [forma('f', 50, 50, 100, 100, '#ffffff')], { mascara: { tipo: 'degrade', angulo: 0, inicio: 0, fim: 1 } }),
      ajuste('a', { tipo: 'preto-e-branco' }, { mascara: { tipo: 'degrade', angulo: 0, inicio: 0, fim: 1 } }),
    ]);
    const doGrupo = renderizarMascara(sessao, doc, p, p.filhos[0] as No);
    const doAjuste = renderizarMascara(sessao, doc, p, p.filhos[1] as No);
    const em = (m: typeof doGrupo, x: number) => m?.cobertura[100 * 200 + x] as number;
    // no grupo o degradê vai de x 50 a 150; no ajuste, de 0 a 200
    expect(em(doGrupo, 100)).toBeGreaterThan(em(doAjuste, 100) - 3);
    expect(Math.abs(em(doGrupo, 100) - 128)).toBeLessThanOrEqual(3);
    expect(Math.abs(em(doAjuste, 100) - 128)).toBeLessThanOrEqual(3);
    expect(Math.abs(em(doGrupo, 75) - em(doAjuste, 50))).toBeLessThanOrEqual(3);
    expect(idDe(doc, 'g')).toBeTruthy();
  });
});

describe('PNG', () => {
  it('codifica o render e, decodificado, devolve os mesmos pixels', () => {
    const { doc, p } = peca([forma('f', 10, 10, 60, 60, '#ff8000', { opacidade: 0.5 })], { largura: 80, altura: 80 });
    const r = renderizarPrancheta(sessao, doc, p, { fundo: false });
    const png = codificarPng(sessao, r);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const img = ck.MakeImageFromEncoded(png);
    const lido = img?.readPixels(0, 0, { width: 80, height: 80, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
    img?.delete();
    expect(Buffer.compare(Buffer.from(lido), Buffer.from(r.rgba))).toBe(0);
  });
});
