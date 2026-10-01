// Fontes e imagens do documento no navegador. As fontes vêm dos mesmos arquivos do servidor.
import { useEffect, useState } from 'react';
import type { Documento } from '../documento/esquema';
import { todasAsCamadas } from '../documento/esquema';
import { FONTES, registrarFonte } from '../render/fontes';

let fontesProntas: Promise<void> | undefined;

export function carregarFontes(): Promise<void> {
  fontesProntas ??= Promise.all(
    FONTES.map(async (f) => {
      const face = new FontFace(f.familia, `url(/fontes/${f.arquivo})`, { weight: String(f.peso) });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return fontesProntas;
}

const imagens = new Map<string, HTMLImageElement>();
const ouvintes = new Set<() => void>();

/** Devolve a imagem se já carregou; senão começa a carregar e avisa quem desenha quando chegar. */
export function imagemDoArquivo(hash: string): CanvasImageSource | undefined {
  const img = imagens.get(hash);
  if (img) return img.complete && img.naturalWidth > 0 ? img : undefined;
  const nova = new Image();
  nova.onload = () => ouvintes.forEach((f) => f());
  nova.src = `/api/arquivos/${hash}`;
  imagens.set(hash, nova);
  return undefined;
}

export function aoCarregarImagem(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Canvas fora da tela para o render (ajuste de cor, máscara em degradê). */
export const criarCanvasWeb = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const fontesPedidas = new Map<string, Promise<void>>();

/** Carrega no navegador as fontes do Google que o documento usa (o mesmo arquivo que o servidor usa). */
export async function carregarFontesDoDocumento(doc: Documento): Promise<boolean> {
  const pares = new Map<string, { familia: string; peso: number }>();
  for (const p of doc.pranchetas)
    for (const n of todasAsCamadas(p.filhos)) {
      if (n.tipo !== 'texto') continue;
      for (const t of [{ fonte: n.fonte, peso: n.peso }, ...(n.trechos ?? []).map((x) => ({ fonte: x.fonte ?? n.fonte, peso: x.peso ?? n.peso }))]) {
        if (FONTES.some((f) => f.familia === t.fonte && f.peso === t.peso)) continue;
        pares.set(`${t.fonte}|${t.peso}`, { familia: t.fonte, peso: t.peso });
      }
    }
  let novas = false;
  await Promise.all(
    [...pares.entries()].map(([chave, { familia, peso }]) => {
      let p = fontesPedidas.get(chave);
      if (!p) {
        novas = true;
        p = (async () => {
          const r = await fetch(`/api/fontes/arquivo/${encodeURIComponent(familia)}/${peso}`);
          if (!r.ok) return;
          const f = (await r.json()) as { familia: string; peso: 300 | 400 | 500 | 600 | 700; url: string };
          const face = new FontFace(f.familia, `url(${f.url})`, { weight: String(f.peso) });
          document.fonts.add(await face.load());
          registrarFonte({ familia: f.familia, peso: f.peso, arquivo: f.url, postScript: '', uso: 'Google Fonts' });
        })().catch(() => undefined);
        fontesPedidas.set(chave, p);
      }
      return p;
    }),
  );
  return novas;
}

let catalogo: Promise<{ familia: string; categoria: string }[]> | undefined;

export function useCatalogoDeFontes(): { familia: string; categoria: string }[] {
  const [lista, setLista] = useState<{ familia: string; categoria: string }[]>([]);
  useEffect(() => {
    catalogo ??= fetch('/api/fontes/catalogo').then((r) => (r.ok ? r.json() : []));
    void catalogo.then(setLista);
  }, []);
  return lista;
}
