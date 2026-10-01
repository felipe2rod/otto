// Uma linha de log por requisição, com o que o ADR 031 permite: conta, correlação, método, ROTA
// COMO MODELO (/api/documentos/:id, nunca o endereço digitado), status, duração e tamanhos.
// Nunca: corpo, query string, cookie, cabeçalho de autorização.
// Também põe em toda resposta a versão do catálogo e o id de correlação.
import { randomUUID } from 'node:crypto';
import { VERSAO_DO_FORMATO } from '@otto/documento';
import { CABECALHOS } from '@otto/shared';
import type { NextFunction, Response } from 'express';
import type { Registro } from '../log/registro';
import type { RequisicaoDoOtto } from './requisicao';

export function registroDeRequisicoes(registro: Registro) {
  return (req: RequisicaoDoOtto, res: Response, proximo: NextFunction): void => {
    const inicio = process.hrtime.bigint();
    req.correlacaoId = randomUUID();
    res.setHeader(CABECALHOS.correlacao, req.correlacaoId);
    res.setHeader(CABECALHOS.catalogo, String(VERSAO_DO_FORMATO));
    res.on('finish', () => {
      // req.route só existe quando uma rota casou; o caminho dela é o modelo, sem os valores
      const modelo = (req.route as { path?: unknown } | undefined)?.path;
      // (o NestJS registra uma rota coringa para o 404: ela não é modelo de nada)
      const rota = typeof modelo === 'string' && modelo.startsWith('/api/') ? modelo : '(rota desconhecida)';
      const linha = {
        evento: 'requisicao',
        correlacaoId: req.correlacaoId,
        ...(req.escopo ? { contaId: req.escopo.contaId } : {}),
        metodo: req.method,
        rota,
        status: res.statusCode,
        duracaoMs: Math.round(Number(process.hrtime.bigint() - inicio) / 1e5) / 10,
        bytesDoPedido: Number(req.get('content-length') ?? 0),
        bytesDaResposta: Number(res.getHeader('content-length') ?? 0),
        ...req.paraOLog,
      };
      // a verificação de saúde bate a cada poucos segundos: só aparece em nível de depuração
      if (rota.startsWith('/api/saude/')) registro.debug(linha);
      else registro.log(linha);
    });
    proximo();
  };
}
