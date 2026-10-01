// O que a borda HTTP pendura na requisição. Só o código de plataforma/http e de presentation/
// conhece o Express (ADR 009: Express é detalhe do NestJS).
import type { Request } from 'express';
import type { EscopoDaConta } from '../escopo/escopo-da-conta';

export interface RequisicaoDoOtto extends Request {
  /** Posto pela guarda de escopo. É a única origem do escopo num caminho HTTP. */
  escopo?: EscopoDaConta;
  correlacaoId?: string;
  /** Campos que o filtro de erros quer na linha de log desta requisição (só código, nunca mensagem). */
  paraOLog?: Record<string, string | number>;
}
