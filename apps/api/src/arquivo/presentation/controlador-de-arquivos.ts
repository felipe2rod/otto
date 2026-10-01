// Rotas de arquivo (docs/mvp/backend.md, 7.4). A imagem do editor sai PELA API, com a conta
// conferida em toda leitura e cache imutável (o endereço é o hash do conteúdo): decisão registrada
// em docs/mvp/README.md. Nenhuma rota aceita chave de objeto vinda do cliente.
import { Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { ArquivoEnviado, VetorImportado } from '@otto/shared';
import type { Request, Response } from 'express';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { CasosDeUsoDeArquivo } from '../application/casos-de-uso-de-arquivo';

/** Nome do arquivo no computador da pessoa, codificado como em URL. É conteúdo: nunca vai para o log. */
const CABECALHO_DO_NOME = 'x-otto-nome-do-arquivo';

function nomeDoArquivo(req: Request): string | undefined {
  const bruto = req.get(CABECALHO_DO_NOME);
  if (!bruto) return undefined;
  try {
    return decodeURIComponent(bruto);
  } catch {
    return undefined;
  }
}

@Controller('arquivos')
export class ControladorDeArquivos {
  constructor(@Inject(CasosDeUsoDeArquivo) private readonly arquivos: CasosDeUsoDeArquivo) {}

  @Post()
  enviar(@Escopo() escopo: EscopoDaConta, @Req() req: Request): Promise<ArquivoEnviado> {
    // o corpo só é Buffer quando o tipo declarado é de imagem; qualquer outra coisa não é arquivo
    const conteudo: Uint8Array = Buffer.isBuffer(req.body) ? req.body : new Uint8Array();
    const nome = nomeDoArquivo(req);
    const tipoDeclarado = req.get('content-type');
    return this.arquivos.enviarImagem(escopo, conteudo, { ...(nome ? { nome } : {}), ...(tipoDeclarado ? { tipoDeclarado } : {}) });
  }

  @Get(':sha256')
  async ler(@Escopo() escopo: EscopoDaConta, @Param('sha256') sha256: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const arquivo = await this.arquivos.ler(escopo, sha256);
    const etag = `"${arquivo.sha256}"`;
    res.setHeader('ETag', etag);
    // privado: é dado da conta; imutável: o endereço é o hash do conteúdo
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.get('if-none-match') === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', arquivo.tipo);
    res.setHeader('Content-Length', String(arquivo.bytes.byteLength));
    res.status(200).end(Buffer.from(arquivo.bytes.buffer, arquivo.bytes.byteOffset, arquivo.bytes.byteLength));
  }
}

@Controller('vetores')
export class ControladorDeVetores {
  constructor(@Inject(CasosDeUsoDeArquivo) private readonly arquivos: CasosDeUsoDeArquivo) {}

  @Post()
  importar(@Escopo() escopo: EscopoDaConta, @Req() req: Request, @Query('nome') nome: unknown): Promise<VetorImportado> {
    // o corpo só é texto quando o tipo declarado é de SVG ou de texto; qualquer outra coisa é recusada pelo importador
    const svg = typeof req.body === 'string' ? req.body : '';
    return this.arquivos.importarVetor(escopo, svg, typeof nome === 'string' ? nome : undefined);
  }
}
