// Parâmetro de rota: o escopo da conta que a guarda resolveu. É o primeiro argumento que todo
// controlador repassa ao caso de uso.
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { EscopoDaConta } from '../escopo/escopo-da-conta';
import type { RequisicaoDoOtto } from './requisicao';

export const Escopo = createParamDecorator((_dado: unknown, contexto: ExecutionContext): EscopoDaConta => {
  const escopo = contexto.switchToHttp().getRequest<RequisicaoDoOtto>().escopo;
  // rota de negócio sem escopo é defeito de montagem, nunca um padrão silencioso (ADR 023)
  if (!escopo) throw new Error('rota de negócio sem escopo de conta: a guarda de escopo não rodou');
  return escopo;
});
