// Rotas da biblioteca de fontes (docs/mvp/backend.md, 7.4). As fontes do Otto são iguais para
// todas as contas e de licença aberta: o cache pode ser público. O endereço é por família e peso,
// não por conteúdo, então o cache dura um dia e revalida pelo ETag (o hash do arquivo).
import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { CATEGORIAS_DE_FONTE, type FonteDaBiblioteca, type ListaDeFontes } from '@otto/shared';
import type { Request, Response } from 'express';
import { CasosDeUsoDeFontes } from '../application/casos-de-uso-de-fontes';

@Controller('fontes')
export class ControladorDeFontes {
  constructor(@Inject(CasosDeUsoDeFontes) private readonly fontes: CasosDeUsoDeFontes) {}

  @Get()
  listar(@Query('q') busca: unknown, @Query('categoria') categoria: unknown, @Query('catalogo') catalogo: unknown): Promise<ListaDeFontes> {
    // `catalogo=1` inclui as famílias que ainda não foram baixadas; categoria desconhecida é ignorada
    const daLista = CATEGORIAS_DE_FONTE.find((c) => c === categoria);
    return this.fontes.listar(typeof busca === 'string' ? busca.slice(0, 80) : undefined, { ...(daLista ? { categoria: daLista } : {}), catalogo: catalogo === '1' || catalogo === 'true' });
  }

  @Get(':familia/:peso')
  detalhe(@Param('familia') familia: string, @Param('peso') peso: string): Promise<FonteDaBiblioteca> {
    return this.fontes.detalhe(familia, Number(peso));
  }

  @Get(':familia/:peso/arquivo')
  async arquivo(@Param('familia') familia: string, @Param('peso') peso: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const fonte = await this.fontes.arquivo(familia, Number(peso));
    const etag = `"${fonte.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Otto-Peso', String(fonte.peso));
    if (req.get('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'font/ttf');
    res.setHeader('Content-Length', String(fonte.bytes.byteLength));
    res.status(200).end(Buffer.from(fonte.bytes.buffer, fonte.bytes.byteOffset, fonte.bytes.byteLength));
  }
}
