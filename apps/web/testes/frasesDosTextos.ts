/**
 * Todo texto que um objeto de textos pode produzir: as cadeias, e o resultado de cada função chamada
 * com argumentos de exemplo que servem a qualquer assinatura daqui (nomes, números e listas).
 */
export function frases(valor: unknown, caminho: string): [string, string][] {
  if (typeof valor === 'string') return [[caminho, valor]];
  if (typeof valor === 'function') {
    const exemplos: unknown[][] = [
      ['Feed', 'Título', 'Poppins', 'Licença livre'],
      [3, 2, 1, 4],
      [['Feed', 'Story'], ['Banner']],
      ['Poppins Negrito (700)', 'a licença não permite'],
      [undefined, undefined],
    ];
    return exemplos.flatMap((args, i) => {
      try {
        return frases((valor as (...a: unknown[]) => unknown)(...args), `${caminho}(${i})`);
      } catch {
        return [];
      }
    });
  }
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([chave, v]) => frases(v, `${caminho}.${chave}`));
  return [];
}
