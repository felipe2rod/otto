// Marcas e briefings salvos (packages/shared/src/briefing.ts; docs/mvp/backend.md, 17.12).
// Tudo aqui é conteúdo do designer: nada vai para evento nem para log daqui.
import { BriefingSalvo, type DadosDaMarca, type DadosDoBriefingSalvo, type ItemDeBriefing, ListaDeBriefings, ListaDeMarcas, Marca } from '@otto/shared';
import type { Cliente, Resposta } from './cliente';

export type Recusa = { ok: false; codigo: string; detalhe?: Record<string, unknown> };
export type Feito<T> = ({ ok: true } & T) | Recusa;

export const recusa = (r: Extract<Resposta<unknown>, { ok: false }>): Recusa => ({ ok: false, codigo: r.codigo, ...(r.detalhe ? { detalhe: r.detalhe } : {}) });

export interface ApiDeCadastros {
  /** Indefinido se a leitura falhou: a tela diz o erro, nunca "nenhuma marca". */
  marcas(): Promise<Marca[] | undefined>;
  /** Com `id`, substitui a marca inteira; sem, cria. */
  salvarMarca(dados: DadosDaMarca, id?: string): Promise<Feito<{ marca: Marca }>>;
  apagarMarca(id: string): Promise<Feito<object>>;
  /** A lista vem sem os dados de cada briefing. */
  briefings(): Promise<ItemDeBriefing[] | undefined>;
  briefing(id: string): Promise<BriefingSalvo | undefined>;
  salvarBriefing(dados: DadosDoBriefingSalvo, id?: string): Promise<Feito<{ briefing: BriefingSalvo }>>;
  apagarBriefing(id: string): Promise<Feito<object>>;
}

export function criarApiDeCadastros(cliente: Cliente): ApiDeCadastros {
  const de = (base: string, id?: string) => (id ? `${base}/${encodeURIComponent(id)}` : base);
  const apagar = async (caminho: string): Promise<Feito<object>> => {
    const r = await cliente.escrever(null, 'DELETE', caminho);
    return r.ok ? { ok: true } : recusa(r);
  };
  return {
    async marcas() {
      const r = await cliente.ler(ListaDeMarcas, '/api/marcas');
      return r.ok ? r.dados.itens : undefined;
    },
    async salvarMarca(dados, id) {
      const r = await cliente.escrever(Marca, id ? 'PUT' : 'POST', de('/api/marcas', id), dados);
      return r.ok ? { ok: true, marca: r.dados } : recusa(r);
    },
    apagarMarca: (id) => apagar(de('/api/marcas', id)),
    async briefings() {
      const r = await cliente.ler(ListaDeBriefings, '/api/briefings');
      return r.ok ? r.dados.itens : undefined;
    },
    async briefing(id) {
      const r = await cliente.ler(BriefingSalvo, de('/api/briefings', id));
      return r.ok ? r.dados : undefined;
    },
    async salvarBriefing(dados, id) {
      const r = await cliente.escrever(BriefingSalvo, id ? 'PUT' : 'POST', de('/api/briefings', id), dados);
      return r.ok ? { ok: true, briefing: r.dados } : recusa(r);
    },
    apagarBriefing: (id) => apagar(de('/api/briefings', id)),
  };
}
