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

export abstract class MotorDeExportacao {
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
}
