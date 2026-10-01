// O PDF da saída vetorial (ADR 034): relido e desenhado por um leitor de PDF independente (pdf.js, com canvas próprio),
// e comparado com o render de referência do Otto. Os PDFs das cenas são versionados em packages/psd/goldens: são os
// arquivos para abrir no Illustrator.
//
// Mudou o mapeamento de propósito? Regenere e confira antes de versionar:
//   docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/psd test
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import type { Documento, No, Prancheta } from '@otto/documento';
import { comparar, criarSessao, renderizarPrancheta } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPdf } from './adaptadores/biblioteca-de-pdf';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import type { RecursosConhecidos, RecursosDaExportacao } from './exportar';
import { exportarVetorial, relatorioDeExportacaoVetorial } from './exportar-vetorial';
import { MAPEAMENTO } from './mapeamento';
import { perfilSrgb } from './perfil-srgb';

const PASTA = path.resolve(import.meta.dirname, '../goldens');
const INDICE = path.join(PASTA, 'indice-do-pdf.json');
const ATUALIZAR = process.env.ATUALIZAR_GOLDENS === '1';
const indice: Record<string, { bytes: number; sha256: string }> = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : {};

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
let conhecidos: RecursosConhecidos;
beforeAll(async () => {
  ({ ck, recursos, conhecidos } = await recursosDeTeste());
  mkdirSync(PASTA, { recursive: true });
});

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const cena = (nome: string): Documento => cenasDeGolden().find((c) => c.nome === nome)?.doc as Documento;
const exportar = (doc: Documento, nome = 'cena', arquivos?: 'por-prancheta') => exportarVetorial(ck, criarFormatoPdf(), doc, recursos, { nome, ...(arquivos ? { arquivos } : {}) });

/** O PDF aberto pelo leitor independente. A cópia é porque ele toma posse dos bytes. */
const abrir = (bytes: Uint8Array) => getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;

interface Camada {
  nome: string;
  visivel: boolean;
}
/**
 * As camadas (conteúdo opcional) como o leitor as mostra, de cima para baixo: um bloco por página, e num bloco sem nome
 * as camadas de dentro de grupo (este leitor não monta a árvore de camada dentro de camada; a árvore é conferida nos bytes).
 */
async function camadasDe(bytes: Uint8Array): Promise<{ pagina: string | null; camadas: Camada[] }[]> {
  const config = await (await abrir(bytes)).getOptionalContentConfig();
  type Item = string | { name: string | null; order: Item[] };
  const camada = (id: string): Camada => {
    const grupo = config.getGroup(id) as { name: string; visible: boolean };
    return { nome: grupo.name, visivel: grupo.visible };
  };
  const ordem = (config.getOrder() ?? []) as Item[];
  const soltas = ordem.filter((i): i is string => typeof i === 'string');
  return [
    ...(soltas.length > 0 ? [{ pagina: null, camadas: soltas.map(camada) }] : []),
    ...ordem
      .filter((i): i is { name: string | null; order: Item[] } => typeof i !== 'string')
      .map((b) => ({ pagina: b.name, camadas: b.order.filter((x): x is string => typeof x === 'string').map(camada) })),
  ];
}
/** A árvore de camadas como está escrita no arquivo (/Order do catálogo), só com os colchetes e os números dos objetos. */
const ordemNoArquivo = (bytes: Uint8Array): string => (/\/Order (\[.*?\])\n\/OFF/s.exec(latin1(bytes))?.[1] ?? '').replace(/<[0-9A-F]+>/g, 'nome').replace(/ 0 R/g, '');

async function desenhar(bytes: Uint8Array, numero = 1): Promise<{ largura: number; altura: number; rgba: Uint8Array; textos: string[] }> {
  const pagina = await (await abrir(bytes)).getPage(numero);
  const vista = pagina.getViewport({ scale: 1 });
  const canvas = createCanvas(vista.width, vista.height);
  const contexto = canvas.getContext('2d');
  await pagina.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: contexto as unknown as CanvasRenderingContext2D, viewport: vista }).promise;
  const textos = (await pagina.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).filter((t) => t.trim());
  return { largura: vista.width, altura: vista.height, rgba: new Uint8Array(contexto.getImageData(0, 0, vista.width, vista.height).data.buffer), textos };
}
function renderDoOtto(doc: Documento, p: Prancheta) {
  const sessao = criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
  try {
    return renderizarPrancheta(sessao, doc, p);
  } finally {
    sessao.destruir();
  }
}
function diferenca(a: Uint8Array, b: Uint8Array): number {
  let acima = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(Math.abs((a[i] as number) - (b[i] as number)), Math.abs((a[i + 1] as number) - (b[i + 1] as number)), Math.abs((a[i + 2] as number) - (b[i + 2] as number))) > 24) acima++;
  }
  return acima / (a.length / 4);
}
/** O arquivo como texto de um byte por caractere, para procurar o que os dicionários do PDF dizem. */
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

describe('páginas e camadas do PDF', () => {
  it('uma página por prancheta, do tamanho dela; cada camada do Otto é uma camada do PDF, com o nome dela', async () => {
    const { arquivos, relatorio } = await exportar(cena('peca'), 'Festival');
    expect(arquivos.map((a) => a.nome)).toEqual(['Festival.pdf']);
    expect(relatorio.arquivos).toEqual(['Festival.pdf']);
    const pdf = await abrir(arquivos[0]?.bytes as Uint8Array);
    expect(pdf.numPages).toBe(2);
    const tamanhos = await Promise.all([1, 2].map(async (n) => (await pdf.getPage(n)).getViewport({ scale: 1 })));
    expect(tamanhos.map((v) => [v.width, v.height])).toEqual([
      [270, 338],
      [216, 384],
    ]);
    const v = (nome: string): Camada => ({ nome, visivel: true });
    // de cima para baixo, como num painel de camadas; a camada de ajuste não vai
    expect(await camadasDe(arquivos[0]?.bytes as Uint8Array)).toEqual([
      { pagina: 'Feed', camadas: ['Botão', 'Título', 'Sobretítulo', 'Película', 'Foto', 'Fundo'].map(v) },
      { pagina: 'Story', camadas: ['Logo', 'Título', 'Foto', 'Fundo'].map(v) },
      { pagina: null, camadas: ['Texto do botão', 'Fundo do botão', 'Logo · #fff7ed'].map(v) },
    ]);
    // no arquivo, as camadas de dentro de um grupo vêm numa lista logo depois dele: Botão [Texto, Fundo] e Logo [caminho]
    expect(ordemNoArquivo(arquivos[0]?.bytes as Uint8Array)).toMatch(/^\[ \[ nome (\d+) \[ \d+ \d+ \] \d+ \d+ \d+ \d+ \d+ \] \[ nome \d+ \[ \d+ \] \d+ \d+ \d+ \] \]$/);
  });

  it('um arquivo por prancheta, quando pedido; camada oculta nasce desligada', async () => {
    const porPrancheta = await exportar(cena('peca'), 'Festival', 'por-prancheta');
    expect(porPrancheta.arquivos.map((a) => a.nome)).toEqual(['Festival - Feed.pdf', 'Festival - Story.pdf']);
    expect((await abrir(porPrancheta.arquivos[1]?.bytes as Uint8Array)).numPages).toBe(1);
    const camadas = (await camadasDe((await exportar(cena('grupo-e-ajuste'))).arquivos[0]?.bytes as Uint8Array))[0]?.camadas ?? [];
    expect(camadas.map((c) => [c.nome, c.visivel])).toEqual([
      ['Oculta', false],
      ['Véu bloqueado', true],
      ['Base do recorte', true],
      ['Luzes', true],
      ['Selo', true],
      ['Foto', true],
      ['Fundo', true],
    ]);
  });
});

describe('texto e fonte no PDF', () => {
  it('o texto é texto (o leitor o extrai), linha por linha, e a fonte vai embutida inteira, com o nome PostScript', async () => {
    const { arquivos } = await exportar(cena('texto'));
    const bytes = arquivos[0]?.bytes as Uint8Array;
    const { textos } = await desenhar(bytes);
    expect(textos.join('|')).toBe('JAZZ NA PRAÇA|O agente|faz a produção|, você faz o design.|A partir de|R$ 19,9|0.|E N T R A D A|F R A N C A|ao vivo|meio-negrito');
    const arquivo = latin1(bytes);
    for (const fonte of ['Anton-Regular', 'IBMPlexSans', 'IBMPlexSans-Bold', 'DMSerifDisplay-Regular']) expect(arquivo).toContain(`/BaseFont /${fonte}\n`);
    // inteira: o arquivo de fonte embutido, descomprimido, é o arquivo original byte a byte (sem recorte de glifos)
    const objeto = /\/FontName \/Anton-Regular\n[^>]*\/FontFile2 (\d+) 0 R/.exec(arquivo)?.[1];
    const inicio = arquivo.indexOf('stream\n', arquivo.indexOf(`\n${objeto} 0 obj`)) + 'stream\n'.length;
    const embutida = inflateSync(Buffer.from(arquivo.slice(inicio, arquivo.indexOf('\nendstream', inicio)), 'latin1'));
    expect(Buffer.compare(embutida, Buffer.from(recursos.fontes.find((f) => f.familia === 'Anton')?.bytes as Uint8Array))).toBe(0);
    // "Centro, com sombra" virou imagem: não há texto dela
    expect(textos.join(' ')).not.toContain('Sábado');
  });

  it('leva o perfil sRGB como intenção de saída, e a data é fixa', async () => {
    const arquivo = latin1((await exportar(cena('forma'))).arquivos[0]?.bytes as Uint8Array);
    expect(arquivo).toContain('/OutputIntents');
    expect(arquivo).toContain(`/N 3`);
    expect(arquivo).toContain('/CreationDate (D:20261001000000Z)');
    expect(perfilSrgb().length).toBeGreaterThan(0);
  });
});

describe('aparência do PDF, desenhado por um leitor independente', () => {
  for (const [nome, limite] of [
    ['forma', 0.01],
    ['texto', 0.05],
    ['imagem', 0.02],
    ['vetor', 0.01],
    ['efeitos', 0.02],
  ] as const) {
    it(`${nome}: menos de ${limite * 100}% dos pixels a mais de 24 níveis do render do Otto`, async () => {
      const doc = cena(nome);
      const p = doc.pranchetas[0] as Prancheta;
      const desenhado = await desenhar((await exportar(doc)).arquivos[0]?.bytes as Uint8Array);
      expect([desenhado.largura, desenhado.altura]).toEqual([p.largura, p.altura]);
      const otto = renderDoOtto(doc, p);
      expect(diferenca(otto.rgba, desenhado.rgba)).toBeLessThan(limite);
      expect(comparar(otto.rgba, desenhado.rgba, p.largura, p.altura).d.media).toBeLessThan(2);
    });
  }

  it('grupo com opacidade, modo de mesclagem e recorte: parece o render do Otto sem as camadas de ajuste e sem o modo que o formato não tem', async () => {
    const doc = cena('peca');
    const bytes = (await exportar(doc)).arquivos[0]?.bytes as Uint8Array;
    for (const [i, p] of doc.pranchetas.entries()) {
      const semAjuste: Prancheta = { ...p, filhos: p.filhos.filter((n: No) => n.tipo !== 'ajuste') };
      const desenhado = await desenhar(bytes, i + 1);
      expect(diferenca(renderDoOtto(doc, semAjuste).rgba, desenhado.rgba)).toBeLessThan(0.03);
    }
  });
});

describe('relatório do PDF', () => {
  it('degradê com parada transparente vira imagem no PDF (no SVG vai como degradê)', async () => {
    const doc = cena('peca');
    const { relatorio } = await exportar(doc);
    expect(relatorio.camadas.find((l) => l.camada === 'Película')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'degrade-transparente-no-pdf' });
    expect(relatorioDeExportacaoVetorial(doc, conhecidos).camadas.find((l) => l.camada === 'Película')).toMatchObject({ destino: 'nativo-editavel' });
  });

  it('sem renderizar, é o mesmo que a exportação devolve; e todo destino é o da coluna vetorial do mapeamento', async () => {
    const esperado = { 'nativo-editavel': 'Nativo', 'nativo-pixel': 'Nativo', 'raster-com-aviso': 'Raster', 'omitido-com-aviso': 'Omitido' } as const;
    for (const c of cenasDeGolden()) {
      const { relatorio } = await exportar(c.doc, c.nome);
      expect({ ...relatorio, arquivos: [] }, c.nome).toEqual(relatorioDeExportacaoVetorial(c.doc, conhecidos, { formato: 'pdf' }));
      for (const l of relatorio.camadas) expect(MAPEAMENTO[l.mapeamento].vetorial?.destino, `${c.nome}/${l.camada}`).toBe(esperado[l.destino]);
    }
  });
});

describe('goldens do PDF', () => {
  for (const c of cenasDeGolden()) {
    it(`${c.nome}: exportar duas vezes dá o mesmo arquivo, e ele é o golden`, async () => {
      const a = (await exportar(c.doc, c.nome)).arquivos[0] as { nome: string; bytes: Uint8Array };
      const b = (await exportar(c.doc, c.nome)).arquivos[0] as { nome: string; bytes: Uint8Array };
      expect(sha256(a.bytes)).toBe(sha256(b.bytes));
      const caminho = path.join(PASTA, a.nome);
      if (ATUALIZAR) {
        writeFileSync(caminho, a.bytes);
        indice[a.nome] = { bytes: a.bytes.length, sha256: sha256(a.bytes) };
        writeFileSync(INDICE, `${JSON.stringify(indice, null, 2)}\n`);
        return;
      }
      expect(indice[a.nome], `não há golden para "${a.nome}": rode com ATUALIZAR_GOLDENS=1 e confira`).toBeDefined();
      if (sha256(a.bytes) !== indice[a.nome]?.sha256) {
        const recusado = path.join(PASTA, '_recusado');
        mkdirSync(recusado, { recursive: true });
        writeFileSync(path.join(recusado, a.nome), a.bytes);
        expect.fail(`"${a.nome}" mudou. Arquivo recusado em goldens/_recusado/${a.nome}`);
      }
      expect(sha256(new Uint8Array(readFileSync(caminho)))).toBe(indice[a.nome]?.sha256);
    });
  }
});
