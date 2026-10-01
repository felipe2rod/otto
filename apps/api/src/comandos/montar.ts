// Monta os casos de uso para um comando de terminal, SEM NestJS: é a prova de que as regras
// rodam fora do framework (ADR 008). Mesma configuração e mesmos adaptadores da API.
import { CasosDeUsoDeArquivo } from '../arquivo/application/casos-de-uso-de-arquivo';
import { ArmazenamentoEmDiscoLocal } from '../arquivo/infrastructure/adaptadores/disco-local/armazenamento-em-disco-local';
import { ArmazenamentoS3 } from '../arquivo/infrastructure/adaptadores/s3/armazenamento-s3';
import { RepositorioDeArquivosNoBanco } from '../arquivo/infrastructure/prisma/repositorio-de-arquivos-no-banco';
import { BibliotecaDeFontesNoBanco } from '../biblioteca/infrastructure/biblioteca-de-fontes-no-banco';
import { RepositorioDeDocumentosNoBanco } from '../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { type Configuracao, ConfiguracaoInvalida, lerConfiguracao } from '../plataforma/config/configuracao';
import { ResolvedorDeContaFixa } from '../plataforma/escopo/adaptadores/resolvedor-de-conta-fixa';
import { uuidV7 } from '../plataforma/identidade/uuid-v7';
import { PrismaComEscopo } from '../plataforma/persistencia/prisma-com-escopo';

export function montarComando(env: Record<string, string | undefined>) {
  let config: Configuracao;
  try {
    config = lerConfiguracao(env);
  } catch (e) {
    if (!(e instanceof ConfiguracaoInvalida)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
  const prisma = new PrismaComEscopo(config.banco.urlDoApp, { conexoes: 2, tempoLimiteMs: 30_000 });
  const armazenamento =
    config.armazenamento.adaptador === 's3' ? new ArmazenamentoS3(config.armazenamento) : new ArmazenamentoEmDiscoLocal(config.armazenamento.pasta, config.armazenamento.segredoDeAssinatura);
  const documentos = new RepositorioDeDocumentosNoBanco(prisma);
  const arquivos = new CasosDeUsoDeArquivo(new RepositorioDeArquivosNoBanco(prisma), armazenamento, uuidV7, config.limites);
  const fontes = new BibliotecaDeFontesNoBanco(prisma, armazenamento);
  return {
    config,
    documentos,
    arquivos,
    fontes,
    /** A conta do comando: a mesma que a API resolve (sem login, a conta fixa). */
    escopo: () => new ResolvedorDeContaFixa(config.contaFixaId).resolverDaRequisicao(undefined),
    fechar: () => prisma.fechar(),
  };
}
