// Custos de operação no Node: tamanho do WebAssembly, tempo de carga, memória, limite de área,
// render por ladrilho, pixel de cada camada, medidor de texto e render em worker.
// Cada caso de memória roda num processo próprio, para o pico de um não contaminar o outro.
// Uso: node --expose-gc src/node/medir.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { CanvasKit } from 'canvaskit-wasm';
import { cenasDeParidade } from '../cenas/cenas.ts';
import { documentoDe200Camadas } from '../cenas/duzentas.ts';
import { LIMITE_DE_PIXELS, renderizarPrancheta } from '../motor/compositor.ts';
import { MODOS_POR_SHADER, POR_CANAL } from '../motor/mesclagem.ts';
import { criarSessao, MOTOR } from '../motor/sessao.ts';
import { type No, todasAsCamadas } from '../motor/tipos.ts';
import { carregarCanvasKit, carregarFontes, carregarImagens, PASTA_CANVASKIT, RAIZ } from './carregar.ts';

const MB = 1048576;
const arredondar = (v: number, casas = 1): number => Math.round(v * 10 ** casas) / 10 ** casas;
const memoriaDoMotor = (ck: CanvasKit): number => arredondar((ck as unknown as { HEAPU8: Uint8Array }).HEAPU8.length / MB);
const rss = (): number => arredondar(process.memoryUsage().rss / MB);
const hash = (d: Uint8Array): string => createHash('sha256').update(d).digest('hex').slice(0, 16);

async function tamanhos(): Promise<Record<string, unknown>> {
  const saida: Record<string, unknown> = {};
  for (const [nome, arquivo] of [['wasm padrão', 'canvaskit.wasm'], ['cola JavaScript padrão', 'canvaskit.js'], ['wasm completo', 'full/canvaskit.wasm'], ['cola JavaScript completa', 'full/canvaskit.js']] as const) {
    const bytes = await readFile(path.join(PASTA_CANVASKIT, arquivo));
    saida[nome] = { bytes: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
  }
  const pacote = await stat(path.join(RAIZ, 'publico/pacote/bancada.js')).catch(() => undefined);
  if (pacote) saida['pacote da página de bancada (motor em TypeScript, sem o CanvasKit)'] = { bytes: pacote.size };
  return saida;
}

/** Um caso de memória, em processo próprio. Imprime JSON na saída. */
async function casoDeMemoria(caso: string): Promise<void> {
  const inicio = rss();
  const t0 = performance.now();
  const ck = await carregarCanvasKit();
  const cargaMs = performance.now() - t0;
  const depoisDoMotor = { rssMB: rss(), motorMB: memoriaDoMotor(ck) };
  const t1 = performance.now();
  const sessao = criarSessao(ck, { fontes: await carregarFontes(), imagens: await carregarImagens() });
  const sessaoMs = performance.now() - t1;
  const depoisDaSessao = { rssMB: rss(), motorMB: memoriaDoMotor(ck) };
  const resultado: Record<string, unknown> = { caso, rssInicialMB: inicio, cargaMs: arredondar(cargaMs), depoisDoMotor, sessaoMs: arredondar(sessaoMs), depoisDaSessao };
  const peca = cenasDeParidade().find((c) => c.nome === 'peca')!.prancheta;
  if (caso === 'duzentas') {
    const tempos: Record<string, number> = {};
    for (const p of documentoDe200Camadas().pranchetas) {
      const t = performance.now();
      renderizarPrancheta(sessao, p);
      tempos[`${p.nome} ${p.largura}×${p.altura}`] = arredondar(performance.now() - t);
    }
    resultado['renderMs'] = tempos;
  } else if (caso.startsWith('escala-')) {
    // a peça de 1080 × 1350 ampliada: prancheta grande com conteúdo de verdade
    const escala = Number(caso.slice('escala-'.length));
    const t = performance.now();
    try {
      const r = renderizarPrancheta(sessao, peca, { escala });
      resultado['pixels'] = `${r.largura} × ${r.altura}`;
      resultado['megapixels'] = arredondar((r.largura * r.altura) / 1e6);
    } catch (erro) {
      resultado['erro'] = String(erro);
    }
    resultado['renderMs'] = arredondar(performance.now() - t);
  } else if (caso.startsWith('superficie-')) {
    // só alocar e limpar uma superfície quadrada, sem o limite do motor: onde o WebAssembly desiste?
    const lado = Number(caso.slice('superficie-'.length));
    try {
      const s = ck.MakeSurface(lado, lado);
      if (!s) throw new Error('MakeSurface devolveu nulo');
      s.getCanvas().clear(ck.WHITE);
      resultado['alocou'] = true;
      s.delete();
    } catch (erro) {
      resultado['alocou'] = false;
      resultado['erro'] = String(erro).slice(0, 200);
    }
  } else if (caso.startsWith('ladrilhos-')) {
    // render por região: a prancheta ampliada sai em ladrilhos, e nenhuma superfície passa do limite
    const [escala, ladrilho] = caso.slice('ladrilhos-'.length).split('x').map(Number) as [number, number];
    const larguraTotal = Math.round(peca.largura * escala);
    const alturaTotal = Math.round(peca.altura * escala);
    const t = performance.now();
    let n = 0;
    const resumo = createHash('sha256');
    for (let y = 0; y < alturaTotal; y += ladrilho) {
      for (let x = 0; x < larguraTotal; x += ladrilho) {
        const w = Math.min(ladrilho, larguraTotal - x);
        const h = Math.min(ladrilho, alturaTotal - y);
        const r = renderizarPrancheta(sessao, peca, { escala, regiao: { x: x / escala, y: y / escala, w: w / escala, h: h / escala } });
        resumo.update(r.rgba);
        n++;
      }
    }
    resultado['pixels'] = `${larguraTotal} × ${alturaTotal}`;
    resultado['megapixels'] = arredondar((larguraTotal * alturaTotal) / 1e6);
    resultado['ladrilhos'] = n;
    resultado['renderMs'] = arredondar(performance.now() - t);
  }
  resultado['pico'] = { rssMB: rss(), motorMB: memoriaDoMotor(ck) };
  sessao.destruir();
  console.log(JSON.stringify(resultado));
}

function rodarCaso(caso: string): Record<string, unknown> {
  try {
    const saida = execFileSync(process.execPath, [import.meta.filename, '--caso', caso], { encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(saida.trim().split('\n').at(-1)!) as Record<string, unknown>;
  } catch (erro) {
    const e = erro as { status?: number; signal?: string; stderr?: string };
    return { caso, falhou: true, codigo: e.status ?? null, sinal: e.signal ?? null, erro: (e.stderr ?? String(erro)).split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300) };
  }
}

async function principal(): Promise<void> {
  const resultado: Record<string, unknown> = { motor: MOTOR, node: process.version, plataforma: `${process.platform} ${process.arch}`, limiteDePixels: LIMITE_DE_PIXELS };
  resultado['tamanhos'] = await tamanhos();

  // carga: a primeira instância compila o WebAssembly; as seguintes também (não há cache de módulo entre chamadas)
  const cargas: number[] = [];
  let ck!: CanvasKit;
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    ck = await carregarCanvasKit();
    cargas.push(arredondar(performance.now() - t));
  }
  resultado['cargaMs'] = { primeira: cargas[0], seguintes: cargas.slice(1) };

  const fontes = await carregarFontes();
  const imagens = await carregarImagens();
  const t0 = performance.now();
  const soTexto = criarSessao(ck, { fontes, imagens: [] });
  resultado['sessaoSoComFontesMs'] = arredondar(performance.now() - t0);

  // medidor de texto (R3): quanto custa medir a tinta de um nó, sem rasterizar
  const textos = documentoDe200Camadas().pranchetas.flatMap((p) => todasAsCamadas(p.filhos)).filter((n): n is Extract<No, { tipo: 'texto' }> => n.tipo === 'texto');
  for (const t of textos) soTexto.texto.medirTinta(t);
  const t1 = performance.now();
  for (let i = 0; i < 10; i++) for (const t of textos) soTexto.texto.medirTinta(t);
  resultado['medidorDeTexto'] = { nosMedidos: textos.length * 10, msPorNo: arredondar((performance.now() - t1) / (textos.length * 10), 3) };
  soTexto.destruir();

  const sessao = criarSessao(ck, { fontes, imagens });

  // pixel de cada camada (R5): a prancheta do Feed, camada por camada, como a exportação PSD precisa
  const feed = documentoDe200Camadas().pranchetas[0]!;
  const folhas = todasAsCamadas(feed.filhos).filter((n) => n.tipo !== 'grupo' && n.tipo !== 'ajuste');
  const t2 = performance.now();
  for (const n of folhas) renderizarPrancheta(sessao, feed, { apenas: new Set([n.id]) });
  const porCamadaMs = performance.now() - t2;
  const t3 = performance.now();
  const composta = renderizarPrancheta(sessao, feed);
  resultado['exportacaoDoFeed'] = { camadasComPixel: folhas.length, pixelDeCadaCamadaMs: arredondar(porCamadaMs), compostaMs: arredondar(performance.now() - t3) };

  // região em 1:1 e prancheta reduzida (R4): o que a ferramenta "renderizar" do agente pede
  const t4 = performance.now();
  renderizarPrancheta(sessao, feed, { regiao: { x: 60, y: 300, w: 512, h: 512 } });
  const regiaoMs = performance.now() - t4;
  const t5 = performance.now();
  renderizarPrancheta(sessao, feed, { escala: 768 / feed.altura });
  resultado['renderDoAgente'] = { regiao512Ms: arredondar(regiaoMs), pranchetaComLado768Ms: arredondar(performance.now() - t5) };

  // variante completa (codifica JPEG e WebP) contra a padrão: mesmos pixels?
  const completa = await carregarCanvasKit('completa');
  const sessaoCompleta = criarSessao(completa, { fontes, imagens });
  const iguais: Record<string, boolean> = {};
  for (const cena of cenasDeParidade().slice(0, 6)) iguais[cena.nome] = hash(renderizarPrancheta(sessao, cena.prancheta).rgba) === hash(renderizarPrancheta(sessaoCompleta, cena.prancheta).rgba);
  resultado['varianteCompletaIgualAPadrao'] = iguais;
  const img = completa.MakeImage({ width: composta.largura, height: composta.altura, colorType: completa.ColorType.RGBA_8888, alphaType: completa.AlphaType.Unpremul, colorSpace: completa.ColorSpace.SRGB }, composta.rgba, composta.largura * 4)!;
  const codificar = (formato: 'PNG' | 'JPEG' | 'WEBP', qualidade: number): { ms: number; bytes: number } => {
    const t = performance.now();
    const b = img.encodeToBytes(completa.ImageFormat[formato], qualidade);
    return { ms: arredondar(performance.now() - t), bytes: b?.length ?? 0 };
  };
  resultado['codificarAComposta1080x1350'] = { png: codificar('PNG', 100), jpeg82: codificar('JPEG', 82), webp82: codificar('WEBP', 82) };
  img.delete();
  sessaoCompleta.destruir();

  // render em worker (R9): mesmos bytes que na linha principal?
  const peca = cenasDeParidade().find((c) => c.nome === 'peca')!.prancheta;
  const naPrincipal = hash(renderizarPrancheta(sessao, peca).rgba);
  const t6 = performance.now();
  let batidas = 0;
  const relogio = setInterval(() => batidas++, 50);
  const doWorker = await new Promise<{ rgba: Uint8Array; preparoMs: number; renderMs: number }>((resolver, rejeitar) => {
    const w = new Worker(new URL('./trabalhador.ts', import.meta.url), { workerData: { recursos: { fontes, imagens }, prancheta: peca } });
    w.once('message', resolver);
    w.once('error', rejeitar);
  });
  clearInterval(relogio);
  resultado['worker'] = { mesmosPixelsQueALinhaPrincipal: hash(doWorker.rgba) === naPrincipal, totalMs: arredondar(performance.now() - t6), preparoMs: arredondar(doWorker.preparoMs), renderMs: arredondar(doWorker.renderMs), batidasDaLinhaPrincipalDurante: batidas };

  // ladrilhos contra superfície única, num tamanho que cabe: o resultado é o mesmo?
  const inteira = renderizarPrancheta(sessao, peca, { escala: 2 });
  const montada = new Uint8Array(inteira.rgba.length);
  const lado = 1024;
  for (let y = 0; y < inteira.altura; y += lado) {
    for (let x = 0; x < inteira.largura; x += lado) {
      const w = Math.min(lado, inteira.largura - x);
      const h = Math.min(lado, inteira.altura - y);
      const r = renderizarPrancheta(sessao, peca, { escala: 2, regiao: { x: x / 2, y: y / 2, w: w / 2, h: h / 2 } });
      for (let linha = 0; linha < h; linha++) montada.set(r.rgba.subarray(linha * w * 4, (linha + 1) * w * 4), ((y + linha) * inteira.largura + x) * 4);
    }
  }
  let maxima = 0;
  let diferentes = 0;
  for (let i = 0; i < montada.length; i += 4) {
    const d = Math.max(Math.abs(montada[i]! - inteira.rgba[i]!), Math.abs(montada[i + 1]! - inteira.rgba[i + 1]!), Math.abs(montada[i + 2]! - inteira.rgba[i + 2]!));
    if (d > 0) diferentes++;
    if (d > maxima) maxima = d;
  }
  resultado['ladrilhosContraSuperficieUnica'] = { tamanho: `${inteira.largura} × ${inteira.altura}`, ladrilho: lado, diferencaMaxima: maxima, pixelsDiferentes: diferentes };

  // luz suave: fórmula do W3C (a do Skia) contra a atribuída ao Photoshop, em todos os pares de 8 bits
  const w3c = POR_CANAL['luz-suave']!;
  const photoshop = (b: number, s: number): number => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (Math.sqrt(b) - b));
  let maior = 0;
  let pares = 0;
  for (let b = 0; b < 256; b++) for (let s = 0; s < 256; s++) {
    const d = Math.abs(Math.round(w3c(b / 255, s / 255) * 255) - Math.round(photoshop(b / 255, s / 255) * 255));
    if (d > 0) pares++;
    if (d > maior) maior = d;
  }
  resultado['luzSuaveW3cContraPhotoshop'] = { diferencaMaximaEmNiveis: maior, paresDiferentes: pares, deTotal: 65536 };
  resultado['modosPorShader'] = MODOS_POR_SHADER;
  sessao.destruir();

  // memória: um processo por caso
  resultado['memoria'] = ['base', 'duzentas', 'escala-2', 'escala-4', 'escala-6', 'escala-7', 'ladrilhos-8x4096', 'superficie-8000', 'superficie-12000', 'superficie-16000', 'superficie-20000', 'superficie-23000'].map((caso) => {
    const r = rodarCaso(caso);
    console.log(JSON.stringify(r));
    return r;
  });

  await writeFile(path.join(RAIZ, 'resultados/node.json'), JSON.stringify(resultado, null, 2));
  const { memoria: _memoria, ...resto } = resultado;
  console.log(JSON.stringify(resto, null, 2));
}

const iCaso = process.argv.indexOf('--caso');
if (iCaso > 0) await casoDeMemoria(process.argv[iCaso + 1]!);
else await principal();
