// Recorte do sujeito da foto com um modelo de segmentação local (ISNet, Apache-2.0).
// Não gera imagem: devolve uma máscara (alfa) do tamanho da foto original, guardada por hash.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import { guardarArquivo, lerArquivo, lerMetaDeArquivo, type MetaDeArquivo } from './armazenamento';

const MODELO = path.resolve(import.meta.dirname, '../../modelos/isnet-general-use.onnx');
const LADO = 1024;
let sessao: Promise<InferenceSession> | undefined;

function abrirSessao(): Promise<InferenceSession> {
  sessao ??= InferenceSession.create(MODELO, { executionProviders: ['cpu'] });
  return sessao;
}

export interface Sujeito {
  /** hash da máscara (PNG branco com alfa = sujeito) */
  arquivo: string;
  /** fração da foto ocupada pelo sujeito */
  cobertura: number;
  /** caixa do sujeito em fração da foto: [x, y, largura, altura] */
  caixa: [number, number, number, number];
}

const cacheArquivo = (hash: string) => path.resolve(import.meta.dirname, `../../dados/arquivos/${hash}.sujeito.json`);

export async function detectarSujeito(hashDaFoto: string): Promise<Sujeito> {
  try {
    return JSON.parse(await readFile(cacheArquivo(hashDaFoto), 'utf8')) as Sujeito;
  } catch {
    // sem cache: roda o modelo
  }
  const bytes = await lerArquivo(hashDaFoto);
  if (!bytes) throw new Error('foto não encontrada na biblioteca');
  const foto = await loadImage(bytes);
  const w = foto.width;
  const h = foto.height;

  // entrada: 1024×1024, RGB normalizado como no treino do ISNet (média 0,485/0,456/0,406, desvio 1)
  const entrada = createCanvas(LADO, LADO);
  const ce = entrada.getContext('2d');
  ce.drawImage(foto, 0, 0, LADO, LADO);
  const px = ce.getImageData(0, 0, LADO, LADO).data;
  const media = [0.485, 0.456, 0.406];
  const tensor = new Float32Array(3 * LADO * LADO);
  for (let i = 0; i < LADO * LADO; i++) for (let c = 0; c < 3; c++) tensor[c * LADO * LADO + i] = px[i * 4 + c]! / 255 - media[c]!;

  const s = await abrirSessao();
  const saida = await s.run({ [s.inputNames[0]!]: new Tensor('float32', tensor, [1, 3, LADO, LADO]) });
  const pred = saida[s.outputNames[0]!]!.data as Float32Array;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < LADO * LADO; i++) {
    mn = Math.min(mn, pred[i]!);
    mx = Math.max(mx, pred[i]!);
  }

  const mascara1024 = createCanvas(LADO, LADO);
  const cm = mascara1024.getContext('2d');
  const img = cm.createImageData(LADO, LADO);
  let soma = 0;
  let [x0, y0, x1, y1] = [LADO, LADO, 0, 0];
  for (let i = 0; i < LADO * LADO; i++) {
    const v = (pred[i]! - mn) / Math.max(1e-6, mx - mn);
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = v * 255;
    soma += v;
    if (v > 0.5) {
      const x = i % LADO;
      const y = Math.floor(i / LADO);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  cm.putImageData(img, 0, 0);
  // volta ao tamanho da foto original: a máscara acompanha o mesmo enquadramento da foto no documento
  const final = createCanvas(w, h);
  final.getContext('2d').drawImage(mascara1024, 0, 0, w, h);
  const png = await final.encode('png');
  const meta: MetaDeArquivo = await guardarArquivo(png, { tipo: 'image/png', largura: w, altura: h });
  const sujeito: Sujeito = {
    arquivo: meta.hash,
    cobertura: Math.round((soma / (LADO * LADO)) * 1000) / 1000,
    caixa: x1 > x0 ? [x0 / LADO, y0 / LADO, (x1 - x0) / LADO, (y1 - y0) / LADO].map((v) => Math.round(v * 1000) / 1000) as Sujeito['caixa'] : [0, 0, 1, 1],
  };
  await writeFile(cacheArquivo(hashDaFoto), JSON.stringify(sujeito));
  return sujeito;
}

export { lerMetaDeArquivo };
