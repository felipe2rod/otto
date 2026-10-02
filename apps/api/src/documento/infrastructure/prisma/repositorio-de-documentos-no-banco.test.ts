import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { RepositorioDeCadastrosNoBanco } from '../../../briefing/infrastructure/prisma/repositorio-de-cadastros-no-banco';
import { RepositorioDeImportacoesNoBanco } from '../../../importacao/infrastructure/prisma/repositorio-de-importacoes-no-banco';
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
    criarImportacao: async (escopo) => {
      const id = randomUUID();
      const agora = new Date();
      const nova = {
        id,
        nomeDoArquivo: 'a.psd',
        bytes: 10,
        sha256: 'a'.repeat(64),
        formato: 'psd' as const,
        largura: 10,
        altura: 10,
        camadas: 1,
        fontes: [],
        chaveDoObjeto: `contas/x/importacoes/${id}/original.psd`,
      };
      await new RepositorioDeImportacoesNoBanco(banco).criarSeCouber(escopo, { ...nova, criadaEm: agora, expiraEm: new Date(agora.getTime() + 86_400_000) }, 100);
      return id;
    },
  };
});
