// A API vista do teste (não do navegador): criar a peça que o teste usa, alterá-la "por fora",
// conferir o que o servidor guardou e arquivar no fim. Fala HTTP direto com a borda.
import type { APIRequestContext, APIResponse, Route } from '@playwright/test';

export interface NoDoServidor {
  id: string;
  nome: string;
  tipo: string;
  x?: number;
  y?: number;
  largura?: number;
  altura?: number;
  rotacao?: number;
  conteudo?: string;
  arquivo?: string;
  visivel?: boolean;
  filhos?: NoDoServidor[];
  [chave: string]: unknown;
}
export interface PranchetaDoServidor {
  id: string;
  nome: string;
  largura: number;
  altura: number;
  filhos: NoDoServidor[];
}
export interface PecaDoServidor {
  id: string;
  nome: string;
  versao: number;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  arvore: { pranchetas: PranchetaDoServidor[] };
}

export interface ExportacaoDoServidor {
  id: string;
  formato: string;
  pacote?: boolean;
  estado: string;
  arquivos: { nome: string; tipo: string; bytes: number; baixar: string }[];
}

const CLIENTE = { 'X-Otto-Cliente': 'editor' };

/**
 * Em desenvolvimento a API recarrega sozinha quando um arquivo dela muda, e por alguns segundos a
 * borda responde 502. Não é o que o teste está conferindo: o pedido DO TESTE espera e tenta de novo.
 * (O que o navegador pede durante uma recarga não tem como ser repetido daqui.)
 */
async function comPaciencia(pedir: () => Promise<APIResponse>): Promise<APIResponse> {
  let resposta: APIResponse | undefined;
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    try {
      resposta = await pedir();
      if (resposta.status() < 502 || resposta.status() > 504) return resposta;
    } catch (erro) {
      if (tentativa === 19) throw erro;
    }
    await new Promise((seguir) => setTimeout(seguir, 1500));
  }
  return resposta as APIResponse;
}

export class Api {
  private catalogo: string | undefined;
  private readonly http: Pick<APIRequestContext, 'get' | 'post' | 'delete'>;
  constructor(
    http: APIRequestContext,
    readonly base: string,
  ) {
    this.http = {
      get: (url, opcoes) => comPaciencia(() => http.get(url, opcoes)),
      post: (url, opcoes) => comPaciencia(() => http.post(url, opcoes)),
      delete: (url, opcoes) => comPaciencia(() => http.delete(url, opcoes)),
    };
  }

  /** A versão do catálogo é a que o servidor anuncia: o teste não a fixa. */
  private async cabecalhos(): Promise<Record<string, string>> {
    if (!this.catalogo) {
      const r = await this.http.get(`${this.base}/api/documentos?limite=1`);
      this.catalogo = r.headers()['x-otto-catalogo'] ?? '2';
    }
    return { ...CLIENTE, 'X-Otto-Catalogo': this.catalogo };
  }

  async criar(nome: string): Promise<PecaDoServidor> {
    const r = await this.http.post(`${this.base}/api/documentos`, { headers: await this.cabecalhos(), data: { nome } });
    if (!r.ok()) throw new Error(`criar a peça: ${r.status()} ${await r.text()}`);
    return (await r.json()) as PecaDoServidor;
  }

  async abrir(id: string): Promise<PecaDoServidor> {
    const r = await this.http.get(`${this.base}/api/documentos/${id}`);
    if (!r.ok()) throw new Error(`abrir a peça: ${r.status()} ${await r.text()}`);
    return (await r.json()) as PecaDoServidor;
  }

  /** Um lote aplicado direto na API, como faria outra aba. Devolve a versão nova. */
  async lote(id: string, operacoes: unknown[], descricao = 'preparo do teste'): Promise<number> {
    const { versao } = await this.abrir(id);
    const r = await this.http.post(`${this.base}/api/documentos/${id}/lotes`, { headers: await this.cabecalhos(), data: { id: crypto.randomUUID(), versaoBase: versao, descricao, operacoes } });
    if (!r.ok()) throw new Error(`lote: ${r.status()} ${await r.text()}`);
    return ((await r.json()) as { versao: number }).versao;
  }

  async arquivar(id: string): Promise<void> {
    await this.http.delete(`${this.base}/api/documentos/${id}`, { headers: await this.cabecalhos() }).catch(() => undefined);
  }

  async listar(): Promise<{ id: string; nome: string }[]> {
    const r = await this.http.get(`${this.base}/api/documentos?limite=100`);
    return ((await r.json()) as { itens: { id: string; nome: string }[] }).itens;
  }

  async enviarImagem(bytes: Buffer): Promise<{ sha256: string; largura: number; altura: number }> {
    const r = await this.http.post(`${this.base}/api/arquivos`, { headers: { ...(await this.cabecalhos()), 'Content-Type': 'image/png' }, data: bytes });
    if (!r.ok()) throw new Error(`enviar imagem: ${r.status()} ${await r.text()}`);
    return (await r.json()) as { sha256: string; largura: number; altura: number };
  }

  async exportacoes(id: string): Promise<ExportacaoDoServidor[]> {
    const r = await this.http.get(`${this.base}/api/documentos/${id}/exportacoes`);
    return ((await r.json()) as { itens: ExportacaoDoServidor[] }).itens;
  }
}

/** Todas as camadas de uma prancheta, com as de dentro dos grupos. */
export function camadas(nos: readonly NoDoServidor[]): NoDoServidor[] {
  return nos.flatMap((n) => [n, ...camadas(n.filhos ?? [])]);
}

export function camada(peca: PecaDoServidor, nome: string, prancheta = 0): NoDoServidor {
  const no = camadas(peca.arvore.pranchetas[prancheta]?.filhos ?? []).find((n) => n.nome === nome);
  if (!no) throw new Error(`a prancheta ${prancheta} não tem a camada "${nome}"`);
  return no;
}

/** Os nomes das camadas de uma lista, de baixo para cima, com as de grupo entre chaves. */
export const ordem = (nos: readonly NoDoServidor[]): string => nos.map((n) => (n.filhos ? `${n.nome}{${ordem(n.filhos)}}` : n.nome)).join(' ');

/**
 * A resposta de verdade de um pedido interceptado, para o teste alterá-la antes de entregar. O teste
 * roda fora do navegador e não tem o mapa de endereços dele: busca na borda, pelo endereço da API.
 */
export function buscarDeVerdade(rota: Route): Promise<APIResponse> {
  const url = new URL(rota.request().url());
  const api = new URL(process.env.E2E_API ?? 'http://localhost:8080');
  url.protocol = api.protocol;
  url.host = api.host;
  return rota.fetch({ url: url.toString() });
}
