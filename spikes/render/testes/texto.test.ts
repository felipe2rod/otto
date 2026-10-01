import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderizarPrancheta } from '../src/motor/compositor.ts';
import { recursosOpenType } from '../src/motor/opentype.ts';
import type { Sessao } from '../src/motor/sessao.ts';
import type { NoTexto } from '../src/motor/tipos.ts';
import { PASTA_FONTES } from '../src/node/carregar.ts';
import { caixaDaTinta, novaSessao, prancheta } from './apoio.ts';

let ck: CanvasKit;
let sessao: Sessao;

beforeAll(async () => {
  ({ ck, sessao } = await novaSessao());
});

function texto(parcial: Partial<NoTexto> & Pick<NoTexto, 'conteudo'>): NoTexto {
  return { id: 't', nome: 'Texto', tipo: 'texto', x: 40, y: 40, largura: 520, altura: 300, fonte: 'IBM Plex Sans', peso: 400, tamanho: 32, cor: '#000000', entrelinha: 1.2, espacamento: 0, alinhamento: 'esquerda', ...parcial };
}

/** Renderiza só o texto, sem fundo, e mede onde há pixel. */
function tintaNoRaster(no: NoTexto): { x: number; y: number; w: number; h: number } {
  const r = renderizarPrancheta(sessao, prancheta(600, 400, [no]), { fundo: false });
  return caixaDaTinta(r.rgba, r.largura, r.altura);
}

describe('recursos OpenType lidos do arquivo de fonte', () => {
  it('Anton declara versalete desenhado (smcp); IBM Plex Sans e a Playfair do Google Fonts não', async () => {
    const playfair = recursosOpenType(new Uint8Array(await readFile(path.join(PASTA_FONTES, 'google/PlayfairDisplay-600.ttf'))));
    const plex = recursosOpenType(new Uint8Array(await readFile(path.join(PASTA_FONTES, 'IBMPlexSans-Regular.ttf'))));
    const anton = recursosOpenType(new Uint8Array(await readFile(path.join(PASTA_FONTES, 'Anton-Regular.ttf'))));
    expect(anton.gsub).toContain('smcp');
    // o arquivo estático que o Google Fonts entrega é um recorte: o smcp da Playfair original não vem
    expect(playfair.gsub).not.toContain('smcp');
    expect(plex.gsub).not.toContain('smcp');
    expect(plex.gpos).toContain('kern');
  });
});

describe('texto com o módulo de parágrafo do Skia', () => {
  it('quebra o parágrafo dentro da caixa, sem linha mais larga que ela', () => {
    const d = sessao.texto.diagramar(texto({ conteudo: 'O agente faz a produção, você faz o design. Texto em caixa quebra por palavra e nunca passa da largura da camada.', largura: 300 }));
    expect(d.linhas.length).toBeGreaterThan(3);
    for (const l of d.linhas) expect(l.largura).toBeLessThanOrEqual(300.5);
    expect(d.fonteEncontrada).toBe(true);
    expect(d.glifosAusentes).toBe(0);
  });

  it('respeita a quebra manual (\\n)', () => {
    const d = sessao.texto.diagramar(texto({ conteudo: 'Um\nDois\nTrês' }));
    expect(d.linhas).toHaveLength(3);
  });

  const casos: [string, NoTexto][] = [
    ['título em Anton', texto({ conteudo: 'JAZZ NA PRAÇA', fonte: 'Anton', tamanho: 96 })],
    ['parágrafo com acentos e descendentes', texto({ conteudo: 'Açaí, pão de queijo e guaraná gelado na praça às 19h.', largura: 320, tamanho: 28 })],
    ['centralizado', texto({ conteudo: 'Sábado\n20 de junho', alinhamento: 'centro', fonte: 'DM Serif Display', tamanho: 48 })],
    ['à direita com tracking', texto({ conteudo: 'ENTRADA FRANCA', alinhamento: 'direita', espacamento: 200, peso: 700, tamanho: 24 })],
    ['trechos de corpo e fonte diferentes', texto({ conteudo: 'A partir de R$ 19,90 por pessoa', tamanho: 28, trechos: [{ inicio: 12, fim: 20, fonte: 'Anton', tamanho: 72, cor: '#c2410c' }] })],
    ['serifada com itálico ausente', texto({ conteudo: 'Fígado, jiló & quiabo', fonte: 'Instrument Serif', tamanho: 64 })],
  ];
  for (const [nome, no] of casos) {
    it(`mede a tinta onde as letras estão, a 1 px do raster: ${nome}`, () => {
      const medida = sessao.texto.diagramar(no).tinta;
      const raster = tintaNoRaster(no);
      // o raster tem antisserrilhado: a tinta medida pode ser até 1 px menor em cada borda
      expect(Math.abs(medida.x - raster.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.y - raster.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.x + medida.w - (raster.x + raster.w))).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.y + medida.h - (raster.y + raster.h))).toBeLessThanOrEqual(1);
    });
  }

  it('a tinta é mais estreita que a caixa da fonte (é a diferença que o lint da POC precisava)', () => {
    const no = texto({ conteudo: 'xoxo', tamanho: 80 });
    const d = sessao.texto.diagramar(no);
    expect(d.tinta.y).toBeGreaterThan(no.y + 10);
    expect(d.tinta.h).toBeLessThan(d.alturaUsada - 20);
  });

  it('tracking por trecho alarga só o trecho, em milésimos de eme', () => {
    const base = texto({ conteudo: 'PROMOÇÃO de hoje', tamanho: 40 });
    const comTracking = texto({ conteudo: 'PROMOÇÃO de hoje', tamanho: 40, trechos: [{ inicio: 0, fim: 8, espacamento: 250 }] });
    const l0 = sessao.texto.diagramar(base).linhas[0]!.largura;
    const l1 = sessao.texto.diagramar(comTracking).linhas[0]!.largura;
    // 8 letras × 250/1000 × 40 px
    expect(l1 - l0).toBeCloseTo(8 * 0.25 * 40, 0);
  });

  it('primeira linha encosta a ascendente da fonte no topo; as seguintes descem corpo × entrelinha', () => {
    const no = texto({ conteudo: 'Um\nDois\nTrês', tamanho: 50, entrelinha: 1.4 });
    const d = sessao.texto.diagramar(no);
    const ascendente = sessao.texto.metricas(no.fonte, no.peso, no.tamanho).ascendente;
    // medido no spike: o parágrafo do Skia encaixa a linha de base em pixel inteiro (aqui 51,25 vira 51).
    // É até meio pixel de diferença para a métrica da fonte, e conta no orçamento de 1 px do ADR 028.
    expect(Number.isInteger(d.linhas[0]!.base)).toBe(true);
    expect(Math.abs(d.linhas[0]!.base - (no.y + ascendente))).toBeLessThanOrEqual(0.5);
    expect(d.linhas[1]!.base - d.linhas[0]!.base).toBeCloseTo(50 * 1.4, 1);
    expect(d.linhas[2]!.base - d.linhas[1]!.base).toBeCloseTo(50 * 1.4, 1);
  });

  it('kerning da fonte desligado muda a largura de um par com kerning', () => {
    const ligado = sessao.texto.diagramar(texto({ conteudo: 'AVATAR', fonte: 'DM Serif Display', tamanho: 80 })).linhas[0]!.largura;
    const desligado = sessao.texto.diagramar(texto({ conteudo: 'AVATAR', fonte: 'DM Serif Display', tamanho: 80, kerning: 'nenhum' })).linhas[0]!.largura;
    expect(desligado).toBeGreaterThan(ligado + 1);
  });

  it('smcp: usa o versalete desenhado quando a fonte tem, e a largura muda', () => {
    const normal = texto({ conteudo: 'Versalete de verdade', fonte: 'Anton', tamanho: 48 });
    const versalete = { ...normal, recursosOpenType: ['smcp'] };
    const a = sessao.texto.diagramar(normal);
    const b = sessao.texto.diagramar(versalete);
    expect(b.linhas[0]!.largura).not.toBeCloseTo(a.linhas[0]!.largura, 0);
    // versalete tem a altura de x, não a da ascendente: a tinta do "l" e do "d" baixa
    expect(tintaNoRaster({ ...versalete, conteudo: 'ldb' }).h).toBeLessThan(tintaNoRaster({ ...normal, conteudo: 'ldb' }).h - 4);
  });

  it('smcp em fonte sem o recurso não muda nada (o versalete sintético continua necessário nelas)', () => {
    const normal = texto({ conteudo: 'Sem versalete', tamanho: 48 });
    const a = sessao.texto.diagramar(normal);
    const b = sessao.texto.diagramar({ ...normal, recursosOpenType: ['smcp'] });
    expect(b.linhas[0]!.largura).toBeCloseTo(a.linhas[0]!.largura, 3);
  });

  it('fonte que não foi entregue é declarada ausente e não desenha com fonte do sistema', () => {
    const no = texto({ conteudo: 'Helvetica do sistema', fonte: 'Helvetica' });
    expect(sessao.texto.diagramar(no).fonteEncontrada).toBe(false);
    const r = renderizarPrancheta(sessao, prancheta(600, 400, [no]), { fundo: false });
    expect(r.rgba.some((v) => v !== 0)).toBe(false);
  });

  it('a medida da tinta acompanha a rotação da camada', () => {
    const no = texto({ conteudo: 'GIRADO', fonte: 'Anton', tamanho: 60, x: 100, y: 150, largura: 300, altura: 80, rotacao: 90 });
    const reta = sessao.texto.medirTinta({ ...no, rotacao: 0 });
    const girada = sessao.texto.medirTinta(no);
    expect(girada.w).toBeCloseTo(reta.h, 0);
    expect(girada.h).toBeCloseTo(reta.w, 0);
    const raster = tintaNoRaster(no);
    expect(Math.abs(girada.x - raster.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(girada.y - raster.y)).toBeLessThanOrEqual(1.5);
  });

  it('medir não cria superfície: o medidor é peça separada do raster (R3)', () => {
    const memoria = (): number => (ck as unknown as { HEAPU8: Uint8Array }).HEAPU8.length;
    const antes = memoria();
    for (let i = 0; i < 200; i++) sessao.texto.medirTinta(texto({ conteudo: `Linha ${i} do medidor` }));
    expect(memoria()).toBe(antes);
  });
});
