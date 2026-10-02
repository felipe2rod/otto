// Versalete nos formatos que não têm versalete: as letras escritas em minúscula vão em maiúscula, num corpo menor.

/**
 * O pedaço de texto partido onde muda o corpo do versalete: a letra escrita em maiúscula (e o que não tem caixa, antes
 * de uma delas) em corpo inteiro; a escrita em minúscula, em `fator` do corpo. `texto` é o que aparece (já em
 * maiúsculas) e `original` é o que foi escrito. Sem `original` ou sem `fator`, o pedaço inteiro em corpo cheio.
 */
export function partesDoVersalete(texto: string, original: string | undefined, fator: number | undefined): { texto: string; fator: number }[] {
  if (!original || !fator) return [{ texto, fator: 1 }];
  const partes: { texto: string; fator: number }[] = [];
  const exibidos = [...texto];
  [...original].forEach((ch, i) => {
    const f = ch !== ch.toLocaleUpperCase('pt-BR') ? fator : 1;
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.fator === f) ultima.texto += exibidos[i] ?? '';
    else partes.push({ texto: exibidos[i] ?? '', fator: f });
  });
  return partes;
}
