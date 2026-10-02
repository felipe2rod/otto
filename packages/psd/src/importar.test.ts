// As decisões da importação (desmontar.ts), uma a uma, com arquivos lidos montados à mão: o formato de teste devolve
// as camadas que o caso pede, no modelo da porta, e o resto (inspeção, motor, catálogo de operações) é o de verdade.
import type { Documento, No, Prancheta } from '@otto/documento';
import { criarSessao, renderizarPrancheta } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarFormatoPsd } from './adaptadores/biblioteca-de-psd';
import { ADOBE_RGB, psdDeTeste } from './apoio-de-psd';
import { recursosDeTeste } from './apoio-de-teste';
import { mapearNos, nosDaForma } from './caminho';
import type { RecursosDaExportacao } from './exportar';
import { fontesDoPsd, importarPsd, type OpcoesDeImportacao, type ResultadoDaImportacao } from './importar';
import { ErroDeImportacao } from './inspecionar';
import { perfilSrgb } from './perfil-srgb';
import type { ArquivoLido, CamadaLida, CaminhoDoArquivo, FormatoDeArquivoEmCamadas, MascaraDoArquivo, PixelsDoArquivo, TextoLido } from './porta';

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  ({ ck, recursos } = await recursosDeTeste());
});

const L = 200;
const A = 100;

/** Uma camada lida, com o mínimo: o caso diz o que ela tem. */
function camada(nome: string, tipo: CamadaLida['tipo'], extra: Partial<CamadaLida> & { pixels?: PixelsDoArquivo; coberturaDaMascara?: MascaraDoArquivo } = {}): CamadaLida {
  const { pixels, coberturaDaMascara, ...resto } = extra;
  return {
    tipo,
    nome,
    opacidade: 1,
    opacidadeDoPreenchimento: 1,
    modo: tipo === 'grupo' ? 'atravessar' : 'normal',
    oculta: false,
    recortadaNaDeBaixo: false,
    bloqueada: false,
    area: pixels ? { x: pixels.x, y: pixels.y, largura: pixels.largura, altura: pixels.altura } : { x: 0, y: 0, largura: 0, altura: 0 },
    decodificar: () => ({ ...(pixels ? { pixels: { ...pixels, rgba: pixels.rgba.slice() } } : {}), ...(coberturaDaMascara ? { mascara: coberturaDaMascara } : {}) }),
    foraDoModelo: [],
    ...(coberturaDaMascara
      ? { mascara: { x: coberturaDaMascara.x, y: coberturaDaMascara.y, largura: coberturaDaMascara.largura, altura: coberturaDaMascara.altura, fora: coberturaDaMascara.fora, desativada: false } }
      : {}),
    ...resto,
  };
}
/** Pixels de uma cor só. */
const pixelsDe = (x: number, y: number, largura: number, altura: number, cor: [number, number, number, number]): PixelsDoArquivo => {
  const rgba = new Uint8Array(largura * altura * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set(cor, i);
  return { x, y, largura, altura, rgba };
};
const texto = (conteudo: string, extra: Partial<TextoLido> = {}): TextoLido => ({
  forma: 'caixa',
  conteudo,
  transformacao: [1, 0, 0, 1, 20, 10],
  caixa: { largura: 160, altura: 60 },
  alinhamento: 'esquerda',
  estilo: { fonte: 'Anton-Regular', tamanho: 40, cor: { r: 10, g: 20, b: 30 }, entrelinha: 48, espacamento: 0, caixa: 'normal', kerning: true },
  ...extra,
});
const retangulo = (x: number, y: number, w: number, h: number, raio = 0): CaminhoDoArquivo => ({ aberto: false, regra: 'nao-zero', nos: nosDaForma('retangulo', x, y, w, h, raio) });
const triangulo: CaminhoDoArquivo = { aberto: false, regra: 'nao-zero', nos: mapearNos(nosDaForma('retangulo', 10, 10, 60, 40, 0).slice(0, 3), (x, y) => [x, y]) };
const forma = (nome: string, caminhos: CaminhoDoArquivo[], extra: Partial<CamadaLida> & { coberturaDaMascara?: MascaraDoArquivo } = {}): CamadaLida =>
  camada(nome, 'forma', {
    preenchimento: { tipo: 'cor', cor: { r: 200, g: 0, b: 0 } },
    mascaraVetorial: { caminhos, invertida: false, desativada: false },
    pixels: pixelsDe(10, 10, 60, 40, [200, 0, 0, 255]),
    ...extra,
  });

async function importar(camadas: CamadaLida[], opcoes: OpcoesDeImportacao = {}, lido: Partial<ArquivoLido> = {}): Promise<ResultadoDaImportacao> {
  const formato: FormatoDeArquivoEmCamadas = {
    escrever: () => ({ bytes: new Uint8Array(0), extensao: 'psd' }),
    ler: () => ({ largura: L, altura: A, camadas, embutidos: [], composta: () => undefined, ...lido }),
  };
  return importarPsd(ck, formato, psdDeTeste({ largura: L, altura: A }), { fontes: recursos.fontes, ...opcoes });
}
const nos = (r: ResultadoDaImportacao, prancheta = 0): No[] => (r.doc.pranchetas[prancheta] as Prancheta).filhos;
const linha = (r: ResultadoDaImportacao, nome: string) => r.relatorio.camadas.find((l) => l.camada === nome);
const avisos = (r: ResultadoDaImportacao): string[] => r.relatorio.avisos.map((a) => a.codigo);

function render(r: ResultadoDaImportacao, doc: Documento = r.doc): Uint8Array {
  const sessao = criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: r.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
  try {
    return renderizarPrancheta(sessao, doc, doc.pranchetas[0] as Prancheta).rgba;
  } finally {
    sessao.destruir();
  }
}
const pixel = (rgba: Uint8Array, x: number, y: number): number[] => [...rgba.subarray((y * L + x) * 4, (y * L + x) * 4 + 3)];

describe('prancheta e fundo', () => {
  it('arquivo sem pranchetas: uma prancheta do tamanho dele; sem camada de fundo, fica branca e o relatório avisa', async () => {
    const r = await importar([camada('Layer 1', 'pixels', { pixels: pixelsDe(10, 10, 20, 20, [0, 0, 255, 255]) })], { nomeDaPrancheta: 'Feed' });
    expect(r.doc.pranchetas).toHaveLength(1);
    expect(r.doc.pranchetas[0]).toMatchObject({ nome: 'Feed', largura: L, altura: A, fundo: '#ffffff' });
    expect(avisos(r)).toContain('fundo-transparente');
  });

  it('a camada de cor sólida embaixo de tudo vira a cor de fundo da prancheta (é como o Otto grava o fundo)', async () => {
    const fundo = camada('Fundo', 'forma', { preenchimento: { tipo: 'cor', cor: { r: 12, g: 34, b: 56 } } });
    const r = await importar([fundo, camada('Layer 1', 'pixels', { pixels: pixelsDe(10, 10, 20, 20, [0, 0, 255, 255]) })]);
    expect(r.doc.pranchetas[0]?.fundo).toBe('#0c2238');
    expect(nos(r).map((n) => n.nome)).toEqual(['Layer 1']);
    expect(linha(r, 'Fundo')).toMatchObject({ destino: 'editavel', mapeamento: 'psd:fundo-de-cor-solida', tipo: 'prancheta' });
    expect(avisos(r)).not.toContain('fundo-transparente');
    // com opacidade, modo ou efeito, é uma camada como as outras
    const r2 = await importar([{ ...fundo, opacidade: 0.5 }]);
    expect(nos(r2).map((n) => [n.nome, n.tipo])).toEqual([['Fundo', 'forma']]);
  });

  it('pranchetas do Photoshop: uma prancheta do Otto para cada, com as camadas na coordenada dela; o que está fora delas não vem', async () => {
    const dentro = (x: number): CamadaLida => camada('Layer 1', 'pixels', { pixels: pixelsDe(x + 5, 7, 10, 10, [255, 0, 0, 255]) });
    const r = await importar([
      camada('Feed', 'grupo', { prancheta: { x: 0, y: 0, largura: 80, altura: 100, fundo: { r: 0, g: 0, b: 0 }, transparente: false }, filhos: [dentro(0)] }),
      camada('Story', 'grupo', { prancheta: { x: 120, y: 0, largura: 60, altura: 90, fundo: { r: 255, g: 255, b: 255 }, transparente: true }, filhos: [dentro(120)] }),
      camada('Solta', 'pixels', { pixels: pixelsDe(90, 0, 5, 5, [0, 0, 0, 255]) }),
    ]);
    expect(r.doc.pranchetas.map((p) => [p.nome, p.largura, p.altura, p.fundo])).toEqual([
      ['Feed', 80, 100, '#000000'],
      ['Story', 60, 90, '#ffffff'],
    ]);
    // o mesmo nome pode se repetir em pranchetas diferentes
    expect(nos(r, 0)[0]).toMatchObject({ nome: 'Layer 1', x: 5, y: 7 });
    expect(nos(r, 1)[0]).toMatchObject({ nome: 'Layer 1', x: 5, y: 7 });
    expect(linha(r, 'Solta')).toMatchObject({ destino: 'ignorado', mapeamento: 'psd:fora-das-pranchetas' });
    expect(avisos(r)).toEqual(expect.arrayContaining(['fundo-transparente', 'camada-ignorada']));
  });
});

describe('nomes', () => {
  it('o nome da camada vem como está; repetido na prancheta ganha um número, vazio vira "Camada", e o relatório guarda o do arquivo', async () => {
    const px = (): PixelsDoArquivo => pixelsDe(0, 0, 4, 4, [1, 2, 3, 255]);
    const r = await importar([
      camada('Layer 1', 'pixels', { pixels: px() }),
      camada('Layer 1', 'pixels', { pixels: px() }),
      camada('', 'pixels', { pixels: px() }),
      camada('  CTA / botão <script> ', 'pixels', { pixels: px() }),
      camada('Grupo', 'grupo', { filhos: [camada('Layer 1', 'pixels', { pixels: px() })] }),
    ]);
    expect(nos(r).map((n) => n.nome)).toEqual(['Layer 1', 'Layer 1 2', 'Camada', '  CTA / botão <script> ', 'Grupo']);
    expect((nos(r)[4] as { filhos: No[] }).filhos[0]?.nome).toBe('Layer 1 3');
    expect(r.relatorio.camadas.map((l) => [l.camada, l.nomeNoOtto])).toEqual([
      ['Layer 1', undefined],
      ['Layer 1', 'Layer 1 2'],
      ['', 'Camada'],
      ['  CTA / botão <script> ', undefined],
      ['Grupo', undefined],
      ['Layer 1', 'Layer 1 3'],
    ]);
    expect(avisos(r)).toContain('nomes-trocados');
    // a mesma imagem em quatro camadas é uma imagem só
    expect(r.imagens).toHaveLength(1);
  });
});

describe('camada de pixels', () => {
  it('vem como imagem, com o pixel em PNG, no lugar e do tamanho da área gravada; camada sem pixel não vem', async () => {
    const r = await importar([
      camada('Foto', 'pixels', { pixels: pixelsDe(30, 20, 50, 40, [0, 128, 255, 255]), opacidade: 0.5, modo: 'multiplicacao', oculta: true, bloqueada: true }),
      camada('Vazia', 'pixels'),
    ]);
    expect(nos(r)).toHaveLength(1);
    const no = nos(r)[0] as No & { arquivo: string };
    expect(no).toMatchObject({
      tipo: 'imagem',
      x: 30,
      y: 20,
      largura: 50,
      altura: 40,
      larguraOriginal: 50,
      alturaOriginal: 40,
      opacidade: 0.5,
      modoDeMesclagem: 'multiplicacao',
      visivel: false,
      bloqueado: true,
    });
    expect(r.imagens).toEqual([expect.objectContaining({ arquivo: no.arquivo, tipo: 'image/png', largura: 50, altura: 40, origem: 'camada' })]);
    expect(no.arquivo).toMatch(/^[0-9a-f]{64}$/);
    expect([...(r.imagens[0]?.bytes.subarray(0, 4) ?? [])]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(linha(r, 'Foto')).toMatchObject({ destino: 'imagem', mapeamento: 'psd:camada-de-pixels', idDoNo: no.id, tipo: 'imagem' });
    expect(linha(r, 'Vazia')).toMatchObject({ destino: 'ignorado', mapeamento: 'psd:camada-vazia' });
    // camada de pixels virar imagem não é perda: não gera aviso
    expect(avisos(r)).not.toContain('virou-imagem');
    expect(avisos(r)).not.toContain('camada-ignorada');
  });

  it('a máscara de pixels e a máscara vetorial de caminho livre são aplicadas no pixel', async () => {
    const mascara: MascaraDoArquivo = { x: 0, y: 0, largura: 100, altura: A, cobertura: new Uint8Array(100 * A).fill(255), fora: 0 };
    // um padrão que não é forma nem degradê: xadrez de 10 px
    for (let y = 0; y < A; y++) for (let x = 0; x < 100; x++) if ((Math.floor(x / 10) + Math.floor(y / 10)) % 2) mascara.cobertura[y * 100 + x] = 0;
    const r = await importar([camada('Xadrez', 'pixels', { pixels: pixelsDe(0, 0, L, A, [255, 0, 0, 255]), coberturaDaMascara: mascara })]);
    expect(linha(r, 'Xadrez')?.observacao).toContain('máscara de camada aplicada no pixel');
    const rgba = render(r);
    expect(pixel(rgba, 5, 5)).toEqual([255, 0, 0]);
    expect(pixel(rgba, 15, 5)).toEqual([255, 255, 255]);
    // fora da área da máscara vale o fundo dela (preto: esconde)
    expect(pixel(rgba, 150, 50)).toEqual([255, 255, 255]);

    const comCaminho = await importar([
      camada('Recortada', 'pixels', { pixels: pixelsDe(0, 0, L, A, [255, 0, 0, 255]), mascaraVetorial: { caminhos: [triangulo], invertida: false, desativada: false } }),
    ]);
    const cortado = render(comCaminho);
    // o triângulo é (10,10), (70,10), (70,50): dentro vermelho, fora o fundo
    expect(pixel(cortado, 60, 20)).toEqual([255, 0, 0]);
    expect(pixel(cortado, 20, 40)).toEqual([255, 255, 255]);
    expect(nos(comCaminho)[0]).not.toHaveProperty('mascara');
  });

  it('máscara toda branca não faz nada; máscara desativada não vale; máscara toda preta esconde a camada', async () => {
    const plano = (v: number): MascaraDoArquivo => ({ x: 0, y: 0, largura: L, altura: A, cobertura: new Uint8Array(L * A).fill(v), fora: 255 });
    const px = pixelsDe(0, 0, L, A, [0, 255, 0, 255]);
    const r = await importar([
      forma('Branca', [retangulo(10, 10, 60, 40)], { coberturaDaMascara: plano(255) }),
      forma('Preta', [retangulo(10, 10, 60, 40)], { coberturaDaMascara: plano(0) }),
      forma('Desativada', [retangulo(10, 10, 60, 40)], { coberturaDaMascara: plano(0), mascara: { x: 0, y: 0, largura: L, altura: A, fora: 255, desativada: true } }),
      camada('Pixels', 'pixels', { pixels: px, coberturaDaMascara: plano(255) }),
    ]);
    expect(nos(r).map((n) => [n.nome, n.tipo, n.visivel, 'mascara' in n])).toEqual([
      ['Branca', 'forma', true, false],
      ['Preta', 'forma', false, false],
      ['Desativada', 'forma', true, false],
      ['Pixels', 'imagem', true, false],
    ]);
  });
});

describe('texto', () => {
  it('em caixa, com a fonte entregue: texto do Otto, com família e peso, tamanho, cor, entrelinha, espaçamento, alinhamento e caixa', async () => {
    const r = await importar([
      camada('Título', 'texto', {
        texto: texto('Jazz na praça', {
          alinhamento: 'centro',
          estilo: { fonte: 'IBMPlexSans-Bold', tamanho: 20, cor: { r: 10, g: 20, b: 30 }, entrelinha: 24, espacamento: 120, caixa: 'versalete', kerning: false },
        }),
      }),
    ]);
    expect(nos(r)[0]).toMatchObject({
      tipo: 'texto',
      conteudo: 'Jazz na praça',
      fonte: 'IBM Plex Sans',
      peso: 700,
      tamanho: 20,
      cor: '#0a141e',
      entrelinha: 1.2,
      espacamento: 120,
      alinhamento: 'centro',
      caixaAlta: false,
      versalete: true,
      kerning: 'nenhum',
      x: 20,
      largura: 160,
      rotacao: 0,
    });
    // O Photoshop encosta a altura da maiúscula da primeira linha no topo da caixa (y = 10); o motor encosta a ascendente.
    // A caixa do Otto sobe a diferença e cresce o mesmo tanto: a tinta do "J" começa no topo da caixa do arquivo
    const no = nos(r)[0] as No & { y: number; altura: number };
    expect(no.y).toBeLessThan(10);
    expect(no.y + no.altura).toBeCloseTo(70, 1);
    const rgba = render(r);
    let primeira = -1;
    for (let y = 0; y < A && primeira < 0; y++) for (let x = 0; x < L; x++) if ((rgba[(y * L + x) * 4] as number) < 128) primeira = y;
    expect(Math.abs(primeira - 10)).toBeLessThanOrEqual(1);
    expect(linha(r, 'Título')).toMatchObject({ destino: 'editavel', mapeamento: 'no:texto' });
    expect(r.relatorio.fontes).toEqual([expect.objectContaining({ familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' })]);
    expect(avisos(r)).toContain('conferir-texto');
    expect(r.imagens).toEqual([]);
  });

  it('trechos: o estilo que cobre mais texto é o da camada, e só o que muda vai no trecho', async () => {
    const base = { fonte: 'IBMPlexSans', tamanho: 18, cor: { r: 0, g: 0, b: 0 }, entrelinha: 24.3, espacamento: 0 };
    const t = texto('A partir de R$ 19,90.', {
      trechos: [
        { comprimento: 12, estilo: base },
        { comprimento: 8, estilo: { ...base, fonte: 'IBMPlexSans-Bold', cor: { r: 194, g: 65, b: 12 }, tamanho: 24, entrelinha: 32.4 } },
        { comprimento: 1, estilo: base },
      ],
      estilo: { ...base, caixa: 'normal', kerning: true },
    });
    const r = await importar([camada('Preço', 'texto', { texto: t })]);
    expect(nos(r)[0]).toMatchObject({ fonte: 'IBM Plex Sans', peso: 400, tamanho: 18, entrelinha: 1.35, trechos: [{ inicio: 12, fim: 20, cor: '#c2410c', peso: 700, tamanho: 24 }] });
  });

  it('de ponto: a caixa é a que cabe a linha, com a linha de base da primeira linha no ponto do arquivo, para cada alinhamento', async () => {
    const ponto = (alinhamento: TextoLido['alinhamento']) => texto('Hello', { forma: 'ponto', caixa: { largura: 0, altura: 0 }, transformacao: [1, 0, 0, 1, 100, 60], alinhamento });
    const r = await importar([
      camada('Esquerda', 'texto', { texto: ponto('esquerda') }),
      camada('Centro', 'texto', { texto: ponto('centro') }),
      camada('Direita', 'texto', { texto: ponto('direita') }),
    ]);
    const [e, c, d] = nos(r) as (No & { x: number; y: number; largura: number; altura: number })[];
    expect(e?.x).toBe(100);
    expect((c?.x ?? 0) + (c?.largura ?? 0) / 2).toBeCloseTo(100, 1);
    expect((d?.x ?? 0) + (d?.largura ?? 0)).toBeCloseTo(100, 1);
    // a tinta do "Hello" (sem letra que desce) termina na linha de base: no y = 60 do arquivo
    const rgba = render(r, { ...r.doc, pranchetas: [{ ...(r.doc.pranchetas[0] as Prancheta), filhos: [e as No] }] });
    let ultima = -1;
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) if ((rgba[(y * L + x) * 4] as number) < 128) ultima = y;
    expect(Math.abs(ultima + 1 - 60)).toBeLessThanOrEqual(1);
    // e a caixa não quebra a linha
    expect(e?.largura).toBeGreaterThan(60);
  });

  it('girado e com escala igual nos dois eixos: a rotação vem, e o tamanho já na escala', async () => {
    const a = (30 * Math.PI) / 180;
    const r = await importar([
      camada('Girado', 'texto', {
        texto: texto('ao vivo', {
          transformacao: [2 * Math.cos(a), 2 * Math.sin(a), -2 * Math.sin(a), 2 * Math.cos(a), 50, 20],
          caixa: { largura: 40, altura: 20 },
          estilo: { ...texto('').estilo, tamanho: 10, entrelinha: 12 },
        }),
      }),
    ]);
    expect(nos(r)[0]).toMatchObject({ tipo: 'texto', rotacao: 30, tamanho: 20, largura: 80, entrelinha: 1.2 });
  });

  it('fonte que o Otto não tem: o texto vem como imagem, com o pixel gravado, e o relatório lista a fonte pelo nome PostScript. Nada é trocado em silêncio', async () => {
    const t = texto('Olá', { estilo: { ...texto('').estilo, fonte: 'MyriadPro-Bold' } });
    const r = await importar([
      camada('Olá', 'texto', { texto: t, pixels: pixelsDe(20, 10, 60, 30, [10, 20, 30, 255]) }),
      camada('Tchau', 'texto', { texto: t, pixels: pixelsDe(20, 50, 60, 30, [10, 20, 30, 255]) }),
    ]);
    expect(nos(r).map((n) => n.tipo)).toEqual(['imagem', 'imagem']);
    expect(linha(r, 'Olá')).toMatchObject({ destino: 'imagem', mapeamento: 'psd:texto-sem-fonte' });
    expect(linha(r, 'Olá')?.observacao).toContain('"MyriadPro-Bold"');
    expect(r.relatorio.emFalta.fontes).toEqual([{ postScript: 'MyriadPro-Bold', camadas: ['Prancheta 1 / Olá', 'Prancheta 1 / Tchau'] }]);
    expect(avisos(r)).toEqual(expect.arrayContaining(['fonte-em-falta', 'virou-imagem']));
    expect(r.relatorio.substituicoes).toEqual([]);
  });

  it('com a troca pedida por quem importa, o texto vem editável na outra fonte, e a troca fica no relatório', async () => {
    const t = texto('Olá', { estilo: { ...texto('').estilo, fonte: 'MyriadPro-Bold' } });
    const r = await importar([camada('Olá', 'texto', { texto: t, pixels: pixelsDe(20, 10, 60, 30, [10, 20, 30, 255]) })], {
      substituir: (nome) => (nome === 'MyriadPro-Bold' ? 'IBMPlexSans-Bold' : undefined),
    });
    expect(nos(r)[0]).toMatchObject({ tipo: 'texto', fonte: 'IBM Plex Sans', peso: 700 });
    expect(r.relatorio.substituicoes).toEqual([{ camada: 'Prancheta 1 / Olá', pedida: 'MyriadPro-Bold', usada: { familia: 'IBM Plex Sans', peso: 700, postScript: 'IBMPlexSans-Bold' } }]);
    expect(r.relatorio.emFalta.fontes).toEqual([]);
    expect(avisos(r)).toContain('fonte-substituida');
  });

  it('o que o texto do Otto não tem vira imagem: em caminho, deformado, vertical, estilo de fora, inclinado', async () => {
    const px = (): PixelsDoArquivo => pixelsDe(20, 10, 60, 30, [10, 20, 30, 255]);
    const r = await importar([
      camada('Caminho', 'texto', { texto: texto('a'), pixels: px(), foraDoModelo: [{ recurso: 'texto-em-caminho', detalhe: 'texto em caminho' }] }),
      camada('Arco', 'texto', { texto: texto('a'), pixels: px(), foraDoModelo: [{ recurso: 'texto-deformado', detalhe: 'texto deformado (arc)' }] }),
      camada('Sublinhado', 'texto', { texto: texto('a'), pixels: px(), foraDoModelo: [{ recurso: 'estilo-de-texto', detalhe: 'sublinhado' }] }),
      camada('Inclinado', 'texto', { texto: texto('a', { transformacao: [1, 0, 0.4, 1, 20, 10] }), pixels: px() }),
      camada('Esticado', 'texto', { texto: texto('a', { transformacao: [2, 0, 0, 1, 20, 10] }), pixels: px() }),
    ]);
    expect(r.relatorio.camadas.map((l) => [l.camada, l.destino, l.mapeamento])).toEqual([
      ['Caminho', 'imagem', 'psd:texto-em-caminho'],
      ['Arco', 'imagem', 'psd:texto-deformado'],
      ['Sublinhado', 'imagem', 'psd:estilo-de-texto'],
      ['Inclinado', 'imagem', 'psd:texto-deformado'],
      ['Esticado', 'imagem', 'psd:texto-deformado'],
    ]);
    expect(nos(r).every((n) => n.tipo === 'imagem')).toBe(true);
  });

  it('parágrafo que o Otto não tem (justificado, recuo): o texto vem editável, e o relatório diz o que não veio', async () => {
    const r = await importar([camada('Corpo', 'texto', { texto: texto('texto'), foraDoModelo: [{ recurso: 'paragrafo-de-texto', detalhe: 'texto justificado' }] })]);
    expect(nos(r)[0]?.tipo).toBe('texto');
    expect(linha(r, 'Corpo')).toMatchObject({ destino: 'editavel', perdas: [{ mapeamento: 'psd:paragrafo-de-texto', detalhe: 'texto justificado' }] });
    expect(avisos(r)).toContain('aparencia-pode-diferir');
  });

  it('texto com máscara de pixels que o Otto não tem vira imagem; com máscara que é um retângulo, continua texto, com máscara de forma', async () => {
    const xadrez: MascaraDoArquivo = { x: 0, y: 0, largura: L, altura: A, cobertura: new Uint8Array(L * A), fora: 0 };
    for (let i = 0; i < xadrez.cobertura.length; i++) xadrez.cobertura[i] = (Math.floor((i % L) / 7) + Math.floor(i / L / 7)) % 2 ? 255 : 0;
    const janela: MascaraDoArquivo = { x: 0, y: 0, largura: L, altura: A, cobertura: new Uint8Array(L * A), fora: 0 };
    for (let y = 20; y < 60; y++) for (let x = 30; x < 130; x++) janela.cobertura[y * L + x] = 255;
    const r = await importar([
      camada('Xadrez', 'texto', { texto: texto('Olá'), pixels: pixelsDe(20, 10, 60, 30, [10, 20, 30, 255]), coberturaDaMascara: xadrez }),
      camada('Janela', 'texto', { texto: texto('Olá'), pixels: pixelsDe(20, 10, 60, 30, [10, 20, 30, 255]), coberturaDaMascara: janela }),
    ]);
    expect(linha(r, 'Xadrez')).toMatchObject({ destino: 'imagem', mapeamento: 'psd:mascara-de-pixels' });
    expect(nos(r)[1]).toMatchObject({ tipo: 'texto', mascara: { tipo: 'forma', forma: 'retangulo', x: 30, y: 20, largura: 100, altura: 40, suavizar: 0, inverter: false } });
  });
});

describe('forma', () => {
  it('retângulo, com raio e girado, e elipse: forma do Otto. Caminho livre de cor sólida: vetor', async () => {
    const r = await importar([
      forma('Botão', [retangulo(10, 10, 60, 40, 8)]),
      forma('Triângulo', [triangulo]),
      forma('Preenchimento', [], {
        mascaraVetorial: undefined as never,
        preenchimento: {
          tipo: 'degrade',
          estilo: 'linear',
          angulo: 90,
          paradas: [
            { cor: { r: 0, g: 0, b: 0 }, posicao: 0, opacidade: 1 },
            { cor: { r: 255, g: 255, b: 255 }, posicao: 1, opacidade: 0.5 },
          ],
        },
      }),
    ]);
    expect(nos(r)[0]).toMatchObject({ tipo: 'forma', forma: 'retangulo', x: 10, y: 10, largura: 60, altura: 40, raio: 8, preenchimento: '#c80000' });
    expect(nos(r)[1]).toMatchObject({ tipo: 'vetor', x: 10, y: 10, largura: 60, altura: 40, moldura: [60, 40], caminhos: [{ preenchimento: '#c80000', regra: 'nao-zero' }] });
    expect((nos(r)[1] as { caminhos: { d: string }[] }).caminhos[0]?.d.replace(/[\d. -]/g, '')).toBe('MCCCZ');
    expect(linha(r, 'Triângulo')).toMatchObject({ destino: 'editavel', mapeamento: 'psd:forma-livre', tipo: 'vetor' });
    // camada de preenchimento sem caminho: um retângulo do tamanho da prancheta, com o degradê
    expect(nos(r)[2]).toMatchObject({
      tipo: 'forma',
      x: 0,
      y: 0,
      largura: L,
      altura: A,
      preenchimento: {
        tipo: 'linear',
        angulo: 90,
        paradas: [
          { cor: '#000000', posicao: 0, opacidade: 1 },
          { cor: '#ffffff', posicao: 1, opacidade: 0.5 },
        ],
      },
    });
  });

  it('traçado: por dentro é o traço da forma; pelo centro vira vetor com traço; por fora, e caminho livre com degradê, viram imagem', async () => {
    const traco = (alinhamento: 'dentro' | 'centro' | 'fora') => ({
      cor: { r: 0, g: 0, b: 255 },
      espessura: 4,
      ponta: 'reta' as const,
      juncao: 'angular' as const,
      comPreenchimento: true,
      alinhamento,
    });
    const r = await importar([
      forma('Dentro', [retangulo(10, 10, 60, 40)], { tracoVetorial: traco('dentro') }),
      forma('Centro', [retangulo(10, 10, 60, 40)], { tracoVetorial: traco('centro') }),
      forma('Fora', [retangulo(10, 10, 60, 40)], { tracoVetorial: traco('fora') }),
      forma('Livre em degradê', [triangulo], {
        preenchimento: {
          tipo: 'degrade',
          estilo: 'linear',
          angulo: 0,
          paradas: [
            { cor: { r: 0, g: 0, b: 0 }, posicao: 0, opacidade: 1 },
            { cor: { r: 9, g: 9, b: 9 }, posicao: 1, opacidade: 1 },
          ],
        },
      }),
      forma('Padrão', [retangulo(10, 10, 60, 40)], { preenchimento: undefined as never, foraDoModelo: [{ recurso: 'preenchimento', detalhe: 'preenchimento de padrão' }] }),
    ]);
    expect(nos(r)[0]).toMatchObject({ tipo: 'forma', traco: { cor: '#0000ff', espessura: 4 } });
    expect(nos(r)[1]).toMatchObject({ tipo: 'vetor', caminhos: [{ preenchimento: '#c80000', traco: { cor: '#0000ff', espessura: 4, ponta: 'reta', juncao: 'angular' } }] });
    expect(r.relatorio.camadas.slice(2).map((l) => [l.camada, l.destino, l.mapeamento])).toEqual([
      ['Fora', 'imagem', 'psd:traco-vetorial'],
      ['Livre em degradê', 'imagem', 'psd:preenchimento'],
      ['Padrão', 'imagem', 'psd:preenchimento'],
    ]);
  });
});

describe('efeitos, ajustes, modos e opacidade', () => {
  it('efeito que o Otto tem vem; o que não tem não vem, e o relatório diz (a camada continua editável: o pixel gravado não traz efeito)', async () => {
    const r = await importar([
      forma('Selo', [retangulo(10, 10, 60, 40)], {
        efeitos: {
          sombraProjetada: { cor: { r: 0, g: 0, b: 0 }, opacidade: 0.5, angulo: 90, distancia: 4, tamanho: 8, modo: 'multiplicacao' },
          tracoInterno: { cor: { r: 255, g: 255, b: 255 }, espessura: 3 },
        },
        foraDoModelo: [{ recurso: 'efeito-desconhecido', detalhe: 'chanfro e entalhe' }],
      }),
      camada('Foto', 'pixels', {
        pixels: pixelsDe(0, 0, 9, 9, [1, 1, 1, 255]),
        efeitos: { tracoInterno: { cor: { r: 255, g: 0, b: 0 }, espessura: 2 }, brilhoExterno: { cor: { r: 255, g: 200, b: 0 }, opacidade: 0.8, tamanho: 12, modo: 'tela' } },
      }),
    ]);
    expect(nos(r)[0]).toMatchObject({ tipo: 'forma', sombra: { cor: '#000000', opacidade: 0.5, angulo: 90, distancia: 4, desfoque: 8 }, traco: { cor: '#ffffff', espessura: 3 } });
    expect(linha(r, 'Selo')).toMatchObject({ destino: 'editavel', perdas: [{ mapeamento: 'psd:efeito-desconhecido', detalhe: 'chanfro e entalhe' }] });
    // traço só existe em forma; brilho externo colorido em modo tela é desenhado em modo normal, e o relatório diz
    expect(nos(r)[1]).toMatchObject({ tipo: 'imagem', efeitos: { brilhoExterno: { cor: '#ffc800', opacidade: 0.8, tamanho: 12 } } });
    expect(linha(r, 'Foto')?.perdas?.map((p) => p.mapeamento)).toEqual(['psd:efeito-parcial', 'psd:efeito-desconhecido']);
    expect(avisos(r)).toContain('aparencia-pode-diferir');
  });

  it('camada de ajuste que o Otto tem vem; a que não tem não vem (não tem pixel para virar imagem), e o relatório diz', async () => {
    const r = await importar([
      camada('Base', 'pixels', { pixels: pixelsDe(0, 0, 9, 9, [1, 1, 1, 255]) }),
      camada('Curvas', 'ajuste', {
        ajuste: {
          tipo: 'curvas',
          rgb: [
            [0, 0],
            [128, 150],
            [255, 255],
          ],
        },
        opacidade: 0.8,
        modo: 'sobrepor',
        recortadaNaDeBaixo: true,
      }),
      camada('Inverter', 'ajuste', { foraDoModelo: [{ recurso: 'ajuste-desconhecido', detalhe: 'inverter' }] }),
      camada('P&B', 'ajuste', { ajuste: { tipo: 'preto-e-branco' }, foraDoModelo: [{ recurso: 'ajuste-parcial', detalhe: 'preto e branco com pesos próprios: veio com os pesos padrão' }] }),
      camada('Misturador', 'ajuste', {
        misturaDeCanais: {
          vermelho: { vermelho: 50, verde: 50, azul: 0, constante: 0 },
          verde: { vermelho: 0, verde: 100, azul: 0, constante: 0 },
          azul: { vermelho: 0, verde: 0, azul: 100, constante: 0 },
        },
      }),
    ]);
    expect(nos(r).map((n) => [n.nome, n.tipo])).toEqual([
      ['Base', 'imagem'],
      ['Curvas', 'ajuste'],
      ['P&B', 'ajuste'],
    ]);
    expect(nos(r)[1]).toMatchObject({
      ajuste: {
        tipo: 'curvas',
        rgb: [
          [0, 0],
          [128, 150],
          [255, 255],
        ],
      },
      opacidade: 0.8,
      modoDeMesclagem: 'sobrepor',
      recortadaNaDeBaixo: true,
    });
    expect(linha(r, 'Inverter')).toMatchObject({ destino: 'ignorado', mapeamento: 'psd:ajuste-desconhecido' });
    expect(linha(r, 'Misturador')).toMatchObject({ destino: 'ignorado', mapeamento: 'psd:ajuste-desconhecido' });
    expect(linha(r, 'P&B')).toMatchObject({ destino: 'editavel', mapeamento: 'ajuste:preto-e-branco', perdas: [{ mapeamento: 'psd:ajuste-parcial' }] });
    expect(avisos(r)).toEqual(expect.arrayContaining(['camada-ignorada', 'aparencia-pode-diferir']));
  });

  it('grupo: modo, opacidade e as camadas dentro; efeito de camada e máscara de pixels em grupo não vêm, e o relatório diz', async () => {
    const xadrez: MascaraDoArquivo = { x: 0, y: 0, largura: L, altura: A, cobertura: new Uint8Array(L * A), fora: 0 };
    for (let i = 0; i < xadrez.cobertura.length; i++) xadrez.cobertura[i] = (Math.floor((i % L) / 7) + Math.floor(i / L / 7)) % 2 ? 255 : 0;
    const r = await importar([
      camada('Selo', 'grupo', {
        modo: 'multiplicacao',
        opacidade: 0.9,
        filhos: [forma('Disco', [retangulo(10, 10, 60, 40)]), camada('Sub', 'grupo', { filhos: [] })],
        efeitos: { sombraProjetada: { cor: { r: 0, g: 0, b: 0 }, opacidade: 1, angulo: 90, distancia: 1, tamanho: 1, modo: 'normal' } },
        coberturaDaMascara: xadrez,
      }),
    ]);
    expect(nos(r)[0]).toMatchObject({
      tipo: 'grupo',
      modoDeMesclagem: 'multiplicacao',
      opacidade: 0.9,
      filhos: [
        { nome: 'Disco', tipo: 'forma' },
        { nome: 'Sub', tipo: 'grupo', modoDeMesclagem: 'atravessar', filhos: [] },
      ],
    });
    expect(nos(r)[0]).not.toHaveProperty('mascara');
    expect(linha(r, 'Selo')?.perdas?.map((p) => p.mapeamento)).toEqual(['psd:efeito-em-grupo', 'psd:mascara-de-pixels']);
  });

  it('modo dissolver vira normal; opacidade do preenchimento entra na opacidade quando não há efeito, e não vem quando há', async () => {
    const r = await importar([
      forma('Dissolver', [retangulo(10, 10, 60, 40)], { foraDoModelo: [{ recurso: 'modo-dissolver', detalhe: 'camada em modo dissolver' }] }),
      forma('Preenchimento', [retangulo(10, 10, 60, 40)], { opacidade: 0.8, opacidadeDoPreenchimento: 0.5 }),
      forma('Com efeito', [retangulo(10, 10, 60, 40)], { opacidadeDoPreenchimento: 0, efeitos: { brilhoExterno: { cor: { r: 255, g: 255, b: 255 }, opacidade: 1, tamanho: 5, modo: 'tela' } } }),
    ]);
    expect(nos(r).map((n) => [n.nome, n.opacidade, (n as { modoDeMesclagem: string }).modoDeMesclagem])).toEqual([
      ['Dissolver', 1, 'normal'],
      ['Preenchimento', 0.4, 'normal'],
      ['Com efeito', 1, 'normal'],
    ]);
    expect(linha(r, 'Dissolver')?.perdas).toEqual([{ mapeamento: 'psd:modo-dissolver', detalhe: 'camada em modo dissolver' }]);
    expect(linha(r, 'Com efeito')?.perdas?.[0]?.mapeamento).toBe('psd:opacidade-do-preenchimento');
  });
});

describe('objeto inteligente', () => {
  const foto = (): Uint8Array => recursos.imagens[0]?.bytes as Uint8Array;
  const embutidos = (): ArquivoLido['embutidos'] => [{ id: 'foto', nome: 'foto.jpg', tipo: 'jpeg', bytes: foto() }];
  const objeto = (cantos: number[], filtros: CamadaLida['objetoInteligente'] extends infer O ? (O extends { filtros: infer F } ? F : never) : never = []) => ({
    embutido: 'foto',
    instancia: 'a',
    cantos: cantos as never,
    largura: 1280,
    altura: 853,
    filtros,
    semente: 0,
  });

  it('foto PNG ou JPEG embutida: imagem com o arquivo original, a caixa e os filtros que o Otto tem', async () => {
    // a foto de 1280 × 853 a 10%: 128 × 85,3
    const r = await importar(
      [camada('Foto', 'objeto-inteligente', { objetoInteligente: objeto([20, 5, 148, 5, 148, 90.3, 20, 90.3], [{ tipo: 'desfoque', raio: 3 }]), pixels: pixelsDe(20, 5, 128, 85, [9, 9, 9, 255]) })],
      {},
      { embutidos: embutidos() },
    );
    expect(nos(r)[0]).toMatchObject({
      tipo: 'imagem',
      larguraOriginal: 1280,
      alturaOriginal: 853,
      x: 20,
      y: 5,
      largura: 128,
      altura: 85.3,
      ajuste: 'cobrir',
      zoom: 1,
      filtros: [{ tipo: 'desfoque', raio: 3 }],
    });
    expect(r.imagens).toEqual([expect.objectContaining({ tipo: 'image/jpeg', largura: 1280, altura: 853, origem: 'foto-embutida' })]);
    // o arquivo embutido vem byte a byte
    expect(Buffer.compare(Buffer.from(r.imagens[0]?.bytes as Uint8Array), Buffer.from(foto()))).toBe(0);
  });

  it('com deformação, espelhado ou com escala diferente nos dois eixos, ou com filtro que o Otto não tem: imagem, com o pixel gravado (que já traz o filtro)', async () => {
    const px = (): PixelsDoArquivo => pixelsDe(20, 5, 128, 85, [9, 9, 9, 255]);
    const r = await importar(
      [
        camada('Esticada', 'objeto-inteligente', { objetoInteligente: objeto([0, 0, 200, 0, 200, 50, 0, 50]), pixels: px() }),
        camada('Com filtro', 'objeto-inteligente', {
          objetoInteligente: objeto([20, 5, 148, 5, 148, 90.3, 20, 90.3]),
          pixels: px(),
          foraDoModelo: [{ recurso: 'filtro-inteligente', detalhe: 'filtro inteligente: Average' }],
        }),
        camada('Vetorial', 'objeto-inteligente', { pixels: px(), foraDoModelo: [{ recurso: 'objeto-inteligente', detalhe: 'objeto inteligente com "logo.ai" dentro (não é PNG nem JPEG)' }] }),
      ],
      {},
      { embutidos: embutidos() },
    );
    expect(r.relatorio.camadas.map((l) => [l.camada, l.destino, l.mapeamento])).toEqual([
      ['Esticada', 'imagem', 'psd:objeto-inteligente-deformado'],
      ['Com filtro', 'imagem', 'psd:filtro-inteligente'],
      ['Vetorial', 'imagem', 'psd:objeto-inteligente'],
    ]);
    expect(r.imagens.every((i) => i.origem === 'camada' && i.tipo === 'image/png')).toBe(true);
  });

  it('máscara de pixels em foto embutida: vira a máscara de recorte da foto, e a foto continua editável', async () => {
    const mascara: MascaraDoArquivo = { x: 20, y: 5, largura: 128, altura: 85, cobertura: new Uint8Array(128 * 85), fora: 0 };
    for (let y = 0; y < 85; y++) for (let x = 0; x < 128; x++) mascara.cobertura[y * 128 + x] = Math.hypot(x - 40, y - 40) < 30 || (x > 90 && y > 50) ? 255 : 0;
    const r = await importar(
      [camada('Sujeito', 'objeto-inteligente', { objetoInteligente: objeto([20, 5, 148, 5, 148, 90.3, 20, 90.3]), pixels: pixelsDe(20, 5, 128, 85, [9, 9, 9, 255]), coberturaDaMascara: mascara })],
      {},
      { embutidos: embutidos() },
    );
    const no = nos(r)[0] as No & { mascara: { tipo: string; arquivo: string } };
    expect(no).toMatchObject({ tipo: 'imagem', mascara: { tipo: 'sujeito', inverter: false } });
    expect(r.imagens.find((i) => i.arquivo === no.mascara.arquivo)).toMatchObject({ origem: 'mascara', tipo: 'image/png', largura: 128, altura: 85 });
    const rgba = render(r);
    // dentro do disco aparece a foto; fora, o fundo
    expect(pixel(rgba, 60, 45)).not.toEqual([255, 255, 255]);
    expect(pixel(rgba, 100, 20)).toEqual([255, 255, 255]);
    expect(pixel(rgba, 130, 80)).not.toEqual([255, 255, 255]);
  });
});

describe('cor', () => {
  it('fontesDoPsd lista os nomes PostScript que o arquivo pede, sem decodificar pixel', async () => {
    const formato: FormatoDeArquivoEmCamadas = {
      escrever: () => ({ bytes: new Uint8Array(0), extensao: 'psd' }),
      ler: () => ({
        largura: L,
        altura: A,
        embutidos: [],
        composta: () => undefined,
        camadas: [
          camada('G', 'grupo', {
            filhos: [
              camada('A', 'texto', {
                texto: texto('a', { trechos: [{ comprimento: 1, estilo: { ...texto('').estilo, fonte: 'MyriadPro-Bold' } }] }),
                decodificar: () => {
                  throw new Error('não era para decodificar');
                },
              }),
            ],
          }),
          camada('B', 'texto', { texto: texto('b') }),
        ],
      }),
    };
    expect(fontesDoPsd(formato, psdDeTeste({ largura: L, altura: A }))).toEqual(['Anton-Regular', 'MyriadPro-Bold']);
  });

  it('formato sem leitura: erro de programação, não de arquivo', async () => {
    await expect(importarPsd(ck, { escrever: () => ({ bytes: new Uint8Array(0), extensao: 'svg' }) }, psdDeTeste())).rejects.toThrow('Este formato não tem leitura');
  });

  it('arquivo em Adobe RGB (1998): as cores das camadas e os pixels vêm convertidos para sRGB, e o relatório diz', async () => {
    const formato = criarFormatoPsd();
    const pixels = pixelsDe(1, 1, 2, 2, [200, 100, 50, 255]);
    const escrito = await formato.escrever({
      largura: 4,
      altura: 4,
      composta: new Uint8Array(64).fill(255),
      camadas: [
        { nome: 'Fundo', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, preenchimento: { tipo: 'cor', cor: { r: 200, g: 100, b: 50 } } },
        { nome: 'Pixels', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, pixels },
      ],
      embutidos: [],
      perfilDeCor: ADOBE_RGB,
    });
    const r = await importarPsd(ck, formato, escrito.bytes);
    // (200, 100, 50) em Adobe RGB é (227, 100, 42) em sRGB, pelo LittleCMS
    expect(r.doc.pranchetas[0]?.fundo).toBe('#e3642a');
    expect(r.relatorio.arquivo).toMatchObject({ conversaoDeCor: 'convertido', perfilDeCor: 'Adobe RGB (1998)' });
    expect(r.relatorio.avisos.map((a) => a.codigo)).toContain('cores-convertidas');
    const sessao = criarSessao(ck, { fontes: [], imagens: r.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })) });
    try {
      const rgba = renderizarPrancheta(sessao, r.doc, r.doc.pranchetas[0] as Prancheta).rgba;
      expect([...rgba.subarray((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 3)]).toEqual([227, 100, 42]);
    } finally {
      sessao.destruir();
    }
  });

  it('o perfil sRGB do próprio Otto não converte nada', async () => {
    const formato = criarFormatoPsd();
    const escrito = await formato.escrever({
      largura: 4,
      altura: 4,
      composta: new Uint8Array(64).fill(255),
      camadas: [{ nome: 'Fundo', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, preenchimento: { tipo: 'cor', cor: { r: 200, g: 100, b: 50 } } }],
      embutidos: [],
      perfilDeCor: perfilSrgb(),
    });
    const r = await importarPsd(ck, formato, escrito.bytes);
    expect(r.doc.pranchetas[0]?.fundo).toBe('#c86432');
    expect(r.relatorio.arquivo).toMatchObject({ conversaoDeCor: 'srgb', perfilDeCor: 'sRGB IEC61966-2.1' });
    expect(r.relatorio.avisos.map((a) => a.codigo)).not.toContain('cores-convertidas');
  });
});

describe('o que a importação recusa', () => {
  it('o erro é ErroDeImportacao, com código e frase em português, antes de qualquer leitura', async () => {
    let leu = false;
    const formato: FormatoDeArquivoEmCamadas = {
      escrever: () => ({ bytes: new Uint8Array(0), extensao: 'psd' }),
      ler: () => {
        leu = true;
        throw new Error('não era para ler');
      },
    };
    for (const [bytes, codigo] of [
      [psdDeTeste({ modo: 4, canais: 4 }), 'modo-de-cor'],
      [psdDeTeste({ bits: 16 }), 'profundidade'],
      [new Uint8Array(100), 'nao-e-psd'],
      [psdDeTeste({ camadas: [{ area: [0, 0, 30_000, 30_000] }] }), 'pixels-demais'],
    ] as const) {
      const erro = await importarPsd(ck, formato, bytes).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroDeImportacao);
      expect((erro as ErroDeImportacao).codigo).toBe(codigo);
    }
    expect(leu).toBe(false);
    // os tetos vêm de quem chama
    await expect(importarPsd(ck, formato, psdDeTeste({ largura: 50, altura: 50 }), { limites: { lado: 40 } })).rejects.toMatchObject({ codigo: 'dimensoes-grandes-demais' });
  });

  it('erro da biblioteca ao ler vira "arquivo malformado": o defeito é do arquivo', async () => {
    const formato: FormatoDeArquivoEmCamadas = {
      escrever: () => ({ bytes: new Uint8Array(0), extensao: 'psd' }),
      ler: () => {
        throw new RangeError('Offset is outside the bounds of the DataView');
      },
    };
    await expect(importarPsd(ck, formato, psdDeTeste())).rejects.toMatchObject({ name: 'ErroDeImportacao', codigo: 'arquivo-malformado' });
  });
});
