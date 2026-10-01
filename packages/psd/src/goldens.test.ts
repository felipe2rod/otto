// Goldens da exportação (ADR 028, item 6): cada cena é exportada, relida por uma SEGUNDA biblioteca, independente da que
// grava, e comparada em três coisas: os bytes do arquivo (determinismo), a estrutura que a segunda biblioteca enxerga
// e a imagem composta contra o render de referência do Otto. O PSD de cada cena é versionado em packages/psd/goldens:
// são esses os arquivos para abrir no Photoshop a cada release que mexer neste pacote.
//
// Mudou o mapeamento de propósito? Regenere e confira o diff da estrutura e do relatório antes de versionar:
//   docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/psd test
//   docker compose run --rm teste pnpm exec biome check --write packages/psd/goldens   (o Biome formata o JSON gravado)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { disporPranchetas } from '@otto/documento';
import { criarSessao, renderizarPrancheta } from '@otto/render';
import Psd from '@webtoon/psd';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import { type CenaDeGolden, cenasDeGolden } from './cenas-de-golden';
import { exportarPsd, type RecursosDaExportacao } from './exportar';
import { perfilSrgb } from './perfil-srgb';

const PASTA = path.resolve(import.meta.dirname, '../goldens');
const INDICE = path.join(PASTA, 'indice.json');
const ATUALIZAR = process.env.ATUALIZAR_GOLDENS === '1';
const indice: Record<string, { bytes: number; sha256: string }> = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : {};

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  ({ ck, recursos } = await recursosDeTeste());
  mkdirSync(PASTA, { recursive: true });
});

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const ler = (bytes: Uint8Array): Psd => Psd.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

/** O que a segunda biblioteca enxerga de uma camada. */
interface Estrutura {
  tipo: 'grupo' | 'camada';
  nome: string;
  opacidade: number;
  /** blocos de informação adicional da camada, pelas chaves da especificação (TySh, vmsk, SoLd, lfx2...) */
  blocos: string[];
  modo?: string;
  oculta?: boolean;
  presa?: boolean;
  /** esquerda, topo, largura, altura do pixel da camada */
  pixel?: [number, number, number, number];
  texto?: string;
  /** máscara de camada: esquerda, topo, largura, altura, e o valor fora dessa área */
  mascara?: [number, number, number, number, number];
  filhos?: Estrutura[];
}

type NoLido = Psd['children'][number];

function estruturaDe(no: NoLido): Estrutura {
  const blocos = Object.keys(no.additionalProperties ?? {}).sort();
  if (no.type === 'Group') return { tipo: 'grupo', nome: no.name, opacidade: no.opacity, blocos, filhos: no.children.map(estruturaDe) };
  // modo e recorte não têm acesso público na biblioteca: saem do registro da camada
  const registro = (no as unknown as { layerFrame: { layerProperties: { blendMode: string; clippingMask: number } } }).layerFrame.layerProperties;
  return {
    tipo: 'camada',
    nome: no.name,
    opacidade: no.opacity,
    blocos,
    modo: registro.blendMode,
    oculta: no.isHidden,
    presa: registro.clippingMask !== 0,
    pixel: [no.left, no.top, no.width, no.height],
    ...(no.text !== undefined ? { texto: no.text } : {}),
    ...(no.maskData.right > no.maskData.left
      ? {
          mascara: [no.maskData.left, no.maskData.top, no.maskData.right - no.maskData.left, no.maskData.bottom - no.maskData.top, no.maskData.backgroundColor] as [
            number,
            number,
            number,
            number,
            number,
          ],
        }
      : {}),
  };
}

async function exportar(cena: CenaDeGolden) {
  const r = await exportarPsd(ck, criarFormatoPsd(), cena.doc, recursos, { nome: cena.nome, ...(cena.arquivos ? { arquivos: cena.arquivos } : {}) });
  const arquivo = r.arquivos[0];
  if (!arquivo || r.arquivos.length !== 1) throw new Error(`a cena ${cena.nome} deveria gerar um arquivo só`);
  return { bytes: arquivo.bytes, nome: arquivo.nome, relatorio: r.relatorio };
}

/** A composta que o Otto renderiza: as pranchetas lado a lado, como no arquivo. */
function compostaDoOtto(cena: CenaDeGolden): { largura: number; altura: number; rgba: Uint8Array } {
  const sessao = criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
  try {
    const posicoes = disporPranchetas(cena.doc.pranchetas);
    const largura = Math.max(...cena.doc.pranchetas.map((p) => (posicoes.get(p.id)?.x ?? 0) + p.largura));
    const altura = Math.max(...cena.doc.pranchetas.map((p) => p.altura));
    const rgba = new Uint8Array(largura * altura * 4);
    for (const p of cena.doc.pranchetas) {
      const r = renderizarPrancheta(sessao, cena.doc, p);
      const dx = posicoes.get(p.id)?.x ?? 0;
      for (let y = 0; y < r.altura; y++) rgba.set(r.rgba.subarray(y * r.largura * 4, (y + 1) * r.largura * 4), (y * largura + dx) * 4);
    }
    return { largura, altura, rgba };
  } finally {
    sessao.destruir();
  }
}

describe('goldens da exportação em PSD', () => {
  for (const cena of cenasDeGolden()) {
    describe(cena.nome, () => {
      it('exportar duas vezes dá os mesmos bytes', async () => {
        const a = await exportar(cena);
        const b = await exportar(cena);
        expect(sha256(a.bytes)).toBe(sha256(b.bytes));
      });

      it('a segunda biblioteca lê a mesma estrutura do golden, e o arquivo é o mesmo, byte a byte', async () => {
        const { bytes, relatorio } = await exportar(cena);
        const estrutura = ler(bytes).children.map(estruturaDe);
        const arquivos = { psd: path.join(PASTA, `${cena.nome}.psd`), estrutura: path.join(PASTA, `${cena.nome}.estrutura.json`), relatorio: path.join(PASTA, `${cena.nome}.relatorio.json`) };
        if (ATUALIZAR) {
          writeFileSync(arquivos.psd, bytes);
          writeFileSync(arquivos.estrutura, `${JSON.stringify(estrutura, null, 2)}\n`);
          writeFileSync(arquivos.relatorio, `${JSON.stringify(relatorio, null, 2)}\n`);
          indice[cena.nome] = { bytes: bytes.length, sha256: sha256(bytes) };
          writeFileSync(INDICE, `${JSON.stringify(indice, null, 2)}\n`);
          return;
        }
        expect(indice[cena.nome], `não há golden para "${cena.nome}": rode com ATUALIZAR_GOLDENS=1 e confira a estrutura e o relatório`).toBeDefined();
        // primeiro o que uma pessoa consegue ler no diff; os bytes por último
        expect(estrutura).toEqual(JSON.parse(readFileSync(arquivos.estrutura, 'utf8')));
        expect(relatorio).toEqual(JSON.parse(readFileSync(arquivos.relatorio, 'utf8')));
        if (sha256(bytes) !== indice[cena.nome]?.sha256) {
          const recusado = path.join(PASTA, '_recusado');
          mkdirSync(recusado, { recursive: true });
          writeFileSync(path.join(recusado, `${cena.nome}.psd`), bytes);
          expect.fail(`"${cena.nome}" mudou nos bytes (a estrutura e o relatório são os mesmos). Arquivo recusado em goldens/_recusado/${cena.nome}.psd`);
        }
        // o PSD versionado é o arquivo que o hash descreve
        expect(sha256(new Uint8Array(readFileSync(arquivos.psd)))).toBe(indice[cena.nome]?.sha256);
      });

      it('a composta que a segunda biblioteca lê é o render de referência do Otto, sem um pixel de diferença', async () => {
        const { bytes } = await exportar(cena);
        const psd = ler(bytes);
        const esperado = compostaDoOtto(cena);
        expect([psd.width, psd.height]).toEqual([esperado.largura, esperado.altura]);
        const lida = await psd.composite();
        expect(lida.length).toBe(esperado.rgba.length);
        let diferentes = 0;
        for (let i = 0; i < lida.length; i += 4) {
          // onde o alfa é zero, a cor não importa
          if (lida[i + 3] === 0 && esperado.rgba[i + 3] === 0) continue;
          if (lida[i] !== esperado.rgba[i] || lida[i + 1] !== esperado.rgba[i + 1] || lida[i + 2] !== esperado.rgba[i + 2] || lida[i + 3] !== esperado.rgba[i + 3]) diferentes++;
        }
        expect(diferentes).toBe(0);
      });

      it('leva o perfil sRGB embutido, e a segunda biblioteca o lê inteiro', async () => {
        const { bytes } = await exportar(cena);
        const lido = ler(bytes).icc_profile;
        expect(lido).toBeDefined();
        expect(Buffer.compare(Buffer.from(lido as Uint8Array), Buffer.from(perfilSrgb()))).toBe(0);
      });

      it('toda camada que desenha leva pixel (ADR 028, item 2)', async () => {
        const { bytes } = await exportar(cena);
        const semPixel: string[] = [];
        const AJUSTES = ['curv', 'levl', 'hue2', 'brit', 'vibA', 'blnc', 'phfl', 'blwh', 'grdm'];
        const ver = (e: Estrutura): void => {
          for (const f of e.filhos ?? []) ver(f);
          if (e.tipo !== 'camada' || e.blocos.some((b) => AJUSTES.includes(b))) return;
          if (!e.pixel || e.pixel[2] <= 1 || e.pixel[3] <= 1) semPixel.push(e.nome);
        };
        for (const e of ler(bytes).children.map(estruturaDe)) ver(e);
        expect(semPixel).toEqual([]);
      });
    });
  }
});
