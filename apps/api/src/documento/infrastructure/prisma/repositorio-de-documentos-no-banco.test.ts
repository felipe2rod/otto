import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { RepositorioDeCadastrosNoBanco } from '../../../briefing/infrastructure/prisma/repositorio-de-cadastros-no-banco';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeDocumentos } from '../../application/repositorio-de-documentos.contrato';
import { RepositorioDeDocumentosNoBanco } from './repositorio-de-documentos-no-banco';

let prisma: PrismaComEscopo | undefined;
afterAll(async () => {
  await prisma?.fechar();
});

contratoDoRepositorioDeDocumentos('PostgreSQL com RLS', async () => {
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
  const banco = prisma;
  return {
    repositorio: new RepositorioDeDocumentosNoBanco(prisma),
    contaA: await criarContaDeTeste(),
    contaB: await criarContaDeTeste(),
    criarMarca: async (escopo) => {
      const criada = await new RepositorioDeCadastrosNoBanco(banco).criarMarca(escopo, { id: randomUUID(), dados: { nome: 'marca', cores: {}, icones: [], restricoes: [] }, agora: new Date() }, 100);
      if (criada === 'limite') throw new Error('a marca de teste não foi criada');
      return criada.id;
    },
  };
});
