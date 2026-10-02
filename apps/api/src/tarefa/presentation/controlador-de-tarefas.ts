// Rotas da tarefa do Otto (docs/mvp/backend.md, 7.5; contrato em @otto/shared, tarefa.ts). Controlador fino:
// valida com o esquema do contrato e repassa o escopo. Nenhuma rota roda o ciclo: quem roda é o worker.
// A entrada da tarefa é validada com o esquema de @otto/agente (o mesmo que o ciclo usa).
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { EntradaDaTarefa } from '@otto/agente';
import {
  type AntesDaTarefa,
  EstadoDaPendencia,
  type EventosDaTarefa,
  FORMATOS_POR_TAREFA,
  type LimitesDeTarefa,
  type ListaDePendencias,
  type ListaDeTarefas,
  PedidoDeAjusteDoPlano,
  PedidoDeDescartar,
  PedidoDeDesfazerTarefa,
  PedidoDeTarefaPorBriefing,
  type PendenciaDaPeca,
  type RespostaDeDesfazerTarefa,
  type Tarefa,
} from '@otto/shared';
import type { Request, Response } from 'express';
import type { Configuracao } from '../../plataforma/config/configuracao';
import { NaoEncontrado, PedidoInvalido } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { validar } from '../../plataforma/http/validar';
import { CONFIGURACAO } from '../../plataforma/servico';
import { CasosDeUsoDeTarefa } from '../application/casos-de-uso-de-tarefa';
import { cursorDe, transmitir } from './fluxo-de-eventos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Id que não é UUID não existe: a resposta é a mesma de id de outra conta. */
function id(valor: string): string {
  if (!UUID.test(valor)) throw new NaoEncontrado();
  return valor;
}

/** O corpo é o formulário de briefing? Quem diz é a versão declarada: o que tem versão é validado como formulário, com erro por campo. */
function ehFormularioDeBriefing(corpo: unknown): boolean {
  const c = corpo as { tipo?: unknown; briefing?: { versao?: unknown } } | null;
  return typeof c === 'object' && c !== null && c.tipo === 'briefing' && typeof c.briefing === 'object' && c.briefing !== null && c.briefing.versao !== undefined;
}

@Controller()
export class ControladorDeTarefas {
  private readonly briefingSolto: boolean;

  constructor(
    @Inject(CasosDeUsoDeTarefa) private readonly tarefas: CasosDeUsoDeTarefa,
    @Inject(CONFIGURACAO) config: Configuracao,
  ) {
    this.briefingSolto = config.ambiente !== 'producao';
  }

  /** O que dizer antes de enviar. Declarada antes de tarefas/:id, para "limites" não ser lido como id. */
  @Get('tarefas/limites')
  limites(@Escopo() escopo: EscopoDaConta, @Res({ passthrough: true }) res: Response): Promise<LimitesDeTarefa> {
    res.setHeader('Cache-Control', 'no-store');
    return this.tarefas.limites(escopo);
  }

  /** 202: aceita e na fila. O andamento se acompanha em GET /api/tarefas/:id/eventos. */
  @Post('documentos/:id/tarefas')
  @HttpCode(202)
  criar(@Escopo() escopo: EscopoDaConta, @Param('id') documentoId: string, @Body() corpo: unknown): Promise<Tarefa> {
    // o formulário de briefing (versão 1) é fechado e validado campo a campo
    if (ehFormularioDeBriefing(corpo)) return this.tarefas.criarPorBriefing(escopo, id(documentoId), validar(PedidoDeTarefaPorBriefing, corpo));
    const entrada = validar(EntradaDaTarefa, corpo);
    // Briefing solto (sem o formulário) é como os roteiros gravados do treinador chegam: serve ao desenvolvimento.
    // Em produção só entra briefing pelo formulário, e o teto de formatos vale nos dois caminhos.
    if (entrada.tipo === 'briefing' && (!this.briefingSolto || entrada.briefing.formatos.length > FORMATOS_POR_TAREFA)) throw new PedidoInvalido(['briefing']);
    return this.tarefas.criar(escopo, id(documentoId), entrada);
  }

  @Get('documentos/:id/tarefas')
  listar(@Escopo() escopo: EscopoDaConta, @Param('id') documentoId: string, @Res({ passthrough: true }) res: Response): Promise<ListaDeTarefas> {
    res.setHeader('Cache-Control', 'no-store');
    return this.tarefas.listar(escopo, id(documentoId));
  }

  @Get('documentos/:id/pendencias')
  pendencias(@Escopo() escopo: EscopoDaConta, @Param('id') documentoId: string, @Query('estado') estado: string | undefined, @Res({ passthrough: true }) res: Response): Promise<ListaDePendencias> {
    res.setHeader('Cache-Control', 'no-store');
    return this.tarefas.pendencias(escopo, id(documentoId), validar(EstadoDaPendencia, estado ?? 'aberta'));
  }

  @Post('pendencias/:id/dispensar')
  @HttpCode(200)
  dispensar(@Escopo() escopo: EscopoDaConta, @Param('id') pendenciaId: string): Promise<PendenciaDaPeca> {
    return this.tarefas.dispensar(escopo, id(pendenciaId));
  }

  @Post('pendencias/:id/reabrir')
  @HttpCode(200)
  reabrir(@Escopo() escopo: EscopoDaConta, @Param('id') pendenciaId: string): Promise<PendenciaDaPeca> {
    return this.tarefas.reabrir(escopo, id(pendenciaId));
  }

  @Get('tarefas/:id')
  consultar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string, @Res({ passthrough: true }) res: Response): Promise<Tarefa> {
    res.setHeader('Cache-Control', 'no-store');
    return this.tarefas.consultar(escopo, id(tarefaId));
  }

  /**
   * Os eventos da tarefa. Com `Accept: text/event-stream`, o fluxo (retoma por Last-Event-ID); sem, a leitura
   * em JSON a partir de `?depoisDe=`, para quem não pode manter conexão aberta.
   */
  @Get('tarefas/:id/eventos')
  async eventos(
    @Escopo() escopo: EscopoDaConta,
    @Param('id') tarefaId: string,
    @Query('depoisDe') depoisDe: string | undefined,
    @Headers('last-event-id') ultimoVisto: string | undefined,
    @Headers('accept') aceita: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const alvo = id(tarefaId);
    res.setHeader('Cache-Control', 'no-store, no-transform');
    if (!aceita?.includes('text/event-stream')) {
      const lido: EventosDaTarefa = await this.tarefas.eventos(escopo, alvo, cursorDe(depoisDe));
      res.json(lido);
      return;
    }
    // antes de abrir o fluxo: tarefa de outra conta responde 404 como qualquer rota, e não um fluxo vazio
    await this.tarefas.pulso(escopo, alvo);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    // proxy na frente não segura o fluxo em buffer
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let fechada = false;
    req.on('close', () => {
      fechada = true;
    });
    try {
      await transmitir(
        { pulso: () => this.tarefas.pulso(escopo, alvo), eventos: (depois) => this.tarefas.eventos(escopo, alvo, depois) },
        { escrever: (texto) => void res.write(texto), fechada: () => fechada },
        cursorDe(ultimoVisto ?? depoisDe),
      );
    } catch {
      // os cabeçalhos já saíram: não há como responder erro. Fecha, e o navegador reconecta de onde parou.
    } finally {
      res.end();
    }
  }

  /** A peça como era antes da tarefa. */
  @Get('tarefas/:id/antes')
  antes(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string, @Res({ passthrough: true }) res: Response): Promise<AntesDaTarefa> {
    res.setHeader('Cache-Control', 'no-store');
    return this.tarefas.antes(escopo, id(tarefaId));
  }

  /** O "pode". */
  @Post('tarefas/:id/aprovar')
  @HttpCode(200)
  aprovar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string): Promise<Tarefa> {
    return this.tarefas.aprovar(escopo, id(tarefaId));
  }

  @Post('tarefas/:id/ajustar')
  @HttpCode(200)
  ajustar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string, @Body() corpo: unknown): Promise<Tarefa> {
    return this.tarefas.ajustar(escopo, id(tarefaId), validar(PedidoDeAjusteDoPlano, corpo));
  }

  /** Cancelar na fila ou no "pode"; com a tarefa trabalhando, é o mesmo que interromper. */
  @Post('tarefas/:id/cancelar')
  @HttpCode(200)
  cancelar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string): Promise<Tarefa> {
    return this.tarefas.cancelar(escopo, id(tarefaId));
  }

  @Post('tarefas/:id/interromper')
  @HttpCode(200)
  interromper(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string): Promise<Tarefa> {
    return this.tarefas.cancelar(escopo, id(tarefaId));
  }

  @Post('tarefas/:id/aceitar')
  @HttpCode(200)
  aceitar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string): Promise<Tarefa> {
    return this.tarefas.aceitar(escopo, id(tarefaId));
  }

  @Post('tarefas/:id/desfazer')
  @HttpCode(200)
  desfazer(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string, @Body() corpo: unknown): Promise<RespostaDeDesfazerTarefa> {
    return this.tarefas.desfazer(escopo, id(tarefaId), validar(PedidoDeDesfazerTarefa, corpo));
  }

  @Post('tarefas/:id/descartar')
  @HttpCode(200)
  descartar(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string, @Body() corpo: unknown): Promise<RespostaDeDesfazerTarefa> {
    return this.tarefas.descartar(escopo, id(tarefaId), validar(PedidoDeDescartar, corpo));
  }

  /** 202: uma tarefa nova, com a mesma entrada. */
  @Post('tarefas/:id/tentar-de-novo')
  @HttpCode(202)
  tentarDeNovo(@Escopo() escopo: EscopoDaConta, @Param('id') tarefaId: string): Promise<Tarefa> {
    return this.tarefas.tentarDeNovo(escopo, id(tarefaId));
  }
}
