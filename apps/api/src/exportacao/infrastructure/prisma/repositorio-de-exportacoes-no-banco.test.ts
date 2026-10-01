import { randomUUID } from 'node:crypto';
import { documentoVazio } from '@otto/documento';
import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { RepositorioDeDocumentosNoBanco } from '../../../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeExportacoes } from '../../application/repositorio-de-exportacoes.contrato';
import { RepositorioDeExportacoesNoBanco } from './repositorio-de-exportacoes-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeExportacoes('PostgreSQL com RLS', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  const documentos = new RepositorioDeDocumentosNoBanco(prisma);
  return {
    repositorio: new RepositorioDeExportacoesNoBanco(prisma),
    contaA: await criarContaDeTeste(),
    contaB: await criarContaDeTeste(),
    criarDocumento: async (escopo) => (await documentos.criar(escopo, { id: randomUUID(), nome: 'doc', arvore: documentoVazio() })).id,
  };
});
