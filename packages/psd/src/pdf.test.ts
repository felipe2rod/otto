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
import { aplicarLote, type Documento, type Prancheta } from '@otto/documento';
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
const exportar = (doc: Documento, nome = 'cena', arquivos?: 'por-prancheta' | 'juntas', comRecursos: RecursosDaExportacao = recursos) =>
  exportarVetorial(ck, criarFormatoPdf(), doc, comRecursos, { nome, ...(arquivos ? { arquivos } : {}) });
function mudar(doc: Documento, operacoes: unknown[]): Documento {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'mudanca-do-teste' });
  if (!r.ok) throw new Error(`${r.erro.op} ${r.erro.alvo ?? ''}: ${r.erro.mensagem}`);
  return r.doc;
}
/** A peça com o ajuste logo acima da foto: a foto e ele achatam, e o resto continua em camadas. */
const pecaEmCamadas = (): Documento => mudar(cena('peca'), [{ op: 'reordenar', alvo: 'Feed/Níveis', posicao: 1 }]);
/** A fonte em que o Illustrator converteu texto em contorno na conferência de 2026-10-02: troca o "n" e o "m" por desenhos alternativos. */
const FRAUNCES = new Uint8Array(readFileSync(path.resolve(import.meta.dirname, '../recursos-de-teste/fontes/Fraunces-600.ttf')));
const comFraunces = (): RecursosDaExportacao => ({ ...recursos, fontes: [...recursos.fontes, { familia: 'Fraunces', peso: 600, bytes: FRAUNCES, arquivo: 'Fraunces-600.ttf' }] });

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
/** Os fluxos de desenho do arquivo (páginas e formulários), descomprimidos: os operadores, como texto. */
function fluxos(bytes: Uint8Array): string[] {
  const arquivo = latin1(bytes);
  const saida: string[] = [];
  for (let i = arquivo.indexOf('stream\n'); i >= 0; i = arquivo.indexOf('stream\n', i + 1)) {
    if (arquivo.slice(i - 3, i) === 'end') continue;
    const inicio = i + 'stream\n'.length;
    try {
      const texto = inflateSync(Buffer.from(arquivo.slice(inicio, arquivo.indexOf('\nendstream', inicio)), 'latin1')).toString('latin1');
      // desenho: tem operador de estado gráfico; fonte, perfil e imagem não têm
      if (/(^|\n)(q|BT|\/OC \/\S+ BDC)\n/.test(texto)) saida.push(texto);
    } catch {
      // fluxo que não é comprimido assim (imagem JPEG): não é desenho
    }
  }
  return saida;
}
/** Os números dos glifos que o arquivo manda desenhar, na ordem. */
const glifosEscritos = (bytes: Uint8Array): number[] =>
  fluxos(bytes).flatMap((f) =>
    [...f.matchAll(/\[([^\]]*)\] TJ/g)].flatMap((m) => [...(m[1] as string).matchAll(/<([0-9A-Fa-f]+)>/g)].flatMap((h) => (h[1] as string).match(/.{4}/g) ?? []).map((x) => Number.parseInt(x, 16))),
  );

/** O glifo de um caractere, lido direto da tabela `cmap` da fonte (subtabela de formato 4), sem biblioteca. */
function glifoDoCaractere(fonte: Uint8Array, codigo: number): number {
  const v = new DataView(fonte.buffer, fonte.byteOffset, fonte.byteLength);
  const tabelas = v.getUint16(4);
  let cmap = 0;
  for (let i = 0; i < tabelas; i++) if (String.fromCharCode(...fonte.subarray(12 + i * 16, 16 + i * 16)) === 'cmap') cmap = v.getUint32(12 + i * 16 + 8);
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const sub = cmap + v.getUint32(cmap + 4 + i * 8 + 4);
    if (v.getUint16(sub) !== 4) continue;
    const segmentos = v.getUint16(sub + 6) / 2;
    const fins = sub + 14;
    const inicios = fins + segmentos * 2 + 2;
    const deltas = inicios + segmentos * 2;
    const deslocamentos = deltas + segmentos * 2;
    for (let s = 0; s < segmentos; s++) {
      if (codigo > v.getUint16(fins + s * 2)) continue;
      const inicio = v.getUint16(inicios + s * 2);
      if (codigo < inicio) return 0;
      const deslocamento = v.getUint16(deslocamentos + s * 2);
      if (deslocamento === 0) return (codigo + v.getUint16(deltas + s * 2)) & 0xffff;
      const glifo = v.getUint16(deslocamentos + s * 2 + deslocamento + (codigo - inicio) * 2);
      return glifo === 0 ? 0 : (glifo + v.getUint16(deltas + s * 2)) & 0xffff;
    }
  }
  throw new Error('a fonte não tem cmap de formato 4');
}

describe('arquivos, páginas e camadas do PDF', () => {
  it('sem dizer nada, é um arquivo por prancheta: o Illustrator só abre a primeira página de um PDF de várias', async () => {
    const { arquivos, relatorio } = await exportar(cena('peca'), 'Festival');
    expect(arquivos.map((a) => a.nome)).toEqual(['Festival - Feed.pdf', 'Festival - Story.pdf']);
    expect(relatorio.arquivos).toEqual(['Festival - Feed.pdf', 'Festival - Story.pdf']);
    for (const a of arquivos) expect((await abrir(a.bytes)).numPages).toBe(1);
    const vista = (await (await abrir(arquivos[1]?.bytes as Uint8Array)).getPage(1)).getViewport({ scale: 1 });
    expect([vista.width, vista.height]).toEqual([216, 384]);
  });

  it('juntas, quando pedido: uma página por prancheta, do tamanho dela; cada camada do Otto é uma camada do PDF, com o nome dela', async () => {
    const { arquivos, relatorio } = await exportar(pecaEmCamadas(), 'Festival', 'juntas');
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
    // de cima para baixo, como num painel de camadas; a foto e o ajuste acima dela são o fundo achatado
    expect(await camadasDe(arquivos[0]?.bytes as Uint8Array)).toEqual([
      { pagina: 'Feed', camadas: ['Botão', 'Título', 'Sobretítulo', 'Película', 'Fundo (achatado)'].map(v) },
      { pagina: 'Story', camadas: ['Logo', 'Título', 'Foto', 'Fundo'].map(v) },
      { pagina: null, camadas: ['Texto do botão', 'Fundo do botão', 'Logo · #fff7ed'].map(v) },
    ]);
    // no arquivo, as camadas de dentro de um grupo vêm numa lista logo depois dele: Botão [Texto, Fundo] e Logo [caminho]
    expect(ordemNoArquivo(arquivos[0]?.bytes as Uint8Array)).toMatch(/^\[ \[ nome (\d+) \[ \d+ \d+ \] \d+ \d+ \d+ \d+ \] \[ nome \d+ \[ \d+ \] \d+ \d+ \d+ \] \]$/);
  });

  it('camada oculta nasce desligada; o modo de mesclagem que o PDF tem continua na camada, e o ajuste achata o que está abaixo dele', async () => {
    const { arquivos, relatorio } = await exportar(cena('grupo-e-ajuste'));
    const camadas = (await camadasDe(arquivos[0]?.bytes as Uint8Array))[0]?.camadas ?? [];
    expect(camadas.map((c) => [c.nome, c.visivel])).toEqual([
      ['Oculta', false],
      ['Véu bloqueado', true],
      ['Fundo (achatado)', true],
    ]);
    // o véu em luz suave vai como forma, com o modo de mesclagem do PDF
    expect(latin1(arquivos[0]?.bytes as Uint8Array)).toContain('/BM /SoftLight');
    expect(relatorio.camadas.find((l) => l.camada === 'Véu bloqueado')).toMatchObject({ destino: 'nativo-editavel' });
    expect(relatorio.camadas.find((l) => l.camada === 'Foto')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'ajuste:niveis' });
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('camadas-achatadas');
  });

  it('modo de mesclagem que o PDF não tem: a camada vira a imagem equivalente em modo normal, em vez de sair em modo normal; o resto continua em camadas', async () => {
    const doc = mudar(cena('forma'), [
      { op: 'alterar', alvo: 'Peça/Elipse', props: { modoDeMesclagem: 'luz-linear' } },
      { op: 'alterar', alvo: 'Peça/Girada', props: { modoDeMesclagem: 'multiplicacao' } },
    ]);
    const { arquivos, relatorio } = await exportar(doc);
    expect(((await camadasDe(arquivos[0]?.bytes as Uint8Array))[0]?.camadas ?? []).map((c) => c.nome)).toEqual([
      'Com filtro',
      'Girada',
      'Com traço e sombra',
      'Degradê radial',
      'Degradê linear',
      'Elipse',
      'Arredondado',
      'Retângulo',
      'Fundo',
    ]);
    expect(relatorio.camadas.find((l) => l.camada === 'Elipse')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'modo:luz-linear' });
    expect(relatorio.camadas.find((l) => l.camada === 'Girada')).toMatchObject({ destino: 'nativo-editavel' });
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('modo-em-imagem');
    expect(latin1(arquivos[0]?.bytes as Uint8Array)).toContain('/BM /Multiply');
    const p = doc.pranchetas[0] as Prancheta;
    expect(diferenca(renderDoOtto(doc, p).rgba, (await desenhar(arquivos[0]?.bytes as Uint8Array)).rgba)).toBeLessThan(0.01);
  });

  it('sem grupo de recorte à toa: camada simples com opacidade não vira objeto de formulário (que o Illustrator abre como grupo de recorte do tamanho da página)', async () => {
    // "Girada" tem opacidade 80%: uma pintura só, a opacidade vai direto nela
    const forma = (await exportar(cena('forma'))).arquivos[0]?.bytes as Uint8Array;
    expect(latin1(forma)).not.toContain('/Subtype /Form');
    // foto: um recorte só (o corte da caixa), e nenhum formulário
    const imagem = (await exportar(cena('imagem'))).arquivos[0]?.bytes as Uint8Array;
    expect(latin1(imagem)).not.toContain('/Subtype /Form');
    const desenho = fluxos(imagem).join('\n');
    const camadaCobrir = desenho.slice(desenho.indexOf('BDC'), desenho.indexOf('EMC'));
    expect(camadaCobrir.match(/\bW\*?\nn\b/g) ?? []).toHaveLength(0);
    expect((desenho.match(/\nW\*?\nn\n/g) ?? []).length).toBeLessThanOrEqual(7);
    // grupo com opacidade: aí sim, um formulário só para o grupo, e não um por camada de dentro
    const grupo = (
      await exportar(
        mudar(cena('grupo-e-ajuste'), [
          { op: 'remover', alvo: 'Peça/Curvas' },
          { op: 'remover', alvo: 'Peça/Níveis em sobrepor' },
        ]),
      )
    ).arquivos[0]?.bytes as Uint8Array;
    expect(latin1(grupo).match(/\/Subtype \/Form/g) ?? []).toHaveLength(1);
  });
});

describe('texto e fonte no PDF', () => {
  it('o texto é texto (o leitor o extrai), linha por linha, e a fonte vai embutida inteira, com o nome PostScript', async () => {
    const { arquivos } = await exportar(cena('texto'));
    const bytes = arquivos[0]?.bytes as Uint8Array;
    const { textos } = await desenhar(bytes);
    expect(textos.join('|')).toBe('JAZZ NA PRAÇA|O agente|faz a produção|, você faz o design.|A partir de|R$ 19,9|0.|E N T R A D A|F R A N C A|ao vivo|meio-negrito|E|NTRADA|F|RANCA');
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

  it('todo glifo escrito é o de um caractere: nada de desenho alternativo nem ligadura, que o Illustrator converte em contorno', async () => {
    const frase = 'Cappuccino cremoso, minimo';
    const doc = mudar(cena('texto'), [
      {
        op: 'criarNo',
        prancheta: 'Peça',
        no: { tipo: 'texto', nome: 'Cardápio', conteudo: frase, x: 20, y: 270, largura: 360, altura: 26, fonte: 'Fraunces', peso: 600, tamanho: 20, cor: '#1c1917', entrelinha: 1.2 },
      },
    ]);
    const bytes = (await exportar(doc, 'cena', undefined, comFraunces())).arquivos[0]?.bytes as Uint8Array;
    // o leitor independente devolve a frase inteira, num trecho só, sem buraco onde a fonte trocaria o desenho da letra
    const { textos } = await desenhar(bytes);
    expect(textos).toContain(frase);
    // e nos bytes: os glifos da frase são os do mapa de caracteres da fonte (lido aqui direto da tabela cmap, formato 4)
    const esperados = [...frase].map((ch) => glifoDoCaractere(FRAUNCES, ch.codePointAt(0) as number));
    const escritos = glifosEscritos(bytes);
    const posicao = escritos.findIndex((_, i) => esperados.every((g, k) => escritos[i + k] === g));
    expect(posicao, `glifos escritos: ${escritos.slice(-esperados.length).join(' ')}; esperados: ${esperados.join(' ')}`).toBeGreaterThanOrEqual(0);
  });

  it('o kerning da fonte vai escrito entre as letras (o texto continua inteiro, não letra por letra); sem kerning na camada, não vai', async () => {
    const com = mudar(cena('texto'), [{ op: 'alterar', alvo: 'Peça/Título', props: { conteudo: 'AVATAR', espacamento: 0 } }]);
    const linhaDoTitulo = (bytes: Uint8Array): string => /\[([^\]]*)\] TJ/.exec(fluxos(bytes).join('\n'))?.[1] ?? '';
    const escrito = linhaDoTitulo((await exportar(com)).arquivos[0]?.bytes as Uint8Array);
    // seis letras, com ajuste (em milésimos do corpo) entre pares como "AV": número positivo aproxima
    expect(escrito.match(/<[0-9a-f]{4}>/g)).toHaveLength(6);
    expect(Number(/<[0-9a-f]{4}> (-?[\d.]+) <[0-9a-f]{4}>/.exec(escrito)?.[1])).toBeGreaterThan(0);
    const sem = mudar(com, [{ op: 'alterar', alvo: 'Peça/Título', props: { kerning: 'nenhum' } }]);
    expect(linhaDoTitulo((await exportar(sem)).arquivos[0]?.bytes as Uint8Array)).toMatch(/^( ?<[0-9a-f]{4}>){6} ?$/);
  });

  it('versalete: as letras escritas em minúscula vão em maiúscula a 70% do corpo, na mesma linha de texto', async () => {
    const desenho = fluxos((await exportar(cena('texto'))).arquivos[0]?.bytes as Uint8Array).join('\n');
    const camada = desenho.slice(desenho.lastIndexOf('BT', desenho.indexOf(' 9.8 Tf')), desenho.indexOf('ET', desenho.indexOf(' 9.8 Tf')));
    // "Entrada Franca": E em 14, "NTRADA " em 9,8, F em 14, "RANCA" em 9,8; uma matriz de texto só (uma linha)
    expect([...camada.matchAll(/ ([\d.]+) Tf/g)].map((m) => m[1])).toEqual(['14', '9.8', '14', '9.8']);
    expect(camada.match(/ Tm\n/g)).toHaveLength(1);
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

  it('peça com camada de ajuste: parece o render do Otto COM o ajuste, nas duas pranchetas', async () => {
    for (const doc of [cena('peca'), pecaEmCamadas()]) {
      const bytes = (await exportar(doc, 'peca', 'juntas')).arquivos[0]?.bytes as Uint8Array;
      for (const [i, p] of doc.pranchetas.entries()) expect(diferenca(renderDoOtto(doc, p).rgba, (await desenhar(bytes, i + 1)).rgba)).toBeLessThan(0.03);
    }
  });

  it('grupo com opacidade, máscara e recorte, com o ajuste e o véu: parece o render do Otto', async () => {
    const doc = cena('grupo-e-ajuste');
    const p = doc.pranchetas[0] as Prancheta;
    const desenhado = await desenhar((await exportar(doc)).arquivos[0]?.bytes as Uint8Array);
    expect(diferenca(renderDoOtto(doc, p).rgba, desenhado.rgba)).toBeLessThan(0.03);
  });
});

describe('relatório do PDF', () => {
  it('degradê com parada transparente vira imagem no PDF (no SVG vai como degradê)', async () => {
    const doc = pecaEmCamadas();
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
      const a = (await exportar(c.doc, c.nome, 'juntas')).arquivos[0] as { nome: string; bytes: Uint8Array };
      const b = (await exportar(c.doc, c.nome, 'juntas')).arquivos[0] as { nome: string; bytes: Uint8Array };
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
