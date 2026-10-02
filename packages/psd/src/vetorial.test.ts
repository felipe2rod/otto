// A saída vetorial (ADR 034): o SVG de cada cena é relido por um analisador de XML independente (estrutura) e desenhado
// por um renderizador de SVG independente (aparência), e comparado com o render de referência do Otto.
// Os SVGs das cenas são versionados em packages/psd/goldens: são os arquivos para abrir no Illustrator.
//
// Mudou o mapeamento de propósito? Regenere e confira o diff antes de versionar:
//   docker compose run --rm -e ATUALIZAR_GOLDENS=1 teste pnpm --filter @otto/psd test
//   docker compose run --rm teste pnpm exec biome check --write packages/psd/goldens
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { aplicarLote, type Documento, type No, type Prancheta } from '@otto/documento';
import { comparar, criarSessao, renderizarPrancheta } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import { Resvg } from '@resvg/resvg-js';
import type { CanvasKit } from 'canvaskit-wasm';
import { XMLParser } from 'fast-xml-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoEmSvg, criarFormatoSvg, idDoSvg } from './adaptadores/svg';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import type { RecursosConhecidos, RecursosDaExportacao } from './exportar';
import { exportarVetorial, imagemEquivalenteEmNormal, relatorioDeExportacaoVetorial } from './exportar-vetorial';
import { MAPEAMENTO } from './mapeamento';

const PASTA = path.resolve(import.meta.dirname, '../goldens');
const INDICE = path.join(PASTA, 'indice-do-svg.json');
const FONTES = path.resolve(import.meta.dirname, '../../render/recursos-de-teste/fontes');
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
const exportar = (doc: Documento, nome = 'cena') => exportarVetorial(ck, criarFormatoSvg(), doc, recursos, { nome });
const texto = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
function mudar(doc: Documento, operacoes: unknown[]): Documento {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote: 'mudanca-do-teste' });
  if (!r.ok) throw new Error(`${r.erro.op} ${r.erro.alvo ?? ''}: ${r.erro.mensagem}`);
  return r.doc;
}

/** A árvore do SVG pelo analisador de XML, na ordem do arquivo: [nome do elemento, atributos, filhos]. */
interface Elemento {
  nome: string;
  atributos: Record<string, string>;
  filhos: Elemento[];
  texto: string;
}
function ler(svg: string): Elemento {
  const bruto = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', trimValues: false, parseTagValue: false }).parse(svg) as Record<string, unknown>[];
  const converter = (no: Record<string, unknown>): Elemento | undefined => {
    const nome = Object.keys(no).find((k) => k !== ':@');
    if (!nome || nome === '#text' || nome === '?xml') return undefined;
    const filhosBrutos = no[nome] as Record<string, unknown>[];
    return {
      nome,
      atributos: (no[':@'] ?? {}) as Record<string, string>,
      filhos: filhosBrutos.map(converter).filter((x): x is Elemento => Boolean(x)),
      texto: filhosBrutos.map((f) => (typeof f['#text'] === 'string' || typeof f['#text'] === 'number' ? String(f['#text']) : '')).join(''),
    };
  };
  const raiz = bruto.map(converter).find((e) => e?.nome === 'svg');
  if (!raiz) throw new Error('sem <svg>');
  return raiz;
}
const todos = (e: Elemento): Elemento[] => [e, ...e.filhos.flatMap(todos)];
const porId = (raiz: Elemento, id: string): Elemento => {
  const achado = todos(raiz).find((e) => e.atributos.id === id);
  if (!achado)
    throw new Error(
      `sem elemento de id "${id}" (há: ${todos(raiz)
        .flatMap((e) => e.atributos.id ?? [])
        .join(', ')})`,
    );
  return achado;
};
/** As camadas do arquivo, de baixo para cima. */
const camadasDe = (svg: Elemento): Elemento[] => svg.filhos.filter((e) => e.nome !== 'defs' && e.nome !== 'title');
/** A camada de texto é um grupo com o nome, e o <text> dentro. */
const textoDe = (raiz: Elemento, id: string): Elemento => porId(raiz, id).filhos[0] as Elemento;

/** O SVG desenhado por um renderizador independente (resvg), com as fontes de teste. */
function desenhar(svg: Uint8Array): { largura: number; altura: number; rgba: Uint8Array } {
  const r = new Resvg(Buffer.from(svg), {
    font: { fontFiles: ['Anton-Regular.ttf', 'IBMPlexSans-Regular.ttf', 'IBMPlexSans-Bold.ttf', 'DMSerifDisplay-Regular.ttf'].map((f) => path.join(FONTES, f)), loadSystemFonts: false },
  }).render();
  return { largura: r.width, altura: r.height, rgba: new Uint8Array(r.pixels) };
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
/** Fração dos pixels que diferem em mais de 24 níveis: o que sobra depois da borda suavizada, que cada renderizador faz do seu jeito. */
function diferenca(a: Uint8Array, b: Uint8Array): number {
  let acima = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(Math.abs((a[i] as number) - (b[i] as number)), Math.abs((a[i + 1] as number) - (b[i + 1] as number)), Math.abs((a[i + 2] as number) - (b[i + 2] as number))) > 24) acima++;
  }
  return acima / (a.length / 4);
}

describe('nomes e caminhos no SVG', () => {
  it('o id segue a convenção do Illustrator: espaço vira "_", e o que não cabe num nome XML vira "_xHH_"', () => {
    expect(idDoSvg('Título')).toBe('Título');
    expect(idDoSvg('Fundo do botão')).toBe('Fundo_do_botão');
    expect(idDoSvg('Logo · #fff7ed (2)')).toBe('Logo__xB7___x23_fff7ed__x28_2_x29_');
    expect(idDoSvg('20% off')).toBe('_x32_0_x25__off');
    expect(idDoSvg('a_b')).toBe('a_x5F_b');
  });

  it('caminho fechado e aberto, em M, C e Z', () => {
    const no = (x: number, y: number) => ({ chegada: [x, y] as [number, number], ancora: [x, y] as [number, number], saida: [x, y] as [number, number], ligado: false });
    expect(caminhoEmSvg([{ aberto: false, regra: 'nao-zero', nos: [no(0, 0), no(10, 0), no(10, 5.12345)] }])).toBe('M0 0C0 0 10 0 10 0C10 0 10 5.123 10 5.123C10 5.123 0 0 0 0Z');
    expect(caminhoEmSvg([{ aberto: true, regra: 'nao-zero', nos: [no(0, 0), no(10, 0)] }])).toBe('M0 0C0 0 10 0 10 0');
  });
});

describe('estrutura do SVG, relida por um analisador independente', () => {
  it('forma: um caminho por camada, com o nome no id, a cor resolvida, o degradê e o traço por dentro', async () => {
    const { arquivos } = await exportar(cena('forma'));
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(svg.atributos).toMatchObject({ width: '400', height: '300', viewBox: '0 0 400 300' });
    // de baixo para cima, como no documento
    expect(svg.filhos.filter((e) => e.nome !== 'defs' && e.nome !== 'title').map((e) => e.atributos.id)).toEqual([
      'Fundo',
      'Retângulo',
      'Arredondado',
      'Elipse',
      'Degradê_linear',
      'Degradê_radial',
      'Com_traço_e_sombra',
      'Girada',
      'Com_filtro',
    ]);
    expect(porId(svg, 'Retângulo')).toMatchObject({ nome: 'path', atributos: { fill: '#c2410c', d: 'M20 20C20 20 120 20 120 20C120 20 120 90 120 90C120 90 20 90 20 90C20 90 20 20 20 20Z' } });
    expect(porId(svg, 'Fundo').atributos.fill).toBe('#fafaf9');
    const linear = todos(svg).find((e) => e.nome === 'linearGradient');
    expect(linear?.atributos.gradientUnits).toBe('userSpaceOnUse');
    expect(linear?.filhos.map((s) => s.atributos['stop-color'])).toEqual(['#0ea5e9', '#fde047']);
    expect(porId(svg, 'Degradê_linear').atributos.fill).toBe(`url(#${linear?.atributos.id})`);
    expect(todos(svg).some((e) => e.nome === 'radialGradient')).toBe(true);
    expect(porId(svg, 'Girada').atributos.opacity).toBe('0.8');
    // sombra e filtro não têm equivalente: a camada vira imagem
    expect(porId(svg, 'Com_traço_e_sombra').nome).toBe('image');
    expect(porId(svg, 'Com_filtro').atributos['xlink:href']).toMatch(/^data:image\/png;base64,iVBOR/);
  });

  it('forma só com traço: o contorno vai com o dobro da espessura, cortado pela própria forma', async () => {
    const r = aplicarLote(cena('forma'), [{ op: 'alterar', alvo: 'Peça/Com traço e sombra', props: { sombra: null } }], { autoria: { tipo: 'designer' }, idDoLote: 'sem-sombra' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const svg = ler(texto((await exportar(r.doc)).arquivos[0]?.bytes as Uint8Array));
    const grupo = porId(svg, 'Com_traço_e_sombra');
    expect(grupo.nome).toBe('g');
    expect(grupo.filhos.map((f) => f.nome)).toEqual(['path', 'path']);
    expect(grupo.filhos[1]?.atributos).toMatchObject({ fill: 'none', stroke: '#0f172a', 'stroke-width': '12' });
    expect(grupo.filhos[1]?.atributos['clip-path']).toMatch(/^url\(#recorte-/);
  });

  it('texto: é <text> dentro de um grupo com o nome, uma linha por vez, com a família, o peso e o nome PostScript de reserva; os trechos viram pedaços', async () => {
    const { arquivos, relatorio } = await exportar(cena('texto'));
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(porId(svg, 'Título').nome).toBe('g');
    const titulo = textoDe(svg, 'Título');
    expect(titulo.nome).toBe('text');
    expect(titulo.atributos).toMatchObject({ 'font-family': "'Anton', 'Anton-Regular'", 'font-weight': '400', 'font-size': '52', fill: '#1c1917', transform: 'matrix(1 0 0 1 20 16)' });
    expect(titulo.atributos['letter-spacing']).toBe('1.04');
    expect(titulo.filhos.map((t) => t.texto)).toEqual(['JAZZ NA PRAÇA']);
    const paragrafo = textoDe(svg, 'Parágrafo');
    // duas linhas, cada uma começando num <tspan> com x e y
    const inicios = paragrafo.filhos.filter((t) => t.atributos.x !== undefined);
    expect(inicios).toHaveLength(2);
    expect(Number(inicios[1]?.atributos.y)).toBeGreaterThan(Number(inicios[0]?.atributos.y));
    expect(paragrafo.filhos.map((t) => t.texto).join('|')).toBe('O agente |faz a produção|, você faz o design.|A partir de| R$ 19,9|0.');
    expect(paragrafo.filhos[1]?.atributos).toMatchObject({ 'font-weight': '700', fill: '#c2410c', 'font-family': "'IBM Plex Sans', 'IBMPlexSans-Bold'" });
    expect(paragrafo.filhos[4]?.atributos).toMatchObject({ 'font-family': "'DM Serif Display', 'DMSerifDisplay-Regular'", 'font-size': '24' });
    // caixa alta vai já em maiúsculas; o peso que não existe sai com o mais próximo
    expect(textoDe(svg, 'Caixa_alta').filhos[0]?.texto).toBe('ENTRADA FRANCA');
    expect(textoDe(svg, 'Peso_trocado').atributos['font-weight']).toBe('700');
    expect(textoDe(svg, 'Girado').atributos.transform).toMatch(/^matrix\(0\.99 -0\.139 0\.139 0\.99 /);
    expect(relatorio.substituicoes).toHaveLength(1);
    expect(relatorio.avisos.map((a) => a.codigo)).toEqual(['texto-em-linhas', 'instalar-fontes', 'fonte-substituida', 'virou-imagem']);
  });

  it('opacidade do texto: vai no grupo em volta, e não no <text>, onde o Illustrator a ignora', async () => {
    const svg = ler(texto((await exportar(cena('texto'))).arquivos[0]?.bytes as Uint8Array));
    expect(porId(svg, 'Versalete')).toMatchObject({ nome: 'g', atributos: { opacity: '0.75' } });
    expect(textoDe(svg, 'Versalete').atributos.opacity).toBeUndefined();
    // nenhum <text> do arquivo leva opacidade
    expect(todos(svg).filter((e) => e.nome === 'text' && e.atributos.opacity !== undefined)).toEqual([]);
  });

  it('versalete: as letras escritas em minúscula vão em maiúscula a 70% do corpo, na mesma linha; sem `font-variant`, que cada programa desenha do seu jeito', async () => {
    const svg = ler(texto((await exportar(cena('texto'))).arquivos[0]?.bytes as Uint8Array));
    const versalete = textoDe(svg, 'Versalete');
    expect(versalete.atributos['font-variant']).toBeUndefined();
    expect(versalete.filhos.map((t) => [t.texto, t.atributos['font-size']])).toEqual([
      ['E', undefined],
      ['NTRADA', '9.8'],
      // o espaço não tem caixa: vai no corpo inteiro, como no motor
      [' F', undefined],
      ['RANCA', '9.8'],
    ]);
    // uma linha só: só o primeiro pedaço diz onde ela começa
    expect(versalete.filhos.filter((t) => t.atributos.x !== undefined)).toHaveLength(1);
  });

  it('é SVG 1.1 completo, declarado: sem isso o Illustrator o trata como SVG Tiny e avisa que perde o recorte', async () => {
    const arquivo = texto((await exportar(cena('imagem'))).arquivos[0]?.bytes as Uint8Array);
    expect(arquivo).toContain('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">');
    expect(ler(arquivo).atributos).toMatchObject({ version: '1.1', baseProfile: 'full' });
    // e o recorte continua lá
    expect(arquivo).toContain('<clipPath');
  });

  it('foto: a imagem original embutida, com o corte da caixa como recorte; com filtro, ajuste ou máscara de sujeito vira imagem', async () => {
    const { arquivos, relatorio } = await exportar(cena('imagem'));
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    const cobrir = porId(svg, 'Cobrir');
    expect(cobrir.nome).toBe('g');
    expect(cobrir.atributos['clip-path']).toMatch(/^url\(#recorte-/);
    const imagem = cobrir.filhos[0] as Elemento;
    expect(imagem.atributos).toMatchObject({ width: '1280', height: '853', preserveAspectRatio: 'none' });
    expect(imagem.atributos['xlink:href']).toMatch(/^data:image\/jpeg;base64,\/9j\//);
    // a foto de 1280 × 853 cobrindo 120 × 130: escala 130/853, centrada na caixa
    const m = /matrix\(([^)]+)\)/
      .exec(imagem.atributos.transform ?? '')?.[1]
      ?.split(' ')
      .map(Number) as number[];
    expect(m[0]).toBeCloseTo(130 / 853, 3);
    expect(m[5]).toBeCloseTo(10, 3);
    const l = Object.fromEntries(relatorio.camadas.map((x) => [x.camada, x]));
    expect(l.Cobrir).toMatchObject({ destino: 'nativo-editavel', mapeamento: 'no:imagem' });
    expect(l['Com filtros']).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'filtro:desfoque' });
    expect(l['Com ajuste de cor']).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'ajuste-de-cor-da-foto' });
    expect(l.Sujeito).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'efeito:sombra' });
    expect(l.Sujeito?.observacao).toContain('sombra projetada, máscara do sujeito');
    expect(porId(svg, 'Sujeito').nome).toBe('image');
  });

  it('vetor: um grupo com um caminho por caminho; regra par-ímpar e contorno', async () => {
    const r = aplicarLote(cena('vetor'), [{ op: 'alterar', alvo: 'Peça/Logo', props: { sombra: null } }], { autoria: { tipo: 'designer' }, idDoLote: 'sem-sombra' });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const svg = ler(texto((await exportar(r.doc)).arquivos[0]?.bytes as Uint8Array));
    expect(porId(svg, 'Anel').filhos[0]?.atributos).toMatchObject({ fill: '#1d4ed8', 'fill-rule': 'evenodd' });
    expect(porId(svg, 'Onda').filhos[0]?.atributos).toMatchObject({ fill: 'none', stroke: '#be123c', 'stroke-width': '6.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    expect(porId(svg, 'Logo').filhos.map((f) => f.nome)).toEqual(['path', 'path']);
    expect(porId(svg, 'Logo').filhos[1]?.atributos).toMatchObject({ fill: '#fde047', stroke: '#0f172a' });
  });

  it('grupo: um <g> com as camadas dentro; grupo com máscara em degradê e recorte com base em texto viram imagem', async () => {
    // sem as camadas que achatam (os dois ajustes soltos e o véu em luz suave), para ver as camadas uma a uma
    const doc = mudar(cena('grupo-e-ajuste'), [
      { op: 'remover', alvo: 'Peça/Curvas' },
      { op: 'remover', alvo: 'Peça/Níveis em sobrepor' },
      { op: 'alterar', alvo: 'Peça/Véu bloqueado', props: { bloqueado: false } },
      { op: 'alterar', alvo: 'Peça/Véu bloqueado', props: { modoDeMesclagem: 'normal' } },
    ]);
    const { arquivos, relatorio } = await exportar(doc);
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(camadasDe(svg).map((e) => e.atributos.id)).toEqual(['Fundo', 'Foto', 'Selo', 'Luzes', 'Base_do_recorte', 'Véu_bloqueado', 'Oculta']);
    const selo = porId(svg, 'Selo');
    expect(selo.nome).toBe('g');
    expect(selo.atributos.opacity).toBe('0.9');
    expect(selo.filhos.map((f) => f.atributos.id)).toEqual(['Disco', 'Data']);
    expect(textoDe(svg, 'Data').filhos.map((t) => t.texto)).toEqual(['20', 'JUN']);
    expect(porId(svg, 'Oculta').atributos.display).toBe('none');
    const l = Object.fromEntries(relatorio.camadas.map((x) => [x.camada, x]));
    // o grupo tem máscara e, dentro, uma camada em luz linear, que age sobre a foto abaixo do grupo: o grupo vira a imagem equivalente
    expect(l.Luzes).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'modo:luz-linear' });
    expect(l.Luz?.observacao).toBe('está dentro da imagem de "Luzes"');
    // a base do recorte é texto, e leva um ajuste preso: o conjunto é uma imagem, com o ajuste aplicado
    expect(l['Base do recorte']).toMatchObject({ destino: 'raster-com-aviso' });
    expect(l['Foto no texto']?.observacao).toBe('está dentro da imagem de "Base do recorte"');
    expect(l['Preto e branco no texto']).toMatchObject({ destino: 'raster-com-aviso', observacao: 'está dentro da imagem de "Base do recorte"' });
    expect(porId(svg, 'Base_do_recorte').nome).toBe('image');
    expect(relatorio.avisos.map((a) => a.codigo)).toEqual(['texto-em-linhas', 'instalar-fontes', 'virou-imagem', 'modo-em-imagem']);
  });

  it('recorte com base em forma: as camadas presas vão num grupo cortado pela forma da base; máscara de forma sem borda suave vira recorte', async () => {
    const r = aplicarLote(
      cena('forma'),
      [
        { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'forma', forma: 'retangulo', nome: 'Presa', x: 250, y: 0, largura: 150, altura: 60, preenchimento: '#000000', recortadaNaDeBaixo: true } },
        { op: 'reordenar', alvo: 'Peça/Presa', posicao: 3 },
        { op: 'alterar', alvo: 'Peça/Retângulo', props: { mascara: { tipo: 'forma', forma: 'elipse', x: 20, y: 20, largura: 50, altura: 50 } } },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'recorte' },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    const { arquivos, relatorio } = await exportar(r.doc);
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    const camadas = svg.filhos.filter((e) => e.nome !== 'defs' && e.nome !== 'title');
    const i = camadas.findIndex((e) => e.atributos.id === 'Elipse');
    expect(camadas[i + 1]).toMatchObject({ nome: 'g', filhos: [{ atributos: { id: 'Presa' } }] });
    const recorte = /url\(#(.+)\)/.exec(camadas[i + 1]?.atributos['clip-path'] ?? '')?.[1] as string;
    expect(porId(svg, recorte).filhos[0]?.atributos.d).toBe(porId(svg, 'Elipse').atributos.d);
    // a máscara de forma do retângulo: um grupo de recorte em volta dele
    const comMascara = camadas.find((e) => e.filhos[0]?.atributos.id === 'Retângulo');
    expect(comMascara?.atributos['clip-path']).toMatch(/^url\(#recorte-/);
    expect(relatorio.camadas.find((x) => x.camada === 'Retângulo')).toMatchObject({ destino: 'nativo-editavel' });
  });
});

describe('camada de ajuste: achatar, para a cor ficar certa (decisão do Felipe, 2026-10-02)', () => {
  /** A peça com o ajuste no meio da pilha: acima da foto e da película, abaixo dos textos. */
  const comAjusteNoMeio = (): Documento => mudar(cena('peca'), [{ op: 'reordenar', alvo: 'Feed/Níveis', posicao: 2 }]);

  it('camada de ajuste: ela e tudo o que está abaixo viram UMA imagem com o fundo; o que está acima continua vetor; nada fica de fora', async () => {
    const doc = comAjusteNoMeio();
    const { arquivos, relatorio } = await exportar(doc, 'Festival');
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(camadasDe(svg).map((e) => e.atributos.id)).toEqual(['Fundo__x28_achatado_x29_', 'Sobretítulo', 'Título', 'Botão']);
    expect(porId(svg, 'Fundo__x28_achatado_x29_')).toMatchObject({ nome: 'image', atributos: { width: '540', height: '676', transform: 'matrix(0.5 0 0 0.5 0 0)' } });
    expect(textoDe(svg, 'Sobretítulo').nome).toBe('text');
    const feed = relatorio.camadas.filter((x) => x.prancheta === 'Feed');
    const l = Object.fromEntries(feed.map((x) => [x.camada, x]));
    for (const nome of ['Fundo', 'Foto', 'Película', 'Níveis']) {
      expect(l[nome], nome).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'ajuste:niveis' });
      expect(l[nome]?.observacao).toBe('achatada numa imagem só com o que está abaixo de "Níveis" (camada de ajuste), para a cor ficar certa');
    }
    expect(l.Sobretítulo).toMatchObject({ destino: 'nativo-editavel' });
    expect(relatorio.camadas.some((x) => x.destino === 'omitido-com-aviso')).toBe(false);
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('camadas-achatadas');
    expect(relatorio.avisos.map((a) => a.codigo)).not.toContain('ficou-de-fora');
  });

  it('camada de ajuste: o arquivo parece o render do Otto COM o ajuste', async () => {
    for (const doc of [comAjusteNoMeio(), cena('peca')]) {
      const { arquivos } = await exportar(doc, 'Festival');
      const p = doc.pranchetas[0] as Prancheta;
      const desenhado = desenhar(arquivos[0]?.bytes as Uint8Array);
      const com = renderDoOtto(doc, p);
      expect(diferenca(com.rgba, desenhado.rgba)).toBeLessThan(0.03);
      // contra o render sem o ajuste a diferença é maior: a comparação enxerga o ajuste
      const sem = renderDoOtto(doc, { ...p, filhos: p.filhos.filter((n: No) => n.tipo !== 'ajuste') });
      const media = (r: { rgba: Uint8Array }): number => comparar(r.rgba, desenhado.rgba, p.largura, p.altura).d.media;
      expect(media(sem)).toBeGreaterThan(media(com) * 2);
    }
  });

  it('ajuste no topo de tudo: a prancheta inteira é uma imagem, e o relatório diz', async () => {
    const { arquivos, relatorio } = await exportar(cena('peca'), 'Festival');
    expect(arquivos.map((a) => a.nome)).toEqual(['Festival - Feed.svg', 'Festival - Story.svg']);
    expect(relatorio.arquivos).toEqual(arquivos.map((a) => a.nome));
    expect(camadasDe(ler(texto(arquivos[0]?.bytes as Uint8Array))).map((e) => e.atributos.id)).toEqual(['Fundo__x28_achatado_x29_']);
    // a outra prancheta não tem ajuste: continua em camadas
    expect(camadasDe(ler(texto(arquivos[1]?.bytes as Uint8Array))).map((e) => e.atributos.id)).toEqual(['Fundo', 'Foto', 'Título', 'Logo']);
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('camadas-achatadas');
    expect(relatorio.camadas.filter((x) => x.prancheta === 'Feed').every((x) => x.destino === 'raster-com-aviso')).toBe(true);
  });

  it('ajuste preso a uma camada: só as duas viram imagem; o resto continua vetor', async () => {
    const doc = mudar(cena('forma'), [
      { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'ajuste', nome: 'Preto e branco', ajuste: { tipo: 'preto-e-branco' }, recortadaNaDeBaixo: true } },
      { op: 'reordenar', alvo: 'Peça/Preto e branco', posicao: 1 },
    ]);
    const { arquivos, relatorio } = await exportar(doc);
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(
      camadasDe(svg)
        .map((e) => e.atributos.id)
        .slice(0, 4),
    ).toEqual(['Fundo', 'Retângulo', 'Arredondado', 'Elipse']);
    expect(porId(svg, 'Fundo').nome).toBe('path');
    expect(porId(svg, 'Retângulo').nome).toBe('image');
    expect(porId(svg, 'Arredondado').nome).toBe('path');
    const l = Object.fromEntries(relatorio.camadas.map((x) => [x.camada, x]));
    expect(l.Retângulo).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'ajuste:preto-e-branco' });
    expect(l['Preto e branco']?.observacao).toBe('está dentro da imagem de "Retângulo"');
    const p = doc.pranchetas[0] as Prancheta;
    expect(diferenca(renderDoOtto(doc, p).rgba, desenhar(arquivos[0]?.bytes as Uint8Array).rgba)).toBeLessThan(0.01);
  });

  it('ajuste dentro de grupo em "atravessar": achata o que está abaixo do grupo, e o grupo junto', async () => {
    const doc = mudar(cena('forma'), [
      { op: 'criarNo', prancheta: 'Peça', no: { tipo: 'ajuste', nome: 'Preto e branco', ajuste: { tipo: 'preto-e-branco' } } },
      { op: 'reordenar', alvo: 'Peça/Preto e branco', posicao: 3 },
      { op: 'agrupar', alvos: ['Peça/Elipse', 'Peça/Preto e branco'], nome: 'Par' },
    ]);
    const { arquivos } = await exportar(doc);
    expect(
      camadasDe(ler(texto(arquivos[0]?.bytes as Uint8Array)))
        .map((e) => e.atributos.id)
        .slice(0, 2),
    ).toEqual(['Fundo__x28_achatado_x29_', 'Degradê_linear']);
    const p = doc.pranchetas[0] as Prancheta;
    expect(diferenca(renderDoOtto(doc, p).rgba, desenhar(arquivos[0]?.bytes as Uint8Array).rgba)).toBeLessThan(0.01);
  });
});

describe('modo de mesclagem que o arquivo não guarda: a camada vira a imagem equivalente em modo normal', () => {
  /** diferença média, em níveis de 0 a 255, nos três canais */
  const niveis = (a: Uint8Array, b: Uint8Array): number => {
    let soma = 0;
    for (let k = 0; k < a.length; k += 4)
      soma += Math.abs((a[k] as number) - (b[k] as number)) + Math.abs((a[k + 1] as number) - (b[k + 1] as number)) + Math.abs((a[k + 2] as number) - (b[k + 2] as number));
    return soma / ((a.length / 4) * 3);
  };

  it('a conta: cor × alfa + o de baixo × (1 − alfa) = o resultado, com o menor alfa possível; onde nada muda, transparente', () => {
    // quatro pixels: igual; escurecido (multiplicação); clareado (tela); trocado por inteiro
    const sem = new Uint8Array([200, 100, 50, 255, 200, 100, 50, 255, 200, 100, 50, 255, 0, 255, 0, 255]);
    const com = new Uint8Array([200, 100, 50, 255, 100, 50, 25, 255, 220, 180, 150, 255, 255, 0, 255, 255]);
    const { rgba, area } = imagemEquivalenteEmNormal(sem, com, 4, 1);
    expect(area).toEqual({ x: 1, y: 0, w: 3, h: 1 });
    expect([...rgba.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    // escurecer pela metade: preto a 50%
    expect([...rgba.subarray(4, 8)]).toEqual([1, 0, 0, 128]);
    expect(rgba[15]).toBe(255);
    // recompondo em modo normal, com a conta de 8 bits de qualquer programa, volta o resultado a 1 nível
    for (let i = 0; i < 16; i += 4) {
      const a = (rgba[i + 3] as number) / 255;
      for (let c = 0; c < 3; c++) expect(Math.abs(Math.round((rgba[i + c] as number) * a + (sem[i + c] as number) * (1 - a)) - (com[i + c] as number))).toBeLessThanOrEqual(1);
    }
  });

  it('no SVG: o Illustrator não aplica modo de mesclagem, e a camada abria como um véu. Ela vira imagem, o resto continua vetor, e o arquivo não leva modo nenhum', async () => {
    const doc = mudar(cena('forma'), [{ op: 'alterar', alvo: 'Peça/Elipse', props: { modoDeMesclagem: 'multiplicacao' } }]);
    const { arquivos, relatorio } = await exportar(doc);
    const arquivo = texto(arquivos[0]?.bytes as Uint8Array);
    expect(arquivo).not.toContain('mix-blend-mode');
    const svg = ler(arquivo);
    expect(camadasDe(svg).map((e) => e.atributos.id)).toEqual(['Fundo', 'Retângulo', 'Arredondado', 'Elipse', 'Degradê_linear', 'Degradê_radial', 'Com_traço_e_sombra', 'Girada', 'Com_filtro']);
    expect(porId(svg, 'Elipse').nome).toBe('image');
    expect(porId(svg, 'Elipse').atributos.opacity).toBeUndefined();
    expect(porId(svg, 'Arredondado').nome).toBe('path');
    const l = Object.fromEntries(relatorio.camadas.map((x) => [x.camada, x]));
    expect(l.Elipse).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'modo-no-svg' });
    expect(l.Elipse?.observacao).toContain('modo de mesclagem multiplicacao: virou uma imagem em modo normal');
    expect(l.Fundo).toMatchObject({ destino: 'nativo-editavel' });
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('modo-em-imagem');
    expect(relatorio.avisos.map((a) => a.codigo)).not.toContain('camadas-achatadas');
    // e nenhuma cena de golden leva modo de mesclagem no SVG
    for (const c of cenasDeGolden()) for (const a of (await exportar(c.doc, c.nome)).arquivos) expect(texto(a.bytes), a.nome).not.toContain('mix-blend-mode');
    // desenhado em modo normal (como o Illustrator faz), o arquivo é o render do Otto
    const p = doc.pranchetas[0] as Prancheta;
    expect(diferenca(renderDoOtto(doc, p).rgba, desenhar(arquivos[0]?.bytes as Uint8Array).rgba)).toBeLessThan(0.01);
  });

  it('o véu da conferência: forma do tamanho da prancheta em luz suave, por cima de tudo, não cobre a peça, e o texto abaixo dela continua texto', async () => {
    const doc = mudar(cena('grupo-e-ajuste'), [
      { op: 'remover', alvo: 'Peça/Curvas' },
      { op: 'remover', alvo: 'Peça/Níveis em sobrepor' },
    ]);
    const { arquivos, relatorio } = await exportar(doc);
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(camadasDe(svg).map((e) => e.atributos.id)).toEqual(['Fundo', 'Foto', 'Selo', 'Luzes', 'Base_do_recorte', 'Véu_bloqueado', 'Oculta']);
    expect(porId(svg, 'Véu_bloqueado').nome).toBe('image');
    expect(textoDe(svg, 'Data').nome).toBe('text');
    expect(relatorio.camadas.find((x) => x.camada === 'Véu bloqueado')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'modo-no-svg' });
    const p = doc.pranchetas[0] as Prancheta;
    const otto = renderDoOtto(doc, p);
    const desenhado = desenhar(arquivos[0]?.bytes as Uint8Array);
    // (o que sobra é a borda das formas e do texto, que cada renderizador suaviza do seu jeito)
    expect(niveis(otto.rgba, desenhado.rgba)).toBeLessThan(1.5);
    // com o véu em modo normal por cima (o que o Illustrator mostrava), a peça é outra: a comparação enxerga o véu
    const docComVeu = mudar(doc, [
      { op: 'alterar', alvo: 'Peça/Véu bloqueado', props: { bloqueado: false } },
      { op: 'alterar', alvo: 'Peça/Véu bloqueado', props: { modoDeMesclagem: 'normal' } },
    ]);
    const comVeu = renderDoOtto(docComVeu, docComVeu.pranchetas[0] as Prancheta);
    expect(niveis(comVeu.rgba, desenhado.rgba)).toBeGreaterThan(10);
  });

  it('dentro de grupo: no grupo em "atravessar" só a camada vira imagem; o grupo isolado vira uma imagem só; o grupo em "atravessar" com opacidade vira a imagem equivalente', async () => {
    const com = (modoDoGrupo: string, extra: object = {}): Documento =>
      mudar(cena('forma'), [
        { op: 'alterar', alvo: 'Peça/Elipse', props: { modoDeMesclagem: 'multiplicacao', x: 200 } },
        { op: 'agrupar', alvos: ['Peça/Arredondado', 'Peça/Elipse'], nome: 'Par', modoDeMesclagem: modoDoGrupo },
        ...(Object.keys(extra).length > 0 ? [{ op: 'alterar', alvo: 'Peça/Par', props: extra }] : []),
      ]);
    const ids = (svg: Elemento): (string | undefined)[] =>
      camadasDe(svg)
        .map((e) => e.atributos.id)
        .slice(0, 4);
    for (const [doc, tipoDoPar, observacao] of [
      [com('atravessar'), 'g', 'grupo'],
      [com('normal'), 'image', 'grupo com modo de mesclagem multiplicacao em "Elipse": virou uma imagem só, com a cor certa'],
      [com('atravessar', { opacidade: 0.7 }), 'image', 'modo de mesclagem multiplicacao em "Elipse": virou uma imagem em modo normal'],
    ] as const) {
      const { arquivos, relatorio } = await exportar(doc);
      const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
      expect(ids(svg)).toEqual(['Fundo', 'Retângulo', 'Par', 'Degradê_linear']);
      expect(porId(svg, 'Par').nome).toBe(tipoDoPar);
      expect(relatorio.camadas.find((x) => x.camada === 'Par')?.observacao).toContain(observacao);
      if (tipoDoPar === 'g')
        expect(porId(svg, 'Par').filhos.map((f) => [f.atributos.id, f.nome])).toEqual([
          ['Arredondado', 'path'],
          ['Elipse', 'image'],
        ]);
      const p = doc.pranchetas[0] as Prancheta;
      expect(diferenca(renderDoOtto(doc, p).rgba, desenhar(arquivos[0]?.bytes as Uint8Array).rgba), observacao).toBeLessThan(0.01);
    }
  });

  it('imagem do tamanho da prancheta por cima de texto: o relatório avisa de travar a imagem antes de clicar no texto', async () => {
    const doc = mudar(cena('texto'), [
      {
        op: 'criarNo',
        prancheta: 'Peça',
        no: {
          tipo: 'imagem',
          nome: 'Textura',
          arquivo: recursos.imagens[0]?.arquivo,
          larguraOriginal: 1280,
          alturaOriginal: 853,
          x: 0,
          y: 0,
          largura: 400,
          altura: 300,
          opacidade: 0.2,
        },
      },
    ]);
    expect((await exportar(doc)).relatorio.avisos.map((a) => a.codigo)).toContain('imagem-sobre-texto');
    expect((await exportar(cena('texto'))).relatorio.avisos.map((a) => a.codigo)).not.toContain('imagem-sobre-texto');
  });
});

describe('tamanho do arquivo: o SVG da padaria tinha 12 MB e levava 36 s para abrir', () => {
  const imagemDe = (e: Elemento): { tipo: string; largura: number } => ({ tipo: /^data:image\/(\w+);/.exec(e.atributos['xlink:href'] ?? '')?.[1] ?? '', largura: Number(e.atributos.width) });

  it('imagem sem transparência vai em JPEG, quando o motor codifica JPEG (variante completa); com transparência, em PNG', async () => {
    const completo = await carregarCanvasKit('completa');
    const svgDe = async (motor: CanvasKit) => ler(texto((await exportarVetorial(motor, criarFormatoSvg(), cena('peca'), recursos, { nome: 'peca' })).arquivos[0]?.bytes as Uint8Array));
    // o fundo achatado da prancheta é opaco
    expect(imagemDe(porId(await svgDe(completo), 'Fundo__x28_achatado_x29_')).tipo).toBe('jpeg');
    // a variante padrão do motor só codifica PNG: o arquivo sai certo, e maior
    expect(imagemDe(porId(await svgDe(ck), 'Fundo__x28_achatado_x29_')).tipo).toBe('png');
    // camada com sombra tem transparência em volta: PNG nas duas
    const comSombra = ler(texto((await exportarVetorial(completo, criarFormatoSvg(), cena('forma'), recursos, { nome: 'forma' })).arquivos[0]?.bytes as Uint8Array));
    expect(imagemDe(porId(comSombra, 'Com_traço_e_sombra')).tipo).toBe('png');
  });

  it('foto que virou imagem (filtro, ajuste de cor) não passa da resolução do arquivo dela: ampliar não acrescenta nada', async () => {
    // a foto de 1280 px mostrada com 1350 px de largura: no dobro seriam 800 px de imagem para a caixa de 400; sai com 400
    const ampliada = mudar(cena('imagem'), [{ op: 'alterar', alvo: 'Peça/Com filtros', props: { x: 0, y: 0, largura: 400, altura: 300, zoom: 3 } }]);
    expect(imagemDe(porId(ler(texto((await exportar(ampliada)).arquivos[0]?.bytes as Uint8Array)), 'Com_filtros')).largura).toBe(400);
    // a foto reduzida continua no dobro: 140 px de área (a caixa de 120 mais o alcance do desfoque), 280 de imagem
    expect(imagemDe(porId(ler(texto((await exportar(cena('imagem'))).arquivos[0]?.bytes as Uint8Array)), 'Com_filtros')).largura).toBe(280);
  });
});

describe('resolução das camadas que viram imagem', () => {
  it('quem exporta abaixo do dobro (prancheta grande demais para o dobro caber) recebe o aviso, igual no relatório prévio; no dobro, não', async () => {
    const doc = cena('forma');
    const reduzida = await exportarVetorial(ck, criarFormatoSvg(), doc, recursos, { nome: 'cena', escalaDaImagem: 1 });
    expect(reduzida.relatorio.avisos.map((a) => a.codigo)).toContain('imagem-em-resolucao-menor');
    expect(relatorioDeExportacaoVetorial(doc, conhecidos, { escalaDaImagem: 1 }).avisos).toEqual(reduzida.relatorio.avisos);
    // a imagem sai mesmo na resolução do documento: a camada com filtro ocupa 178 px, e são 178 px de imagem
    expect(porId(ler(texto(reduzida.arquivos[0]?.bytes as Uint8Array)), 'Com_filtro').atributos.width).toBe('178');
    expect((await exportar(doc)).relatorio.avisos.map((a) => a.codigo)).not.toContain('imagem-em-resolucao-menor');
    // sem camada que vire imagem, não há o que avisar
    expect(relatorioDeExportacaoVetorial(cena('vetor'), conhecidos, { escalaDaImagem: 1 }).avisos.map((a) => a.codigo)).toContain('virou-imagem');
    const semImagem = mudar(cena('vetor'), [{ op: 'alterar', alvo: 'Peça/Logo', props: { sombra: null } }]);
    expect(relatorioDeExportacaoVetorial(semImagem, conhecidos, { escalaDaImagem: 1 }).avisos.map((a) => a.codigo)).not.toContain('imagem-em-resolucao-menor');
  });
});

describe('aparência do SVG, desenhado por um renderizador independente', () => {
  // cenas em que nada fica de fora: o SVG tem de parecer o render do Otto
  for (const [nome, limite] of [
    ['forma', 0.01],
    ['texto', 0.05],
    ['imagem', 0.02],
    ['vetor', 0.01],
    ['efeitos', 0.02],
  ] as const) {
    it(`${nome}: menos de ${limite * 100}% dos pixels a mais de 24 níveis do render do Otto`, async () => {
      const doc = cena(nome);
      const { arquivos } = await exportar(doc);
      const p = doc.pranchetas[0] as Prancheta;
      const desenhado = desenhar(arquivos[0]?.bytes as Uint8Array);
      expect([desenhado.largura, desenhado.altura]).toEqual([p.largura, p.altura]);
      const otto = renderDoOtto(doc, p);
      expect(diferenca(otto.rgba, desenhado.rgba)).toBeLessThan(limite);
      // e a diferença média é de poucos níveis
      expect(comparar(otto.rgba, desenhado.rgba, p.largura, p.altura).d.media).toBeLessThan(2);
    });
  }
});

describe('relatório da saída vetorial', () => {
  it('sem renderizar, é o mesmo que a exportação devolve, fora a lista de arquivos', async () => {
    for (const c of cenasDeGolden()) {
      const { relatorio } = await exportar(c.doc, c.nome);
      expect({ ...relatorio, arquivos: [] }, c.nome).toEqual(relatorioDeExportacaoVetorial(c.doc, conhecidos));
    }
  });

  it('toda linha aponta para uma linha do mapeamento, e o destino é o da coluna vetorial', () => {
    const esperado = { 'nativo-editavel': 'Nativo', 'nativo-pixel': 'Nativo', 'raster-com-aviso': 'Raster', 'omitido-com-aviso': 'Omitido' } as const;
    for (const c of cenasDeGolden()) {
      for (const l of relatorioDeExportacaoVetorial(c.doc, conhecidos).camadas) expect(MAPEAMENTO[l.mapeamento].vetorial?.destino, `${c.nome}/${l.camada} (${l.mapeamento})`).toBe(esperado[l.destino]);
    }
  });

  it('texto com fonte que não foi entregue vira imagem vazia, e o relatório diz qual fonte falta', () => {
    const rel = relatorioDeExportacaoVetorial(cena('texto'), { ...conhecidos, fontes: conhecidos.fontes.filter((f) => f.familia !== 'Anton') });
    expect(rel.camadas.find((x) => x.camada === 'Título')).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'texto-sem-fonte' });
    expect(rel.emFalta.fontes).toEqual([{ familia: 'Anton', camadas: ['Peça / Título', 'Peça / Girado'] }]);
    expect(rel.avisos.map((a) => a.codigo)).toContain('fonte-em-falta');
  });
});

describe('goldens do SVG', () => {
  for (const c of cenasDeGolden()) {
    it(`${c.nome}: exportar duas vezes dá o mesmo arquivo, e ele é o golden`, async () => {
      const a = await exportar(c.doc, c.nome);
      const b = await exportar(c.doc, c.nome);
      expect(a.arquivos.map((x) => sha256(x.bytes))).toEqual(b.arquivos.map((x) => sha256(x.bytes)));
      for (const arquivo of a.arquivos) {
        const caminho = path.join(PASTA, arquivo.nome);
        if (ATUALIZAR) {
          writeFileSync(caminho, arquivo.bytes);
          indice[arquivo.nome] = { bytes: arquivo.bytes.length, sha256: sha256(arquivo.bytes) };
          writeFileSync(INDICE, `${JSON.stringify(indice, null, 2)}\n`);
          continue;
        }
        expect(indice[arquivo.nome], `não há golden para "${arquivo.nome}": rode com ATUALIZAR_GOLDENS=1 e confira`).toBeDefined();
        if (sha256(arquivo.bytes) !== indice[arquivo.nome]?.sha256) {
          const recusado = path.join(PASTA, '_recusado');
          mkdirSync(recusado, { recursive: true });
          writeFileSync(path.join(recusado, arquivo.nome), arquivo.bytes);
          expect.fail(`"${arquivo.nome}" mudou. Arquivo recusado em goldens/_recusado/${arquivo.nome}`);
        }
        expect(sha256(new Uint8Array(readFileSync(caminho)))).toBe(indice[arquivo.nome]?.sha256);
      }
    });
  }
});
