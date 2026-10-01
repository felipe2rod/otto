// GET /api/links/:token: entrega o arquivo de um link assinado quando o armazenamento não tem um
// servidor de objetos próprio na frente (disco local, em desenvolvimento). Com S3, o link aponta
// direto para o armazenamento e esta rota responde sempre 404.
// Não há sessão nem conta aqui: o link É a credencial, assinada e com vencimento. Por isso a
// guarda de escopo deixa esta rota passar, e por isso o token nunca vai para o log (a rota é
// registrada como modelo).
import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import { ArmazenamentoDeArquivo } from '../application/armazenamento-de-arquivo';
import { disposicaoDeAnexo } from '../infrastructure/adaptadores/links-locais';

@Controller('links')
export class ControladorDeLinks {
  constructor(@Inject(ArmazenamentoDeArquivo) private readonly armazenamento: ArmazenamentoDeArquivo) {}

  @Get(':token')
  async baixar(@Param('token') token: string, @Res() res: Response): Promise<void> {
    // vencido, adulterado, inventado ou de objeto que não existe mais: a resposta é a mesma
    const arquivo = token.length <= 4096 ? await this.armazenamento.abrirLinkProprio(token) : undefined;
    if (!arquivo) throw new NaoEncontrado();
    res.setHeader('Content-Type', arquivo.tipo);
    res.setHeader('Content-Length', String(arquivo.bytes.byteLength));
    // sempre anexo: nada que veio de uma conta é exibido na origem do Otto
    res.setHeader('Content-Disposition', disposicaoDeAnexo(arquivo.nome));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.status(200).end(Buffer.from(arquivo.bytes.buffer, arquivo.bytes.byteOffset, arquivo.bytes.byteLength));
  }
}
