// Porta: dado de uso (ADR 031). Tipo, contagem, duração e resultado; NUNCA conteúdo.
// Os tipos abaixo são a lista de permissão: um evento só carrega os campos declarados aqui,
// e nenhum deles é texto livre. O catálogo de eventos é do analista-de-produto; estes são
// os que o código consegue emitir hoje. Na fatia de produção o adaptador grava em tabela.
import type { EscopoDaConta } from '../escopo/escopo-da-conta';

type FormatoExportado = 'psd' | 'png' | 'svg' | 'pdf';

export type EventoDeUso =
  | { evento: 'lote_aplicado'; documentoId: string; autoria: 'designer' | 'agente'; operacoesPorTipo: Record<string, number>; nosTocados: number; mediuTexto: boolean; versao: number }
  | { evento: 'arquivo_enviado'; tipo: string; bytes: number; largura: number; altura: number }
  | { evento: 'exportacao_pedida'; exportacaoId: string; documentoId: string; formato: FormatoExportado; pacote: boolean; pranchetas: number; juntas: boolean }
  | { evento: 'exportacao_baixada'; exportacaoId: string; documentoId: string; formato: FormatoExportado; pacote: boolean }
  | { evento: 'exportacao_limpa'; exportacaoId: string; arquivos: number; bytes: number }
  | {
      evento: 'exportacao_terminada';
      exportacaoId: string;
      documentoId: string;
      formato: FormatoExportado;
      pacote: boolean;
      resultado: 'pronta' | 'pronta_em_parte' | 'falhou';
      pranchetas: number;
      falhas: number;
      arquivos: number;
      bytes: number;
      /** Do pedido ao começo do trabalho. */
      esperaMs: number;
      /** Do começo do trabalho ao fim. */
      duracaoMs: number;
    };

export abstract class RegistroDeUso {
  abstract registrar(escopo: EscopoDaConta, evento: EventoDeUso): void;
}

export class RegistroDeUsoMudo extends RegistroDeUso {
  registrar(): void {}
}
