import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeDocumentos } from '../../application/repositorio-de-documentos.contrato';
import { RepositorioDeDocumentosNoBanco } from './repositorio-de-documentos-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeDocumentos('PostgreSQL com RLS', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  return { repositorio: new RepositorioDeDocumentosNoBanco(prisma), contaA: await criarContaDeTeste(), contaB: await criarContaDeTeste() };
});
