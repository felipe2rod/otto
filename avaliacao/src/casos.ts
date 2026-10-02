// Os casos do conjunto de avaliação. Cada caso é um arquivo em avaliacao/casos/: a entrada da tarefa, o
// documento de partida (como lista de operações, para o caso se bastar) e os critérios.
// Material nosso ou licenciado para isso; nunca arquivo de cliente (ADR 031, item 3).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EntradaDaTarefa } from '../../packages/agente/src/index';
import { aplicarLote, type Documento, documentoVazio } from '../../packages/documento/src/index';

export const TIPOS_DE_CASO = ['criar-de-briefing', 'criar-de-pedido', 'adaptar-formato', 'ajuste', 'revisar', 'remocao', 'limite', 'ataque'] as const;

export interface Caso {
  id: string;
  tipo: (typeof TIPOS_DE_CASO)[number];
  /** De onde veio o caso (rodada da POC, auditoria, uso real anonimizado). */
  origem: string;
  entrada: EntradaDaTarefa;
  /** Operações que montam o documento de partida, a partir do vazio. Ausente: documento vazio. */
  documento?: unknown[];
  criterios: {
    /** Nomes dos critérios automáticos (src/criterios.ts) que valem para o caso. */
    automaticos: string[];
    /** O "pode" é esperado? */
    pode?: boolean;
    /** Para "nao-repetiu-o-ataque". */
    trechosDoAtaque?: string[];
    /** Para "admitiu-sem-alterar". */
    pendenciasEsperadas?: string[];
    /** Perguntas para a checagem visual por modelo sobre o render final. Ainda não roda. */
    porRender?: string[];
    /** Rubrica humana que se aplica. Ainda não existe: a de qualidade visual é do diretor-de-arte. */
    rubrica?: string;
  };
}

export const PASTA_DOS_CASOS = path.resolve(import.meta.dirname, '../casos');

export function lerCasos(pasta = PASTA_DOS_CASOS): Caso[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((nome) => {
      const bruto = JSON.parse(readFileSync(path.join(pasta, nome), 'utf8')) as Caso;
      return { ...bruto, entrada: EntradaDaTarefa.parse(bruto.entrada) };
    });
}

export function lerCaso(id: string, pasta = PASTA_DOS_CASOS): Caso {
  const caso = lerCasos(pasta).find((c) => c.id === id);
  if (!caso)
    throw new Error(
      `caso "${id}" não existe. Casos: ${lerCasos(pasta)
        .map((c) => c.id)
        .join(', ')}`,
    );
  return caso;
}

/** O documento de partida do caso. O id do lote é fixo: os ids dos nós são sempre os mesmos. */
export function documentoDoCaso(caso: Pick<Caso, 'id' | 'documento'>): Documento {
  if (!caso.documento?.length) return documentoVazio();
  const r = aplicarLote(documentoVazio(), caso.documento, { autoria: { tipo: 'designer' }, idDoLote: `caso:${caso.id}` });
  if (!r.ok) throw new Error(`o documento do caso "${caso.id}" não monta: operação ${r.erro.indice} (${r.erro.op}): ${r.erro.mensagem}`);
  return r.doc;
}
