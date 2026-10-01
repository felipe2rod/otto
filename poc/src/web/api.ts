import type { Autoria, Documento } from '../documento/esquema';
import type { Aviso } from '../documento/lint';
import type { Operacao } from '../documento/operacoes';
import type { EsforcoCriativo } from '../servidor/esforco';

export type EstadoDaTarefa = 'rodando' | 'em-revisao' | 'aceita' | 'desfeita' | 'falhou';

export interface CustoDaTarefa {
  modelo: string;
  chamadas: number;
  tokensDeEntrada: number;
  tokensDeSaida: number;
  tokensDeCacheLidos: number;
  /** Escrita no cache (1,25× a entrada). Ausente nas tarefas antigas. */
  tokensDeCacheCriados?: number;
  imagensEnviadas: number;
  voltasDeConferencia: number;
  segundos: number;
}

export interface EventoDaTarefa {
  tipo: 'mensagem' | 'plano' | 'direcao' | 'revisao' | 'lote' | 'lote-recusado' | 'render' | 'verificacao' | 'imagem' | 'entrega' | 'erro' | 'custo';
  quando: string;
  texto?: string;
  dados?: unknown;
}

export interface Tarefa {
  id: string;
  documentoId: string;
  entrada: ({ tipo: 'briefing'; briefing: unknown } | { tipo: 'pedido' | 'criar'; pedido: string }) & { esforco?: EsforcoCriativo };
  estado: EstadoDaTarefa;
  eventos: EventoDaTarefa[];
  lotes: string[];
  resumo?: string;
  pendencias?: string[];
  custo: CustoDaTarefa;
  criadaEm: string;
}

export interface LoteNoHistorico {
  id: string;
  descricao: string;
  autoria: Autoria;
  quando: string;
  operacoes: Operacao[];
  tocados: string[];
}

export interface Registro {
  doc: Documento;
  historico: LoteNoHistorico[];
  tarefas: Tarefa[];
}

export interface ItemDaLista {
  id: string;
  nome: string;
  pranchetas: number;
  alterado?: string;
}

export interface RelatorioDeExportacao {
  arquivos: string[];
  camadas: { prancheta: string; camada: string; tipo: string; destino: string; observacao?: string }[];
  tokens: { nome: string; valor: string; usadoEm: string[] }[];
  fontes: { familia: string; peso: number; postScript: string; arquivo: string }[];
  imagens: { camada: string; banco: string; autor: string; licenca: string; url: string }[];
  avisos: string[];
}

export type { Aviso };
import type { FichaDaMarca } from '../servidor/marca';
export type { FichaDaMarca };

/** Corpo de POST /api/documentos/:id/tarefas. O esforço criativo é opcional: sem ele, a tarefa roda como sempre. */
export type PedidoDeTarefa = ({ tipo: 'briefing'; briefing: unknown } | { tipo: 'pedido' | 'criar'; pedido: string }) & { esforco?: EsforcoCriativo };

export class ErroDaApi extends Error {}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const texto = await r.text();
  const corpo = texto ? (JSON.parse(texto) as unknown) : undefined;
  if (!r.ok) throw new ErroDaApi((corpo as { erro?: string } | undefined)?.erro ?? `erro ${r.status}`);
  return corpo as T;
}

const json = (corpo: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

export const api = {
  listar: () => pedir<ItemDaLista[]>('/api/documentos'),
  criar: (nome: string) => pedir<Registro>('/api/documentos', json({ nome })),
  abrir: (id: string) => pedir<Registro>(`/api/documentos/${id}`),
  aplicar: (id: string, descricao: string, operacoes: Operacao[]) => pedir<Registro>(`/api/documentos/${id}/lotes`, json({ descricao, operacoes })),
  desfazer: (id: string) => pedir<Registro>(`/api/documentos/${id}/desfazer`, { method: 'POST' }),
  pedirTarefa: (id: string, corpo: PedidoDeTarefa) => pedir<Registro & { tarefaId: string }>(`/api/documentos/${id}/tarefas`, json(corpo)),
  aceitar: (tarefaId: string) => pedir<Registro>(`/api/tarefas/${tarefaId}/aceitar`, { method: 'POST' }),
  desfazerTarefa: (tarefaId: string) => pedir<Registro>(`/api/tarefas/${tarefaId}/desfazer`, { method: 'POST' }),
  cancelar: (tarefaId: string) => pedir<{ ok: true }>(`/api/tarefas/${tarefaId}/cancelar`, { method: 'POST' }),
  antes: (tarefaId: string) => pedir<Documento>(`/api/tarefas/${tarefaId}/antes`),
  relatorio: (id: string) => pedir<{ relatorio: RelatorioDeExportacao; texto: string }>(`/api/documentos/${id}/relatorio`),
  importarVetor: (arquivo: File) => pedir<{ no: { tipo: 'vetor'; moldura: [number, number]; caminhos: unknown[]; origem: unknown }; avisos: string[] }>(`/api/vetores?nome=${encodeURIComponent(arquivo.name)}`, { method: 'POST', headers: { 'Content-Type': 'image/svg+xml' }, body: arquivo }),
  recortarSujeito: (hash: string) => pedir<{ arquivo: string; cobertura: number }>(`/api/arquivos/${hash}/sujeito`, { method: 'POST' }),
  lerSite: (url: string) =>
    pedir<{
      ficha: FichaDaMarca;
      captura: { hash: string; largura: number; altura: number };
      logo?: { no: { tipo: 'vetor'; moldura: [number, number]; caminhos: unknown[]; origem: { arquivo: string; nome: string } }; avisos: string[] } | { imagem: { hash: string; largura: number; altura: number }; avisos: string[] };
      avisos: string[];
    }>('/api/site', json({ url })),
  estado: () => pedir<{ modelo: string; capacidades: { imagem: boolean }; bancoDeImagens: boolean }>('/api/estado'),
  enviarImagem: async (arquivo: File) =>
    pedir<{ hash: string; largura: number; altura: number; origem: unknown }>('/api/arquivos', { method: 'POST', headers: { 'Content-Type': arquivo.type }, body: arquivo }),
};

/** Projeção de custo com o preço do Sonnet 5 na DigitalOcean (docs/tecnico/custos.md). */
export function projecaoSonnet5(c: CustoDaTarefa): { dolares: number; reais: number } {
  const criados = c.tokensDeCacheCriados ?? 0;
  const semCache = Math.max(0, c.tokensDeEntrada - c.tokensDeCacheLidos - criados);
  const dolares = (semCache * 2 + criados * 2.5 + c.tokensDeCacheLidos * 0.2 + c.tokensDeSaida * 10) / 1e6;
  return { dolares, reais: dolares * 5.1991 };
}
