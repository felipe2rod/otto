// Montagem do processo. API e worker são o MESMO código com pontos de entrada diferentes
// (main.ts e worker.ts). O NestJS fica aqui e nas pastas presentation/ e infrastructure/;
// caso de uso e porta não o conhecem (ADR 008).
import 'reflect-metadata';
import { type DynamicModule, type INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LIMITES, TIPOS_DE_IMAGEM } from '@otto/shared';
import { ArmazenamentoDeArquivo } from './arquivo/application/armazenamento-de-arquivo';
import { CasosDeUsoDeArquivo } from './arquivo/application/casos-de-uso-de-arquivo';
import { RepositorioDeArquivos } from './arquivo/application/repositorio-de-arquivos';
import { ArmazenamentoEmDiscoLocal } from './arquivo/infrastructure/adaptadores/disco-local/armazenamento-em-disco-local';
import { ArmazenamentoS3 } from './arquivo/infrastructure/adaptadores/s3/armazenamento-s3';
import { RepositorioDeArquivosNoBanco } from './arquivo/infrastructure/prisma/repositorio-de-arquivos-no-banco';
import { ControladorDeArquivos, ControladorDeVetores } from './arquivo/presentation/controlador-de-arquivos';
import { ControladorDeLinks } from './arquivo/presentation/controlador-de-links';
import { BibliotecaDeFontes } from './biblioteca/application/biblioteca-de-fontes';
import { CasosDeUsoDeFontes } from './biblioteca/application/casos-de-uso-de-fontes';
import { CatalogoDeFontes } from './biblioteca/application/catalogo-de-fontes';
import { criarCatalogoDeFontes } from './biblioteca/infrastructure/adaptadores/criar-catalogo-de-fontes';
import { BibliotecaDeFontesNoBanco } from './biblioteca/infrastructure/biblioteca-de-fontes-no-banco';
import { ControladorDeFontes } from './biblioteca/presentation/controlador-de-fontes';
import { BriefingParaOOtto } from './briefing/application/briefing-para-o-otto';
import { CasosDeUsoDeCadastro } from './briefing/application/casos-de-uso-de-cadastro';
import { RepositorioDeCadastros } from './briefing/application/repositorio-de-cadastros';
import { RepositorioDeCadastrosNoBanco } from './briefing/infrastructure/prisma/repositorio-de-cadastros-no-banco';
import { ControladorDeBriefings, ControladorDeMarcas } from './briefing/presentation/controlador-de-cadastros';
import { CicloDeVida } from './ciclo-de-vida';
import { CasosDeUsoDeDocumento } from './documento/application/casos-de-uso-de-documento';
import { CasosDeUsoDeMiniatura, RenderDeMiniatura } from './documento/application/casos-de-uso-de-miniatura';
import { MedidorDeTexto } from './documento/application/medidor-de-texto';
import { RepositorioDeDocumentos } from './documento/application/repositorio-de-documentos';
import { RepositorioDeDocumentosNoBanco } from './documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { MedidorComCanvasKit } from './documento/infrastructure/render/medidor-com-canvaskit';
import { MiniaturaPelaBancada } from './documento/infrastructure/render/miniatura-pela-bancada';
import { ControladorDeDocumentos } from './documento/presentation/controlador-de-documentos';
import { CasosDeUsoDeExportacao, type FalhaObservada } from './exportacao/application/casos-de-uso-de-exportacao';
import { MotorDeExportacao } from './exportacao/application/motor-de-exportacao';
import { RepositorioDeExportacoes } from './exportacao/application/repositorio-de-exportacoes';
import { RepositorioDeExportacoesNoBanco } from './exportacao/infrastructure/prisma/repositorio-de-exportacoes-no-banco';
import { MotorDeExportacaoEmThread } from './exportacao/infrastructure/render/motor-em-thread';
import { ControladorDeExportacoes } from './exportacao/presentation/controlador-de-exportacoes';
import { BancoDeImagens } from './imagem/application/banco-de-imagens';
import { CacheDeBuscas } from './imagem/application/cache-de-buscas';
import { CasosDeUsoDeImagens } from './imagem/application/casos-de-uso-de-imagens';
import { criarBancoDeImagens } from './imagem/infrastructure/adaptadores/criar-banco-de-imagens';
import { CacheDeBuscasNoBanco } from './imagem/infrastructure/prisma/cache-de-buscas-no-banco';
import { ControladorDeImagens } from './imagem/presentation/controlador-de-imagens';
import { type Configuracao, type ConfiguracaoDoArmazenamento, ConfiguracaoInvalida, lerConfiguracao } from './plataforma/config/configuracao';
import { FiltroDeErros } from './plataforma/erros/filtro-de-erros';
import { ResolvedorDeContaFixa } from './plataforma/escopo/adaptadores/resolvedor-de-conta-fixa';
import { ResolvedorDeEscopo } from './plataforma/escopo/resolvedor-de-escopo';
import { BarramentoComPgBoss } from './plataforma/fila/adaptadores/pg-boss/barramento-com-pg-boss';
import { BarramentoDeEventos } from './plataforma/fila/barramento-de-eventos';
import { GuardaDeEscopo } from './plataforma/http/guarda-de-escopo';
import { registroDeRequisicoes } from './plataforma/http/registro-de-requisicoes';
import { uuidV7 } from './plataforma/identidade/uuid-v7';
import { Registro } from './plataforma/log/registro';
import { semConteudo } from './plataforma/log/sem-conteudo';
import { PrismaComEscopo } from './plataforma/persistencia/prisma-com-escopo';
import { SondaDoPrisma } from './plataforma/persistencia/sonda-do-prisma';
import { ControladorDeSaude } from './plataforma/saude/controlador-de-saude';
import { SondaDoBanco } from './plataforma/saude/sonda-do-banco';
import { CONFIGURACAO, SERVICO, type Servico } from './plataforma/servico';
import { RegistroDeUso } from './plataforma/uso/registro-de-uso';
import { RegistroDeUsoNoLog } from './plataforma/uso/registro-de-uso-no-log';
import { BancadaDoOtto } from './tarefa/application/bancada-do-otto';
import { BriefingDaTarefa } from './tarefa/application/briefing-da-tarefa';
import { CasosDeUsoDeTarefa, type FalhaDaTarefa } from './tarefa/application/casos-de-uso-de-tarefa';
import { ConsumoDoModelo } from './tarefa/application/consumo-do-modelo';
import { ModelosDoOtto } from './tarefa/application/modelos-do-otto';
import { RepositorioDeTarefas } from './tarefa/application/repositorio-de-tarefas';
import { ModelosComClaude } from './tarefa/infrastructure/adaptadores/claude/modelos-com-claude';
import { ModelosRoteirizados } from './tarefa/infrastructure/adaptadores/roteirizado/modelos-roteirizados';
import { ConsumoDoModeloNoBanco } from './tarefa/infrastructure/prisma/consumo-do-modelo-no-banco';
import { RepositorioDeTarefasNoBanco } from './tarefa/infrastructure/prisma/repositorio-de-tarefas-no-banco';
import { fontesDoOtto, imagensDoOtto } from './tarefa/infrastructure/recursos-do-otto';
import { BancadaComRender } from './tarefa/infrastructure/render/bancada-com-render';
import { tarefasDaPeca } from './tarefa/infrastructure/tarefas-da-peca';
import { ControladorDeTarefas } from './tarefa/presentation/controlador-de-tarefas';
import { CasosDeUsoDeTexturas } from './textura/application/casos-de-uso-de-texturas';
import { GeradorDeTexturas } from './textura/application/texturas';
import { GeradorComCanvasKit } from './textura/infrastructure/render/gerador-com-canvaskit';
import { ControladorDeTexturas } from './textura/presentation/controlador-de-texturas';

class SemModelo extends ModelosDoOtto {
  abrir(): never {
    throw new Error('este processo não chama o modelo: a tarefa do Otto roda no worker');
  }
}

function criarArmazenamento(config: ConfiguracaoDoArmazenamento): ArmazenamentoDeArquivo {
  return config.adaptador === 's3' ? new ArmazenamentoS3(config) : new ArmazenamentoEmDiscoLocal(config.pasta, config.segredoDeAssinatura);
}

@Module({})
export class ModuloRaiz {
  /** Escolher adaptador é configuração, resolvida uma vez na subida (ADR 020, exigência 5). */
  static para(servico: Servico, config: Configuracao): DynamicModule {
    return {
      module: ModuloRaiz,
      // o worker só responde saúde; as rotas de negócio são da API
      controllers:
        servico === 'api'
          ? [
              ControladorDeSaude,
              ControladorDeDocumentos,
              ControladorDeArquivos,
              ControladorDeVetores,
              ControladorDeLinks,
              ControladorDeFontes,
              ControladorDeExportacoes,
              ControladorDeTarefas,
              ControladorDeMarcas,
              ControladorDeBriefings,
              ControladorDeImagens,
              ControladorDeTexturas,
            ]
          : [ControladorDeSaude],
      providers: [
        { provide: SERVICO, useValue: servico },
        { provide: CONFIGURACAO, useValue: config },
        { provide: Registro, useFactory: () => new Registro(servico, config) },
        { provide: PrismaComEscopo, useFactory: () => new PrismaComEscopo(config.banco.urlDoApp) },
        { provide: SondaDoBanco, useFactory: (prisma: PrismaComEscopo) => new SondaDoPrisma(prisma), inject: [PrismaComEscopo] },
        { provide: ArmazenamentoDeArquivo, useFactory: () => criarArmazenamento(config.armazenamento) },
        // Ponto único em que a conta é decidida. Sem login no MVP: conta fixa (ADR 035).
        { provide: ResolvedorDeEscopo, useFactory: () => new ResolvedorDeContaFixa(config.contaFixaId) },
        { provide: APP_GUARD, useFactory: (resolvedor: ResolvedorDeEscopo) => new GuardaDeEscopo(resolvedor), inject: [ResolvedorDeEscopo] },
        { provide: RegistroDeUso, useFactory: (registro: Registro) => new RegistroDeUsoNoLog(registro), inject: [Registro] },
        // repositórios e adaptadores
        { provide: RepositorioDeDocumentos, useFactory: (prisma: PrismaComEscopo) => new RepositorioDeDocumentosNoBanco(prisma), inject: [PrismaComEscopo] },
        { provide: RepositorioDeArquivos, useFactory: (prisma: PrismaComEscopo) => new RepositorioDeArquivosNoBanco(prisma), inject: [PrismaComEscopo] },
        {
          provide: BibliotecaDeFontes,
          useFactory: (prisma: PrismaComEscopo, armazenamento: ArmazenamentoDeArquivo) => new BibliotecaDeFontesNoBanco(prisma, armazenamento),
          inject: [PrismaComEscopo, ArmazenamentoDeArquivo],
        },
        { provide: RepositorioDeExportacoes, useFactory: (prisma: PrismaComEscopo) => new RepositorioDeExportacoesNoBanco(prisma), inject: [PrismaComEscopo] },
        { provide: RepositorioDeCadastros, useFactory: (prisma: PrismaComEscopo) => new RepositorioDeCadastrosNoBanco(prisma), inject: [PrismaComEscopo] },
        { provide: CacheDeBuscas, useFactory: (prisma: PrismaComEscopo) => new CacheDeBuscasNoBanco(prisma), inject: [PrismaComEscopo] },
        // Banco de imagens e catálogo de fontes: adaptador escolhido pela configuração (ADR 020). Nulo: não configurado.
        { provide: BancoDeImagens, useFactory: () => criarBancoDeImagens(config.bancoDeImagens) ?? null },
        { provide: CatalogoDeFontes, useFactory: (armazenamento: ArmazenamentoDeArquivo) => criarCatalogoDeFontes(config.catalogoDeFontes, armazenamento) ?? null, inject: [ArmazenamentoDeArquivo] },
        // Quem desenha textura é o worker (é render); a API só entrega a que já está guardada.
        {
          provide: GeradorDeTexturas,
          useFactory: () => (servico === 'worker' ? new GeradorComCanvasKit() : null),
        },
        { provide: RepositorioDeTarefas, useFactory: (prisma: PrismaComEscopo) => new RepositorioDeTarefasNoBanco(prisma), inject: [PrismaComEscopo] },
        { provide: ConsumoDoModelo, useFactory: (prisma: PrismaComEscopo) => new ConsumoDoModeloNoBanco(prisma), inject: [PrismaComEscopo] },
        // O motor da bancada só é carregado na primeira tarefa: na API, nunca.
        {
          provide: BancadaDoOtto,
          useFactory: (fontes: BibliotecaDeFontes, arquivos: RepositorioDeArquivos, armazenamento: ArmazenamentoDeArquivo) => new BancadaComRender(fontes, arquivos, armazenamento),
          inject: [BibliotecaDeFontes, RepositorioDeArquivos, ArmazenamentoDeArquivo],
        },
        // Qual modelo responde é configuração (ADR 020): o de verdade, ou o roteirizado, que não gasta token.
        {
          provide: ModelosDoOtto,
          useFactory: (consumo: ConsumoDoModelo): ModelosDoOtto => {
            const modelo = config.agente.modelo;
            if (modelo.adaptador === 'claude') return new ModelosComClaude(modelo, consumo);
            if (modelo.adaptador === 'roteirizado') return new ModelosRoteirizados({ velocidade: modelo.velocidade });
            // a API não chama modelo, e não recebe a chave: quem roda a tarefa é o worker
            return new SemModelo();
          },
          inject: [ConsumoDoModelo],
        },
        // a fila mora no mesmo PostgreSQL; só o worker consome e faz a manutenção dela
        {
          provide: BarramentoDeEventos,
          useFactory: (registro: Registro) =>
            new BarramentoComPgBoss(config.banco.urlDoApp, { consumidor: servico === 'worker', aoErrar: (tipo) => registro.warn({ evento: 'erro_na_fila', erro: tipo }) }),
          inject: [Registro],
        },
        // As threads do motor só nascem na primeira exportação: na API, nunca. No worker, uma por exportação
        // ao mesmo tempo.
        { provide: MotorDeExportacao, useFactory: () => new MotorDeExportacaoEmThread({ threads: config.worker.exportacoesAoMesmoTempo }) },
        { provide: MedidorDeTexto, useFactory: (fontes: BibliotecaDeFontes) => new MedidorComCanvasKit(fontes), inject: [BibliotecaDeFontes] },
        // A miniatura da peça é desenhada pela bancada de render do worker (na thread de render).
        { provide: RenderDeMiniatura, useFactory: (bancada: BancadaDoOtto) => new MiniaturaPelaBancada(bancada), inject: [BancadaDoOtto] },
        {
          provide: CasosDeUsoDeMiniatura,
          useFactory: (documentos: RepositorioDeDocumentos, armazenamento: ArmazenamentoDeArquivo, fila: BarramentoDeEventos, render: RenderDeMiniatura, uso: RegistroDeUso) =>
            new CasosDeUsoDeMiniatura({ documentos, armazenamento, fila, render, uso }),
          inject: [RepositorioDeDocumentos, ArmazenamentoDeArquivo, BarramentoDeEventos, RenderDeMiniatura, RegistroDeUso],
        },
        // casos de uso: classes puras, montadas aqui
        {
          provide: CasosDeUsoDeDocumento,
          useFactory: (
            documentos: RepositorioDeDocumentos,
            arquivos: RepositorioDeArquivos,
            medidor: MedidorDeTexto,
            uso: RegistroDeUso,
            fontes: BibliotecaDeFontes,
            tarefas: RepositorioDeTarefas,
            sobDemanda: CasosDeUsoDeFontes,
            miniaturas: CasosDeUsoDeMiniatura,
          ) => new CasosDeUsoDeDocumento(documentos, arquivos, medidor, uuidV7, uso, fontes, tarefasDaPeca(tarefas, uso), sobDemanda, miniaturas),
          inject: [RepositorioDeDocumentos, RepositorioDeArquivos, MedidorDeTexto, RegistroDeUso, BibliotecaDeFontes, RepositorioDeTarefas, CasosDeUsoDeFontes, CasosDeUsoDeMiniatura],
        },
        {
          provide: CasosDeUsoDeArquivo,
          useFactory: (arquivos: RepositorioDeArquivos, armazenamento: ArmazenamentoDeArquivo, uso: RegistroDeUso) => new CasosDeUsoDeArquivo(arquivos, armazenamento, uuidV7, config.limites, uso),
          inject: [RepositorioDeArquivos, ArmazenamentoDeArquivo, RegistroDeUso],
        },
        {
          provide: CasosDeUsoDeExportacao,
          useFactory: (
            documentos: RepositorioDeDocumentos,
            exportacoes: RepositorioDeExportacoes,
            arquivos: RepositorioDeArquivos,
            armazenamento: ArmazenamentoDeArquivo,
            fontes: BibliotecaDeFontes,
            fila: BarramentoDeEventos,
            motor: MotorDeExportacao,
            uso: RegistroDeUso,
            registro: Registro,
          ) =>
            new CasosDeUsoDeExportacao({
              documentos,
              exportacoes,
              arquivos,
              armazenamento,
              fontes,
              fila,
              motor,
              gerarId: uuidV7,
              uso,
              aoFalhar: (falha: FalhaObservada) => registro.warn({ evento: 'falha_na_exportacao', exportacaoId: falha.exportacaoId, etapa: falha.etapa, ...semConteudo(falha.erro) }),
            }),
          inject: [
            RepositorioDeDocumentos,
            RepositorioDeExportacoes,
            RepositorioDeArquivos,
            ArmazenamentoDeArquivo,
            BibliotecaDeFontes,
            BarramentoDeEventos,
            MotorDeExportacao,
            RegistroDeUso,
            Registro,
          ],
        },
        {
          provide: CasosDeUsoDeTarefa,
          useFactory: (
            tarefas: RepositorioDeTarefas,
            documentos: RepositorioDeDocumentos,
            pecas: CasosDeUsoDeDocumento,
            fila: BarramentoDeEventos,
            bancada: BancadaDoOtto,
            modelos: ModelosDoOtto,
            consumo: ConsumoDoModelo,
            uso: RegistroDeUso,
            registro: Registro,
            briefing: BriefingDaTarefa,
            imagens: CasosDeUsoDeImagens,
            banco: BancoDeImagens | null,
            texturas: CasosDeUsoDeTexturas,
            fontes: CasosDeUsoDeFontes,
            catalogo: CatalogoDeFontes | null,
            miniaturas: CasosDeUsoDeMiniatura,
          ) =>
            new CasosDeUsoDeTarefa({
              tarefas,
              documentos,
              pecas,
              fila,
              bancada,
              modelos,
              consumo,
              // com o modelo roteirizado não há consumo de verdade: o teto diário de tokens não recusa nem conta
              limites: { ...config.agente, contarConsumo: config.agente.modeloDeVerdade },
              gerarId: uuidV7,
              uso,
              alavancas: config.agente.alavancas,
              aoParar: (escopo, documentoId) => miniaturas.pedirAgora(escopo, documentoId),
              briefing,
              // as ferramentas que o Otto recebe dependem do que este servidor tem configurado
              ...(banco ? { imagens: imagensDoOtto(imagens) } : {}),
              texturas,
              ...(catalogo ? { fontes: fontesDoOtto(fontes) } : {}),
              // só o tipo do erro: a mensagem pode citar a peça
              aoFalhar: (falha: FalhaDaTarefa) => registro.warn({ evento: 'falha_na_tarefa', tarefaId: falha.tarefaId, etapa: falha.etapa, ...semConteudo(falha.erro) }),
            }),
          inject: [
            RepositorioDeTarefas,
            RepositorioDeDocumentos,
            CasosDeUsoDeDocumento,
            BarramentoDeEventos,
            BancadaDoOtto,
            ModelosDoOtto,
            ConsumoDoModelo,
            RegistroDeUso,
            Registro,
            BriefingDaTarefa,
            CasosDeUsoDeImagens,
            BancoDeImagens,
            CasosDeUsoDeTexturas,
            CasosDeUsoDeFontes,
            CatalogoDeFontes,
            CasosDeUsoDeMiniatura,
          ],
        },
        {
          provide: CasosDeUsoDeFontes,
          useFactory: (fontes: BibliotecaDeFontes, catalogo: CatalogoDeFontes | null, registro: Registro) =>
            new CasosDeUsoDeFontes(fontes, catalogo ?? undefined, {
              // só contagens: qual fonte uma peça usa é conteúdo (ADR 031)
              aoBaixar: (b) => registro.log({ evento: 'fonte_baixada', pesos: b.pesos, bytes: b.bytes, duracaoMs: b.duracaoMs }),
              aoFalhar: (motivo) => registro.warn({ evento: 'catalogo_de_fontes_indisponivel', erro: motivo }),
            }),
          inject: [BibliotecaDeFontes, CatalogoDeFontes, Registro],
        },
        {
          provide: CasosDeUsoDeCadastro,
          useFactory: (cadastros: RepositorioDeCadastros, arquivos: RepositorioDeArquivos, uso: RegistroDeUso) => new CasosDeUsoDeCadastro({ cadastros, arquivos, gerarId: uuidV7, uso }),
          inject: [RepositorioDeCadastros, RepositorioDeArquivos, RegistroDeUso],
        },
        {
          provide: CasosDeUsoDeImagens,
          useFactory: (banco: BancoDeImagens | null, cache: CacheDeBuscas, arquivos: CasosDeUsoDeArquivo, registros: RepositorioDeArquivos, uso: RegistroDeUso, registro: Registro) =>
            new CasosDeUsoDeImagens({
              ...(banco ? { banco } : {}),
              cache,
              arquivos,
              registros,
              limites: config.imagens,
              uso,
              aoFalhar: (motivo) => registro.warn({ evento: 'banco_de_imagens_indisponivel', erro: motivo }),
            }),
          inject: [BancoDeImagens, CacheDeBuscas, CasosDeUsoDeArquivo, RepositorioDeArquivos, RegistroDeUso, Registro],
        },
        {
          provide: CasosDeUsoDeTexturas,
          useFactory: (armazenamento: ArmazenamentoDeArquivo, arquivos: CasosDeUsoDeArquivo, gerador: GeradorDeTexturas | null, uso: RegistroDeUso) =>
            new CasosDeUsoDeTexturas({ armazenamento, arquivos, uso, ...(gerador ? { gerador } : {}) }),
          inject: [ArmazenamentoDeArquivo, CasosDeUsoDeArquivo, GeradorDeTexturas, RegistroDeUso],
        },
        {
          provide: BriefingDaTarefa,
          useFactory: (cadastros: RepositorioDeCadastros, registros: RepositorioDeArquivos, arquivos: CasosDeUsoDeArquivo) => new BriefingParaOOtto({ cadastros, registros, arquivos }),
          inject: [RepositorioDeCadastros, RepositorioDeArquivos, CasosDeUsoDeArquivo],
        },
        {
          provide: CicloDeVida,
          useFactory: (
            prisma: PrismaComEscopo,
            fila: BarramentoDeEventos,
            exportacoes: CasosDeUsoDeExportacao,
            registro: Registro,
            motorDeExportacao: MotorDeExportacao,
            tarefas: CasosDeUsoDeTarefa,
            bancada: BancadaDoOtto,
            miniaturas: CasosDeUsoDeMiniatura,
          ) =>
            new CicloDeVida(
              servico,
              prisma,
              fila,
              exportacoes,
              registro,
              {
                exportacoesAoMesmoTempo: config.worker.exportacoesAoMesmoTempo,
                tarefasAoMesmoTempo: config.worker.tarefasAoMesmoTempo,
                // as threads de render: as da exportação e a da tarefa do Otto
                motor: { fechar: async () => void (await Promise.all([motorDeExportacao.fechar(), bancada.fechar()])) },
              },
              tarefas,
              miniaturas,
            ),
          inject: [PrismaComEscopo, BarramentoDeEventos, CasosDeUsoDeExportacao, Registro, MotorDeExportacao, CasosDeUsoDeTarefa, BancadaDoOtto, CasosDeUsoDeMiniatura],
        },
      ],
    };
  }
}

/** O que vale para a aplicação inteira, igual no processo de verdade e no teste. */
/**
 * A aplicação precisa ser criada com `bodyParser: false`: os leitores de corpo são os daqui, com limite.
 */
export function configurarAplicacao(app: INestApplication): INestApplication {
  const config = app.get<Configuracao>(CONFIGURACAO);
  const registro = app.get(Registro);
  const http = app as NestExpressApplication;
  http.disable('x-powered-by');
  // primeiro de tudo: toda resposta, inclusive a de erro de leitura de corpo, sai com correlação e vai para o log
  http.use(registroDeRequisicoes(registro));
  // corpo: JSON para as rotas de documento, bytes para envio de imagem, texto para SVG. Cada um com teto.
  http.useBodyParser('json', { limit: LIMITES.bytesDoLote });
  http.useBodyParser('raw', { type: [...TIPOS_DE_IMAGEM, 'application/octet-stream'], limit: config.limites.bytesPorArquivo });
  http.useBodyParser('text', { type: ['image/svg+xml', 'text/plain', 'application/xml', 'text/xml'], limit: LIMITES.bytesDoSvg });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FiltroDeErros(registro, config.limites.bytesPorArquivo));
  app.enableShutdownHooks();
  return app;
}

export async function criarAplicacao(servico: Servico, config: Configuracao): Promise<INestApplication> {
  const app = await NestFactory.create(ModuloRaiz.para(servico, config), { logger: new Registro(servico, config), bodyParser: false });
  return configurarAplicacao(app);
}

/** Ponto de entrada comum de main.ts e worker.ts. Configuração inválida: sai com erro antes de abrir porta. */
export async function iniciar(servico: Servico, env: Record<string, string | undefined>): Promise<void> {
  let config: Configuracao;
  try {
    config = lerConfiguracao(env, servico);
  } catch (e) {
    if (!(e instanceof ConfiguracaoInvalida)) throw e;
    process.stderr.write(`[${servico}] ${e.message}\n`);
    process.exit(1);
  }
  const app = await criarAplicacao(servico, config);
  await app.listen(config.porta, '0.0.0.0');
  app.get(Registro).log({ evento: 'no_ar', porta: config.porta });
}
