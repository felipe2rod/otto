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
import type { ArquivoEmCamadas, ArquivoGravado } from '../porta';
import { comRecursoDeImagem, criarFormatoPsd } from './biblioteca-de-psd';

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

/** O adaptador de PSD grava na hora (a porta admite promessa por causa do PDF). */
const gravar = (arquivo: ArquivoEmCamadas): ArquivoGravado => criarFormatoPsd().escrever(arquivo) as ArquivoGravado;

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
    // escala de 100% (fração 1). Ia 100, que o Photoshop lia como 10000%: o degradê virava uma faixa lisa
    expect((linear as unknown as { scale: number }).scale).toBe(1);
    expect((camada(psd, 'Degradê radial').vectorFill as unknown as { scale: number }).scale).toBe(1);
    expect((camada(psd, 'Degradê radial').vectorFill as { style: string }).style).toBe('radial');
    const fx = camada(psd, 'Com traço e sombra').effects;
    expect(fx?.stroke?.[0]).toMatchObject({ position: 'inside', fillType: 'color', color: { r: 15, g: 23, b: 42 }, size: { units: 'Pixels', value: 6 }, enabled: true });
    // a sombra vai em modo normal, que é como o motor a desenha
    expect(fx?.dropShadow?.[0]).toMatchObject({ blendMode: 'normal', angle: 120, distance: { value: 6 }, size: { value: 10 }, useGlobalLight: false });
    // O que o Photoshop recusou em 2026-10-02 ("as configurações no arquivo não eram válidas"): a sombra projetada ia
    // com o contorno vazio. Agora vai o contorno linear, com os outros parâmetros neutros.
    expect(fx?.dropShadow?.[0]?.contour).toEqual({
      name: 'Linear',
      curve: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
    });
    expect(fx?.dropShadow?.[0]).toMatchObject({ choke: { units: 'Pixels', value: 0 }, antialiased: false, layerConceals: true });
    // e o traço interno continua lá, junto com a sombra
    expect(fx?.stroke?.[0]?.enabled).toBe(true);
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
    // a caixa desce (ascendente − maiúscula) × tamanho e encolhe o mesmo tanto: ver "texto não sai do lugar", abaixo
    expect(titulo.text?.transform?.slice(0, 5)).toEqual([1, 0, 0, 1, 20]);
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
    // a origem da caixa (já descida pela compensação da primeira linha), girada em torno do centro da camada (335, 253)
    const descida = (1.17627 - 0.859375) * 28;
    expect(Math.hypot((t[4] as number) - 335, (t[5] as number) - 253)).toBeCloseTo(Math.hypot(55, 17 - descida), 0);
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
    // brilho 10, contraste 20: ganho 1,4, e a reta cruza o preto no nível 26 e o branco no 208
    expect(camada(psd, 'Com ajuste de cor: brilho e contraste')).toMatchObject({
      clipping: true,
      adjustment: { type: 'levels', rgb: { shadowInput: 26, highlightInput: 208, shadowOutput: 0, highlightOutput: 255, midtoneInput: 1 } },
    });
    // saturação −40: cada canal fica com 60% dele e 40% do cinza
    expect(camada(psd, 'Com ajuste de cor: saturação')).toMatchObject({
      clipping: true,
      adjustment: {
        type: 'channel mixer',
        monochrome: false,
        red: { red: 72, green: 23, blue: 5, constant: 0 },
        green: { red: 12, green: 83, blue: 5, constant: 0 },
        blue: { red: 12, green: 23, blue: 65, constant: 0 },
      },
    });
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
    // todos os parâmetros que o Photoshop grava vão, nos valores neutros: contorno linear, sem retração, e o alcance
    // do brilho em 100% (o desfoque puro, que é o que o motor desenha)
    const contorno = {
      name: 'Linear',
      curve: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
    };
    expect(camada(psd, 'Brilho externo').effects?.outerGlow).toMatchObject({
      enabled: true,
      blendMode: 'normal',
      color: { r: 245, g: 158, b: 11 },
      size: { value: 14 },
      choke: { value: 0 },
      range: 1,
      noise: 0,
      jitter: 0,
      contour: contorno,
    });
    expect(camada(psd, 'Brilho interno').effects?.innerGlow).toMatchObject({
      blendMode: 'screen',
      source: 'edge',
      size: { value: 14 },
      choke: { value: 0 },
      range: 1,
      technique: 'softer',
      contour: contorno,
    });
    expect(camada(psd, 'Sombra interna').effects?.innerShadow?.[0]).toMatchObject({
      blendMode: 'multiply',
      angle: 120,
      distance: { value: 6 },
      size: { value: 8 },
      choke: { value: 0 },
      contour: contorno,
    });
    // nenhum efeito de nenhuma cena sai com contorno vazio
    for (const nome of ['forma', 'texto', 'imagem', 'vetor', 'efeitos', 'peca']) {
      const ver = (l: Layer): void => {
        for (const efeito of [...(l.effects?.dropShadow ?? []), ...(l.effects?.innerShadow ?? []), l.effects?.outerGlow, l.effects?.innerGlow])
          if (efeito) expect(efeito.contour?.curve.length, `${nome}/${l.name}`).toBeGreaterThanOrEqual(2);
        for (const f of l.children ?? []) ver(f);
      };
      for (const l of (await ler(nome)).children ?? []) ver(l);
    }
    expect(camada(psd, 'Sobreposição de cor').effects?.solidFill?.[0]).toMatchObject({ blendMode: 'multiply', color: { r: 225, g: 29, b: 72 } });
    const degrade = camada(psd, 'Sobreposição de degradê').effects?.gradientOverlay?.[0];
    expect(degrade).toMatchObject({ blendMode: 'soft light', type: 'linear', angle: 0, scale: 1 });
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
    expect(camada(psd, 'Story', 'Título').text?.transform?.[4]).toBe(446);
    expect(camada(psd, 'Story', 'Fundo').left).toBe(430);
    // a mesma foto nas duas pranchetas: um arquivo embutido só
    expect(psd.linkedFiles).toHaveLength(1);
  });
});

describe('texto não sai do lugar quando o Photoshop o refaz', () => {
  // O Photoshop refaz o texto em caixa encostando a ALTURA DA MAIÚSCULA da primeira linha no topo da caixa; o motor
  // encosta a ascendente. A caixa gravada desce a diferença, para a linha de base cair no mesmo lugar.
  // Anton: ascendente 1,17627 e maiúscula 0,859375 do corpo. IBM Plex Sans: 1,025 e 0,698.
  it('a caixa desce (ascendente − maiúscula) × tamanho, e encolhe o mesmo tanto', async () => {
    const psd = await ler('texto');
    const titulo = camada(psd, 'Título').text;
    // 52 px de Anton em y = 16: o motor põe a linha de base em 16 + 1,17627 × 52 (em pixel inteiro: 77)
    const descida = (titulo?.transform?.[5] as number) - 16;
    expect(descida).toBeGreaterThan((1.17627 - 0.859375) * 52 - 1);
    expect(descida).toBeLessThan((1.17627 - 0.859375) * 52 + 1);
    // topo da caixa + maiúscula = linha de base do motor
    expect((titulo?.transform?.[5] as number) + 0.859375 * 52).toBeCloseTo(77, 0);
    // a caixa encolhe o que desceu, e continua cobrindo a caixa da camada (64 de altura) e o texto que o motor desenhou
    expect((titulo?.boxBounds?.[3] as number) + descida).toBeGreaterThanOrEqual(64);
    expect((titulo?.boxBounds?.[3] as number) + descida).toBeLessThan(64 + 16);
    expect(titulo?.boxBounds?.slice(0, 3)).toEqual([0, 0, 360]);
    // IBM Plex Sans a 18 px: desce (1,025 − 0,698) × 18 = 5,9
    const paragrafo = camada(psd, 'Parágrafo').text;
    expect((paragrafo?.transform?.[5] as number) - 90).toBeCloseTo((1.025 - 0.698) * 18, 0);
  });

  it('a caixa nunca fica menor que o texto: as linhas que o motor desenhou cabem nela', async () => {
    const psd = await ler('grupo-e-ajuste');
    // "20\nJUN" a 30 px com entrelinha 0,95 numa caixa de 64 de altura
    const data = camada(psd, 'Selo', 'Data').text;
    const descida = (data?.transform?.[5] as number) - 34;
    expect(descida).toBeGreaterThan(8);
    expect(data?.boxBounds?.[3] as number).toBeGreaterThanOrEqual(30);
    expect((data?.boxBounds?.[3] as number) + descida).toBeGreaterThanOrEqual(64);
  });
});

describe('forma viva', () => {
  it('retângulo, retângulo arredondado e elipse sem rotação levam os dados de forma viva; girada, só o caminho', async () => {
    const psd = await ler('forma');
    const viva = (nome: string) => camada(psd, nome).vectorOrigination?.keyDescriptorList[0];
    expect(viva('Retângulo')).toMatchObject({
      keyOriginType: 1,
      keyOriginResolution: 72,
      keyOriginShapeBoundingBox: { top: { units: 'Pixels', value: 20 }, left: { value: 20 }, bottom: { value: 90 }, right: { value: 120 } },
      transform: [1, 0, 0, 1, 0, 0],
    });
    expect(viva('Arredondado')).toMatchObject({
      keyOriginType: 2,
      keyOriginRRectRadii: { topRight: { units: 'Pixels', value: 18 }, topLeft: { value: 18 }, bottomLeft: { value: 18 }, bottomRight: { value: 18 } },
    });
    expect(viva('Arredondado')?.keyOriginBoxCorners).toEqual([
      { x: 140, y: 20 },
      { x: 240, y: 20 },
      { x: 240, y: 90 },
      { x: 140, y: 90 },
    ]);
    expect(viva('Elipse')).toMatchObject({ keyOriginType: 5 });
    expect(viva('Elipse')?.keyOriginRRectRadii).toBeUndefined();
    expect(camada(psd, 'Girada').vectorOrigination).toBeUndefined();
    // a foto e o fundo não são forma viva
    expect(camada(psd, 'Fundo').vectorOrigination).toBeUndefined();
  });
});

describe('perfil de cor', () => {
  it('entra como recurso de imagem 1039, sem estragar o resto: o arquivo continua legível, com as mesmas camadas', () => {
    const arquivo: ArquivoEmCamadas = {
      largura: 4,
      altura: 2,
      composta: new Uint8Array(32).fill(255),
      camadas: [{ nome: 'Fundo', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, preenchimento: { tipo: 'cor', cor: { r: 255, g: 0, b: 0 } } }],
      embutidos: [],
    };
    const sem = gravar(arquivo).bytes;
    // tamanho ímpar: o recurso é completado para ficar par
    const perfil = Uint8Array.from([1, 2, 3, 4, 5]);
    const com = gravar({ ...arquivo, perfilDeCor: perfil }).bytes;
    expect(com.length).toBe(sem.length + 12 + 6);
    const psd = readPsd(com, { useImageData: true, skipThumbnail: true });
    expect(psd.children?.map((c) => c.name)).toEqual(['Fundo']);
    expect(psd.width).toBe(4);
    const direto = comRecursoDeImagem(sem, 1039, perfil);
    expect(Buffer.compare(Buffer.from(direto), Buffer.from(com))).toBe(0);
    // o recurso está no fim da seção de recursos: "8BIM", 1039, nome vazio, tamanho 5
    const v = new DataView(com.buffer, com.byteOffset, com.byteLength);
    const inicio = 26 + 4 + v.getUint32(26);
    const fim = inicio + 4 + v.getUint32(inicio);
    expect([...com.slice(fim - 18, fim)]).toEqual([0x38, 0x42, 0x49, 0x4d, 0x04, 0x0f, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5, 0]);
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
    const psd = gravar(arquivo(30_000));
    expect(psd.extensao).toBe('psd');
    expect(new TextDecoder().decode(psd.bytes.slice(0, 4))).toBe('8BPS');
    expect([psd.bytes[4], psd.bytes[5]]).toEqual([0, 1]);
    const psb = gravar(arquivo(30_001));
    expect(psb.extensao).toBe('psb');
    expect([psb.bytes[4], psb.bytes[5]]).toEqual([0, 2]);
    expect(readPsd(psb.bytes, { skipCompositeImageData: true, skipLayerImageData: true, skipThumbnail: true }).width).toBe(30_001);
  });
});
