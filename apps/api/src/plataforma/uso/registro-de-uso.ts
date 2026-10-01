// Porta: dado de uso (ADR 031). Tipo, contagem, duração e resultado; NUNCA conteúdo.
// Os tipos abaixo são a lista de permissão: um evento só carrega os campos declarados aqui,
// e nenhum deles é texto livre. O catálogo de eventos é do analista-de-produto; estes dois são
// os que a fatia 1 consegue emitir. Na fatia de produção o adaptador grava em tabela.
import type { EscopoDaConta } from '../escopo/escopo-da-conta';

export type EventoDeUso =
  | { evento: 'lote_aplicado'; documentoId: string; autoria: 'designer' | 'agente'; operacoesPorTipo: Record<string, number>; nosTocados: number; mediuTexto: boolean; versao: number }
  | { evento: 'arquivo_enviado'; tipo: string; bytes: number; largura: number; altura: number };

export abstract class RegistroDeUso {
  abstract registrar(escopo: EscopoDaConta, evento: EventoDeUso): void;
}

export class RegistroDeUsoMudo extends RegistroDeUso {
  registrar(): void {}
}
