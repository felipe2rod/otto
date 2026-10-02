// Um formato de erro só, em um lugar só (docs/mvp/backend.md, 7.1): { codigo, detalhe? },
// com Content-Type application/problem+json. A API manda código estável; a frase que a pessoa lê
// é montada no editor. Nada de pilha, SQL ou mensagem interna na resposta.
// É aqui, e só aqui, que um erro de caso de uso vira status HTTP.
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, type LoggerService } from '@nestjs/common';
import { CODIGOS_DE_ERRO, type CodigoDeErro, type ErroDaApi } from '@otto/shared';
import type { Response } from 'express';
import type { RequisicaoDoOtto } from '../http/requisicao';
import { ErroDaAplicacao } from './erro-da-aplicacao';

const C = CODIGOS_DE_ERRO;

const STATUS_POR_CODIGO: Record<CodigoDeErro, number> = {
  [C.naoEncontrado]: 404,
  [C.rotaNaoEncontrada]: 404,
  [C.pedidoInvalido]: 400,
  [C.clienteNaoIdentificado]: 403,
  [C.versaoDesatualizada]: 409,
  [C.catalogoDesatualizado]: 409,
  [C.loteInvalido]: 422,
  [C.arquivoDesconhecido]: 422,
  [C.nadaParaDesfazer]: 409,
  [C.nadaParaRefazer]: 409,
  [C.corpoGrandeDemais]: 413,
  [C.documentoGrandeDemais]: 413,
  [C.arquivoGrandeDemais]: 413,
  [C.tipoNaoAceito]: 415,
  [C.imagemGrandeDemais]: 422,
  [C.imagemIlegivel]: 422,
  [C.svgInvalido]: 422,
  [C.pranchetaDesconhecida]: 422,
  [C.nadaParaExportar]: 422,
  [C.limiteDeExportacoes]: 429,
  [C.exportacaoNaoPronta]: 409,
  [C.exportacaoExpirada]: 410,
  [C.filaIndisponivel]: 503,
  [C.exportacaoGrandeDemais]: 422,
  [C.documentoEmTarefa]: 409,
  [C.revisaoPendente]: 409,
  [C.tarefaEmAndamento]: 409,
  [C.tarefaForaDoEstado]: 409,
  [C.editadoDepois]: 409,
  [C.pranchetaNaoDescartavel]: 422,
  [C.limiteDeTarefas]: 429,
  [C.limiteDiario]: 429,
  [C.erroInterno]: 500,
};

/** Erros que não nasceram num caso de uso: rota inexistente, corpo malformado ou grande demais. */
const CODIGO_POR_STATUS: Record<number, CodigoDeErro> = { 400: C.pedidoInvalido, 404: C.rotaNaoEncontrada, 413: C.corpoGrandeDemais, 415: C.tipoNaoAceito };

@Catch()
export class FiltroDeErros implements ExceptionFilter {
  constructor(
    private readonly registro: LoggerService,
    private readonly bytesPorArquivo: number,
  ) {}

  catch(erro: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<RequisicaoDoOtto>();
    const { status, corpo } = this.traduzir(erro, req);
    // ADR 031: o log leva o código e o tipo do erro, nunca a mensagem nem o detalhe (citam conteúdo)
    req.paraOLog = { ...req.paraOLog, codigo: corpo.codigo };
    if (status >= 500) this.registro.error({ evento: 'erro_nao_tratado', tipo: erro instanceof Error ? erro.name : typeof erro, correlacaoId: req.correlacaoId });
    const resposta = http.getResponse<Response>();
    resposta.status(status).setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    resposta.send(JSON.stringify(corpo));
  }

  private traduzir(erro: unknown, req: RequisicaoDoOtto): { status: number; corpo: ErroDaApi } {
    if (erro instanceof ErroDaAplicacao) return { status: STATUS_POR_CODIGO[erro.codigo], corpo: { codigo: erro.codigo, ...(erro.detalhe ? { detalhe: erro.detalhe } : {}) } };
    const status = erro instanceof HttpException ? erro.getStatus() : (statusDoExpress(erro) ?? 500);
    if (status === 413 && req.path === '/api/arquivos') return { status, corpo: { codigo: C.arquivoGrandeDemais, detalhe: { limiteEmBytes: this.bytesPorArquivo } } };
    if (status >= 500) return { status: 500, corpo: { codigo: C.erroInterno } };
    return { status, corpo: { codigo: CODIGO_POR_STATUS[status] ?? C.pedidoInvalido } };
  }
}

/** O leitor de corpo do Express levanta erro comum com `status` (413, 400). */
function statusDoExpress(erro: unknown): number | undefined {
  const status = (erro as { status?: unknown; statusCode?: unknown } | undefined)?.status ?? (erro as { statusCode?: unknown } | undefined)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
