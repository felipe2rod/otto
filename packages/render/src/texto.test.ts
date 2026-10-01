import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NoTexto } from '@otto/documento';
import { beforeAll, describe, expect, it } from 'vitest';
import { caixaDaTinta, novaSessao, peca, texto } from './apoio-de-teste';
import { recursosEmFalta, renderizarPrancheta } from './compositor';
import { recursosOpenType } from './opentype';
import type { Sessao } from './sessao';

let sessao: Sessao;
beforeAll(async () => {
  ({ sessao } = await novaSessao());
});

/** O nó de texto como o catálogo o cria, com os padrões do esquema. */
const no = (conteudo: string, extra: object = {}): NoTexto => peca([texto('T', conteudo, extra)]).p.filhos[0] as NoTexto;

/** Renderiza só o texto, sem fundo, e mede onde há pixel. */
function tintaNoRaster(n: NoTexto): { x: number; y: number; w: number; h: number } {
  const { id: _id, nome: _nome, tipo: _tipo, conteudo, ...resto } = n;
  const { doc, p } = peca([texto('T', conteudo, resto)], { largura: 600, altura: 400 });
  const r = renderizarPrancheta(sessao, doc, p, { fundo: false });
  return caixaDaTinta(r.rgba, r.largura, r.altura);
}

describe('recursos OpenType lidos do arquivo de fonte', () => {
  it('Anton declara versalete desenhado (smcp); IBM Plex Sans não', () => {
    const ler = (arquivo: string) => recursosOpenType(new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../recursos-de-teste/fontes', arquivo))));
    expect(ler('Anton-Regular.ttf').gsub).toContain('smcp');
    expect(ler('IBMPlexSans-Regular.ttf').gsub).not.toContain('smcp');
    expect(ler('IBMPlexSans-Regular.ttf').gpos).toContain('kern');
  });
});

describe('texto com o módulo de parágrafo do Skia', () => {
  it('quebra o parágrafo dentro da caixa e devolve o texto de cada linha', () => {
    const d = sessao.texto.diagramar(no('O agente faz a produção, você faz o design. Texto em caixa quebra por palavra.', { largura: 300 }));
    expect(d.linhas.length).toBeGreaterThan(3);
    for (const l of d.linhas) expect(l.largura).toBeLessThanOrEqual(300.5);
    expect(d.linhas.map((l) => l.texto.trim()).join(' ')).toBe('O agente faz a produção, você faz o design. Texto em caixa quebra por palavra.');
    expect(d.fonteEncontrada).toBe(true);
    expect(d.palavraEstourada).toBeUndefined();
    expect(d.glifosAusentes).toBe(0);
  });

  it('respeita a quebra manual (\\n)', () => {
    expect(sessao.texto.diagramar(no('Um\nDois\nTrês')).linhas.map((l) => l.texto.trim())).toEqual(['Um', 'Dois', 'Três']);
  });

  it('palavra mais larga que a caixa é partida pelo Skia, e o motor diz qual foi (o lint acusa)', () => {
    const d = sessao.texto.diagramar(no('Um paralelepípedo aqui', { largura: 120, tamanho: 40 }));
    expect(d.palavraEstourada).toBe('paralelepípedo');
  });

  const casos: [string, NoTexto][] = [
    ['título em Anton', no('JAZZ NA PRAÇA', { fonte: 'Anton', tamanho: 96 })],
    ['parágrafo com acentos e descendentes', no('Açaí, pão de queijo e guaraná gelado na praça às 19h.', { largura: 320, tamanho: 28 })],
    ['centralizado', no('Sábado\n20 de junho', { alinhamento: 'centro', fonte: 'DM Serif Display', tamanho: 48 })],
    ['à direita com tracking', no('ENTRADA FRANCA', { alinhamento: 'direita', espacamento: 200, peso: 700, tamanho: 24 })],
    ['trechos de corpo e fonte diferentes', no('A partir de R$ 19,90 por pessoa', { tamanho: 28, trechos: [{ inicio: 12, fim: 20, fonte: 'Anton', tamanho: 72, cor: '#c2410c' }] })],
    ['caixa alta', no('caixa alta', { caixaAlta: true, tamanho: 60 })],
    ['versalete sintético', no('Versalete Sintético', { versalete: true, tamanho: 60 })],
  ];
  for (const [nome, n] of casos) {
    it(`mede a tinta onde as letras estão, a 1 px do raster: ${nome}`, () => {
      const medida = sessao.texto.diagramar(n).tinta;
      const raster = tintaNoRaster(n);
      expect(Math.abs(medida.x - raster.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.y - raster.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.x + medida.w - (raster.x + raster.w))).toBeLessThanOrEqual(1);
      expect(Math.abs(medida.y + medida.h - (raster.y + raster.h))).toBeLessThanOrEqual(1);
    });
  }

  it('tracking por trecho alarga só o trecho, em milésimos de eme', () => {
    const l0 = sessao.texto.diagramar(no('PROMOÇÃO de hoje', { tamanho: 40 })).linhas[0]?.largura ?? 0;
    const l1 = sessao.texto.diagramar(no('PROMOÇÃO de hoje', { tamanho: 40, trechos: [{ inicio: 0, fim: 8, espacamento: 250 }] })).linhas[0]?.largura ?? 0;
    expect(l1 - l0).toBeCloseTo(8 * 0.25 * 40, 0);
  });

  it('primeira linha encosta a ascendente da fonte no topo; as seguintes descem corpo × entrelinha', () => {
    const n = no('Um\nDois\nTrês', { tamanho: 50, entrelinha: 1.4 });
    const d = sessao.texto.diagramar(n);
    const ascendente = sessao.texto.metricas(n.fonte, n.peso, n.tamanho).ascendente;
    // o parágrafo do Skia encaixa a linha de base em pixel inteiro: até meio pixel fora da métrica da fonte
    expect(Math.abs((d.linhas[0]?.base ?? 0) - (n.y + ascendente))).toBeLessThanOrEqual(0.5);
    expect((d.linhas[1]?.base ?? 0) - (d.linhas[0]?.base ?? 0)).toBeCloseTo(50 * 1.4, 1);
  });

  it('caixa alta desenha maiúsculas sem mudar o conteúdo', () => {
    const baixa = sessao.texto.diagramar(no('promoção', { tamanho: 60 }));
    const alta = sessao.texto.diagramar(no('promoção', { tamanho: 60, caixaAlta: true }));
    expect(alta.linhas[0]?.texto).toBe('PROMOÇÃO');
    expect(alta.linhas[0]?.largura).toBeGreaterThan((baixa.linhas[0]?.largura ?? 0) + 10);
  });

  it('versalete sintético: minúscula vira maiúscula a 75% do corpo, como no Photoshop', () => {
    const cheio = sessao.texto.diagramar(no('ABC', { tamanho: 80 }));
    const versalete = sessao.texto.diagramar(no('abc', { tamanho: 80, versalete: true }));
    const maiusculaEmVersalete = sessao.texto.diagramar(no('ABC', { tamanho: 80, versalete: true }));
    expect(versalete.linhas[0]?.texto).toBe('ABC');
    expect(Math.abs(versalete.tinta.h - cheio.tinta.h * 0.75)).toBeLessThanOrEqual(1);
    expect(Math.abs(maiusculaEmVersalete.tinta.h - cheio.tinta.h)).toBeLessThanOrEqual(1);
  });

  it('kerning da fonte desligado muda a largura de um par com kerning', () => {
    const ligado = sessao.texto.diagramar(no('AVATAR', { fonte: 'DM Serif Display', tamanho: 80 })).linhas[0]?.largura ?? 0;
    const desligado = sessao.texto.diagramar(no('AVATAR', { fonte: 'DM Serif Display', tamanho: 80, kerning: 'nenhum' })).linhas[0]?.largura ?? 0;
    expect(desligado).toBeGreaterThan(ligado + 1);
  });

  it('escolhe o arquivo da família com o peso mais próximo, sem engrossar a letra por conta própria', () => {
    const p600 = sessao.texto.diagramar(no('Peso', { peso: 600, tamanho: 60 })).linhas[0]?.largura;
    const p700 = sessao.texto.diagramar(no('Peso', { peso: 700, tamanho: 60 })).linhas[0]?.largura;
    expect(p600).toBe(p700);
  });

  it('fonte que não foi entregue: não desenha com outra, e o motor avisa qual falta e em que camada', () => {
    const { doc, p } = peca([texto('Legenda', 'Helvetica do sistema', { fonte: 'Helvetica' }), texto('Ok', 'tem fonte', { y: 200, trechos: [{ inicio: 0, fim: 3, fonte: 'Futura', peso: 700 }] })], {
      largura: 600,
      altura: 400,
    });
    expect(sessao.texto.diagramar(p.filhos[0] as NoTexto).fonteEncontrada).toBe(false);
    const r = renderizarPrancheta(sessao, doc, p, { fundo: false });
    expect(r.rgba.some((v) => v !== 0)).toBe(false);
    expect(recursosEmFalta(sessao, doc).fontes).toEqual([
      { familia: 'Helvetica', peso: 400, camadas: ['P/Legenda'] },
      { familia: 'Futura', peso: 700, camadas: ['P/Ok'] },
    ]);
  });

  it('a medida da tinta acompanha a rotação da camada', () => {
    const n = no('GIRADO', { fonte: 'Anton', tamanho: 60, x: 100, y: 150, largura: 300, altura: 80, rotacao: 90 });
    const reta = sessao.texto.medirTinta({ ...n, rotacao: 0 });
    const girada = sessao.texto.medirTinta(n);
    expect(girada.w).toBeCloseTo(reta.h, 0);
    expect(girada.h).toBeCloseTo(reta.w, 0);
    const raster = tintaNoRaster(n);
    expect(Math.abs(girada.x - raster.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(girada.y - raster.y)).toBeLessThanOrEqual(1.5);
  });
});
