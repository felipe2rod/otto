// Desfazer e refazer sobre um histórico que só cresce (ADR 027; docs/mvp/backend.md, 6.3).
// Nenhuma linha é apagada: desfazer e refazer GRAVAM um lote de reversão, que leva o documento
// ao conteúdo de uma versão anterior.
//
// "Versão de conteúdo" de uma versão V: a versão cuja árvore V repete.
//   - lote de edição: a própria versão (ele criou conteúdo novo);
//   - lote de reversão: a versão de conteúdo que ele restaurou (`reverteAteVersao`);
//   - documento sem lote: 0, o documento vazio.
// Regras puras, sem banco: quem busca os lotes é o caso de uso.

export interface LoteNoHistorico {
  versao: number;
  tipo: 'edicao' | 'reversao';
  /** Preenchido só em reversão, e sempre com uma versão de conteúdo (nunca com a de outra reversão). */
  reverteAteVersao: number | null;
}

export function conteudoDe(lote: LoteNoHistorico | undefined): number {
  if (!lote) return 0;
  return lote.tipo === 'edicao' ? lote.versao : (lote.reverteAteVersao ?? 0);
}

export interface PlanoDeDesfazer {
  /** Versão de conteúdo cuja árvore o documento passa a ter. */
  restaurar: number;
  /** Versão do lote de edição que fica marcado como desfeito. */
  desfaz: number;
}

/**
 * Desfazer tira o passo mais recente ainda de pé: o lote de edição que criou o conteúdo atual.
 * O documento volta ao conteúdo que havia logo antes dele.
 * @param atual o lote mais recente do documento (undefined se não há nenhum)
 * @param lote busca o lote de uma versão (undefined para a versão 0)
 */
export function planejarDesfazer(atual: LoteNoHistorico | undefined, lote: (versao: number) => LoteNoHistorico | undefined): PlanoDeDesfazer | undefined {
  const conteudo = conteudoDe(atual);
  if (conteudo === 0) return undefined;
  return { restaurar: conteudoDe(lote(conteudo - 1)), desfaz: conteudo };
}

export interface PlanoDeRefazer {
  restaurar: number;
  /** Versão do lote de edição que deixa de estar desfeito. */
  refaz: number;
}

/**
 * Refazer só existe logo depois de desfazer: uma edição nova apaga a possibilidade.
 * @param cauda as reversões seguidas no fim do histórico, da mais nova para a mais velha
 * @param conteudoAntesDaCauda versão de conteúdo logo antes da primeira reversão da cauda
 */
export function planejarRefazer(cauda: readonly LoteNoHistorico[], conteudoAntesDaCauda: number): PlanoDeRefazer | undefined {
  const pilha: number[] = [];
  let anterior = conteudoAntesDaCauda;
  for (const reversao of [...cauda].reverse()) {
    const conteudo = conteudoDe(reversao);
    // voltou para trás: desfez `anterior`; foi para a frente: refez o topo da pilha
    if (conteudo < anterior) pilha.push(anterior);
    else pilha.pop();
    anterior = conteudo;
  }
  const topo = pilha.at(-1);
  return topo === undefined ? undefined : { restaurar: topo, refaz: topo };
}
