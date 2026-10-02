// Rotas dos cadastros da conta: marcas e briefings salvos (contrato em @otto/shared, briefing.ts).
// Controlador fino: valida com o esquema do contrato e repassa o escopo.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Res } from '@nestjs/common';
import { type BriefingSalvo, DadosDaMarca, DadosDoBriefingSalvo, type ListaDeBriefings, type ListaDeMarcas, type Marca } from '@otto/shared';
import type { Response } from 'express';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { validar } from '../../plataforma/http/validar';
import { CasosDeUsoDeCadastro } from '../application/casos-de-uso-de-cadastro';

@Controller('marcas')
export class ControladorDeMarcas {
  constructor(@Inject(CasosDeUsoDeCadastro) private readonly cadastros: CasosDeUsoDeCadastro) {}

  @Get()
  listar(@Escopo() escopo: EscopoDaConta, @Res({ passthrough: true }) res: Response): Promise<ListaDeMarcas> {
    res.setHeader('Cache-Control', 'no-store');
    return this.cadastros.listarMarcas(escopo);
  }

  @Post()
  @HttpCode(201)
  criar(@Escopo() escopo: EscopoDaConta, @Body() corpo: unknown): Promise<Marca> {
    return this.cadastros.criarMarca(escopo, validar(DadosDaMarca, corpo));
  }

  @Get(':id')
  obter(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<Marca> {
    res.setHeader('Cache-Control', 'no-store');
    return this.cadastros.obterMarca(escopo, id);
  }

  /** Troca tudo: o que não vem deixa de existir. */
  @Put(':id')
  substituir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<Marca> {
    return this.cadastros.substituirMarca(escopo, id, validar(DadosDaMarca, corpo));
  }

  @Delete(':id')
  @HttpCode(204)
  apagar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string): Promise<void> {
    return this.cadastros.apagarMarca(escopo, id);
  }
}

@Controller('briefings')
export class ControladorDeBriefings {
  constructor(@Inject(CasosDeUsoDeCadastro) private readonly cadastros: CasosDeUsoDeCadastro) {}

  @Get()
  listar(@Escopo() escopo: EscopoDaConta, @Res({ passthrough: true }) res: Response): Promise<ListaDeBriefings> {
    res.setHeader('Cache-Control', 'no-store');
    return this.cadastros.listarBriefings(escopo);
  }

  @Post()
  @HttpCode(201)
  criar(@Escopo() escopo: EscopoDaConta, @Body() corpo: unknown): Promise<BriefingSalvo> {
    return this.cadastros.criarBriefing(escopo, validar(DadosDoBriefingSalvo, corpo));
  }

  @Get(':id')
  obter(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<BriefingSalvo> {
    res.setHeader('Cache-Control', 'no-store');
    return this.cadastros.obterBriefing(escopo, id);
  }

  @Put(':id')
  substituir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<BriefingSalvo> {
    return this.cadastros.substituirBriefing(escopo, id, validar(DadosDoBriefingSalvo, corpo));
  }

  @Delete(':id')
  @HttpCode(204)
  apagar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string): Promise<void> {
    return this.cadastros.apagarBriefing(escopo, id);
  }
}
