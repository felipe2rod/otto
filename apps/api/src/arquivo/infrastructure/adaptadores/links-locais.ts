// Link assinado para os adaptadores que não têm um servidor de objetos na frente (disco local e o
// falso em memória): a própria API serve o arquivo em GET /api/links/:token. O token é o que
// autoriza: carrega a chave do objeto, o nome, o tipo e o vencimento, assinados com HMAC-SHA256.
// Não há segredo no link, e trocar qualquer caractere invalida a assinatura.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ArmazenamentoDeArquivo, ArquivoDoLink } from '../../application/armazenamento-de-arquivo';

export interface DadosDoLink {
  chave: string;
  nome: string;
  tipo: string;
}

/** Cabeçalho Content-Disposition de anexo (RFC 6266): nome ASCII de reserva e o nome de verdade em UTF-8. */
export function disposicaoDeAnexo(nome: string): string {
  const limpo = nome.replace(/[\r\n\t]/g, ' ').trim() || 'arquivo';
  const ascii = limpo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\/;]/g, '_');
  const utf8 = encodeURIComponent(limpo).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export class AssinadorDeLinks {
  constructor(
    private readonly segredo: string,
    private readonly agora: () => number = Date.now,
  ) {
    if (segredo.length < 32) throw new Error('o segredo de assinatura precisa de ao menos 32 caracteres');
  }

  private assinatura(corpo: string): Buffer {
    return createHmac('sha256', this.segredo).update(corpo).digest();
  }

  assinar(dados: DadosDoLink, validadeEmSegundos: number): string {
    const corpo = Buffer.from(JSON.stringify({ c: dados.chave, n: dados.nome, t: dados.tipo, e: this.agora() + validadeEmSegundos * 1000 }), 'utf8').toString('base64url');
    return `${corpo}.${this.assinatura(corpo).toString('base64url')}`;
  }

  /** Os dados do link, se a assinatura confere e ele não venceu. Senão, undefined. */
  abrir(token: string): DadosDoLink | undefined {
    const partes = token.split('.');
    if (partes.length !== 2 || !partes[0] || !partes[1]) return undefined;
    const [corpo, assinatura] = partes as [string, string];
    const esperada = this.assinatura(corpo);
    const recebida = Buffer.from(assinatura, 'base64url');
    if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return undefined;
    try {
      const lido = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { c?: unknown; n?: unknown; t?: unknown; e?: unknown };
      if (typeof lido.c !== 'string' || typeof lido.n !== 'string' || typeof lido.t !== 'string' || typeof lido.e !== 'number') return undefined;
      if (this.agora() > lido.e) return undefined;
      return { chave: lido.c, nome: lido.n, tipo: lido.t };
    } catch {
      return undefined;
    }
  }
}

export const ROTA_DOS_LINKS_LOCAIS = '/api/links';

/** Para os testes de contrato: segue um link local como a rota GET /api/links/:token faria. */
export async function baixarLinkLocal(armazenamento: ArmazenamentoDeArquivo, link: string): Promise<{ status: number; bytes?: Uint8Array; disposicao?: string; tipo?: string }> {
  if (!link.startsWith(`${ROTA_DOS_LINKS_LOCAIS}/`)) return { status: 404 };
  const arquivo: ArquivoDoLink | undefined = await armazenamento.abrirLinkProprio(link.slice(ROTA_DOS_LINKS_LOCAIS.length + 1));
  return arquivo ? { status: 200, bytes: arquivo.bytes, disposicao: disposicaoDeAnexo(arquivo.nome), tipo: arquivo.tipo } : { status: 404 };
}
