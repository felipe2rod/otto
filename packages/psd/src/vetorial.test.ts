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
import { Resvg } from '@resvg/resvg-js';
import type { CanvasKit } from 'canvaskit-wasm';
import { XMLParser } from 'fast-xml-parser';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoEmSvg, criarFormatoSvg, idDoSvg } from './adaptadores/svg';
import { recursosDeTeste } from './apoio-de-teste';
import { cenasDeGolden } from './cenas-de-golden';
import type { RecursosConhecidos, RecursosDaExportacao } from './exportar';
import { exportarVetorial, relatorioDeExportacaoVetorial } from './exportar-vetorial';
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

  it('texto: é <text>, uma linha por vez, com a família, o peso e o nome PostScript de reserva; os trechos viram pedaços', async () => {
    const { arquivos, relatorio } = await exportar(cena('texto'));
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    const titulo = porId(svg, 'Título');
    expect(titulo.nome).toBe('text');
    expect(titulo.atributos).toMatchObject({ 'font-family': "'Anton', 'Anton-Regular'", 'font-weight': '400', 'font-size': '52', fill: '#1c1917', transform: 'matrix(1 0 0 1 20 16)' });
    expect(titulo.atributos['letter-spacing']).toBe('1.04');
    expect(titulo.filhos.map((t) => t.texto)).toEqual(['JAZZ NA PRAÇA']);
    const paragrafo = porId(svg, 'Parágrafo');
    // duas linhas, cada uma começando num <tspan> com x e y
    const inicios = paragrafo.filhos.filter((t) => t.atributos.x !== undefined);
    expect(inicios).toHaveLength(2);
    expect(Number(inicios[1]?.atributos.y)).toBeGreaterThan(Number(inicios[0]?.atributos.y));
    expect(paragrafo.filhos.map((t) => t.texto).join('|')).toBe('O agente |faz a produção|, você faz o design.|A partir de| R$ 19,9|0.');
    expect(paragrafo.filhos[1]?.atributos).toMatchObject({ 'font-weight': '700', fill: '#c2410c', 'font-family': "'IBM Plex Sans', 'IBMPlexSans-Bold'" });
    expect(paragrafo.filhos[4]?.atributos).toMatchObject({ 'font-family': "'DM Serif Display', 'DMSerifDisplay-Regular'", 'font-size': '24' });
    // caixa alta vai já em maiúsculas; o peso que não existe sai com o mais próximo
    expect(porId(svg, 'Caixa_alta').filhos[0]?.texto).toBe('ENTRADA FRANCA');
    expect(porId(svg, 'Peso_trocado').atributos['font-weight']).toBe('700');
    expect(porId(svg, 'Girado').atributos.transform).toMatch(/^matrix\(0\.99 -0\.139 0\.139 0\.99 /);
    expect(relatorio.substituicoes).toHaveLength(1);
    expect(relatorio.avisos.map((a) => a.codigo)).toEqual(['texto-em-linhas', 'instalar-fontes', 'fonte-substituida', 'virou-imagem']);
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

  it('grupo, modo de mesclagem, recorte e o que fica de fora', async () => {
    const { arquivos, relatorio } = await exportar(cena('grupo-e-ajuste'));
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    const selo = porId(svg, 'Selo');
    expect(selo.nome).toBe('g');
    expect(selo.atributos).toMatchObject({ opacity: '0.9', style: 'isolation:isolate' });
    expect(selo.filhos.map((f) => f.atributos.id)).toEqual(['Disco', 'Data']);
    expect(porId(svg, 'Data').filhos.map((t) => t.texto)).toEqual(['20', 'JUN']);
    expect(porId(svg, 'Véu_bloqueado').atributos.style).toBe('mix-blend-mode:soft-light');
    expect(porId(svg, 'Oculta').atributos.display).toBe('none');
    const l = Object.fromEntries(relatorio.camadas.map((x) => [x.camada, x]));
    // camada de ajuste não vai; grupo com máscara em degradê e recorte com base em texto viram imagem
    expect(l.Curvas).toMatchObject({ destino: 'omitido-com-aviso', mapeamento: 'ajuste:curvas' });
    expect(todos(svg).some((e) => e.atributos.id === 'Curvas')).toBe(false);
    expect(l.Luzes).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'mascara:degrade' });
    expect(l.Luz?.observacao).toBe('está dentro da imagem de "Luzes"');
    expect(l['Base do recorte']).toMatchObject({ destino: 'raster-com-aviso', mapeamento: 'recorte-em-texto' });
    expect(l['Foto no texto']?.observacao).toBe('está dentro da imagem de "Base do recorte"');
    expect(porId(svg, 'Base_do_recorte').nome).toBe('image');
    expect(relatorio.avisos.map((a) => a.codigo)).toEqual(['texto-em-linhas', 'instalar-fontes', 'virou-imagem', 'ficou-de-fora']);
  });

  it('modo de mesclagem que o formato não tem: a camada sai em vetor, em modo normal, e o relatório avisa', async () => {
    const r = aplicarLote(
      cena('forma'),
      [
        { op: 'alterar', alvo: 'Peça/Elipse', props: { modoDeMesclagem: 'luz-linear' } },
        { op: 'alterar', alvo: 'Peça/Arredondado', props: { modoDeMesclagem: 'multiplicacao' } },
      ],
      { autoria: { tipo: 'designer' }, idDoLote: 'modos' },
    );
    if (!r.ok) throw new Error(r.erro.mensagem);
    const { arquivos, relatorio } = await exportar(r.doc);
    const svg = ler(texto(arquivos[0]?.bytes as Uint8Array));
    expect(porId(svg, 'Elipse').nome).toBe('path');
    expect(porId(svg, 'Elipse').atributos.style).toBeUndefined();
    expect(porId(svg, 'Arredondado').atributos.style).toBe('mix-blend-mode:multiply');
    expect(relatorio.camadas.find((x) => x.camada === 'Elipse')).toMatchObject({ destino: 'nativo-editavel' });
    expect(relatorio.camadas.find((x) => x.camada === 'Elipse')?.observacao).toContain('modo luz-linear não existe no formato: saiu em modo normal');
    expect(relatorio.avisos.map((a) => a.codigo)).toContain('modo-de-mesclagem-trocado');
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

  it('peça com camada de ajuste: parece o render do Otto SEM o ajuste, que é o que o relatório avisa', async () => {
    const doc = cena('peca');
    const { arquivos, relatorio } = await exportar(doc, 'Festival');
    expect(arquivos.map((a) => a.nome)).toEqual(['Festival - Feed.svg', 'Festival - Story.svg']);
    expect(relatorio.arquivos).toEqual(arquivos.map((a) => a.nome));
    const p = doc.pranchetas[0] as Prancheta;
    const semAjuste: Prancheta = { ...p, filhos: p.filhos.filter((n: No) => n.tipo !== 'ajuste') };
    const desenhado = desenhar(arquivos[0]?.bytes as Uint8Array);
    const sem = renderDoOtto(doc, semAjuste);
    expect(diferenca(sem.rgba, desenhado.rgba)).toBeLessThan(0.03);
    // contra o render com o ajuste a diferença média dobra: é a prova de que a comparação enxerga a falta dele
    const media = (r: { rgba: Uint8Array }): number => comparar(r.rgba, desenhado.rgba, p.largura, p.altura).d.media;
    expect(media(renderDoOtto(doc, p))).toBeGreaterThan(media(sem) * 2);
  });
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
