// Biblioteca do Google Fonts: catálogo inteiro disponível, arquivo baixado só quando usado.
// Licenças OFL, Apache e UFL permitem uso comercial e redistribuição junto com o PSD.
import { GlobalFonts } from '@napi-rs/canvas';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type ArquivoDeFonte, FONTES, registrarFonte } from '../render/fontes';

export const PASTA_GOOGLE = path.resolve(import.meta.dirname, '../../fontes/google');
const CATALOGO = path.resolve(import.meta.dirname, '../../dados/google-fonts.json');
const INDICE = path.join(PASTA_GOOGLE, 'indice.json');
const PESOS = [300, 400, 500, 600, 700] as const;
type Peso = (typeof PESOS)[number];

export interface FamiliaDoCatalogo {
  familia: string;
  categoria: 'sem serifa' | 'serifada' | 'display' | 'manuscrita' | 'monoespaçada';
  pesos: number[];
  /** posição no ranking de uso do Google Fonts (1 = mais usada) */
  popularidade: number;
}

const CATEGORIA: Record<string, FamiliaDoCatalogo['categoria']> = { 'Sans Serif': 'sem serifa', Serif: 'serifada', Display: 'display', Handwriting: 'manuscrita', Monospace: 'monoespaçada' };

let catalogo: Promise<FamiliaDoCatalogo[]> | undefined;

export function catalogoGoogle(): Promise<FamiliaDoCatalogo[]> {
  catalogo ??= (async () => {
    try {
      const s = await stat(CATALOGO);
      if (Date.now() - s.mtimeMs < 7 * 24 * 3600 * 1000) return JSON.parse(await readFile(CATALOGO, 'utf8')) as FamiliaDoCatalogo[];
    } catch {
      // sem cache: baixa
    }
    const r = await fetch('https://fonts.google.com/metadata/fonts');
    const texto = await r.text();
    const dados = JSON.parse(texto.slice(texto.indexOf('{'))) as { familyMetadataList: { family: string; category: string; fonts: Record<string, unknown>; popularity: number; subsets: string[] }[] };
    const lista = dados.familyMetadataList
      .filter((f) => f.subsets.includes('latin'))
      .map((f) => ({ familia: f.family, categoria: CATEGORIA[f.category] ?? 'display', pesos: Object.keys(f.fonts).filter((k) => /^\d+$/.test(k)).map(Number), popularidade: f.popularity }))
      .sort((a, b) => a.popularidade - b.popularidade);
    await mkdir(path.dirname(CATALOGO), { recursive: true });
    await writeFile(CATALOGO, JSON.stringify(lista));
    return lista;
  })();
  return catalogo;
}

export async function buscarFontes(consulta = '', categoria?: string, limite = 20): Promise<FamiliaDoCatalogo[]> {
  const q = consulta.trim().toLowerCase();
  return (await catalogoGoogle()).filter((f) => (!q || f.familia.toLowerCase().includes(q)) && (!categoria || f.categoria === categoria)).slice(0, limite);
}

/** Nome PostScript (name id 6) lido do próprio TTF: é o que o Photoshop procura para o texto seguir editável. */
function nomePostScript(ttf: Buffer): string | undefined {
  const n = ttf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (ttf.toString('latin1', o, o + 4) !== 'name') continue;
    const tab = ttf.readUInt32BE(o + 8);
    const qtd = ttf.readUInt16BE(tab + 2);
    const inicioTexto = tab + ttf.readUInt16BE(tab + 4);
    for (let j = 0; j < qtd; j++) {
      const r = tab + 6 + j * 12;
      if (ttf.readUInt16BE(r + 6) !== 6) continue;
      const plataforma = ttf.readUInt16BE(r);
      const len = ttf.readUInt16BE(r + 8);
      const off = inicioTexto + ttf.readUInt16BE(r + 10);
      const bruto = ttf.subarray(off, off + len);
      return plataforma === 3 || plataforma === 0 ? Buffer.from(bruto).swap16().toString('utf16le') : bruto.toString('latin1');
    }
  }
  return undefined;
}

let indice: Promise<Record<string, ArquivoDeFonte>> | undefined;

async function lerIndice(): Promise<Record<string, ArquivoDeFonte>> {
  indice ??= (async () => {
    await mkdir(PASTA_GOOGLE, { recursive: true });
    try {
      const i = JSON.parse(await readFile(INDICE, 'utf8')) as Record<string, ArquivoDeFonte>;
      // registra de novo o que já foi baixado em outra execução
      for (const f of Object.values(i)) {
        GlobalFonts.registerFromPath(path.join(PASTA_GOOGLE, path.basename(f.arquivo)), f.familia);
        registrarFonte(f);
      }
      return i;
    } catch {
      return {};
    }
  })();
  return indice;
}

const baixando = new Map<string, Promise<ArquivoDeFonte | undefined>>();

/** Garante a fonte no servidor (baixa, registra no Skia e no registro do Otto). Devolve undefined se a família não existe. */
export async function garantirFonte(familia: string, pesoPedido: number): Promise<ArquivoDeFonte | undefined> {
  if (FONTES.some((f) => f.familia === familia && f.peso === pesoPedido)) return FONTES.find((f) => f.familia === familia && f.peso === pesoPedido);
  const idx = await lerIndice();
  const doCatalogo = (await catalogoGoogle()).find((f) => f.familia === familia);
  if (!doCatalogo) return undefined;
  // peso mais próximo que a família tem, dentro da escala do Otto
  const disponiveis = doCatalogo.pesos.length ? doCatalogo.pesos : [400];
  const peso = disponiveis.reduce((m, p) => (Math.abs(p - pesoPedido) < Math.abs(m - pesoPedido) ? p : m));
  const pesoOtto = PESOS.reduce((m, p) => (Math.abs(p - peso) < Math.abs(m - peso) ? p : m)) as Peso;
  const jaTem = FONTES.find((f) => f.familia === familia && f.peso === pesoOtto);
  if (jaTem) return jaTem;
  const chave = `${familia}|${pesoOtto}`;
  if (idx[chave]) return idx[chave];
  const emCurso = baixando.get(chave);
  if (emCurso) return emCurso;
  const tarefa = (async () => {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia).replace(/%20/g, '+')}:wght@${peso}`)).text();
    const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    if (!url) return undefined;
    const ttf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const arquivo = `${familia.replace(/[^\w]+/g, '')}-${pesoOtto}.ttf`;
    await writeFile(path.join(PASTA_GOOGLE, arquivo), ttf);
    GlobalFonts.registerFromPath(path.join(PASTA_GOOGLE, arquivo), familia);
    const fonte: ArquivoDeFonte = { familia, peso: pesoOtto, arquivo: `google/${arquivo}`, postScript: nomePostScript(ttf) ?? arquivo.replace('.ttf', ''), uso: `Google Fonts (${doCatalogo.categoria})` };
    registrarFonte(fonte);
    idx[chave] = fonte;
    await writeFile(INDICE, JSON.stringify(idx));
    return fonte;
  })();
  baixando.set(chave, tarefa);
  try {
    return await tarefa;
  } finally {
    baixando.delete(chave);
  }
}

/** Baixa as fontes do Google que o documento usa (texto e trechos). */
export async function garantirFontesDoDocumento(pares: { fonte: string; peso: number }[]): Promise<void> {
  await lerIndice();
  const unicos = new Map(pares.map((p) => [`${p.fonte}|${p.peso}`, p]));
  await Promise.all([...unicos.values()].filter((p) => !FONTES.some((f) => f.familia === p.fonte && f.peso === p.peso)).map((p) => garantirFonte(p.fonte, p.peso).catch(() => undefined)));
}
