// Rotas das texturas do Otto (contrato em @otto/shared, briefing.ts). A API não desenha textura: lista o
// catálogo e entrega a que já está guardada (gerada pela semeadura ou pelo worker).
import { Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import type { ListaDeTexturas, TexturaTrazida } from '@otto/shared';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { CasosDeUsoDeTexturas } from '../application/casos-de-uso-de-texturas';

@Controller('texturas')
export class ControladorDeTexturas {
  constructor(@Inject(CasosDeUsoDeTexturas) private readonly texturas: CasosDeUsoDeTexturas) {}

  @Get()
  listar(): ListaDeTexturas {
    return this.texturas.listar();
  }

  /** 201: a textura virou arquivo da conta; `no` vai direto em criarNo. */
  @Post(':nome/trazer')
  @HttpCode(201)
  trazer(@Escopo() escopo: EscopoDaConta, @Param('nome') nome: string): Promise<TexturaTrazida> {
    return this.texturas.trazer(escopo, nome);
  }
}
