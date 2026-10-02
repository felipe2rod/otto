// Do nome PostScript que um PSD pede ("PlayfairDisplay-BoldItalic") para uma pista de qual família e peso ele é.
// Serve para dizer ao designer "o catálogo tem esta família" e "a biblioteca tem esta família em outro peso".
// É pista, não verdade: quem decide se a fonte é a mesma é o nome PostScript do arquivo que o Otto tem.
// O nome vem do arquivo de um terceiro: é só comparado, com tamanho limitado, e nunca vira chave de objeto.

export interface PistaDeFonte {
  /** A família em forma de chave: minúsculas, só letras e números. Compare com `chaveDaFamilia`. */
  familia: string;
  peso: number;
  italico: boolean;
}

const TAMANHO_MAXIMO = 200;

/** Do mais específico para o mais geral: "extrabold" antes de "bold", "extralight" antes de "light". */
const PESOS: readonly (readonly [RegExp, number])[] = [
  [/thin|hairline/, 100],
  [/extralight|ultralight/, 200],
  [/semibold|demibold/, 600],
  [/extrabold|ultrabold/, 800],
  [/black|heavy/, 900],
  [/light/, 300],
  [/medium/, 500],
  [/bold/, 700],
];

/** A família em forma de chave: "IBM Plex Sans" e "IBMPlexSans" dão "ibmplexsans". */
export function chaveDaFamilia(familia: string): string {
  return familia
    .slice(0, TAMANHO_MAXIMO * 2)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, TAMANHO_MAXIMO);
}

export function pistaDoPostScript(postScript: string): PistaDeFonte {
  const nome = postScript.slice(-TAMANHO_MAXIMO * 4);
  const hifen = nome.lastIndexOf('-');
  const estilo = hifen >= 0 ? nome.slice(hifen + 1).toLowerCase() : '';
  const peso = PESOS.find(([padrao]) => padrao.test(estilo))?.[1];
  // estilo que não diz peso nem inclinação ("Condensed") não separa a família de forma confiável: o que vem antes
  // do último hífen ainda é a melhor pista
  const familia = chaveDaFamilia(hifen >= 0 ? nome.slice(0, hifen) : nome);
  return { familia, peso: peso ?? 400, italico: /italic|oblique/.test(estilo) };
}
