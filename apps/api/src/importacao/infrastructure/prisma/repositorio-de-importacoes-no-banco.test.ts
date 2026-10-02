import { randomUUID } from 'node:crypto';
import { documentoVazio } from '@otto/documento';
import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { RepositorioDeDocumentosNoBanco } from '../../../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeImportacoes } from '../../application/repositorio-de-importacoes.contrato';
import { RepositorioDeImportacoesNoBanco } from './repositorio-de-importacoes-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeImportacoes('PostgreSQL com RLS', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  const documentos = new RepositorioDeDocumentosNoBanco(prisma);
  return {
    repositorio: new RepositorioDeImportacoesNoBanco(prisma),
    novaConta: () => criarContaDeTeste(),
    criarPeca: async (escopo, importacaoId) => (await documentos.criar(escopo, { id: randomUUID(), nome: 'importada', arvore: documentoVazio(), importacaoId })).id,
  };
});
