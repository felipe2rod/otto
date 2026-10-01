import { afterAll } from 'vitest';
import { urlDoAppDeTeste } from '../../../testes/banco/conexoes';
import { ArmazenamentoEmMemoria } from '../../arquivo/infrastructure/adaptadores/memoria/armazenamento-em-memoria';
import { PrismaComEscopo } from '../../plataforma/persistencia/prisma-com-escopo';
import { contratoDaBibliotecaDeFontes } from '../application/biblioteca-de-fontes.contrato';
import { BibliotecaDeFontesNoBanco } from './biblioteca-de-fontes-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDaBibliotecaDeFontes('PostgreSQL (catálogo global) e armazenamento', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  return new BibliotecaDeFontesNoBanco(prisma, new ArmazenamentoEmMemoria());
});
