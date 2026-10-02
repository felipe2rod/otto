// "O texto do briefing é literal" (regra de detalhe, POC rodada 3): conferência palavra por palavra.
// O agente pode dividir a frase em camadas, mudar o corpo e destacar por trecho; as palavras ficam todas lá.
// Veio de poc/src/servidor/agente.ts. O que mudou: devolve dado (prancheta, texto, palavras que faltam),
// e confere só as pranchetas pedidas (as que a tarefa criou), não a peça inteira.
import { camadasVisuaisVisiveis, type Documento } from '@otto/documento';

/** Palavras comparáveis: minúsculas, sem pontuação nas pontas, sem separadores soltos (· — |). */
const palavras = (t: string): string[] =>
  t
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}@$%]+|[^\p{L}\p{N}%]+$/gu, ''))
    .filter(Boolean);

export interface TextoQueFalta {
  /** nome da prancheta */
  prancheta: string;
  pranchetaId: string;
  /** o texto do cliente, como veio */
  texto: string;
  faltam: string[];
}

/** Palavras do texto do cliente que sumiram de uma prancheta (reescrita, corte ou troca). */
export function conferirTextoDoCliente(doc: Documento, textos: readonly string[], pranchetas?: ReadonlySet<string>): TextoQueFalta[] {
  const problemas: TextoQueFalta[] = [];
  for (const p of doc.pranchetas) {
    if (pranchetas && !pranchetas.has(p.id)) continue;
    const presentes = new Map<string, number>();
    for (const n of camadasVisuaisVisiveis(p.filhos)) if (n.tipo === 'texto') for (const w of palavras(n.conteudo)) presentes.set(w, (presentes.get(w) ?? 0) + 1);
    for (const texto of textos) {
      const faltam = palavras(texto).filter((w) => {
        const q = presentes.get(w) ?? 0;
        if (q > 0) presentes.set(w, q - 1);
        return q === 0;
      });
      if (faltam.length) problemas.push({ prancheta: p.nome, pranchetaId: p.id, texto, faltam });
    }
  }
  return problemas;
}

/** Os campos de texto preenchidos do briefing: precisam aparecer literais em cada prancheta criada. */
export function textosDoBriefing(briefing: unknown): string[] {
  const textos = (briefing as { textos?: Record<string, unknown> } | undefined)?.textos;
  if (!textos || typeof textos !== 'object') return [];
  return Object.values(textos).filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** Trechos entre aspas no pedido livre: entram literais na peça, como os textos do briefing. */
export function textosEntreAspas(pedido: string): string[] {
  return [...pedido.matchAll(/["“”«»]([^"“”«»]{2,300})["“”«»]/g)].map((m) => (m[1] as string).trim()).filter(Boolean);
}
