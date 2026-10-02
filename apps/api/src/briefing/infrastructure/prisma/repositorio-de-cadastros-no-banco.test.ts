import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeCadastros } from '../../application/repositorio-de-cadastros.contrato';
import { RepositorioDeCadastrosNoBanco } from './repositorio-de-cadastros-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeCadastros('PostgreSQL com RLS', async () => {
  prisma ??= new PrismaComEscopo(urlDoAppDeTeste());
  return { repositorio: new RepositorioDeCadastrosNoBanco(prisma), contaA: await criarContaDeTeste(), contaB: await criarContaDeTeste() };
});
