// As chamadas de peça (docs/mvp/backend.md, seções 7.3 e 17.3), sobre o contrato de @otto/shared.
// "Peça" é o nome de tela do documento; na API e no código do núcleo é "documento".
import type { Documento } from '@otto/documento';
import { DocumentoAberto, type DocumentoDaLista, DocumentoRenomeado, ListaDeDocumentos } from '@otto/shared';
import type { Cliente } from './cliente';

export interface PecaDaLista {
  id: string;
  nome: string;
  /** Quantas pranchetas a peça tem. */
  formatos: number;
  alteradoEm: string;
  /** Estado da tarefa viva, com o nome do contrato. Ausente quando não há tarefa. */
  tarefa?: string;
}

export type ResultadoDaLista = { estado: 'ok'; pecas: PecaDaLista[]; proximoCursor: string | null } | { estado: 'erro' };

export interface PecaAberta {
  id: string;
  nome: string;
  versao: number;
  /** A árvore do documento, já validada pelo esquema de @otto/documento. */
  arvore: Documento;
}

export type ResultadoDeAbrir = { estado: 'aberta'; peca: PecaAberta } | { estado: 'nao_encontrada' } | { estado: 'erro'; codigo: string };

export type ResultadoDeAcao<T> = ({ ok: true } & T) | { ok: false; codigo: string };

export interface ApiDePecas {
  listar(cursor?: string): Promise<ResultadoDaLista>;
  criar(): Promise<ResultadoDeAcao<{ peca: PecaDaLista }>>;
  renomear(id: string, nome: string): Promise<ResultadoDeAcao<{ nome: string }>>;
  duplicar(id: string): Promise<ResultadoDeAcao<{ peca: PecaDaLista }>>;
  /** "Excluir" na tela. A API arquiva: não apaga. */
  arquivar(id: string): Promise<ResultadoDeAcao<object>>;
  abrir(id: string): Promise<ResultadoDeAbrir>;
}

const ITENS_POR_PAGINA = 100;
const caminho = (id: string, resto = '') => `/api/documentos/${encodeURIComponent(id)}${resto}`;

const daLista = (d: DocumentoDaLista): PecaDaLista => ({ id: d.id, nome: d.nome, formatos: d.pranchetas, alteradoEm: d.alteradoEm, ...(d.tarefa ? { tarefa: d.tarefa.estado } : {}) });
/** A peça recém-criada ou duplicada, como item de lista. A API não devolve a data: é agora. */
const doAberto = (d: DocumentoAberto): PecaDaLista => ({ id: d.id, nome: d.nome, formatos: d.arvore.pranchetas.length, alteradoEm: new Date().toISOString() });

export function criarApiDePecas(cliente: Cliente): ApiDePecas {
  return {
    async listar(cursor) {
      const r = await cliente.ler(ListaDeDocumentos, `/api/documentos?limite=${ITENS_POR_PAGINA}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      return r.ok ? { estado: 'ok', pecas: r.dados.itens.map(daLista), proximoCursor: r.dados.proximoCursor } : { estado: 'erro' };
    },
    async criar() {
      const r = await cliente.escrever(DocumentoAberto, 'POST', '/api/documentos', {});
      return r.ok ? { ok: true, peca: doAberto(r.dados) } : { ok: false, codigo: r.codigo };
    },
    async renomear(id, nome) {
      const r = await cliente.escrever(DocumentoRenomeado, 'PATCH', caminho(id), { nome: nome.trim() });
      return r.ok ? { ok: true, nome: r.dados.nome } : { ok: false, codigo: r.codigo };
    },
    async duplicar(id) {
      const r = await cliente.escrever(DocumentoAberto, 'POST', caminho(id, '/duplicar'), {});
      return r.ok ? { ok: true, peca: doAberto(r.dados) } : { ok: false, codigo: r.codigo };
    },
    async arquivar(id) {
      const r = await cliente.escrever(null, 'DELETE', caminho(id));
      return r.ok ? { ok: true } : { ok: false, codigo: r.codigo };
    },
    async abrir(id) {
      const r = await cliente.ler(DocumentoAberto, caminho(id));
      if (r.ok) return { estado: 'aberta', peca: { id: r.dados.id, nome: r.dados.nome, versao: r.dados.versao, arvore: r.dados.arvore } };
      return r.status === 404 ? { estado: 'nao_encontrada' } : { estado: 'erro', codigo: r.codigo };
    },
  };
}
