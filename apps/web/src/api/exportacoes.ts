// Exportação de uma peça (packages/shared/src/exportacao.ts): o relatório antes de exportar, o
// pedido que entra na fila e a consulta do andamento. O download não passa por aqui: é navegação
// comum para `arquivos[].baixar`, que responde 302 para um link assinado novo a cada pedido.
import { Exportacao, type PedidoDeExportacao, RelatorioDeExportacao } from '@otto/shared';
import type { Cliente, Resposta } from './cliente';

export type ResultadoDoRelatorio = { ok: true; relatorio: RelatorioDeExportacao } | { ok: false; codigo: string };

/** `passageiro`: a rede ou o servidor não responderam. Vale tentar de novo; o pedido em si não foi recusado. */
export type ResultadoDaExportacao = { ok: true; exportacao: Exportacao } | { ok: false; codigo: string; passageiro: boolean };

export interface ApiDeExportacoes {
  /** O que vai sair, sem criar nada. Responde na hora. */
  relatorio(pedido: PedidoDeExportacao): Promise<ResultadoDoRelatorio>;
  /** Põe a exportação na fila. É da versão da peça neste momento. */
  pedir(pedido: PedidoDeExportacao): Promise<ResultadoDaExportacao>;
  consultar(id: string): Promise<ResultadoDaExportacao>;
}

export function criarApiDeExportacoes(cliente: Cliente, pecaId: string): ApiDeExportacoes {
  const base = `/api/documentos/${encodeURIComponent(pecaId)}/exportacoes`;
  const daExportacao = (r: Resposta<Exportacao>): ResultadoDaExportacao => (r.ok ? { ok: true, exportacao: r.dados } : { ok: false, codigo: r.codigo, passageiro: r.status === 0 || r.status >= 500 });
  return {
    async relatorio(pedido) {
      const r = await cliente.escrever(RelatorioDeExportacao, 'POST', `${base}/relatorio`, pedido);
      return r.ok ? { ok: true, relatorio: r.dados } : { ok: false, codigo: r.codigo };
    },
    pedir: async (pedido) => daExportacao(await cliente.escrever(Exportacao, 'POST', base, pedido)),
    consultar: async (id) => daExportacao(await cliente.ler(Exportacao, `/api/exportacoes/${encodeURIComponent(id)}`)),
  };
}
