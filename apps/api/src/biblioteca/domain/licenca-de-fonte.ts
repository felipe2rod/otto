// O arquivo de uma fonte da biblioteca pode ser redistribuído dentro do pacote de exportação?
// A resposta sai do texto de licença registrado na biblioteca (coluna `licenca`), nada mais.
//
// PENDÊNCIA PARA O JURÍDICO (sem bloquear o pacote): 23 das 38 fontes da biblioteca de desenvolvimento
// vieram da POC com a licença registrada como "Google Fonts (licença aberta, a conferir por família)".
// Elas VÃO no pacote, como 'a_conferir'. Falta conferir a licença de cada família e registrar o nome
// certo; e confirmar se levar só o arquivo original da fonte basta para a SIL OFL (a licença pede que
// o aviso de direitos e a licença acompanhem cada cópia; o arquivo os traz nos metadados).
export type SituacaoDaLicenca =
  /** Licença conhecida que deixa redistribuir o arquivo junto com outro trabalho. */
  | 'permite'
  /** Registrada como aberta, sem a licença exata conferida. Vai no pacote; é pendência do jurídico. */
  | 'a_conferir'
  /** Nada registrado: não dá para saber. Fica fora do pacote. */
  | 'desconhecida'
  /** Registrada, e não é das que deixam redistribuir. Fica fora do pacote. */
  | 'nao_permite';

const DEIXAM_REDISTRIBUIR = [/\bSIL Open Font Licen[cs]e\b/i, /\bOFL\b/i, /\bApache Licen[cs]e\b/i, /\bUbuntu Font Licen[cs]e\b/i];
const ABERTA_A_CONFERIR = /licença aberta, a conferir/i;

export function situacaoDaLicenca(licenca: string | null): SituacaoDaLicenca {
  const texto = licenca?.trim();
  if (!texto) return 'desconhecida';
  if (DEIXAM_REDISTRIBUIR.some((padrao) => padrao.test(texto))) return 'permite';
  if (ABERTA_A_CONFERIR.test(texto)) return 'a_conferir';
  return 'nao_permite';
}
