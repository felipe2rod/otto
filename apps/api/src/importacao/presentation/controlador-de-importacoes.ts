// Rotas da importação de PSD (docs/mvp/backend.md, 17.14). Controlador fino: lê o corpo com teto, valida com o
// esquema do contrato e repassa o escopo. Nenhuma rota decodifica pixel: o trabalho pesado é do worker.
// Nenhuma rota recebe nem devolve chave de objeto.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { CODIGOS_DE_ERRO, type Importacao, type ListaDeImportacoes, PedidoDeImportacao, TIPO_DO_PSD } from '@otto/shared';
import type { Request, Response } from 'express';
import type { Configuracao } from '../../plataforma/config/configuracao';
import { ErroDaAplicacao, PedidoInvalido } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { Escopo } from '../../plataforma/http/escopo';
import { CorpoGrandeDemais, CorpoInterrompido, lerCorpoComTeto } from '../../plataforma/http/ler-corpo';
import { validar } from '../../plataforma/http/validar';
import { CONFIGURACAO } from '../../plataforma/servico';
import { CasosDeUsoDeImportacao } from '../application/casos-de-uso-de-importacao';

/** Nome do arquivo no computador da pessoa, codificado como em URL. É conteúdo: nunca vai para o log. */
const CABECALHO_DO_NOME = 'x-otto-nome-do-arquivo';
/** O tipo é só o que deixa o envio entrar por esta rota: quem diz se é PSD são os bytes. */
const TIPOS_DECLARADOS: readonly string[] = [TIPO_DO_PSD, 'application/x-photoshop', 'application/octet-stream'];
/**
 * Quantos envios este processo lê ao mesmo tempo. Cada um segura o arquivo inteiro em memória (até o teto): sem
 * isto, uma dúzia de envios juntos passa da memória da API. Sem login, é por processo; com login, vira por conta.
 */
export const ENVIOS_AO_MESMO_TEMPO = 2;

function nomeDoArquivo(req: Request): string | undefined {
  const bruto = req.get(CABECALHO_DO_NOME);
  if (!bruto || bruto.length > 2000) return undefined;
  try {
    return decodeURIComponent(bruto);
  } catch {
    return undefined;
  }
}

@Controller()
export class ControladorDeImportacoes {
  private readonly limiteEmBytes: number;
  private enviosEmCurso = 0;

  constructor(
    @Inject(CasosDeUsoDeImportacao) private readonly importacoes: CasosDeUsoDeImportacao,
    @Inject(CONFIGURACAO) config: Configuracao,
  ) {
    this.limiteEmBytes = config.importacao.bytesDoArquivo;
  }

  /** 201: o arquivo passou na conferência e espera o pedido de importação. */
  @Post('importacoes')
  @HttpCode(201)
  async enviar(@Escopo() escopo: EscopoDaConta, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Importacao> {
    if (this.enviosEmCurso >= ENVIOS_AO_MESMO_TEMPO) {
      // recusa sem ler o corpo: é para isso que o freio existe
      res.setHeader('Connection', 'close');
      res.setHeader('Retry-After', '5');
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeImportacoes, { motivo: 'envios_ao_mesmo_tempo', limite: ENVIOS_AO_MESMO_TEMPO });
    }
    this.enviosEmCurso++;
    try {
      const conteudo = await this.corpo(req, res);
      const nome = nomeDoArquivo(req);
      return await this.importacoes.enviar(escopo, conteudo, nome ? { nome } : {});
    } finally {
      this.enviosEmCurso--;
    }
  }

  private async corpo(req: Request, res: Response): Promise<Uint8Array> {
    const declarado = (req.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!TIPOS_DECLARADOS.includes(declarado)) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.tipoNaoAceito);
    // arquivo pequeno com tipo genérico já foi lido pelo leitor geral de bytes
    if (Buffer.isBuffer(req.body)) return req.body;
    try {
      return await lerCorpoComTeto(req, res, this.limiteEmBytes);
    } catch (erro) {
      if (erro instanceof CorpoGrandeDemais) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoGrandeDemais, { limiteEmBytes: erro.limiteEmBytes });
      if (erro instanceof CorpoInterrompido) throw new PedidoInvalido(['corpo']);
      throw erro;
    }
  }

  /** 202: aceito e na fila. O resultado se acompanha em GET /api/importacoes/:id. */
  @Post('importacoes/:id/importar')
  @HttpCode(202)
  pedir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Body() corpo: unknown): Promise<Importacao> {
    return this.importacoes.pedir(escopo, id, validar(PedidoDeImportacao, corpo ?? {}));
  }

  /** As importações em curso e as recentes da conta: é como a tela retoma depois de recarregar a página. */
  @Get('importacoes')
  listar(@Escopo() escopo: EscopoDaConta, @Res({ passthrough: true }) res: Response): Promise<ListaDeImportacoes> {
    res.setHeader('Cache-Control', 'no-store');
    return this.importacoes.listar(escopo);
  }

  @Get('importacoes/:id')
  consultar(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<Importacao> {
    res.setHeader('Cache-Control', 'no-store');
    return this.importacoes.consultar(escopo, id);
  }

  /** Desiste de um arquivo enviado e ainda não importado. */
  @Delete('importacoes/:id')
  @HttpCode(204)
  async desistir(@Escopo() escopo: EscopoDaConta, @Param('id') id: string): Promise<void> {
    await this.importacoes.desistir(escopo, id);
  }

  /** O relatório da importação que criou a peça. */
  @Get('documentos/:id/importacao')
  daPeca(@Escopo() escopo: EscopoDaConta, @Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<Importacao> {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.importacoes.daPeca(escopo, id);
  }
}
