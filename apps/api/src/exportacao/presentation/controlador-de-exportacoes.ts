// Rotas de exportação (docs/mvp/backend.md, 7.6). Controlador fino: valida com o esquema do
// contrato e repassa o escopo. Nenhuma rota renderiza: o trabalho pesado é do worker.
// Nenhuma rota recebe nem devolve chave de objeto.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import { type Exportacao, type ListaDeExportacoes, PedidoDeExportacao, type RelatorioDeExportacao } from '@otto/shared';
import type { Response } from 'express';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { validar } from '../../plataforma/http/validar';
import { CasosDeUsoDeExportacao } from '../application/casos-de-uso-de-exportacao';

@Controller()
export class ControladorDeExportacoes {
  constructor(@Inject(CasosDeUsoDeExportacao) private readonly exportacoes: CasosDeUsoDeExportacao) {}

  /** O relatório antes de exportar. Síncrono: sai da árvore, sem renderizar. */
  @Post('documentos/:id/exportacoes/relatorio')
  @HttpCode(200)
  relatorio(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<RelatorioDeExportacao> {
    return this.exportacoes.relatorio(escopo, id, validar(PedidoDeExportacao, corpo));
  }

  /** 202: aceito e na fila. O resultado se acompanha em GET /api/exportacoes/:id. */
  @Post('documentos/:id/exportacoes')
  @HttpCode(202)
  pedir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<Exportacao> {
    return this.exportacoes.pedir(escopo, id, validar(PedidoDeExportacao, corpo));
  }

  /** As exportações em curso e as recentes da peça: é como o editor retoma depois de recarregar a página. */
  @Get('documentos/:id/exportacoes')
  listar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<ListaDeExportacoes> {
    res.setHeader('Cache-Control', 'no-store');
    return this.exportacoes.listar(escopo, id);
  }

  @Get('exportacoes/:id')
  consultar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<Exportacao> {
    res.setHeader('Cache-Control', 'no-store');
    return this.exportacoes.consultar(escopo, id);
  }

  /** Redireciona para um link assinado de vida curta, novo a cada pedido. O link nunca fica guardado. */
  @Get('exportacoes/:id/arquivos/:indice')
  async baixar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Param('indice') indice: string, @Res() res: Response): Promise<void> {
    if (!/^\d{1,4}$/.test(indice)) throw new NaoEncontrado();
    const link = await this.exportacoes.linkDoArquivo(escopo, id, Number(indice));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, link);
  }
}
