// Importar um PSD (packages/shared/src/importacao.ts; docs/mvp/backend.md, 17.14). O arquivo vai como
// bytes; a resposta do envio já diz que fontes o texto dele pede, e é ali que o designer escolhe o que
// fazer com as que faltam. Nome de arquivo, de camada e de fonte são conteúdo de terceiro: texto, nunca HTML.
import { Importacao, ListaDeImportacoes, type PedidoDeImportacao, TIPO_DO_PSD } from '@otto/shared';
import { type Feito, recusa } from './cadastros';
import type { Cliente } from './cliente';

/** O pedido como a tela o monta: `fontes` só com as escolhas que fogem do padrão. */
export type PedidoDaTela = Omit<PedidoDeImportacao, 'fontes'> & { fontes?: PedidoDeImportacao['fontes'] };

export interface ApiDeImportacoes {
  /** Envia o arquivo. O servidor o confere pelos bytes antes de guardar: a recusa vem com `detalhe.motivo`. */
  enviar(arquivo: File): Promise<Feito<{ importacao: Importacao }>>;
  pedir(id: string, pedido: PedidoDaTela): Promise<Feito<{ importacao: Importacao }>>;
  consultar(id: string): Promise<Feito<{ importacao: Importacao }>>;
  /** As em curso e as recentes, sem o relatório. Indefinido se a leitura falhou. */
  listar(): Promise<Importacao[] | undefined>;
  /** Desiste de um arquivo enviado e ainda não importado. */
  desistir(id: string): Promise<Feito<object>>;
  /** A importação que criou a peça, com o relatório. Indefinido se a peça não veio de um PSD. */
  daPeca(pecaId: string): Promise<Importacao | undefined>;
}

export function criarApiDeImportacoes(cliente: Cliente): ApiDeImportacoes {
  const uma = (id: string, resto = '') => `/api/importacoes/${encodeURIComponent(id)}${resto}`;
  return {
    async enviar(arquivo) {
      const r = await cliente.enviarBytes(Importacao, '/api/importacoes', arquivo, TIPO_DO_PSD, { 'X-Otto-Nome-Do-Arquivo': encodeURIComponent(arquivo.name) });
      return r.ok ? { ok: true, importacao: r.dados } : recusa(r);
    },
    async pedir(id, pedido) {
      const r = await cliente.escrever(Importacao, 'POST', uma(id, '/importar'), pedido);
      return r.ok ? { ok: true, importacao: r.dados } : recusa(r);
    },
    async consultar(id) {
      const r = await cliente.ler(Importacao, uma(id));
      return r.ok ? { ok: true, importacao: r.dados } : recusa(r);
    },
    async listar() {
      const r = await cliente.ler(ListaDeImportacoes, '/api/importacoes');
      return r.ok ? r.dados.itens : undefined;
    },
    async desistir(id) {
      const r = await cliente.escrever(null, 'DELETE', uma(id));
      return r.ok ? { ok: true } : recusa(r);
    },
    async daPeca(pecaId) {
      const r = await cliente.ler(Importacao, `/api/documentos/${encodeURIComponent(pecaId)}/importacao`);
      return r.ok ? r.dados : undefined;
    },
  };
}
