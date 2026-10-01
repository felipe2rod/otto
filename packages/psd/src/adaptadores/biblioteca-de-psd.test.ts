// O adaptador contra a própria biblioteca: o que foi gravado é relido por ela, e os dados editáveis de cada camada
// estão lá, com os valores do documento. (A leitura pela segunda biblioteca, independente, está em goldens.test.ts.)
import { FOTO, imagensDeTeste } from '@otto/render/apoio-de-teste';
import { initializeCanvas, type Layer, type Psd, readPsd } from 'ag-psd';
import type { CanvasKit } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { recursosDeTeste } from '../apoio-de-teste';
import { cenasDeGolden } from '../cenas-de-golden';
import { exportarPsd, type RecursosDaExportacao } from '../exportar';
import { idEstavel } from '../montar';
import type { ArquivoEmCamadas } from '../porta';
import { criarFormatoPsd } from './biblioteca-de-psd';

let ck: CanvasKit;
let recursos: RecursosDaExportacao;
beforeAll(async () => {
  // para LER, a biblioteca pede quem crie a área de pixels; gravar (o que o produto faz) não precisa de nada disto
  initializeCanvas(
    () => {
      throw new Error('os testes não usam canvas');
    },
    (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
  );
  ({ ck, recursos } = await recursosDeTeste());
});

const lidos = new Map<string, Psd>();
async function ler(nome: string): Promise<Psd> {
  const pronto = lidos.get(nome);
  if (pronto) return pronto;
  const cena = cenasDeGolden().find((c) => c.nome === nome);
  if (!cena) throw new Error(`sem cena ${nome}`);
  const { arquivos } = await exportarPsd(ck, criarFormatoPsd(), cena.doc, recursos, { nome, ...(cena.arquivos ? { arquivos: cena.arquivos } : {}) });
  const psd = readPsd(arquivos[0]?.bytes as Uint8Array, { useImageData: true, skipThumbnail: true });
  lidos.set(nome, psd);
  return psd;
}
/** As âncoras de um caminho. O arquivo guarda coordenada em ponto fixo, relativa ao tamanho do documento: volta com erro de milésimos. */
const ancoras = (c: Layer, caminho = 0): number[] => (c.vectorMask?.paths[caminho]?.knots ?? []).flatMap((k) => k.points.slice(2, 4));
const perto = (lido: number[], esperado: number[]): void => {
  expect(lido).toHaveLength(esperado.length);
  for (const [i, v] of lido.entries()) expect(v).toBeCloseTo(esperado[i] as number, 3);
};

function camada(psd: Psd | Layer, ...caminho: string[]): Layer {
  let atual: Psd | Layer = psd;
  for (const nome of caminho) {
    const achada: Layer | undefined = atual.children?.find((c) => c.name === nome);
    if (!achada) throw new Error(`sem a camada "${nome}" (há: ${atual.children?.map((c) => c.name).join(', ')})`);
    atual = achada;
  }
  return atual as Layer;
}

describe('forma', () => {
  it('é camada de preenchimento com máscara vetorial; o raio vai como curva', async () => {
    const psd = await ler('forma');
    expect(psd.children?.map((c) => c.name)).toEqual(['Fundo', 'Retângulo', 'Arredondado', 'Elipse', 'Degradê linear', 'Degradê radial', 'Com traço e sombra', 'Girada', 'Com filtro']);
    expect(camada(psd, 'Fundo').vectorFill).toEqual({ type: 'color', color: { r: 250, g: 250, b: 249 } });
    const retangulo = camada(psd, 'Retângulo');
    // token:marca resolvido em valor
    expect(retangulo.vectorFill).toEqual({ type: 'color', color: { r: 194, g: 65, b: 12 } });
    perto(ancoras(retangulo), [20, 20, 120, 20, 120, 90, 20, 90]);
    expect(retangulo.vectorMask?.paths[0]?.open).toBe(false);
    expect(camada(psd, 'Arredondado').vectorMask?.paths[0]?.knots).toHaveLength(8);
    expect(camada(psd, 'Elipse').vectorMask?.paths[0]?.knots).toHaveLength(4);
    expect(retangulo.imageData?.width).toBeGreaterThanOrEqual(100);
  });

  it('degradê, traço, sombra, rotação e opacidade', async () => {
    const psd = await ler('forma');
    const linear = camada(psd, 'Degradê linear').vectorFill as { type: string; style: string; angle: number; colorStops: { color: object; location: number }[] };
    expect(linear.type).toBe('solid');
    expect(linear.style).toBe('linear');
    expect(linear.angle).toBe(45);
    expect(linear.colorStops.map((s) => s.location)).toEqual([0, 1]);
    expect((camada(psd, 'Degradê radial').vectorFill as { style: string }).style).toBe('radial');
    const fx = camada(psd, 'Com traço e sombra').effects;
    expect(fx?.stroke?.[0]).toMatchObject({ position: 'inside', fillType: 'color', color: { r: 15, g: 23, b: 42 }, size: { units: 'Pixels', value: 6 }, enabled: true });
    // a sombra vai em modo normal, que é como o motor a desenha
    expect(fx?.dropShadow?.[0]).toMatchObject({ blendMode: 'normal', angle: 120, distance: { value: 6 }, size: { value: 10 }, useGlobalLight: false });
    expect(fx?.dropShadow?.[0]?.opacity).toBeCloseTo(0.45, 2);
    const girada = camada(psd, 'Girada');
    expect(girada.opacity).toBeCloseTo(0.8, 2);
    // girada 12 graus: o primeiro canto sai de (40, 210)
    const [x, y] = ancoras(girada) as [number, number];
    expect(x).not.toBeCloseTo(40, 0);
    expect(Math.hypot(x - 100, y - 235)).toBeCloseTo(Math.hypot(60, 25), 3);
  });

  it('com filtro, vai só o pixel: sem preenchimento nem máscara vetorial', async () => {
    const comFiltro = camada(await ler('forma'), 'Com filtro');
    expect(comFiltro.vectorFill).toBeUndefined();
    expect(comFiltro.vectorMask).toBeUndefined();
    expect(comFiltro.imageData?.width).toBeGreaterThan(140);
  });
});

describe('texto', () => {
  it('é camada de texto, com a fonte pelo nome PostScript, a caixa, a entrelinha em pixels e o tracking', async () => {
    const titulo = camada(await ler('texto'), 'Título');
    expect(titulo.text?.text).toBe('JAZZ NA PRAÇA');
    expect(titulo.text?.style?.font?.name).toBe('Anton-Regular');
    expect(titulo.text?.style?.fontSize).toBe(52);
    expect(titulo.text?.style?.leading).toBe(52);
    expect(titulo.text?.style?.autoLeading).toBe(false);
    expect(titulo.text?.style?.tracking).toBe(20);
    expect(titulo.text?.shapeType).toBe('box');
    expect(titulo.text?.boxBounds).toEqual([0, 0, 360, 64]);
    expect(titulo.text?.transform).toEqual([1, 0, 0, 1, 20, 16]);
    expect(titulo.text?.paragraphStyle?.justification).toBe('left');
    // o pixel da camada vai junto: é o que o Photoshop mostra até a pessoa editar
    expect(titulo.imageData?.width).toBeGreaterThan(300);
  });

  it('trechos viram estilos por sequência de caracteres, cobrindo o texto inteiro', async () => {
    const paragrafo = camada(await ler('texto'), 'Parágrafo');
    const conteudo = 'O agente faz a produção, você faz o design. A partir de R$ 19,90.';
    const trechos = paragrafo.text?.styleRuns ?? [];
    expect(trechos.map((r) => r.length)).toEqual([9, 14, 32, 8, 2]);
    expect(trechos.reduce((soma, r) => soma + r.length, 0)).toBe(conteudo.length);
    expect(trechos.map((r) => r.style.font?.name)).toEqual(['IBMPlexSans', 'IBMPlexSans-Bold', 'IBMPlexSans', 'DMSerifDisplay-Regular', 'IBMPlexSans']);
    // a cor do texto é guardada em fração de 0 a 1: volta com erro de milésimos
    const corDoTrecho = trechos[1]?.style.fillColor as { r: number; g: number; b: number };
    expect([corDoTrecho.r, corDoTrecho.g, corDoTrecho.b].map(Math.round)).toEqual([194, 65, 12]);
    expect(trechos[3]?.style.fontSize).toBe(24);
    // a entrelinha acompanha o tamanho do trecho, como no motor
    expect(trechos[3]?.style.leading).toBeCloseTo(32.4, 2);
  });

  it('caixa alta, alinhamento, rotação e o peso trocado', async () => {
    const psd = await ler('texto');
    expect(camada(psd, 'Caixa alta').text?.style?.fontCaps).toBe(2);
    // o conteúdo vai como foi digitado: a caixa alta é atributo
    expect(camada(psd, 'Caixa alta').text?.text).toBe('entrada franca');
    expect(camada(psd, 'Centro, com sombra').text?.paragraphStyle?.justification).toBe('center');
    const t = camada(psd, 'Girado').text?.transform as number[];
    expect(t[0]).toBeCloseTo(Math.cos((-8 * Math.PI) / 180), 6);
    expect(t[1]).toBeCloseTo(Math.sin((-8 * Math.PI) / 180), 6);
    // a origem da caixa, girada em torno do centro da camada
    expect(Math.hypot((t[4] as number) - 335, (t[5] as number) - 253)).toBeCloseTo(Math.hypot(55, 17), 3);
    expect(camada(psd, 'Peso trocado').text?.style?.font?.name).toBe('IBMPlexSans-Bold');
  });

  it('a quebra de linha continua no texto (no arquivo é retorno de carro, como a segunda biblioteca mostra nos goldens)', async () => {
    expect(camada(await ler('grupo-e-ajuste'), 'Selo', 'Data').text?.text).toBe('20\nJUN');
  });
});

describe('foto', () => {
  it('é objeto inteligente com o arquivo original embutido uma vez só, e a transformação é a foto inteira', async () => {
    const psd = await ler('imagem');
    const original = imagensDeTeste().find((i) => i.arquivo === FOTO)?.bytes as Uint8Array;
    const embutidos = psd.linkedFiles ?? [];
    expect(embutidos.map((e) => [e.name, e.type])).toEqual([
      ['Cobrir.jpg', 'JPEG'],
      ['PNG com alfa, girada.png', 'png'],
    ]);
    expect(Buffer.compare(Buffer.from(embutidos[0]?.data as Uint8Array), Buffer.from(original))).toBe(0);
    const cobrir = camada(psd, 'Cobrir').placedLayer;
    expect(cobrir?.id).toBe(idEstavel(`arquivo:${FOTO}`));
    expect(cobrir?.type).toBe('raster');
    expect([cobrir?.width, cobrir?.height]).toEqual([1280, 853]);
    // cobrir uma caixa de 120 × 130 com uma foto de 1280 × 853: a altura manda, e a foto inteira tem 195 × 130, centrada
    const t = cobrir?.transform as number[];
    expect(t[1]).toBeCloseTo(10, 4);
    expect((t[2] as number) - (t[0] as number)).toBeCloseTo((1280 * 130) / 853, 3);
    expect(((t[0] as number) + (t[2] as number)) / 2).toBeCloseTo(70, 3);
    expect((t[7] as number) - (t[1] as number)).toBeCloseTo(130, 3);
    // todas as camadas da mesma foto apontam para o mesmo arquivo, cada uma com a sua instância
    const ids = ['Cobrir', 'Conter', 'Recorte em elipse', 'Com filtros'].map((n) => camada(psd, n).placedLayer);
    expect(new Set(ids.map((p) => p?.id)).size).toBe(1);
    expect(new Set(ids.map((p) => p?.placed)).size).toBe(4);
  });

  it('o corte da caixa é máscara vetorial; o recorte em elipse também', async () => {
    const psd = await ler('imagem');
    perto(ancoras(camada(psd, 'Cobrir')), [10, 10, 130, 10, 130, 140, 10, 140]);
    expect(camada(psd, 'Recorte em elipse').vectorMask?.paths[0]?.knots.every((k) => k.linked)).toBe(true);
  });

  it('filtros viram filtros inteligentes, na ordem; o ruído é uniforme, como o do motor', async () => {
    const filtro = camada(await ler('imagem'), 'Com filtros').placedLayer?.filter;
    expect(filtro?.list.map((f) => f.type)).toEqual(['gaussian blur', 'add noise']);
    expect(filtro?.list[0]).toMatchObject({ enabled: true, filter: { radius: { units: 'Pixels', value: 3 } } });
    expect(filtro?.list[1]).toMatchObject({ filter: { distribution: 'uniform', monochromatic: true } });
    const ruido = filtro?.list[1] as { filter: { amount: number } } | undefined;
    expect(ruido?.filter.amount).toBeCloseTo(0.15, 4);
  });

  it('o ajuste de cor vira camadas de ajuste presas à foto', async () => {
    const psd = await ler('imagem');
    const nomes = psd.children?.map((c) => c.name) ?? [];
    const i = nomes.indexOf('Com ajuste de cor');
    expect(nomes.slice(i, i + 3)).toEqual(['Com ajuste de cor', 'Com ajuste de cor: brilho e contraste', 'Com ajuste de cor: saturação']);
    expect(camada(psd, 'Com ajuste de cor: brilho e contraste')).toMatchObject({ clipping: true, adjustment: { type: 'brightness/contrast', brightness: 15, contrast: 20 } });
    expect(camada(psd, 'Com ajuste de cor: saturação')).toMatchObject({ clipping: true, adjustment: { type: 'hue/saturation', master: { saturation: -40 } } });
  });

  it('a máscara do sujeito vai como máscara de camada, e a sombra como efeito', async () => {
    const sujeito = camada(await ler('imagem'), 'Sujeito');
    expect(sujeito.mask?.imageData?.width).toBeGreaterThan(0);
    expect(sujeito.mask?.defaultColor).toBe(0);
    expect(sujeito.effects?.dropShadow?.[0]?.color).toEqual({ r: 249, g: 115, b: 22 });
  });
});

describe('vetor', () => {
  it('é um grupo com uma camada de forma por caminho; a regra par-ímpar e o traçado vetorial vão juntos', async () => {
    const psd = await ler('vetor');
    const anel = camada(psd, 'Anel', 'Anel · #1d4ed8');
    expect(anel.vectorMask?.paths).toHaveLength(2);
    expect(anel.vectorMask?.paths[0]?.fillRule).toBe('even-odd');
    expect(anel.vectorFill).toEqual({ type: 'color', color: { r: 29, g: 78, b: 216 } });
    // moldura de 100 numa caixa de 80 em (110, 20): o ponto (50, 10) vai para (150, 28)
    perto(ancoras(anel).slice(0, 2), [150, 28]);
    const onda = camada(psd, 'Onda', 'Onda · #be123c');
    expect(onda.vectorMask?.paths[0]?.open).toBe(true);
    expect(onda.vectorStroke).toMatchObject({
      strokeEnabled: true,
      fillEnabled: false,
      lineCapType: 'round',
      lineJoinType: 'round',
      lineAlignment: 'center',
      content: { type: 'color', color: { r: 190, g: 18, b: 60 } },
    });
    expect(onda.vectorStroke?.lineWidth?.value).toBeCloseTo(6.4, 4);
    const logo = camada(psd, 'Logo');
    expect(logo.children?.map((c) => c.name)).toEqual(['Logo · #0f766e (1)', 'Logo · #fde047 (2)']);
    // os efeitos da camada do Otto ficam no grupo
    expect(logo.effects?.dropShadow?.[0]?.enabled).toBe(true);
    expect(logo.children?.[1]?.vectorStroke?.fillEnabled).toBe(true);
  });
});

describe('grupo, ajuste, máscara e recorte', () => {
  it('grupo: atravessar é o padrão; opacidade e modo próprios isolam', async () => {
    const psd = await ler('grupo-e-ajuste');
    expect(camada(psd, 'Luzes').blendMode).toBe('pass through');
    expect(camada(psd, 'Selo').blendMode).toBe('normal');
    expect(camada(psd, 'Selo').opacity).toBeCloseTo(0.9, 2);
    expect(camada(psd, 'Luzes', 'Luz').blendMode).toBe('linear light');
    expect(camada(psd, 'Luzes').mask?.imageData?.width).toBeGreaterThan(0);
  });

  it('camadas de ajuste com os parâmetros do documento, a opacidade, o modo, a máscara e o recorte', async () => {
    const psd = await ler('grupo-e-ajuste');
    expect(camada(psd, 'Curvas')).toMatchObject({
      adjustment: {
        type: 'curves',
        rgb: [
          { input: 0, output: 0 },
          { input: 128, output: 150 },
          { input: 255, output: 255 },
        ],
      },
    });
    expect(camada(psd, 'Curvas').opacity).toBeCloseTo(0.8, 2);
    expect(camada(psd, 'Níveis em sobrepor')).toMatchObject({ blendMode: 'overlay', adjustment: { type: 'levels', rgb: { shadowInput: 10, highlightInput: 235, midtoneInput: 1.1 } } });
    expect(camada(psd, 'Preto e branco no texto')).toMatchObject({ clipping: true, adjustment: { type: 'black & white' } });
    expect(camada(psd, 'Foto no texto').clipping).toBe(true);
    expect(camada(psd, 'Base do recorte').clipping).toBeFalsy();
  });

  it('visível, bloqueado e modo de mesclagem', async () => {
    const psd = await ler('grupo-e-ajuste');
    expect(camada(psd, 'Oculta').hidden).toBe(true);
    expect(camada(psd, 'Véu bloqueado')).toMatchObject({ blendMode: 'soft light', protected: { transparency: true, composite: true, position: true } });
    expect(camada(psd, 'Véu bloqueado').opacity).toBeCloseTo(0.4, 2);
  });
});

describe('efeitos de camada', () => {
  it('cada efeito com os parâmetros do documento e o modo com que o motor o desenha', async () => {
    const psd = await ler('efeitos');
    expect(camada(psd, 'Brilho externo').effects?.outerGlow).toMatchObject({ enabled: true, blendMode: 'normal', color: { r: 245, g: 158, b: 11 }, size: { value: 14 } });
    expect(camada(psd, 'Brilho interno').effects?.innerGlow).toMatchObject({ blendMode: 'screen', source: 'edge', size: { value: 14 } });
    expect(camada(psd, 'Sombra interna').effects?.innerShadow?.[0]).toMatchObject({ blendMode: 'multiply', angle: 120, distance: { value: 6 }, size: { value: 8 } });
    expect(camada(psd, 'Sobreposição de cor').effects?.solidFill?.[0]).toMatchObject({ blendMode: 'multiply', color: { r: 225, g: 29, b: 72 } });
    const degrade = camada(psd, 'Sobreposição de degradê').effects?.gradientOverlay?.[0];
    expect(degrade).toMatchObject({ blendMode: 'soft light', type: 'linear', angle: 0 });
    expect(degrade?.opacity).toBeCloseTo(0.7, 2);
    const noTexto = camada(psd, 'Texto com efeitos').effects;
    expect(Object.keys(noTexto ?? {}).sort()).toEqual(expect.arrayContaining(['gradientOverlay', 'innerShadow', 'outerGlow']));
    // o texto continua texto
    expect(camada(psd, 'Texto com efeitos').text?.text).toBe('OTTO');
  });
});

describe('várias pranchetas num arquivo', () => {
  it('cada uma é uma prancheta do Photoshop, lado a lado como no editor, com o fundo dela', async () => {
    const psd = await ler('peca');
    expect([psd.width, psd.height]).toEqual([270 + 160 + 216, 384]);
    expect(psd.children?.map((c) => c.name)).toEqual(['Feed', 'Story']);
    expect(camada(psd, 'Feed').artboard).toMatchObject({ rect: { top: 0, left: 0, bottom: 338, right: 270 }, color: { r: 12, g: 10, b: 9 } });
    expect(camada(psd, 'Story').artboard?.rect).toEqual({ top: 0, left: 430, bottom: 384, right: 646 });
    // as camadas da segunda prancheta estão deslocadas para a posição dela
    expect(camada(psd, 'Story', 'Título').text?.transform?.slice(4)).toEqual([446, 250]);
    expect(camada(psd, 'Story', 'Fundo').left).toBe(430);
    // a mesma foto nas duas pranchetas: um arquivo embutido só
    expect(psd.linkedFiles).toHaveLength(1);
  });
});

describe('PSB', () => {
  const arquivo = (largura: number): ArquivoEmCamadas => ({
    largura,
    altura: 2,
    composta: new Uint8Array(largura * 2 * 4).fill(255),
    camadas: [{ nome: 'Fundo', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, preenchimento: { tipo: 'cor', cor: { r: 255, g: 255, b: 255 } } }],
    embutidos: [],
  });

  it('até 30.000 px de lado é PSD (versão 1 no cabeçalho); acima, PSB (versão 2)', () => {
    const psd = criarFormatoPsd().escrever(arquivo(30_000));
    expect(psd.extensao).toBe('psd');
    expect(new TextDecoder().decode(psd.bytes.slice(0, 4))).toBe('8BPS');
    expect([psd.bytes[4], psd.bytes[5]]).toEqual([0, 1]);
    const psb = criarFormatoPsd().escrever(arquivo(30_001));
    expect(psb.extensao).toBe('psb');
    expect([psb.bytes[4], psb.bytes[5]]).toEqual([0, 2]);
    expect(readPsd(psb.bytes, { skipCompositeImageData: true, skipLayerImageData: true, skipThumbnail: true }).width).toBe(30_001);
  });
});
