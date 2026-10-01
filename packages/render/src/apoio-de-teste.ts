// Apoio dos testes do motor. Os documentos nascem pelo catálogo de operações (@otto/documento),
// como no produto: o que o motor recebe já passou pelo esquema e tem os valores padrão preenchidos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { acharNo, aplicarLote, type Documento, documentoVazio, type Prancheta } from '@otto/documento';
import type { CanvasKit } from 'canvaskit-wasm';
import { carregarCanvasKit } from './node';
import { criarSessao, type FonteDeArquivo, type ImagemDeArquivo, type Sessao } from './sessao';

const PASTA = path.resolve(import.meta.dirname, '../recursos-de-teste');

/** Imagens de teste, pela chave que o documento usa: o sha256 do conteúdo. */
export const FOTO = 'd2770bffcd3f26ad30260ac7f24b522ac422bf2b3cd92cec53a012f41cfb3945';
export const RECORTE = '8274e4a26323a2405a823e2d19521c84a43b17b52a9245e272e1966f3cf15d0f';
/** Máscara de sujeito da FOTO, gerada aqui: branca, com alfa em elipse suave à direita do centro (o "sujeito"). */
export const SUJEITO_DA_FOTO = 'a1'.padStart(64, '0');

/** O PNG da máscara de sujeito de teste (chave SUJEITO_DA_FOTO). */
export function mascaraDeSujeito(ck: CanvasKit): Uint8Array {
  const largura = 320;
  const altura = 213;
  const rgba = new Uint8Array(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const d = Math.hypot((x - 190) / 90, (y - 120) / 80);
      const i = (y * largura + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
      // inteiro até 0,9 do raio, e some em rampa linear até 1: conta só com inteiros e divisão, igual em toda máquina
      rgba[i + 3] = d <= 0.9 ? 255 : d >= 1 ? 0 : Math.round(((1 - d) / 0.1) * 255);
    }
  }
  return pngDe(ck, rgba, largura, altura);
}

export function fontesDeTeste(): FonteDeArquivo[] {
  const fonte = (familia: string, peso: number, arquivo: string): FonteDeArquivo => ({ familia, peso, bytes: new Uint8Array(readFileSync(path.join(PASTA, 'fontes', arquivo))) });
  return [
    fonte('Anton', 400, 'Anton-Regular.ttf'),
    fonte('IBM Plex Sans', 400, 'IBMPlexSans-Regular.ttf'),
    fonte('IBM Plex Sans', 700, 'IBMPlexSans-Bold.ttf'),
    fonte('DM Serif Display', 400, 'DMSerifDisplay-Regular.ttf'),
  ];
}

export function imagensDeTeste(): ImagemDeArquivo[] {
  return [
    { arquivo: FOTO, bytes: new Uint8Array(readFileSync(path.join(PASTA, 'imagens/foto-paisagem.jpg'))) },
    { arquivo: RECORTE, bytes: new Uint8Array(readFileSync(path.join(PASTA, 'imagens/recorte-com-alfa.png'))) },
  ];
}

let motor: Promise<CanvasKit> | undefined;
/** Uma instância do motor para o arquivo de teste inteiro (carregar custa 50 a 80 ms). */
export function canvasKitDeTeste(): Promise<CanvasKit> {
  motor ??= carregarCanvasKit();
  return motor;
}

export async function novaSessao(imagensExtras: ImagemDeArquivo[] = []): Promise<{ ck: CanvasKit; sessao: Sessao }> {
  const ck = await canvasKitDeTeste();
  return { ck, sessao: criarSessao(ck, { fontes: fontesDeTeste(), imagens: [...imagensDeTeste(), { arquivo: SUJEITO_DA_FOTO, bytes: mascaraDeSujeito(ck) }, ...imagensExtras] }) };
}

type NoLiteral = Record<string, unknown> & { nome: string; tipo: string; filhos?: NoLiteral[] };

let lotes = 0;
function aplicar(doc: Documento, operacoes: unknown[], lote?: string): Documento {
  const r = aplicarLote(doc, operacoes, { autoria: { tipo: 'designer' }, idDoLote: lote ?? `lote-de-teste-do-render-${++lotes}` });
  if (!r.ok) throw new Error(`${r.erro.op} ${r.erro.alvo ?? ''} ${r.erro.campo ?? ''}: ${r.erro.mensagem}`);
  return r.doc;
}

function operacoesDe(nos: NoLiteral[], grupo?: string): unknown[] {
  return nos.flatMap((n) => {
    const { filhos, ...resto } = n;
    return [{ op: 'criarNo', prancheta: 'P', no: resto, ...(grupo ? { grupo: `P/${grupo}` } : {}) }, ...(filhos ? operacoesDe(filhos, n.nome) : [])];
  });
}

export interface OpcoesDaPeca {
  largura?: number;
  altura?: number;
  fundo?: string;
  tokens?: Record<string, string>;
  /** Id do lote que cria a peça. Os ids dos nós saem dele, e a semente do ruído sai do id do nó: golden com ruído precisa de lote fixo. */
  lote?: string;
}

/** Documento de uma prancheta ("P") com os nós dados, de baixo para cima. Grupo aceita "filhos". */
export function peca(nos: NoLiteral[], opcoes: OpcoesDaPeca = {}): { doc: Documento; p: Prancheta } {
  const doc = aplicar(
    documentoVazio(),
    [
      ...Object.entries(opcoes.tokens ?? {}).map(([nome, valor]) => ({ op: 'definirToken', nome, valor })),
      { op: 'criarPrancheta', nome: 'P', largura: opcoes.largura ?? 200, altura: opcoes.altura ?? 200, fundo: opcoes.fundo ?? '#ffffff' },
      ...operacoesDe(nos),
    ],
    opcoes.lote,
  );
  return { doc, p: doc.pranchetas[0] as Prancheta };
}

export const idDe = (doc: Documento, nome: string): string => acharNo(doc, `P/${nome}`).no.id;

export const forma = (nome: string, x: number, y: number, largura: number, altura: number, preenchimento: unknown, extra: object = {}): NoLiteral => ({
  tipo: 'forma',
  forma: 'retangulo',
  nome,
  x,
  y,
  largura,
  altura,
  preenchimento,
  ...extra,
});
export const texto = (nome: string, conteudo: string, extra: object = {}): NoLiteral => ({
  tipo: 'texto',
  nome,
  conteudo,
  x: 40,
  y: 40,
  largura: 520,
  altura: 300,
  fonte: 'IBM Plex Sans',
  peso: 400,
  tamanho: 32,
  cor: '#000000',
  entrelinha: 1.2,
  ...extra,
});
export const imagem = (nome: string, arquivo: string, x: number, y: number, largura: number, altura: number, extra: object = {}): NoLiteral => ({
  tipo: 'imagem',
  nome,
  arquivo,
  larguraOriginal: 1280,
  alturaOriginal: 853,
  x,
  y,
  largura,
  altura,
  ...extra,
});
export const ajuste = (nome: string, ajusteDaCamada: object, extra: object = {}): NoLiteral => ({ tipo: 'ajuste', nome, ajuste: ajusteDaCamada, ...extra });
export const grupo = (nome: string, filhos: NoLiteral[], extra: object = {}): NoLiteral => ({ tipo: 'grupo', nome, filhos, ...extra });

/** Gerador com semente: os testes de pixel não podem depender de Math.random. */
export function aleatorio(semente: number): () => number {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pixelsAleatorios(n: number, semente: number, alfa: 'opaco' | 'variado'): Uint8Array {
  const r = aleatorio(semente);
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    d[i * 4] = Math.floor(r() * 256);
    d[i * 4 + 1] = Math.floor(r() * 256);
    d[i * 4 + 2] = Math.floor(r() * 256);
    d[i * 4 + 3] = alfa === 'opaco' ? 255 : 64 + Math.floor(r() * 192);
  }
  return d;
}

export function pixel(rgba: Uint8Array, largura: number, x: number, y: number): [number, number, number, number] {
  const i = (Math.round(y) * largura + Math.round(x)) * 4;
  return [rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number, rgba[i + 3] as number];
}

/** Caixa dos pixels com alfa acima do limiar: é a tinta de fato, medida no raster. */
export function caixaDaTinta(rgba: Uint8Array, largura: number, altura: number, limiar = 8): { x: number; y: number; w: number; h: number } {
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if ((rgba[(y * largura + x) * 4 + 3] as number) > limiar) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function diferencaMaxima(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs((a[i] as number) - (b[i] as number)));
  return max;
}

/** PNG de pixels dados, codificado pelo próprio motor: imagem de teste com conteúdo conhecido. */
export function pngDe(ck: CanvasKit, rgba: Uint8Array, largura: number, altura: number): Uint8Array {
  const img = ck.MakeImage({ width: largura, height: altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }, rgba, largura * 4);
  if (!img) throw new Error('não foi possível montar a imagem de teste');
  const bytes = img.encodeToBytes(ck.ImageFormat.PNG, 100);
  img.delete();
  if (!bytes) throw new Error('não foi possível codificar a imagem de teste');
  return bytes;
}

/** Chaves de 64 dígitos hexadecimais para imagens geradas no teste (o esquema exige a forma de um sha256). */
export const chaveDeTeste = (n: number): string => n.toString(16).padStart(64, '0');
