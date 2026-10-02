// Alavancas de custo e de espera do ciclo. Cada uma é uma opção, desligada por padrão, para a avaliação medir
// com e sem (ADR 029, item 6: nada muda sem o conjunto rodado, com o antes e o depois).
//
// De onde vieram: a tarefa de briefing medida em 2026-10-02 (Feed e Story, 35 chamadas, 2,6 milhões de tokens,
// US$ 1,29). O prefixo de 44 mil tokens é relido a cada chamada, e 13 das 33 chamadas do ciclo só pediam
// render ou verificação.
export interface Alavancas {
  /** 1. O catálogo de operações vai ao modelo só pelos nomes; a sintaxe está nas receitas do prompt. Corta mais da metade do prefixo. */
  esquemaCompacto?: boolean;
  /** 2. Depois de cada lote, o sistema devolve a verificação e o render das pranchetas que mudaram, na mesma resposta. */
  conferenciaNoLote?: boolean;
  /** 3. O prompt diz que erro se corrige e aviso é julgamento: não se gasta volta nem se põe enfeite para calar aviso. */
  avisoEJulgamento?: boolean;
  /** 4. Direção de arte e segunda conferência com raciocínio médio, em vez de alto. */
  julgamentoEmMedio?: boolean;
}

export const NOMES_DAS_ALAVANCAS = ['esquemaCompacto', 'conferenciaNoLote', 'avisoEJulgamento', 'julgamentoEmMedio'] as const satisfies readonly (keyof Alavancas)[];

export const TODAS_AS_ALAVANCAS: Required<Alavancas> = { esquemaCompacto: true, conferenciaNoLote: true, avisoEJulgamento: true, julgamentoEmMedio: true };

/** "todas", "nenhuma", ou nomes e números separados por vírgula ("1,3", "esquemaCompacto,julgamentoEmMedio"). Nome desconhecido lança. */
export function lerAlavancas(texto: string | undefined): Alavancas {
  if (!texto || texto === 'nenhuma') return {};
  if (texto === 'todas') return { ...TODAS_AS_ALAVANCAS };
  const ligadas: Alavancas = {};
  for (const parte of texto
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const nome = /^[1-4]$/.test(parte) ? NOMES_DAS_ALAVANCAS[Number(parte) - 1] : NOMES_DAS_ALAVANCAS.find((n) => n === parte);
    if (!nome) throw new Error(`alavanca desconhecida: "${parte}". Use todas, nenhuma, 1 a 4 ou: ${NOMES_DAS_ALAVANCAS.join(', ')}`);
    ligadas[nome] = true;
  }
  return ligadas;
}
