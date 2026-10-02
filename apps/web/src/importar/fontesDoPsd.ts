// O que fazer com cada fonte que o texto do PSD pede (packages/shared/src/importacao.ts). É o centro da
// tela de importar: o designer vê quais fontes o arquivo pede e decide, por fonte, entre trocar por outra
// e deixar o texto virar imagem. Nada é trocado em silêncio: sem escolha, vale o padrão da situação, e o
// pedido só leva o que foge dele.
import type { EscolhaDeFonte, FonteDoPsd } from '@otto/shared';

export type EscolhaNaTela = { fazer: 'imagem' } | { fazer: 'baixar' } | { fazer: 'substituir'; familia: string; peso: number };
export type Escolhas = Readonly<Record<string, EscolhaNaTela>>;
export type OQueFazer = EscolhaNaTela['fazer'];

/** As escolhas possíveis, na ordem da tela. Fonte que o Otto tem não tem escolha. */
export function opcoesDe(fonte: FonteDoPsd): OQueFazer[] {
  if (fonte.situacao === 'na_biblioteca') return [];
  return fonte.situacao === 'no_catalogo' ? ['baixar', 'substituir', 'imagem'] : ['substituir', 'imagem'];
}

/** O que acontece sem escolha: a do catálogo é baixada, a que falta vira imagem. */
export function escolhaPadrao(fonte: FonteDoPsd): EscolhaNaTela | undefined {
  if (fonte.situacao === 'na_biblioteca') return undefined;
  return fonte.situacao === 'no_catalogo' ? { fazer: 'baixar' } : { fazer: 'imagem' };
}

export const escolhaDe = (fonte: FonteDoPsd, escolhas: Escolhas): EscolhaNaTela | undefined => (opcoesDe(fonte).length > 0 ? (escolhas[fonte.postScript] ?? escolhaPadrao(fonte)) : undefined);

/** As trocas em que a fonte nova ainda não foi escolhida: enquanto houver, não dá para importar. */
export function trocasSemFonte(fontes: readonly FonteDoPsd[], escolhas: Escolhas): string[] {
  return fontes
    .filter((f) => {
      const e = escolhaDe(f, escolhas);
      return e?.fazer === 'substituir' && e.familia.trim() === '';
    })
    .map((f) => f.postScript);
}

/** O campo `fontes` do pedido: só o que foge do padrão, e só de fonte que está no arquivo. */
export function escolhasParaOPedido(fontes: readonly FonteDoPsd[], escolhas: Escolhas): EscolhaDeFonte[] {
  return fontes.flatMap((fonte): EscolhaDeFonte[] => {
    const escolha = escolhaDe(fonte, escolhas);
    const padrao = escolhaPadrao(fonte);
    if (!escolha || !padrao) return [];
    if (escolha.fazer === 'substituir') return escolha.familia.trim() === '' ? [] : [{ postScript: fonte.postScript, fazer: 'substituir', por: { familia: escolha.familia, peso: escolha.peso } }];
    return escolha.fazer === padrao.fazer ? [] : [{ postScript: fonte.postScript, fazer: escolha.fazer }];
  });
}

/** Quantas fontes do arquivo vêm com o texto editável e quantas viram imagem, com as escolhas de agora. */
export function contarDestinos(fontes: readonly FonteDoPsd[], escolhas: Escolhas): { editaveis: number; imagens: number } {
  const imagens = fontes.filter((f) => escolhaDe(f, escolhas)?.fazer === 'imagem').length;
  return { editaveis: fontes.length - imagens, imagens };
}
