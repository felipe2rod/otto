import { randomUUID } from 'node:crypto';
import { documentoVazio } from '@otto/documento';
import { lerContaId } from '@otto/shared';
import { RepositorioDeDocumentosEmMemoria } from '../../../documento/infrastructure/memoria/repositorio-de-documentos-em-memoria';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeTarefas } from '../../application/repositorio-de-tarefas.contrato';
import { RepositorioDeTarefasEmMemoria } from './repositorio-de-tarefas-em-memoria';

const documentos = new RepositorioDeDocumentosEmMemoria();
const repositorio = new RepositorioDeTarefasEmMemoria(documentos);

contratoDoRepositorioDeTarefas('em memória (adaptador falso)', async () => ({
  repositorio,
  contaA: EscopoDaConta.abrir(lerContaId(randomUUID())),
  contaB: EscopoDaConta.abrir(lerContaId(randomUUID())),
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
