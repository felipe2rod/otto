// Rotas de documento (docs/mvp/backend.md, 7.3). Controlador fino: valida com o esquema do
// contrato, repassa o escopo e o pedido ao caso de uso, devolve o que ele devolver.
// Nenhuma regra mora aqui. Não existe rota que receba a árvore do cliente.
import { createHash } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import {
  type DocumentoAberto,
  type DocumentoRenomeado,
  type Historico,
  type ListaDeDocumentos,
  Paginacao,
  PedidoDeCriarDocumento,
  PedidoDeDesfazer,
  PedidoDeDuplicarDocumento,
  PedidoDeLote,
  PedidoDeRenomearDocumento,
  type RespostaDeDesfazer,
  type RespostaDeLote,
} from '@otto/shared';
import type { Request, Response } from 'express';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { validar } from '../../plataforma/http/validar';
import { CasosDeUsoDeDocumento } from '../application/casos-de-uso-de-documento';

@Controller('documentos')
export class ControladorDeDocumentos {
  constructor(@Inject(CasosDeUsoDeDocumento) private readonly documentos: CasosDeUsoDeDocumento) {}

  @Get()
  listar(@Escopo() escopo: EscopoDaConta, @Query() query: unknown): Promise<ListaDeDocumentos> {
    const { cursor, limite } = validar(Paginacao, query);
    return this.documentos.listar(escopo, { limite, ...(cursor ? { cursor } : {}) });
  }

  @Post()
  criar(@Escopo() escopo: EscopoDaConta, @Body() corpo: unknown): Promise<DocumentoAberto> {
    return this.documentos.criar(escopo, validar(PedidoDeCriarDocumento, corpo));
  }

  @Get(':id')
  async abrir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<DocumentoAberto | undefined> {
    const doc = await this.documentos.abrir(escopo, id);
    // o ETag muda com a versão e com o nome (renomear não cria versão)
    const etag = `W/"${doc.versao}-${createHash('sha256').update(doc.nome).digest('hex').slice(0, 12)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-store');
    if (req.get('if-none-match') === etag) {
      res.status(304);
      return undefined;
    }
    return doc;
  }

  @Patch(':id')
  renomear(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<DocumentoRenomeado> {
    return this.documentos.renomear(escopo, id, validar(PedidoDeRenomearDocumento, corpo));
  }

  @Delete(':id')
  @HttpCode(204)
  arquivar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string): Promise<void> {
    return this.documentos.arquivar(escopo, id);
  }

  @Post(':id/duplicar')
  duplicar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<DocumentoAberto> {
    return this.documentos.duplicar(escopo, id, validar(PedidoDeDuplicarDocumento, corpo));
  }

  @Get(':id/historico')
  historico(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Query() query: unknown): Promise<Historico> {
    const { cursor, limite } = validar(Paginacao, query);
    return this.documentos.historico(escopo, id, { limite, ...(cursor ? { cursor } : {}) });
  }

  @Post(':id/lotes')
  @HttpCode(200)
  aplicarLote(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<RespostaDeLote> {
    return this.documentos.aplicarLote(escopo, id, validar(PedidoDeLote, corpo));
  }

  @Post(':id/desfazer')
  @HttpCode(200)
  desfazer(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<RespostaDeDesfazer> {
    return this.documentos.desfazer(escopo, id, validar(PedidoDeDesfazer, corpo));
  }

  @Post(':id/refazer')
  @HttpCode(200)
  refazer(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<RespostaDeDesfazer> {
    return this.documentos.refazer(escopo, id, validar(PedidoDeDesfazer, corpo));
  }
}
