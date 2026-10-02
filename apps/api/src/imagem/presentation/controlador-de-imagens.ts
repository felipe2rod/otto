// Rotas do banco de imagens (ADR 032; contrato em @otto/shared, briefing.ts). Nenhuma rota recebe nem
// devolve endereço do banco: a busca devolve ids, a prévia sai pelo servidor, e `trazer` recebe só o id.
// O texto da busca vem na query string, que o log não registra (a rota é registrada como modelo).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { type ImagemTrazida, OrientacaoDeImagem, PedidoDeTrazerImagem, type ResultadoDaBuscaDeImagens } from '@otto/shared';
import type { Response } from 'express';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { validar } from '../../plataforma/http/validar';
import { CasosDeUsoDeImagens } from '../application/casos-de-uso-de-imagens';

@Controller('imagens')
export class ControladorDeImagens {
  constructor(@Inject(CasosDeUsoDeImagens) private readonly imagens: CasosDeUsoDeImagens) {}

  @Get('busca')
  buscar(@Escopo() escopo: EscopoDaConta, @Query('q') q: unknown, @Query('orientacao') orientacao: unknown, @Res({ passthrough: true }) res: Response): Promise<ResultadoDaBuscaDeImagens> {
    res.setHeader('Cache-Control', 'no-store');
    return this.imagens.buscar(escopo, { consulta: typeof q === 'string' ? q : '', orientacao: validar(OrientacaoDeImagem, orientacao ?? 'todas') }, 'editor');
  }

  /** 201: a imagem já está no armazenamento da conta, com a origem guardada. */
  @Post('trazer')
  @HttpCode(201)
  trazer(@Escopo() escopo: EscopoDaConta, @Body() corpo: unknown): Promise<ImagemTrazida> {
    return this.imagens.trazer(escopo, validar(PedidoDeTrazerImagem, corpo), 'editor');
  }

  /** A prévia de um resultado de busca, pelo servidor. O endereço vale enquanto o resultado valer (24 horas). */
  @Get(':banco/:id/previa')
  async previa(@Escopo() escopo: EscopoDaConta, @Param('banco') banco: string, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const previa = await this.imagens.previa(escopo, banco, id);
    // privado e por um dia: é o prazo dos endereços do banco; não é link permanente
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', previa.tipo);
    res.setHeader('Content-Length', String(previa.bytes.byteLength));
    res.status(200).end(Buffer.from(previa.bytes.buffer, previa.bytes.byteOffset, previa.bytes.byteLength));
  }
}
