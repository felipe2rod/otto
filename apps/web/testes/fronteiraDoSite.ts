// Segue os imports a partir das páginas públicas e diz se algum caminho chega ao editor, ao motor
// de render ou a um .wasm (ADR 019). Leitura de texto, como as outras varreduras de fronteira.
import path from 'node:path';
import { importsDe } from '../../../testes/fronteira/varredura';

export interface Arquivos {
  ler(arquivo: string): string;
  existe(arquivo: string): boolean;
}

const PROIBIDOS = [/^@otto\/render($|\/)/, /canvaskit/i, /\.wasm$/];
const TERMINACOES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolver(de: string, modulo: string, arquivos: Arquivos): string | undefined {
  if (!modulo.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(de), modulo);
  for (const fim of TERMINACOES) {
    const candidato = base + fim;
    if (/\.(ts|tsx)$/.test(candidato) && arquivos.existe(candidato)) return candidato;
  }
  return undefined;
}

/**
 * @param entradas arquivos que o Next monta fora de /editor
 * @param src a pasta src do web; o editor é tudo o que está em src/editor
 */
export function violacoesDoSitePublico(entradas: readonly string[], src: string, arquivos: Arquivos): string[] {
  const raiz = path.dirname(src);
  const rel = (a: string) => path.relative(raiz, a).split(path.sep).join('/');
  const doEditor = (a: string) => a.startsWith(path.join(src, 'editor') + path.sep);

  const violacoes: string[] = [];
  const vistos = new Set<string>();
  const fila = [...entradas];
  while (fila.length > 0) {
    const arquivo = fila.shift() as string;
    if (vistos.has(arquivo)) continue;
    vistos.add(arquivo);
    for (const modulo of importsDe(arquivos.ler(arquivo))) {
      if (PROIBIDOS.some((p) => p.test(modulo))) {
        violacoes.push(`${rel(arquivo)} importa ${modulo}`);
        continue;
      }
      const alvo = resolver(arquivo, modulo, arquivos);
      if (!alvo) continue;
      if (doEditor(alvo)) violacoes.push(`${rel(arquivo)} alcança o editor: ${rel(alvo)}`);
      else fila.push(alvo);
    }
  }
  return violacoes;
}
