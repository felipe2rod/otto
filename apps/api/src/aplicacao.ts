// Montagem do processo. API e worker são o MESMO código com pontos de entrada diferentes
// (main.ts e worker.ts). O NestJS fica aqui e nas pastas presentation/ e infrastructure/;
// caso de uso e porta não o conhecem (ADR 008).
import 'reflect-metadata';
import { type DynamicModule, type INestApplication, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
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
import { BibliotecaDeFontes } from './biblioteca/application/biblioteca-de-fontes';
import { CasosDeUsoDeFontes } from './biblioteca/application/casos-de-uso-de-fontes';
import { BibliotecaDeFontesNoBanco } from './biblioteca/infrastructure/biblioteca-de-fontes-no-banco';
import { ControladorDeFontes } from './biblioteca/presentation/controlador-de-fontes';
import { CasosDeUsoDeDocumento } from './documento/application/casos-de-uso-de-documento';
import { MedidorDeTexto } from './documento/application/medidor-de-texto';
import { RepositorioDeDocumentos } from './documento/application/repositorio-de-documentos';
import { RepositorioDeDocumentosNoBanco } from './documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { MedidorComCanvasKit } from './documento/infrastructure/render/medidor-com-canvaskit';
import { ControladorDeDocumentos } from './documento/presentation/controlador-de-documentos';
import { type Configuracao, type ConfiguracaoDoArmazenamento, ConfiguracaoInvalida, lerConfiguracao } from './plataforma/config/configuracao';
import { FiltroDeErros } from './plataforma/erros/filtro-de-erros';
import { ResolvedorDeContaFixa } from './plataforma/escopo/adaptadores/resolvedor-de-conta-fixa';
import { ResolvedorDeEscopo } from './plataforma/escopo/resolvedor-de-escopo';
import { GuardaDeEscopo } from './plataforma/http/guarda-de-escopo';
import { registroDeRequisicoes } from './plataforma/http/registro-de-requisicoes';
import { uuidV7 } from './plataforma/identidade/uuid-v7';
import { Registro } from './plataforma/log/registro';
import { PrismaComEscopo } from './plataforma/persistencia/prisma-com-escopo';
import { SondaDoPrisma } from './plataforma/persistencia/sonda-do-prisma';
import { ControladorDeSaude } from './plataforma/saude/controlador-de-saude';
import { SondaDoBanco } from './plataforma/saude/sonda-do-banco';
import { CONFIGURACAO, SERVICO, type Servico } from './plataforma/servico';
import { RegistroDeUso } from './plataforma/uso/registro-de-uso';
import { RegistroDeUsoNoLog } from './plataforma/uso/registro-de-uso-no-log';

/** Fecha o pool do banco quando o processo recebe o sinal de término. */
class EncerramentoDoBanco implements OnApplicationShutdown {
  constructor(@Inject(PrismaComEscopo) private readonly prisma: PrismaComEscopo) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.fechar();
  }
}

function criarArmazenamento(config: ConfiguracaoDoArmazenamento): ArmazenamentoDeArquivo {
  return config.adaptador === 's3' ? new ArmazenamentoS3(config) : new ArmazenamentoEmDiscoLocal(config.pasta);
}

@Module({})
export class ModuloRaiz {
  /** Escolher adaptador é configuração, resolvida uma vez na subida (ADR 020, exigência 5). */
  static para(servico: Servico, config: Configuracao): DynamicModule {
    return {
      module: ModuloRaiz,
      // o worker só responde saúde; as rotas de negócio são da API
      controllers: servico === 'api' ? [ControladorDeSaude, ControladorDeDocumentos, ControladorDeArquivos, ControladorDeVetores, ControladorDeFontes] : [ControladorDeSaude],
      providers: [
        { provide: SERVICO, useValue: servico },
        { provide: CONFIGURACAO, useValue: config },
        { provide: Registro, useFactory: () => new Registro(servico, config) },
        { provide: PrismaComEscopo, useFactory: () => new PrismaComEscopo(config.banco.urlDoApp) },
        { provide: SondaDoBanco, useFactory: (prisma: PrismaComEscopo) => new SondaDoPrisma(prisma), inject: [PrismaComEscopo] },
        { provide: ArmazenamentoDeArquivo, useFactory: () => criarArmazenamento(config.armazenamento) },
        // Ponto único em que a conta é decidida. Sem login no MVP: conta fixa (suposição a confirmar).
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
        { provide: MedidorDeTexto, useFactory: (fontes: BibliotecaDeFontes) => new MedidorComCanvasKit(fontes), inject: [BibliotecaDeFontes] },
        // casos de uso: classes puras, montadas aqui
        {
          provide: CasosDeUsoDeDocumento,
          useFactory: (documentos: RepositorioDeDocumentos, arquivos: RepositorioDeArquivos, medidor: MedidorDeTexto, uso: RegistroDeUso) =>
            new CasosDeUsoDeDocumento(documentos, arquivos, medidor, uuidV7, uso),
          inject: [RepositorioDeDocumentos, RepositorioDeArquivos, MedidorDeTexto, RegistroDeUso],
        },
        {
          provide: CasosDeUsoDeArquivo,
          useFactory: (arquivos: RepositorioDeArquivos, armazenamento: ArmazenamentoDeArquivo, uso: RegistroDeUso) => new CasosDeUsoDeArquivo(arquivos, armazenamento, uuidV7, config.limites, uso),
          inject: [RepositorioDeArquivos, ArmazenamentoDeArquivo, RegistroDeUso],
        },
        { provide: CasosDeUsoDeFontes, useFactory: (fontes: BibliotecaDeFontes) => new CasosDeUsoDeFontes(fontes), inject: [BibliotecaDeFontes] },
        EncerramentoDoBanco,
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
    config = lerConfiguracao(env);
  } catch (e) {
    if (!(e instanceof ConfiguracaoInvalida)) throw e;
    process.stderr.write(`[${servico}] ${e.message}\n`);
    process.exit(1);
  }
  const app = await criarAplicacao(servico, config);
  await app.listen(config.porta, '0.0.0.0');
  app.get(Registro).log({ evento: 'no_ar', porta: config.porta });
}
