import { afterAll } from 'vitest';
import { urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoCacheDeBuscas } from '../../application/cache-de-buscas.contrato';
import { CacheDeBuscasNoBanco } from './cache-de-buscas-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoCacheDeBuscas('PostgreSQL (catálogo global)', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  return new CacheDeBuscasNoBanco(prisma);
});
