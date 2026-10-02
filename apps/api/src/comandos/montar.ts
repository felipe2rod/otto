// Monta os casos de uso para um comando de terminal, SEM NestJS: é a prova de que as regras
// rodam fora do framework (ADR 008). Mesma configuração e mesmos adaptadores da API.
import { CasosDeUsoDeArquivo } from '../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmDiscoLocal } from '../arquivo/infrastructure/adaptadores/disco-local/armazenamento-em-disco-local';
import { ArmazenamentoS3 } from '../arquivo/infrastructure/adaptadores/s3/armazenamento-s3';
import { RepositorioDeArquivosNoBanco } from '../arquivo/infrastructure/prisma/repositorio-de-arquivos-no-banco';
import { BibliotecaDeFontesNoBanco } from '../biblioteca/infrastructure/biblioteca-de-fontes-no-banco';
import { CasosDeUsoDeDocumento } from '../documento/application/casos-de-uso-de-documento';
import { RepositorioDeDocumentosNoBanco } from '../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { MedidorComCanvasKit } from '../documento/infrastructure/render/medidor-com-canvaskit';
import { type Configuracao, ConfiguracaoInvalida, lerConfiguracao } from '../plataforma/config/configuracao';
import { ResolvedorDeContaFixa } from '../plataforma/escopo/adaptadores/resolvedor-de-conta-fixa';
import { uuidV7 } from '../plataforma/identidade/uuid-v7';
import { PrismaComEscopo } from '../plataforma/persistencia/prisma-com-escopo';
import { CasosDeUsoDeTexturas } from '../textura/application/casos-de-uso-de-texturas';
import { GeradorComCanvasKit } from '../textura/infrastructure/render/gerador-com-canvaskit';

export function montarComando(env: Record<string, string | undefined>) {
  let config: Configuracao;
  try {
    // como a API: o comando não chama o modelo, e não exige a chave dele
    config = lerConfiguracao(env, 'api');
  } catch (e) {
    if (!(e instanceof ConfiguracaoInvalida)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
  const prisma = new PrismaComEscopo(config.banco.urlDoApp, { conexoes: 2, tempoLimiteMs: 30_000 });
  const armazenamento =
    config.armazenamento.adaptador === 's3' ? new ArmazenamentoS3(config.armazenamento) : new ArmazenamentoEmDiscoLocal(config.armazenamento.pasta, config.armazenamento.segredoDeAssinatura);
  const documentos = new RepositorioDeDocumentosNoBanco(prisma);
  const registros = new RepositorioDeArquivosNoBanco(prisma);
  const arquivos = new CasosDeUsoDeArquivo(registros, armazenamento, uuidV7, config.limites);
  const fontes = new BibliotecaDeFontesNoBanco(prisma, armazenamento);
  // o comando tem o motor de render (não é requisição): é ele que desenha as texturas do Otto
  const texturas = new CasosDeUsoDeTexturas({ armazenamento, arquivos, gerador: new GeradorComCanvasKit() });
  const pecas = new CasosDeUsoDeDocumento(documentos, registros, new MedidorComCanvasKit(fontes), uuidV7, undefined, fontes);
  return {
    config,
    documentos,
    arquivos,
    fontes,
    texturas,
    pecas,
    /** A conta do comando: a mesma que a API resolve (sem login, a conta fixa). */
    escopo: () => new ResolvedorDeContaFixa(config.contaFixaId).resolverDaRequisicao(undefined),
    fechar: () => prisma.fechar(),
  };
}
