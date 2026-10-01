// Goldens do render de referência (CPU), com tolerância zero: mesmo documento, mesmas fontes, mesma versão do motor,
// mesmos bytes. Cada golden é um PNG versionado em packages/render/goldens, para a pessoa olhar, e o hash dos pixels.
//
// Mudou o motor de propósito? Regenere e confira os PNGs no diff antes de versionar:
//   docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/render test
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { novaSessao, peca, pngDe } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import { naoDesenhado, renderizarPrancheta } from './compositor';
import { comparar } from './diferenca';
import type { Sessao } from './sessao';
import { VERSAO_DO_CANVASKIT } from './versao';

const PASTA = path.resolve(import.meta.dirname, '../goldens');
const INDICE = path.join(PASTA, 'indice.json');
const ATUALIZAR = process.env.ATUALIZAR_GOLDENS === '1';

interface Registro {
  largura: number;
  altura: number;
  /** sha256 dos pixels RGBA de 8 bits, não premultiplicados */
  sha256: string;
}
const indice: { canvaskit: string; cenas: Record<string, Registro> } = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : { canvaskit: VERSAO_DO_CANVASKIT, cenas: {} };

let ck: CanvasKit;
let sessao: Sessao;
beforeAll(async () => {
  ({ ck, sessao } = await novaSessao());
  mkdirSync(PASTA, { recursive: true });
});

const hash = (rgba: Uint8Array): string => createHash('sha256').update(rgba).digest('hex');

function lerPng(arquivo: string): Uint8Array {
  const img = ck.MakeImageFromEncoded(readFileSync(arquivo));
  if (!img) throw new Error(`golden ilegível: ${arquivo}`);
  const rgba = img.readPixels(0, 0, { width: img.width(), height: img.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  img.delete();
  return rgba;
}

describe('goldens do render de referência', () => {
  it('a versão do CanvasKit instalada é a dos goldens', () => {
    const require = createRequire(import.meta.url);
    const instalada = (JSON.parse(readFileSync(path.join(path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js')), '../package.json'), 'utf8')) as { version: string }).version;
    expect(instalada).toBe(VERSAO_DO_CANVASKIT);
    expect(indice.canvaskit).toBe(VERSAO_DO_CANVASKIT);
  });

  for (const cena of cenasDeGolden()) {
    it(`${cena.nome}: zero pixel diferente do golden`, () => {
      // lote fixo: os ids dos nós saem dele, e o grão do ruído sai do id do nó
      const { doc, p } = peca(cena.nos, { ...cena.opcoes, lote: `golden-${cena.nome}` });
      // o golden só vale para o que o motor desenha: cena com recurso que ele não desenha é erro da cena
      expect(naoDesenhado(doc)).toEqual([]);
      const r = renderizarPrancheta(sessao, doc, p);
      const registro: Registro = { largura: r.largura, altura: r.altura, sha256: hash(r.rgba) };
      const arquivo = path.join(PASTA, `${cena.nome}.png`);
      if (ATUALIZAR) {
        writeFileSync(arquivo, pngDe(ck, r.rgba, r.largura, r.altura));
        indice.cenas[cena.nome] = registro;
        writeFileSync(INDICE, `${JSON.stringify(indice, null, 2)}\n`);
        return;
      }
      const esperado = indice.cenas[cena.nome];
      expect(esperado, `não há golden para "${cena.nome}": rode com ATUALIZAR_GOLDENS=1 e confira o PNG`).toBeDefined();
      if (registro.sha256 !== esperado?.sha256) {
        // diz quanto mudou e deixa o render recusado ao lado, para olhar
        const recusado = path.join(PASTA, '_recusado');
        mkdirSync(recusado, { recursive: true });
        writeFileSync(path.join(recusado, `${cena.nome}.png`), pngDe(ck, r.rgba, r.largura, r.altura));
        const golden = lerPng(arquivo);
        const d = golden.length === r.rgba.length ? comparar(golden, r.rgba, r.largura, r.altura).d : undefined;
        expect.fail(`"${cena.nome}" mudou: ${d ? `${d.diferentes} pixels diferentes, maior diferença ${d.maxima}` : 'tamanho diferente'}. Render recusado em goldens/_recusado/${cena.nome}.png`);
      }
      // o PNG versionado é o mesmo render que o hash descreve
      expect(hash(lerPng(arquivo))).toBe(esperado.sha256);
    });

    it(`${cena.nome}: o cálculo da GPU (shader) fica a no máximo 4 níveis do golden`, () => {
      // lote fixo: os ids dos nós saem dele, e o grão do ruído sai do id do nó
      const { doc, p } = peca(cena.nos, { ...cena.opcoes, lote: `golden-${cena.nome}` });
      const referencia = renderizarPrancheta(sessao, doc, p);
      const shader = renderizarPrancheta(sessao, doc, p, { calculo: 'shader' });
      expect(comparar(referencia.rgba, shader.rgba, p.largura, p.altura).d.maxima).toBeLessThanOrEqual(4);
    }, 120_000);
  }
});
