// Cliente HTTP da API. Um caminho só para toda leitura e toda escrita do editor: valida a resposta
// pelo esquema de @otto/shared, devolve o erro como código (a frase é de textos/erros.ts) e põe em
// toda escrita os dois cabeçalhos que a API exige (docs/mvp/backend.md, seções 7.1 e 17.3).
//
// A conta nunca vai na requisição: a API resolve. Sem login (ADR 035) não há cookie; `cabecalhos`
// existe para o componente de servidor repassar o que o navegador mandou, quando houver.
import { VERSAO_DO_FORMATO } from '@otto/documento';
import { CABECALHOS, ErroDaApi } from '@otto/shared';

type Buscar = (endereco: string, init?: RequestInit) => Promise<Response>;

/** O que o cliente precisa de um esquema. Os de @otto/shared (zod) servem. */
export interface Esquema<T> {
  safeParse(valor: unknown): { success: true; data: T } | { success: false };
}

export type Resposta<T> = { ok: true; status: number; dados: T } | { ok: false; status: number; codigo: string; detalhe?: Record<string, unknown> };

export interface Cliente {
  ler<T>(esquema: Esquema<T>, caminho: string): Promise<Resposta<T>>;
  /** `esquema` nulo: resposta sem corpo (204). */
  escrever<T>(esquema: Esquema<T>, metodo: Metodo, caminho: string, corpo?: unknown): Promise<Resposta<T>>;
  escrever(esquema: null, metodo: Metodo, caminho: string, corpo?: unknown): Promise<Resposta<undefined>>;
  /** POST com o arquivo no corpo, como bytes, e o tipo dele no Content-Type (imagem e SVG). */
  enviarBytes<T>(esquema: Esquema<T>, caminho: string, corpo: Blob, tipo: string): Promise<Resposta<T>>;
}

type Metodo = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Código do editor (não da API): a rede não respondeu. */
export const SEM_CONEXAO = 'sem_conexao';
/** Código do editor (não da API): a resposta veio 2xx e não bate com o contrato. */
export const FORA_DO_CONTRATO = 'resposta_fora_do_contrato';

export function criarCliente(opcoes: { fetch?: Buscar; base?: string; cabecalhos?: Record<string, string> } = {}): Cliente {
  const buscar = opcoes.fetch ?? ((endereco, init) => fetch(endereco, init));
  const base = opcoes.base ?? '';

  async function pedir<T>(esquema: Esquema<T> | null, metodo: 'GET' | Metodo, caminho: string, corpo?: unknown, bytes?: { corpo: Blob; tipo: string }): Promise<Resposta<T | undefined>> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json', ...opcoes.cabecalhos };
    if (metodo !== 'GET') {
      cabecalhos[CABECALHOS.cliente.nome] = CABECALHOS.cliente.valor;
      cabecalhos[CABECALHOS.catalogo] = String(VERSAO_DO_FORMATO);
      if (bytes) cabecalhos['Content-Type'] = bytes.tipo;
      else if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    }
    let resposta: Response;
    try {
      resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        cache: 'no-store',
        headers: cabecalhos,
        ...(bytes ? { body: bytes.corpo } : corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch {
      return { ok: false, status: 0, codigo: SEM_CONEXAO };
    }
    const lido: unknown = resposta.status === 204 ? undefined : await resposta.json().catch(() => undefined);
    if (!resposta.ok) {
      const erro = ErroDaApi.safeParse(lido);
      return erro.success
        ? { ok: false, status: resposta.status, codigo: erro.data.codigo, ...(erro.data.detalhe ? { detalhe: erro.data.detalhe } : {}) }
        : { ok: false, status: resposta.status, codigo: 'erro_interno' };
    }
    if (esquema === null) return { ok: true, status: resposta.status, dados: undefined };
    const valido = esquema.safeParse(lido);
    return valido.success ? { ok: true, status: resposta.status, dados: valido.data } : { ok: false, status: resposta.status, codigo: FORA_DO_CONTRATO };
  }

  return {
    ler: (esquema, caminho) => pedir(esquema, 'GET', caminho),
    escrever: (esquema: Esquema<unknown> | null, metodo: Metodo, caminho: string, corpo?: unknown) => pedir(esquema, metodo, caminho, corpo),
    enviarBytes: (esquema: Esquema<unknown>, caminho: string, corpo: Blob, tipo: string) => pedir(esquema, 'POST', caminho, undefined, { corpo, tipo }),
  } as Cliente;
}
