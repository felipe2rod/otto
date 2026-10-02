// Porta: quem de fato renderiza e monta os arquivos. É trabalho de CPU e de memória (centenas de MB):
// roda só no worker. O caso de uso não conhece o motor de render nem a biblioteca que grava o PSD.
import type { Documento } from '@otto/documento';
import type { RecursosDaExportacao } from '@otto/psd';

export interface ArquivoGerado {
  nome: string;
  bytes: Uint8Array;
}

/** Chamada entre uma etapa e outra do trabalho pesado: é onde o worker bate o sinal de vida. */
export type EntreEtapas = () => Promise<void>;

export interface OpcoesDoSvg {
  nome: string;
  pranchetas: readonly string[];
  /** Resolução das camadas que viram imagem. Sem isto, 2. Quem chama baixa para 1 em prancheta grande demais para 2x. */
  escalaDaImagem?: 1 | 2;
}
export interface OpcoesDoPdf extends OpcoesDoSvg {
  arquivos: 'por-prancheta' | 'juntas';
}

export abstract class MotorDeExportacao {
  /** Libera o que o motor segura (threads). Chamado no desligamento do processo. */
  async fechar(): Promise<void> {}

  abstract psd(
    doc: Documento,
    recursos: RecursosDaExportacao,
    opcoes: { nome: string; pranchetas: readonly string[]; arquivos: 'por-prancheta' | 'juntas' },
    entreEtapas: EntreEtapas,
  ): Promise<ArquivoGerado[]>;
  abstract png(
    doc: Documento,
    recursos: RecursosDaExportacao,
    opcoes: { nome: string; pranchetas: readonly string[]; escala: 1 | 2; semFundo: boolean },
    entreEtapas: EntreEtapas,
  ): Promise<ArquivoGerado[]>;
  /** Um .svg por prancheta. O texto sai como texto; o que não tem equivalente vetorial vira imagem ou fica de fora. */
  abstract svg(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoSvg, entreEtapas: EntreEtapas): Promise<ArquivoGerado[]>;
  /** 'juntas': um .pdf com uma página por prancheta. 'por-prancheta': um .pdf por prancheta. */
  abstract pdf(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoPdf, entreEtapas: EntreEtapas): Promise<ArquivoGerado[]>;
}
