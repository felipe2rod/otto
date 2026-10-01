// A chave de um objeto no armazenamento. Nunca vem do cliente e nunca volta para ele (ADR 023, 5c):
// é montada aqui, a partir do escopo e do hash do conteúdo. O prefixo por conta serve operação e
// retenção; NÃO é o controle de acesso. Quem autoriza é a linha em `arquivos`, lida sob RLS.
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { EscopoDivergente } from '../../plataforma/escopo/escopo-da-conta';

export class ChaveDeObjetoInvalida extends Error {
  constructor() {
    // sem a chave na mensagem: ela pode ir para o log
    super('chave de objeto inválida');
    this.name = 'ChaveDeObjetoInvalida';
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
const SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Prefixo do que é do Otto e igual para todas as contas (fontes, texturas). */
const BIBLIOTECA = 'biblioteca';

/** Chave do arquivo de uma conta: contas/{conta}/arquivos/{sha256}. Sem deduplicação entre contas. */
export function chaveDeArquivoDaConta(escopo: EscopoDaConta, sha256: string): string {
  if (!SHA256.test(sha256)) throw new ChaveDeObjetoInvalida();
  return `contas/${escopo.contaId}/arquivos/${sha256}`;
}

/**
 * Confere a chave contra o escopo. Todo adaptador chama isto antes de tocar o armazenamento.
 * - chave malformada (segmento vazio, "..", barra invertida, absoluta): ChaveDeObjetoInvalida;
 * - chave de outra conta: EscopoDivergente;
 * - biblioteca do Otto: qualquer conta lê; nenhuma conta grava nem apaga.
 */
export function conferirChave(escopo: EscopoDaConta, chave: string, uso: 'leitura' | 'escrita'): void {
  const segmentos = chave.split('/');
  if (segmentos.length < 2 || segmentos.some((s) => !SEGMENTO.test(s) || s.includes('..'))) throw new ChaveDeObjetoInvalida();
  if (segmentos[0] === BIBLIOTECA) {
    if (uso === 'escrita') throw new EscopoDivergente();
    return;
  }
  if (segmentos[0] !== 'contas' || segmentos.length < 4) throw new ChaveDeObjetoInvalida();
  if (segmentos[1] !== escopo.contaId) throw new EscopoDivergente();
}

/** Chave de um arquivo de fonte da biblioteca do Otto. */
export function chaveDeFonteDaBiblioteca(sha256: string): string {
  if (!SHA256.test(sha256)) throw new ChaveDeObjetoInvalida();
  return `${BIBLIOTECA}/fontes/${sha256}.ttf`;
}

/** Confere que a chave é da biblioteca do Otto, e bem formada. */
export function conferirChaveDaBiblioteca(chave: string): void {
  const segmentos = chave.split('/');
  if (segmentos.length < 2 || segmentos[0] !== BIBLIOTECA || segmentos.some((s) => !SEGMENTO.test(s) || s.includes('..'))) throw new ChaveDeObjetoInvalida();
}
