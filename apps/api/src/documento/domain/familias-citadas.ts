// As famílias de fonte que um documento usa. Regra pura.
import { type Documento, todasAsCamadas } from '@otto/documento';

/**
 * Famílias de fonte que o lote pode precisar medir: as do documento e as que as operações citam
 * (um lote pode criar o texto e alinhar na mesma tacada).
 */
export function familiasCitadas(doc: Documento, operacoes: readonly unknown[] = []): Set<string> {
  const familias = new Set<string>();
  for (const estilo of Object.values(doc.tokens.estilosDeTexto)) familias.add(estilo.fonte);
  for (const prancheta of doc.pranchetas) {
    for (const no of todasAsCamadas(prancheta.filhos)) {
      if (no.tipo !== 'texto') continue;
      familias.add(no.fonte);
      for (const trecho of no.trechos ?? []) if (trecho.fonte) familias.add(trecho.fonte);
    }
  }
  const varrer = (valor: unknown, profundidade: number): void => {
    if (profundidade > 12 || typeof valor !== 'object' || valor === null) return;
    if (Array.isArray(valor)) {
      for (const item of valor) varrer(item, profundidade + 1);
      return;
    }
    for (const [chave, dentro] of Object.entries(valor)) {
      if (chave === 'fonte' && typeof dentro === 'string') familias.add(dentro);
      else varrer(dentro, profundidade + 1);
    }
  };
  varrer(operacoes, 0);
  return familias;
}
