// Envio de lote, desfazer e refazer de uma peça (docs/mvp/backend.md, seções 7.3 e 17.3).
// O `id` do lote é gerado pelo editor e é o idDoLote de aplicarLote: navegador e servidor chegam à
// mesma árvore, e reenviar o mesmo id não aplica duas vezes.
import { type Documento, loteDependeDeMedida, type Operacao } from '@otto/documento';
import { CODIGOS_DE_ERRO, LIMITES, RespostaDeDesfazer, RespostaDeLote } from '@otto/shared';
import type { Historico, LoteDoEditor, RespostaDoEnvio } from '../editor/nucleo/sessaoDoDocumento';
import type { Cliente } from './cliente';

export type ResultadoDeReverter = { ok: true; versao: number; doc: Documento; historico: Historico } | { ok: false; codigo: string };

const historicoDe = (r: Historico): Historico => ({ podeDesfazer: r.podeDesfazer, podeRefazer: r.podeRefazer });

export interface ApiDeLotes {
  enviar(lote: LoteDoEditor<Operacao>): Promise<RespostaDoEnvio<Documento>>;
  desfazer(versaoBase: number): Promise<ResultadoDeReverter>;
  refazer(versaoBase: number): Promise<ResultadoDeReverter>;
}

export function criarApiDeLotes(cliente: Cliente, pecaId: string): ApiDeLotes {
  const base = `/api/documentos/${encodeURIComponent(pecaId)}`;

  async function reverter(rota: 'desfazer' | 'refazer', versaoBase: number): Promise<ResultadoDeReverter> {
    const r = await cliente.escrever(RespostaDeDesfazer, 'POST', `${base}/${rota}`, { versaoBase });
    return r.ok ? { ok: true, versao: r.dados.versao, doc: r.dados.arvore, historico: historicoDe(r.dados) } : { ok: false, codigo: r.codigo };
  }

  return {
    async enviar(lote) {
      // Lote que mede texto (alinhar, distribuir) pede a árvore do servidor: os dois lados podem medir
      // diferente, e o que vale é o que o servidor gravou.
      const pedeArvore = loteDependeDeMedida(lote.operacoes);
      const r = await cliente.escrever(RespostaDeLote, 'POST', `${base}/lotes`, {
        id: lote.id,
        versaoBase: lote.versaoBase,
        descricao: lote.descricao.slice(0, LIMITES.caracteresDaDescricao),
        operacoes: lote.operacoes,
        ...(pedeArvore ? { devolver: 'arvore' } : {}),
      });
      if (r.ok) return { tipo: 'confirmado', versao: r.dados.versao, ...(r.dados.arvore ? { arvore: r.dados.arvore } : {}), historico: historicoDe(r.dados) };
      if (r.codigo === CODIGOS_DE_ERRO.versaoDesatualizada && typeof r.detalhe?.versaoAtual === 'number') return { tipo: 'versao_desatualizada', versaoAtual: r.detalhe.versaoAtual };
      // Rede fora do ar e falha do servidor: o lote fica na fila. Reenviar com o mesmo id é seguro.
      if (r.status === 0 || r.status >= 500) return { tipo: 'sem_conexao' };
      return { tipo: 'recusado', codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) };
    },
    desfazer: (versaoBase) => reverter('desfazer', versaoBase),
    refazer: (versaoBase) => reverter('refazer', versaoBase),
  };
}
