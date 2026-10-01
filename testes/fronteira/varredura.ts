// Varredura estática usada pelos testes de fronteira (ADR 008, 020).
// É leitura de texto, de propósito: não depende de compilar o código que está conferindo.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '../..');

/** Pacotes do núcleo: não conhecem framework nem fornecedor. */
export const PACOTES_DO_NUCLEO = ['documento', 'render', 'psd', 'agente', 'shared'] as const;
/** Destes, os que rodam também no navegador e por isso não tocam módulo do Node. */
const RODAM_NO_NAVEGADOR = new Set(['documento', 'agente', 'shared']);

const PROIBIDO_NO_NUCLEO = [/^@nestjs\//, /^@prisma\//, /^prisma$/, /^next($|\/)/, /^react($|\/)/, /^react-dom($|\/)/, /^express$/, /^pg$/, /^pg-boss$/, /^@otto\/(api|web)$/];
const MODULOS_DO_NODE = new Set(builtinModules);

/**
 * Nomes de fornecedor (ADR 020). Só podem aparecer em pasta `adaptadores/`, na configuração,
 * em variável de ambiente e em migração. Tecnologia da plataforma (NestJS, Prisma, PostgreSQL,
 * CanvasKit, zod) não é fornecedor e não entra aqui.
 */
export const FORNECEDORES = [
  'digitalocean',
  'do-ai.run',
  'anthropic',
  'openai',
  'moonshot',
  'pixabay',
  'unsplash',
  'pexels',
  'shutterstock',
  'ag-psd',
  'googleapis',
  'fonts.google',
  'aws-sdk',
  'amazonaws',
  'minio',
  'versity',
  'seaweedfs',
  'asaas',
] as const;

/** Especificadores de módulo citados no texto, na ordem em que aparecem. */
export function importsDe(fonte: string): string[] {
  const padroes = [
    /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const achados: { onde: number; modulo: string }[] = [];
  for (const padrao of padroes) for (const m of fonte.matchAll(padrao)) achados.push({ onde: m.index, modulo: m[1] as string });
  return achados.sort((a, b) => a.onde - b.onde).map((a) => a.modulo);
}

/** Dos módulos importados por um pacote do núcleo, os que ele não pode importar. */
export function violacoesDoNucleo(pacote: string, imports: readonly string[]): string[] {
  return imports.filter((modulo) => {
    if (PROIBIDO_NO_NUCLEO.some((p) => p.test(modulo))) return true;
    if (!RODAM_NO_NAVEGADOR.has(pacote)) return false;
    return modulo.startsWith('node:') || MODULOS_DO_NODE.has(modulo.split('/')[0] as string);
  });
}

/** Nomes de fornecedor presentes no texto (código, comentário ou literal), na ordem da lista. */
export function nomesDeFornecedorEm(fonte: string): string[] {
  const minusculas = fonte.toLowerCase();
  return FORNECEDORES.filter((nome) => minusculas.includes(nome));
}

const IGNORADAS = new Set(['node_modules', '.next', 'dist', 'coverage', 'gerado']);

/** Arquivos de código de uma pasta, em profundidade. Pasta que não existe devolve lista vazia. */
export function arquivosDeCodigo(pasta: string): string[] {
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return [];
  }
  return nomes.flatMap((nome) => {
    if (IGNORADAS.has(nome)) return [];
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeCodigo(caminho);
    return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(nome) ? [caminho] : [];
  });
}

export const ler = (arquivo: string): string => readFileSync(arquivo, 'utf8');
export const relativo = (arquivo: string): string => path.relative(RAIZ, arquivo);
