// Porta: quem de fato lê o PSD e monta a árvore do Otto. É trabalho de CPU e de memória (o arquivo inteiro, mais uma
// camada decodificada de cada vez): roda só no worker, numa thread de render. O caso de uso não conhece o motor de
// render nem a biblioteca que lê o PSD.
import type { FonteDaExportacao, LimitesDeImportacao, ResultadoDaImportacao } from '@otto/psd';

export interface OpcoesDoMotorDeImportacao {
  /** As fontes que a conta tem para este arquivo. Texto com fonte que não está aqui vem como imagem. */
  fontes: FonteDaExportacao[];
  /** Troca de fonte pedida pelo designer: nome PostScript que o arquivo pede → nome PostScript de uma fonte de `fontes`. */
  substituicoes: Readonly<Record<string, string>>;
  limites?: Partial<LimitesDeImportacao>;
  nomeDaPrancheta?: string;
}

export abstract class MotorDeImportacao {
  /**
   * Lança ErroDeImportacao (de @otto/psd) quando o arquivo não pode ser importado; qualquer outro erro é falha nossa.
   * O motor pode ficar com `bytes` (entregar à thread sem copiar): quem chama não os usa depois.
   */
  abstract importar(bytes: Uint8Array, opcoes: OpcoesDoMotorDeImportacao): Promise<ResultadoDaImportacao>;
}
