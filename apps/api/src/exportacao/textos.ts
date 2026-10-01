// Texto que o servidor produz e a pessoa lê, dentro do pacote de exportação. É texto público: passa
// pelo guardião da marca (docs/marca/identidade.md). PROVISÓRIO: ainda não foi revisado por ele.
// (O corpo do relatório vem de @otto/psd, que tem a mesma pendência.)
import type { FonteDoPacote } from '@otto/shared';

export const NOME_DA_PASTA_DE_FONTES = 'Fontes';
export const NOME_DO_RELATORIO_NO_PACOTE = 'Relatório de exportação.md';

const nomeDaFonte = (f: FonteDoPacote): string => `${f.familia} ${f.peso} (${f.postScript})`;

const MOTIVO: Record<NonNullable<FonteDoPacote['motivo']>, (f: FonteDoPacote) => string> = {
  licenca_desconhecida: () => 'não está no pacote. Não há licença registrada para esta fonte.',
  licenca_nao_permite: (f) => `não está no pacote. A licença registrada (${f.licenca ?? 'sem nome'}) não permite redistribuir o arquivo.`,
};

/** A seção de fontes do relatório que vai dentro do pacote, em markdown. Vazia se a exportação não usa fonte. */
export function secaoDeFontesDoPacote(fontes: readonly FonteDoPacote[]): string {
  if (fontes.length === 0) return '';
  const dentro = fontes.filter((f) => f.incluida);
  const fora = fontes.filter((f) => !f.incluida);
  const linhas: string[] = ['', '## Fontes neste pacote', ...(dentro.length ? dentro.map((f) => `- ${nomeDaFonte(f)}: ${f.arquivo}. Licença: ${f.licenca}.`) : ['- nenhuma'])];
  if (fora.length) linhas.push('', '## Fontes que não vieram no pacote', ...fora.map((f) => `- ${nomeDaFonte(f)}: ${MOTIVO[f.motivo ?? 'licenca_desconhecida'](f)}`));
  return `${linhas.join('\n')}\n`;
}
