// Log estruturado (pino, ADR 009), no lugar do registrador padrão do NestJS.
// ADR 031 (uso sim, conteúdo não): o log leva tipo, contagem, duração e resultado. Nunca árvore,
// texto ou nome de camada, texto de pedido, corpo de requisição, segredo nem URL assinada.
// O teste testes/http/log-sem-conteudo.e2e.test.ts roda um fluxo inteiro e procura conteúdo no log.
import type { LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import type { Configuracao } from '../config/configuracao';
import type { Servico } from '../servico';

type Entrada = string | Record<string, unknown>;

export class Registro implements LoggerService {
  private readonly pino: Logger;

  /** @param destino onde as linhas são escritas; por padrão, a saída do processo. Os testes passam um coletor. */
  constructor(servico: Servico, config: Pick<Configuracao, 'nivelDeLog' | 'ambiente'>, destino?: { write(linha: string): void }) {
    const opcoes = {
      level: config.nivelDeLog,
      base: { servico, ambiente: config.ambiente },
      // cinto e suspensório: se alguém registrar um objeto com estes campos, o valor não sai
      redact: { paths: ['senha', 'token', 'cookie', 'authorization', 'url', 'chave', '*.senha', '*.token', '*.cookie', '*.authorization'], censor: '[removido]' },
    };
    this.pino = destino ? pino(opcoes, destino) : pino(opcoes);
  }

  private escrever(nivel: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal', entrada: Entrada, contexto?: unknown): void {
    const origem = typeof contexto === 'string' ? { origem: contexto } : {};
    if (typeof entrada === 'string') this.pino[nivel](origem, entrada);
    else this.pino[nivel]({ ...origem, ...entrada });
  }

  log(entrada: Entrada, contexto?: unknown): void {
    this.escrever('info', entrada, contexto);
  }
  error(entrada: Entrada, ..._resto: unknown[]): void {
    // o NestJS passa a pilha como segundo argumento; ela não vai para o log (pode citar conteúdo)
    this.escrever('error', entrada);
  }
  warn(entrada: Entrada, contexto?: unknown): void {
    this.escrever('warn', entrada, contexto);
  }
  debug(entrada: Entrada, contexto?: unknown): void {
    this.escrever('debug', entrada, contexto);
  }
  verbose(entrada: Entrada, contexto?: unknown): void {
    this.escrever('trace', entrada, contexto);
  }
  fatal(entrada: Entrada, contexto?: unknown): void {
    this.escrever('fatal', entrada, contexto);
  }
}
