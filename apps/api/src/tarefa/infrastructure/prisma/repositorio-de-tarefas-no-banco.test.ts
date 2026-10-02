import { randomUUID } from 'node:crypto';
import { documentoVazio } from '@otto/documento';
import { afterAll, describe, expect, it } from 'vitest';
import { criarContaDeTeste, urlDoAppDeTeste } from '../../../../testes/banco/conexoes';
import { RepositorioDeDocumentosNoBanco } from '../../../documento/infrastructure/prisma/repositorio-de-documentos-no-banco';
import { PrismaComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
import { contratoDoRepositorioDeTarefas } from '../../application/repositorio-de-tarefas.contrato';
import { ConsumoDoModeloNoBanco } from './consumo-do-modelo-no-banco';
import { RepositorioDeTarefasNoBanco } from './repositorio-de-tarefas-no-banco';

const prisma = new PrismaComEscopo(urlDoAppDeTeste());
afterAll(() => prisma.fechar());
const documentos = new RepositorioDeDocumentosNoBanco(prisma);

contratoDoRepositorioDeTarefas('PostgreSQL com RLS', async () => ({
  repositorio: new RepositorioDeTarefasNoBanco(prisma),
  contaA: await criarContaDeTeste(),
  contaB: await criarContaDeTeste(),
  criarDocumento: async (escopo, versao = 0) => {
    const doc = await documentos.criar(escopo, { id: randomUUID(), nome: 'doc', arvore: documentoVazio() });
    for (let v = 1; v <= versao; v++) {
      await documentos.comTrava(escopo, doc.id, (d) =>
        d.gravarLote({ id: randomUUID(), versao: v, autoria: 'designer', tipo: 'edicao', descricao: 'x', operacoes: [], tocados: [], arvore: documentoVazio() }),
      );
    }
    return doc.id;
  },
}));

describe('ConsumoDoModeloNoBanco (contador da plataforma, sem conta)', () => {
  // um dia que nenhum outro teste usa: o contador é global
  const dia = new Date(Date.UTC(2100 + Math.floor(Math.random() * 800), 0, 1 + Math.floor(Math.random() * 300), 12));
  const consumo = new ConsumoDoModeloNoBanco(prisma);

  it('soma tokens e chamadas no dia, guarda o que o fornecedor disse que resta, e um dia não conta no outro', async () => {
    expect(await consumo.hoje(dia)).toEqual({ tokens: 0, chamadas: 0 });
    await Promise.all([consumo.somar(dia, 1000), consumo.somar(dia, 2500), consumo.somar(dia, 500)]);
    await consumo.anotarRestante(dia, 41_000_000);
    expect(await consumo.hoje(dia)).toEqual({ tokens: 4000, chamadas: 3, restanteNoFornecedor: 41_000_000 });
    expect(await consumo.hoje(new Date(dia.getTime() + 86_400_000))).toEqual({ tokens: 0, chamadas: 0 });
  });
});
