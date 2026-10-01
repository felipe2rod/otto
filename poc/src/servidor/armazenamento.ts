// Armazenamento da POC em disco: arquivos por hash de conteúdo (pixel é conteúdo, ADR 027)
// e documentos com histórico em JSON. No produto isso é S3 + PostgreSQL com RLS.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Autoria, Documento } from '../documento/esquema';
import type { Operacao } from '../documento/operacoes';
import type { EsforcoCriativo } from './esforco';

const PASTA = path.resolve(import.meta.dirname, '../../dados');
const ARQUIVOS = path.join(PASTA, 'arquivos');
const DOCUMENTOS = path.join(PASTA, 'documentos');
await mkdir(ARQUIVOS, { recursive: true });
await mkdir(DOCUMENTOS, { recursive: true });

export interface MetaDeArquivo {
  hash: string;
  tipo: string;
  largura: number;
  altura: number;
  origem?: { banco: string; autor: string; licenca: string; url: string };
}

export async function guardarArquivo(bytes: Buffer, meta: Omit<MetaDeArquivo, 'hash'>): Promise<MetaDeArquivo> {
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(ARQUIVOS, hash), bytes);
  const completo = { hash, ...meta };
  await writeFile(path.join(ARQUIVOS, `${hash}.json`), JSON.stringify(completo));
  return completo;
}

export async function lerArquivo(hash: string): Promise<Buffer | undefined> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return undefined;
  try {
    return await readFile(path.join(ARQUIVOS, hash));
  } catch {
    return undefined;
  }
}

export async function lerMetaDeArquivo(hash: string): Promise<MetaDeArquivo | undefined> {
  try {
    return JSON.parse(await readFile(path.join(ARQUIVOS, `${hash}.json`), 'utf8')) as MetaDeArquivo;
  } catch {
    return undefined;
  }
}

export interface LoteRegistrado {
  id: string;
  descricao: string;
  autoria: Autoria;
  quando: string;
  operacoes: Operacao[];
  tocados: string[];
  /** Snapshot antes do lote: desfazer é voltar a ele. No produto, snapshot periódico + log. */
  antes: Documento;
}

export interface CustoDaTarefa {
  modelo: string;
  chamadas: number;
  tokensDeEntrada: number;
  tokensDeSaida: number;
  tokensDeCacheLidos: number;
  /** Escrita no cache (1,25× a entrada). Ausente nas tarefas antigas. */
  tokensDeCacheCriados?: number;
  imagensEnviadas: number;
  voltasDeConferencia: number;
  segundos: number;
}

export type EstadoDaTarefa = 'rodando' | 'em-revisao' | 'aceita' | 'desfeita' | 'falhou';

export interface EventoDaTarefa {
  tipo: 'mensagem' | 'plano' | 'direcao' | 'revisao' | 'lote' | 'lote-recusado' | 'render' | 'verificacao' | 'imagem' | 'entrega' | 'erro' | 'custo';
  quando: string;
  texto?: string;
  dados?: unknown;
}

export interface Tarefa {
  id: string;
  documentoId: string;
  /** O esforço criativo (esforco.ts) é opcional: sem ele, a tarefa roda como sempre. */
  entrada: ({ tipo: 'briefing'; briefing: unknown } | { tipo: 'pedido' | 'criar'; pedido: string }) & { esforco?: EsforcoCriativo };
  estado: EstadoDaTarefa;
  eventos: EventoDaTarefa[];
  lotes: string[];
  docAntes: Documento;
  resumo?: string;
  pendencias?: string[];
  custo: CustoDaTarefa;
  criadaEm: string;
}

export interface Registro {
  doc: Documento;
  historico: LoteRegistrado[];
  tarefas: Tarefa[];
}

export async function salvarRegistro(r: Registro): Promise<void> {
  await writeFile(path.join(DOCUMENTOS, `${r.doc.id}.json`), JSON.stringify(r));
}

export async function carregarRegistros(): Promise<Registro[]> {
  const nomes = (await readdir(DOCUMENTOS)).filter((n) => n.endsWith('.json'));
  const regs = await Promise.all(nomes.map(async (n) => JSON.parse(await readFile(path.join(DOCUMENTOS, n), 'utf8')) as Registro));
  // tarefa que estava rodando quando o servidor caiu não volta sozinha
  // com lote aplicado, vai para revisão: o designer aceita ou desfaz o que entrou
  for (const r of regs)
    for (const t of r.tarefas)
      if (t.estado === 'rodando') {
        t.estado = t.lotes.length ? 'em-revisao' : 'falhou';
        t.resumo ??= 'Parei porque o servidor reiniciou no meio da tarefa.';
        t.pendencias ??= ['A tarefa não terminou. O que foi feito até aqui está no conjunto de alterações.'];
      }
  return regs;
}
