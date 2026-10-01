// Bancada de desempenho: documento sintético de 200 camadas, com contador de quadros.
// Parâmetros da URL:
//   motor=gpu      WebGL para o cache e para o quadro (padrão; é a proposta para o editor)
//   motor=hibrido  cache rasterizado em CPU (igual ao servidor), quadro em WebGL
//   motor=cpu      tudo em raster de CPU
//   densidade=2    simula tela de alta densidade (o canvas tem o dobro de pixels por lado)
//   cache=2        resolução das imagens em cache, em pixels por unidade do documento
//   auto=1&nome=x  roda a bateria inteira e envia o resultado ao servidor (uso do script de medição)
//   sujo=1         ao arrastar, redesenha só a região onde a camada estava e onde está
//   quadros=60     quadros medidos por cenário (padrão 240)
//   cenarios=a,b   só estes cenários (o raster de CPU não aguenta os que recompõem a cada quadro)
import type { CanvasKit, GrDirectContext, Surface } from 'canvaskit-wasm';
import { contarCamadas, documentoDe200Camadas } from '../cenas/duzentas.ts';
import { desenharNos } from '../motor/compositor.ts';
import { type Camera, CenaDoEditor, fabricaNaCpu, fabricaNaGpu, type FabricaDeImagens } from '../motor/editor.ts';
import { criarSessao, MOTOR, type Sessao } from '../motor/sessao.ts';
import type { Documento, No, Prancheta } from '../motor/tipos.ts';
import { carregarCanvasKit, carregarRecursos, descreverGpu, enviar } from './carregar.ts';

type Motor = 'gpu' | 'hibrido' | 'cpu';
const parametros = new URLSearchParams(location.search);
const motor: Motor = (['gpu', 'hibrido', 'cpu'] as const).find((m) => m === parametros.get('motor')) ?? 'gpu';
const densidade = Number(parametros.get('densidade') ?? devicePixelRatio) || 1;
const escalaDoCache = Number(parametros.get('cache') ?? 1) || 1;
const automatico = parametros.get('auto') === '1';
const nomeDaExecucao = parametros.get('nome') ?? `bancada-${motor}`;
const quadrosDaBateria = Number(parametros.get('quadros') ?? 240) || 240;
const somenteCenarios = parametros.get('cenarios')?.split(',');
const regiaoSuja = parametros.get('sujo') === '1';

const elemento = document.querySelector('#tela') as HTMLCanvasElement;
const painel = document.querySelector('#painel') as HTMLDivElement;
const seletor = document.querySelector('#cenario') as HTMLSelectElement;
const tabela = document.querySelector('#resultado') as HTMLPreElement;

interface Tela {
  superficie: Surface;
  contexto: GrDirectContext | undefined;
  gl: WebGL2RenderingContext | undefined;
}

function criarTela(ck: CanvasKit): Tela {
  elemento.width = Math.round(elemento.clientWidth * densidade);
  elemento.height = Math.round(elemento.clientHeight * densidade);
  if (motor === 'cpu') {
    const superficie = ck.MakeSWCanvasSurface(elemento);
    if (!superficie) throw new Error('Não foi possível criar a superfície de CPU');
    return { superficie, contexto: undefined, gl: undefined };
  }
  // preserveDrawingBuffer: o canvas guarda o quadro anterior, e a região suja pode redesenhar só um pedaço
  const identificador = ck.GetWebGLContext(elemento, { antialias: 0, alpha: 1, depth: 0, stencil: 8, premultipliedAlpha: 1, preserveDrawingBuffer: regiaoSuja ? 1 : 0 });
  const contexto = ck.MakeWebGLContext(identificador);
  if (!contexto) throw new Error('Não foi possível criar o contexto WebGL');
  // o cache de texturas padrão do Skia é pequeno para dezenas de imagens do tamanho da prancheta
  contexto.setResourceCacheLimitBytes(1024 * 1024 * 1024);
  const superficie = ck.MakeOnScreenGLSurface(contexto, elemento.width, elemento.height, ck.ColorSpace.SRGB);
  if (!superficie) throw new Error('Não foi possível criar a superfície WebGL');
  return { superficie, contexto, gl: elemento.getContext('webgl2') ?? undefined };
}

/** Espera a GPU terminar o que foi pedido. Sem isto, o tempo medido é só o de enfileirar os comandos. */
function sincronizar(tela: Tela): void {
  if (!tela.gl) return;
  tela.gl.finish();
  tela.gl.readPixels(0, 0, 1, 1, tela.gl.RGBA, tela.gl.UNSIGNED_BYTE, new Uint8Array(4));
}

interface Estatistica {
  n: number;
  media: number;
  p50: number;
  p95: number;
  p99: number;
  maxima: number;
}

function estatistica(valores: number[]): Estatistica {
  const v = [...valores].sort((a, b) => a - b);
  const em = (q: number): number => v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0;
  const arredondar = (x: number): number => Math.round(x * 100) / 100;
  return { n: v.length, media: arredondar(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)), p50: arredondar(em(0.5)), p95: arredondar(em(0.95)), p99: arredondar(em(0.99)), maxima: arredondar(v.at(-1) ?? 0) };
}

interface Cenario {
  id: string;
  nome: string;
  /** Prepara o cenário (por exemplo, monta as partes do arraste). Devolve o tempo de preparo. */
  preparar(): void;
  /** Desenha o quadro t (0, 1, 2, ...). */
  quadro(t: number): void;
}

function mover(p: Prancheta, id: string, dx: number, dy: number): Prancheta {
  const em = (nos: No[]): No[] => nos.map((n) => (n.id === id && 'x' in n ? { ...n, x: n.x + dx, y: n.y + dy } : n.tipo === 'grupo' ? { ...n, filhos: em(n.filhos) } : n));
  return { ...p, filhos: em(p.filhos) };
}

function criarCenarios(sessao: Sessao, doc: Documento, cena: CenaDoEditor, tela: Tela): Cenario[] {
  const { ck } = sessao;
  const canvas = tela.superficie.getCanvas();
  const W = elemento.width;
  const H = elemento.height;
  const feed = doc.pranchetas[0]!;
  const larguraTotal = Math.max(...doc.pranchetas.map((p) => p.x + p.largura));
  const alturaTotal = Math.max(...doc.pranchetas.map((p) => p.altura));
  const fundo = ck.Color(38, 36, 34, 1);
  // prancheta do Feed inteira na tela, com margem
  const zoomDoFeed = Math.min(W / (feed.largura + 160), H / (feed.altura + 120));
  const cameraDoFeed: Camera = { x: feed.x - (W / zoomDoFeed - feed.largura) / 2, y: feed.y - (H / zoomDoFeed - feed.altura) / 2, zoom: zoomDoFeed };
  const vaivem = (t: number, periodo: number): number => Math.sin((t / periodo) * Math.PI * 2);

  const comCache = (camera: (t: number) => Camera, previa?: (t: number) => [number, number]) => (t: number) => {
    if (previa) cena.definirPrevia(...previa(t));
    cena.desenharQuadro(canvas, camera(t), { fundo, regiaoSuja });
    tela.superficie.flush();
  };
  const arrastar = (id: string, nome: string, rotulo: string): Cenario => ({
    id,
    nome: rotulo,
    preparar: () => {
      if (!cena.iniciarArraste(nome)) throw new Error(`Não foi possível preparar o arraste de ${nome}`);
    },
    quadro: comCache(() => cameraDoFeed, (t) => [Math.round(vaivem(t, 120) * 260), Math.round(vaivem(t, 75) * 180)]),
  });
  const ingenuo = (id: string, rotulo: string, todas: boolean): Cenario => ({
    id,
    nome: rotulo,
    preparar: () => {
      cena.encerrarArraste();
      cena.definirDocumento(doc);
      cena.comporTudo();
    },
    quadro: (t) => {
      canvas.clear(fundo);
      const movida = mover(feed, 'p1-texto-36', Math.round(vaivem(t, 120) * 260), Math.round(vaivem(t, 75) * 180));
      const camera = todas ? { x: -80, y: -60, zoom: Math.min(W / (larguraTotal + 160), H / (alturaTotal + 120)) } : cameraDoFeed;
      canvas.save();
      canvas.scale(camera.zoom, camera.zoom);
      canvas.translate(-camera.x, -camera.y);
      for (const p of todas ? doc.pranchetas : [feed]) {
        canvas.save();
        canvas.translate(p.x, p.y);
        desenharNos(sessao, canvas, p === feed ? movida : p, (p === feed ? movida : p).filhos);
        canvas.restore();
      }
      canvas.restore();
      tela.superficie.flush();
    },
  });

  return [
    {
      id: 'camera-mover',
      nome: 'Mover a câmera (4 pranchetas, zoom fixo)',
      preparar: () => undefined,
      quadro: comCache((t) => {
        const zoom = 0.5 * densidade;
        return { x: larguraTotal / 2 - W / zoom / 2 + vaivem(t, 180) * larguraTotal * 0.3, y: alturaTotal / 2 - H / zoom / 2 + vaivem(t, 110) * alturaTotal * 0.25, zoom };
      }),
    },
    {
      id: 'camera-zoom',
      nome: 'Zoom da câmera (de 15% a 150%)',
      preparar: () => undefined,
      quadro: comCache((t) => {
        const zoom = (0.15 + (vaivem(t, 150) * 0.5 + 0.5) * 1.35) * densidade;
        return { x: feed.x + feed.largura / 2 - W / zoom / 2, y: feed.y + feed.altura / 2 - H / zoom / 2, zoom };
      }),
    },
    arrastar('arrastar-topo', 'p1-vetor-50', 'Arrastar a camada do topo (logo; nada acima)'),
    arrastar('arrastar-meio', 'p1-texto-36', 'Arrastar o título (sombra; acima: textos, botão, recorte, selo, 2 ajustes)'),
    arrastar('arrastar-fundo', 'p1-forma-5', 'Arrastar o disco em multiplicação, perto do fundo (acima: quase tudo, com 3 modos e 2 ajustes)'),
    ingenuo('ingenuo-prancheta', 'Sem cache de partes: recompor a prancheta tocada a cada quadro', false),
    ingenuo('ingenuo-documento', 'Sem cache nenhum: recompor as 4 pranchetas (200 camadas) a cada quadro', true),
  ];
}

interface Medicao {
  cenario: string;
  nome: string;
  preparoMs: number;
  itens: number;
  /** intervalo entre quadros do navegador, sem esperar a GPU: é o que o designer sente */
  intervalo: Estatistica;
  quadrosPorSegundo: number;
  /** quadros que passaram de 1,5 × 16,7 ms */
  quadrosPerdidos: number;
  /** tempo de JavaScript por quadro (montar e enviar os comandos) */
  javascript: Estatistica;
  /** tempo por quadro esperando a GPU terminar: é o custo real do quadro */
  sincronizado: Estatistica;
}

const proximoQuadro = (): Promise<number> => new Promise((resolver) => requestAnimationFrame(resolver));

async function medir(c: Cenario, tela: Tela, cena: CenaDoEditor, quadros: number): Promise<Medicao> {
  const t0 = performance.now();
  c.preparar();
  sincronizar(tela);
  const preparoMs = performance.now() - t0;
  let t = 0;
  for (let i = 0; i < 20; i++) {
    await proximoQuadro();
    c.quadro(t++);
  }
  // A: cadência livre
  const intervalos: number[] = [];
  const javascript: number[] = [];
  let anterior = await proximoQuadro();
  for (let i = 0; i < quadros; i++) {
    const a = performance.now();
    c.quadro(t++);
    javascript.push(performance.now() - a);
    const agora = await proximoQuadro();
    intervalos.push(agora - anterior);
    anterior = agora;
  }
  // B: esperando a GPU a cada quadro
  const sincronizado: number[] = [];
  for (let i = 0; i < Math.min(90, quadros); i++) {
    await proximoQuadro();
    const a = performance.now();
    c.quadro(t++);
    sincronizar(tela);
    sincronizado.push(performance.now() - a);
  }
  const intervalo = estatistica(intervalos);
  return {
    cenario: c.id,
    nome: c.nome,
    preparoMs: Math.round(preparoMs * 10) / 10,
    itens: cena.itensDoArraste,
    intervalo,
    quadrosPorSegundo: Math.round((1000 / intervalo.media) * 10) / 10,
    quadrosPerdidos: intervalos.filter((v) => v > 25).length,
    javascript: estatistica(javascript),
    sincronizado: estatistica(sincronizado),
  };
}

async function iniciar(): Promise<void> {
  const { ck, scriptMs, wasmMs } = await carregarCanvasKit();
  const t0 = performance.now();
  const recursos = await carregarRecursos();
  const recursosMs = performance.now() - t0;
  const t1 = performance.now();
  const sessao = criarSessao(ck, recursos);
  const sessaoMs = performance.now() - t1;
  const tela = criarTela(ck);
  const doc = documentoDe200Camadas();
  const fabrica: FabricaDeImagens = motor === 'gpu' ? fabricaNaGpu(sessao, tela.superficie) : fabricaNaCpu(sessao);
  const cena = new CenaDoEditor(sessao, doc, fabrica, escalaDoCache);
  const gpu = descreverGpu();

  // composição inicial das quatro pranchetas, uma a uma
  const composicao: { prancheta: string; ms: number }[] = [];
  for (const p of doc.pranchetas) {
    const a = performance.now();
    const so = new CenaDoEditor(sessao, { nome: doc.nome, pranchetas: [p] }, fabrica, escalaDoCache);
    so.comporTudo();
    sincronizar(tela);
    composicao.push({ prancheta: `${p.nome} ${p.largura}×${p.altura}`, ms: Math.round((performance.now() - a) * 10) / 10 });
    so.destruir();
  }
  const a = performance.now();
  cena.comporTudo();
  sincronizar(tela);
  const composicaoTotalMs = performance.now() - a;

  const cenarios = criarCenarios(sessao, doc, cena, tela).filter((c) => !somenteCenarios || somenteCenarios.includes(c.id));
  for (const c of cenarios) seletor.append(new Option(c.nome, c.id));

  const cabecalho = { regiaoSuja, motor: { ...MOTOR, raster: motor }, navegador: navigator.userAgent, gpu, nucleos: navigator.hardwareConcurrency, canvas: { largura: elemento.width, altura: elemento.height, densidade }, escalaDoCache, documento: contarCamadas(doc), carga: { scriptMs: Math.round(scriptMs), wasmMs: Math.round(wasmMs), recursosMs: Math.round(recursosMs), sessaoMs: Math.round(sessaoMs) }, composicao, composicaoTotalMs: Math.round(composicaoTotalMs) };

  const memoria = (): Record<string, number> => ({
    wasmMB: Math.round((ck as unknown as { HEAPU8: Uint8Array }).HEAPU8.length / 1048576),
    javascriptMB: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576),
  });

  const linha = (m: Medicao): string =>
    `${m.cenario.padEnd(20)} ${String(m.quadrosPorSegundo).padStart(6)} q/s  intervalo p50 ${m.intervalo.p50.toFixed(1).padStart(5)} p95 ${m.intervalo.p95.toFixed(1).padStart(5)} máx ${m.intervalo.maxima.toFixed(1).padStart(6)}  perdidos ${String(m.quadrosPerdidos).padStart(3)}/${m.intervalo.n}  JS p50 ${m.javascript.p50.toFixed(2).padStart(6)} p95 ${m.javascript.p95.toFixed(2).padStart(6)}  com GPU p50 ${m.sincronizado.p50.toFixed(2).padStart(7)} p95 ${m.sincronizado.p95.toFixed(2).padStart(7)} máx ${m.sincronizado.maxima.toFixed(1).padStart(6)}  preparo ${m.preparoMs.toFixed(0).padStart(5)} ms  itens ${m.itens}`;

  async function bateria(quadros: number): Promise<Medicao[]> {
    const medicoes: Medicao[] = [];
    tabela.textContent = `${motor.toUpperCase()} · ${gpu?.renderizador ?? 'sem WebGL'} · canvas ${elemento.width}×${elemento.height}\ncomposição inicial: ${composicao.map((c) => `${c.prancheta} ${c.ms} ms`).join(' · ')}\n`;
    for (const c of cenarios) {
      const m = await medir(c, tela, cena, quadros);
      medicoes.push(m);
      tabela.textContent += `${linha(m)}\n`;
    }
    // recompor depois de soltar: o documento muda numa prancheta só
    cena.iniciarArraste('p1-texto-36');
    cena.definirPrevia(40, 30);
    cena.encerrarArraste();
    const novo: Documento = { ...doc, pranchetas: [mover(doc.pranchetas[0]!, 'p1-texto-36', 40, 30), ...doc.pranchetas.slice(1)] };
    const b = performance.now();
    cena.definirDocumento(novo);
    const refeitas = cena.comporTudo();
    sincronizar(tela);
    const soltarMs = performance.now() - b;
    tabela.textContent += `recompor ao soltar: ${soltarMs.toFixed(1)} ms (${refeitas} prancheta)\nmemória: ${JSON.stringify(memoria())}\n`;
    cena.definirDocumento(doc);
    cena.comporTudo();
    await enviarResultado(medicoes, soltarMs);
    return medicoes;
  }

  async function enviarResultado(medicoes: Medicao[], soltarMs: number): Promise<void> {
    await enviar(`${nomeDaExecucao}/fim.json`, JSON.stringify({ ...cabecalho, memoria: memoria(), recomporAoSoltarMs: Math.round(soltarMs * 10) / 10, medicoes }, null, 2));
  }

  if (automatico) {
    await bateria(quadrosDaBateria);
    document.title = 'fim';
    return;
  }

  // modo interativo: anima o cenário escolhido e mostra o contador de quadros
  document.querySelector('#rodar')?.addEventListener('click', () => {
    pausado = true;
    void bateria(quadrosDaBateria).then(() => {
      pausado = false;
      atual = undefined;
    });
  });
  let pausado = false;
  let atual: Cenario | undefined;
  let t = 0;
  const intervalos: number[] = [];
  const javascript: number[] = [];
  let anterior = performance.now();
  let ultimaLeitura = anterior;
  const laco = (agora: number): void => {
    requestAnimationFrame(laco);
    if (pausado) {
      anterior = agora;
      return;
    }
    const escolhido = cenarios.find((c) => c.id === seletor.value) ?? cenarios[0]!;
    if (escolhido !== atual) {
      atual = escolhido;
      atual.preparar();
      intervalos.length = 0;
      javascript.length = 0;
    }
    const a = performance.now();
    atual.quadro(t++);
    javascript.push(performance.now() - a);
    intervalos.push(agora - anterior);
    anterior = agora;
    if (intervalos.length > 240) {
      intervalos.shift();
      javascript.shift();
    }
    if (agora - ultimaLeitura > 400) {
      ultimaLeitura = agora;
      const i = estatistica(intervalos);
      const j = estatistica(javascript);
      const m = memoria();
      painel.textContent = `${(1000 / i.media).toFixed(1)} quadros por segundo\nintervalo entre quadros: p50 ${i.p50.toFixed(1)} ms · p95 ${i.p95.toFixed(1)} ms · pior ${i.maxima.toFixed(1)} ms\nJavaScript por quadro: p50 ${j.p50.toFixed(2)} ms · p95 ${j.p95.toFixed(2)} ms\n${motor.toUpperCase()} · ${gpu?.renderizador ?? 'sem WebGL'}\ncanvas ${elemento.width} × ${elemento.height} (densidade ${densidade}) · 200 camadas em 4 pranchetas\nmemória: WebAssembly ${m['wasmMB']} MB`;
    }
  };
  requestAnimationFrame(laco);
}

iniciar().catch(async (erro: unknown) => {
  painel.textContent = `ERRO: ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`;
  if (automatico) {
    await enviar(`${nomeDaExecucao}/fim.json`, JSON.stringify({ erro: String(erro) }));
    document.title = 'erro';
  }
});
