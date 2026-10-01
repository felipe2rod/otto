// Página de paridade: renderiza as mesmas cenas do Node, no navegador, e envia os pixels ao servidor.
// ?motor=cpu   raster de CPU do WebAssembly (o mesmo caminho do servidor)
// ?motor=gpu   WebGL (o caminho do editor)
// ?motor=causas  um recurso por cena, GPU contra CPU no mesmo navegador, para atribuir cada diferença
// ?nome=...    pasta em que o resultado é gravado (padrão: o motor)
import type { CanvasKit } from 'canvaskit-wasm';
import { cenasDeCausa } from '../cenas/causas.ts';
import { cenasDeParidade } from '../cenas/cenas.ts';
import { comparar, type Diferenca } from '../motor/diferenca.ts';
import { desenharPrancheta, renderizarPrancheta } from '../motor/compositor.ts';
import { criarSessao, MOTOR, type Sessao } from '../motor/sessao.ts';
import { carregarCanvasKit, carregarRecursos, descreverGpu, enviar } from './carregar.ts';

const parametros = new URLSearchParams(location.search);
const pedido = parametros.get('motor');
const motor = pedido === 'gpu' || pedido === 'causas' ? pedido : 'cpu';
const nome = parametros.get('nome') ?? motor;
const registro = document.querySelector('#registro') as HTMLPreElement;
const galeria = document.querySelector('#galeria') as HTMLDivElement;
const dizer = (linha: string): void => {
  registro.textContent += `${linha}\n`;
};

function mostrar(rgba: Uint8Array, largura: number, altura: number, legenda: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  canvas.title = legenda;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), largura, altura), 0, 0);
  galeria.append(canvas);
}

/** O decodificador do navegador dá os mesmos pixels que o do WebAssembly? Decide por onde a imagem entra no motor. */
async function compararDecodificadores(ck: CanvasKit, bytes: Uint8Array): Promise<{ largura: number; altura: number; maxima: number; diferentes: number }> {
  const doMotor = ck.MakeImageFromEncoded(bytes)!;
  const largura = doMotor.width();
  const altura = doMotor.height();
  const a = doMotor.readPixels(0, 0, { width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
  doMotor.delete();
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const b = ctx.getImageData(0, 0, largura, altura).data;
  let maxima = 0;
  let diferentes = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!), Math.abs(a[i + 3]! - b[i + 3]!));
    if (d > 0) diferentes++;
    if (d > maxima) maxima = d;
  }
  return { largura, altura, maxima, diferentes };
}

function renderizarNaGpu(ck: CanvasKit, sessao: Sessao): (cena: ReturnType<typeof cenasDeParidade>[number]) => { largura: number; altura: number; rgba: Uint8Array } {
  const tela = document.createElement('canvas');
  tela.width = 1200;
  tela.height = 1920;
  const superficie = ck.MakeWebGLCanvasSurface(tela);
  if (!superficie || !superficie.reportBackendTypeIsGPU()) throw new Error('Não foi possível criar a superfície WebGL');
  return (cena) => {
    const canvas = superficie.getCanvas();
    canvas.clear(ck.TRANSPARENT);
    desenharPrancheta(sessao, canvas, cena.prancheta);
    superficie.flush();
    const { largura, altura } = cena.prancheta;
    const rgba = canvas.readPixels(0, 0, { width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array;
    return { largura, altura, rgba };
  };
}

async function executar(): Promise<void> {
  dizer(`motor: ${motor}`);
  const { ck, scriptMs, wasmMs } = await carregarCanvasKit();
  const t0 = performance.now();
  const recursos = await carregarRecursos();
  const recursosMs = performance.now() - t0;
  dizer(`motor carregado: script ${scriptMs.toFixed(0)} ms, WebAssembly ${wasmMs.toFixed(0)} ms, recursos ${recursosMs.toFixed(0)} ms`);
  const sessao = criarSessao(ck, recursos);
  const gpu = descreverGpu();
  if (motor === 'gpu') dizer(`GPU: ${gpu?.renderizador ?? 'sem WebGL 2'}`);
  const naGpu = motor === 'cpu' ? undefined : renderizarNaGpu(ck, sessao);
  const renderizar = naGpu ?? ((cena: ReturnType<typeof cenasDeParidade>[number]) => renderizarPrancheta(sessao, cena.prancheta));

  if (motor === 'causas') {
    const causas: Record<string, Diferenca> = {};
    dizer(`${'recurso'.padEnd(38)} ${'máx'.padStart(4)} ${'% dif.'.padStart(8)} ${'>2'.padStart(7)} ${'>8'.padStart(7)} ${'>32'.padStart(7)} ${'média'.padStart(8)}`);
    for (const cena of cenasDeCausa()) {
      const cpu = renderizarPrancheta(sessao, cena.prancheta);
      const gpuR = naGpu!(cena);
      const { d, mapa } = comparar(cpu.rgba, gpuR.rgba, cpu.largura, cpu.altura);
      causas[cena.nome] = d;
      dizer(`${cena.nome.padEnd(38)} ${String(d.maxima).padStart(4)} ${d.porcentagemDiferente.toFixed(3).padStart(8)} ${String(d.acimaDe2).padStart(7)} ${String(d.acimaDe8).padStart(7)} ${String(d.acimaDe32).padStart(7)} ${d.media.toFixed(4).padStart(8)}`);
      mostrar(gpuR.rgba, gpuR.largura, gpuR.altura, `${cena.nome} (GPU)`);
      mostrar(mapa, cpu.largura, cpu.altura, `${cena.nome} (diferença)`);
      if (d.maxima > 32) {
        // guarda os dois renders dos casos de diferença grande, para olhar a borda ampliada
        const arquivo = cena.nome.replace(/[^a-z0-9]+/gi, '-');
        await enviar(`${nome}/${arquivo}.cpu.rgba`, cpu.rgba);
        await enviar(`${nome}/${arquivo}.gpu.rgba`, gpuR.rgba);
      }
      await new Promise((resolver) => setTimeout(resolver, 0));
    }
    await enviar(`${nome}/fim.json`, JSON.stringify({ navegador: navigator.userAgent, gpu, causas }, null, 2));
    dizer('fim');
    document.title = 'fim';
    return;
  }

  const cenas: Record<string, { largura: number; altura: number; ms: number }> = {};
  for (const cena of cenasDeParidade()) {
    const t = performance.now();
    const r = renderizar(cena);
    const ms = performance.now() - t;
    cenas[cena.nome] = { largura: r.largura, altura: r.altura, ms: Math.round(ms * 10) / 10 };
    dizer(`${cena.nome.padEnd(20)} ${r.largura} × ${r.altura}  ${ms.toFixed(1)} ms`);
    mostrar(r.rgba, r.largura, r.altura, cena.nome);
    await enviar(`${nome}/${cena.nome}.rgba`, r.rgba);
    // devolve o controle ao navegador entre cenas, para a página não parecer travada
    await new Promise((resolver) => setTimeout(resolver, 0));
  }

  const decodificacao: Record<string, Awaited<ReturnType<typeof compararDecodificadores>>> = {};
  for (const img of recursos.imagens) decodificacao[img.arquivo] = await compararDecodificadores(ck, img.bytes);
  dizer(`decodificador do navegador contra o do motor: ${JSON.stringify(decodificacao)}`);

  await enviar(
    `${nome}/fim.json`,
    JSON.stringify(
      { motor: { ...MOTOR, raster: motor }, navegador: navigator.userAgent, gpu, nucleos: navigator.hardwareConcurrency, densidade: devicePixelRatio, carga: { scriptMs: Math.round(scriptMs), wasmMs: Math.round(wasmMs), recursosMs: Math.round(recursosMs) }, cenas, decodificacao },
      null,
      2,
    ),
  );
  dizer('fim');
  document.title = 'fim';
}

executar().catch(async (erro: unknown) => {
  dizer(`ERRO: ${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}`);
  await enviar(`${nome}/fim.json`, JSON.stringify({ erro: String(erro) }));
  document.title = 'erro';
});
