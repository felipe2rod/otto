// Rotas de saúde, sem sessão e sem dado nenhum além do estado (docs/mvp/backend.md, 7.8).
//   vivo:   o processo está de pé? Não consulta dependência (senão banco fora derruba o contêiner).
//   pronto: banco, armazenamento e fila respondem? 503 se algum não responde.
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { NOME_DO_PACOTE } from '@otto/documento';
import type { RespostaDeSaude } from '@otto/shared';
import { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { BarramentoDeEventos } from '../fila/barramento-de-eventos';
import { SERVICO, type Servico } from '../servico';
import { SondaDoBanco } from './sonda-do-banco';

/** O mínimo da resposta HTTP de que esta rota precisa: o controlador não importa o Express (ADR 009). */
interface RespostaComStatus {
  status(codigo: number): unknown;
}

@Controller('saude')
export class ControladorDeSaude {
  // Injeção sempre por token explícito: nada aqui depende de metadado de tipo emitido pelo compilador.
  constructor(
    @Inject(SERVICO) private readonly servico: Servico,
    @Inject(SondaDoBanco) private readonly banco: SondaDoBanco,
    @Inject(ArmazenamentoDeArquivo) private readonly armazenamento: ArmazenamentoDeArquivo,
    @Inject(BarramentoDeEventos) private readonly fila: BarramentoDeEventos,
  ) {}

  @Get('vivo')
  vivo(): RespostaDeSaude {
    return { estado: 'vivo', servico: this.servico, nucleo: NOME_DO_PACOTE };
  }

  @Get('pronto')
  async pronto(@Res({ passthrough: true }) resposta: RespostaComStatus): Promise<RespostaDeSaude> {
    const [banco, armazenamento, fila] = await Promise.all([this.banco.responde(), this.armazenamento.responde(), this.fila.responde()]);
    const pronto = banco && armazenamento && fila;
    if (!pronto) resposta.status(503);
    return { estado: pronto ? 'pronto' : 'indisponivel', servico: this.servico, nucleo: NOME_DO_PACOTE, dependencias: { banco, armazenamento, fila } };
  }
}
