import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeArquivos } from '../../application/repositorio-de-arquivos.contrato';
import { RepositorioDeArquivosNoBanco } from './repositorio-de-arquivos-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeArquivos('PostgreSQL com RLS', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  return { repositorio: new RepositorioDeArquivosNoBanco(prisma), contaA: await criarContaDeTeste(), contaB: await criarContaDeTeste() };
});
