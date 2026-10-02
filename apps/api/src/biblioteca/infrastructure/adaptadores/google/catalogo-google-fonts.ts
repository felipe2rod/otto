// Adaptador de CatalogoDeFontes para o Google Fonts. Tudo no catálogo tem licença aberta (OFL, Apache ou
// UFL), que permite uso comercial e redistribuição; a licença exata de cada arquivo é lida do próprio arquivo
// por quem registra (biblioteca/domain/fontes.ts).
// - catálogo: https://fonts.google.com/metadata/fonts (não é API documentada: se mudar, o catálogo fica com o
//   que estava guardado; a biblioteca do Otto continua servindo o que já foi baixado);
// - arquivo: a folha de estilo de https://fonts.googleapis.com/css2 aponta para um TTF em fonts.gstatic.com.
//   Sem navegador moderno no cabeçalho, o serviço entrega um TTF por peso (também nas famílias variáveis).
// Só baixa de fonts.gstatic.com, em https, sem seguir redirecionamento, com teto de bytes e de tempo.
// O catálogo fica guardado por 7 dias (no processo e no que `guardado` oferecer): não vai à rede a cada busca.
import { CatalogoDeFontes, CatalogoIndisponivel, type CategoriaDeFonte, type FamiliaDoCatalogo } from '../../../application/catalogo-de-fontes';

const ENDERECO_DO_CATALOGO = 'https://fonts.google.com/metadata/fonts';
const ENDERECO_DA_FOLHA = 'https://fonts.googleapis.com/css2';
const HOST_DOS_ARQUIVOS = 'fonts.gstatic.com';
const VALIDADE_DO_CATALOGO_MS = 7 * 24 * 3_600_000;
const BYTES_DO_CATALOGO = 20 * 1024 * 1024;
const BYTES_DA_FONTE = 10 * 1024 * 1024;
const TEMPO_LIMITE_MS = 20_000;
const CATEGORIA: Record<string, CategoriaDeFonte> = { 'Sans Serif': 'sem serifa', Serif: 'serifada', Display: 'display', Handwriting: 'manuscrita', Monospace: 'monoespaçada' };

type Buscar = (endereco: string, init: { signal: AbortSignal; redirect: 'error' }) => Promise<Pick<Response, 'ok' | 'status' | 'text' | 'arrayBuffer' | 'headers'>>;

interface Guardado {
  baixadoEm: string;
  familias: FamiliaDoCatalogo[];
}

/** Onde o catálogo fica guardado entre reinícios (o armazenamento da biblioteca). Opcional. */
export interface CatalogoGuardado {
  ler(): Promise<Uint8Array | undefined>;
  guardar(conteudo: Uint8Array): Promise<void>;
}

function lerCatalogo(texto: string): FamiliaDoCatalogo[] {
  // a resposta pode vir com um prefixo antes do JSON
  const inicio = texto.indexOf('{');
  if (inicio < 0) throw new CatalogoIndisponivel('resposta');
  let dados: { familyMetadataList?: unknown };
  try {
    dados = JSON.parse(texto.slice(inicio)) as { familyMetadataList?: unknown };
  } catch {
    throw new CatalogoIndisponivel('resposta');
  }
  if (!Array.isArray(dados.familyMetadataList)) throw new CatalogoIndisponivel('resposta');
  const familias: FamiliaDoCatalogo[] = [];
  for (const bruta of dados.familyMetadataList as { family?: unknown; category?: unknown; fonts?: unknown; popularity?: unknown; subsets?: unknown }[]) {
    if (typeof bruta.family !== 'string' || bruta.family.length === 0 || bruta.family.length > 80) continue;
    // só o que escreve em português
    if (!Array.isArray(bruta.subsets) || !bruta.subsets.includes('latin')) continue;
    const pesos = Object.keys((bruta.fonts as Record<string, unknown> | undefined) ?? {})
      .filter((k) => /^\d{3}$/.test(k))
      .map(Number)
      .sort((a, b) => a - b);
    if (pesos.length === 0) continue;
    familias.push({ familia: bruta.family, categoria: CATEGORIA[String(bruta.category)] ?? 'display', pesos, popularidade: typeof bruta.popularity === 'number' ? bruta.popularity : 100_000 });
  }
  if (familias.length === 0) throw new CatalogoIndisponivel('resposta');
  return familias.sort((a, b) => a.popularidade - b.popularidade || a.familia.localeCompare(b.familia));
}

export class CatalogoGoogleFonts extends CatalogoDeFontes {
  private readonly buscar: Buscar;
  private readonly agora: () => number;
  private lido: { quando: number; familias: Promise<FamiliaDoCatalogo[]> } | undefined;

  constructor(private readonly opcoes: { guardado?: CatalogoGuardado; buscar?: Buscar; agora?: () => number } = {}) {
    super();
    this.buscar = opcoes.buscar ?? ((endereco, init) => fetch(endereco, init));
    this.agora = opcoes.agora ?? Date.now;
  }

  private async ir(endereco: string, limiteEmBytes: number): Promise<Uint8Array | undefined> {
    let resposta: Awaited<ReturnType<Buscar>>;
    try {
      resposta = await this.buscar(endereco, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS), redirect: 'error' });
    } catch {
      throw new CatalogoIndisponivel('rede');
    }
    // família ou peso que não existe: o serviço responde 400
    if (resposta.status === 400 || resposta.status === 404) return undefined;
    if (!resposta.ok) throw new CatalogoIndisponivel('rede');
    const declarado = Number(resposta.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declarado) && declarado > limiteEmBytes) throw new CatalogoIndisponivel('tamanho');
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.byteLength > limiteEmBytes) throw new CatalogoIndisponivel('tamanho');
    return bytes;
  }

  familias(): Promise<FamiliaDoCatalogo[]> {
    if (this.lido && this.agora() - this.lido.quando < VALIDADE_DO_CATALOGO_MS) return this.lido.familias;
    const familias = this.carregar();
    this.lido = { quando: this.agora(), familias };
    // se falhar, a próxima chamada tenta de novo em vez de guardar a falha
    familias.catch(() => {
      this.lido = undefined;
    });
    return familias;
  }

  private async carregar(): Promise<FamiliaDoCatalogo[]> {
    const guardado = await this.lerGuardado();
    if (guardado && this.agora() - Date.parse(guardado.baixadoEm) < VALIDADE_DO_CATALOGO_MS) return guardado.familias;
    try {
      const bytes = await this.ir(ENDERECO_DO_CATALOGO, BYTES_DO_CATALOGO);
      if (!bytes) throw new CatalogoIndisponivel('resposta');
      const familias = lerCatalogo(Buffer.from(bytes).toString('utf8'));
      await this.opcoes.guardado?.guardar(Buffer.from(JSON.stringify({ baixadoEm: new Date(this.agora()).toISOString(), familias } satisfies Guardado))).catch(() => undefined);
      return familias;
    } catch (erro) {
      // o catálogo guardado, mesmo vencido, é melhor que nenhum
      if (guardado) return guardado.familias;
      throw erro;
    }
  }

  private async lerGuardado(): Promise<Guardado | undefined> {
    try {
      const bytes = await this.opcoes.guardado?.ler();
      if (!bytes) return undefined;
      const lido = JSON.parse(Buffer.from(bytes).toString('utf8')) as Guardado;
      return Array.isArray(lido.familias) && lido.familias.length > 0 && Number.isFinite(Date.parse(lido.baixadoEm)) ? lido : undefined;
    } catch {
      return undefined;
    }
  }

  async baixar(familia: string, peso: number): Promise<Uint8Array | undefined> {
    // só o que o catálogo lista: o nome que vai para o endereço nunca é texto livre de quem pediu
    const doCatalogo = (await this.familias()).find((f) => f.familia === familia);
    if (!doCatalogo?.pesos.includes(peso)) return undefined;
    const folha = await this.ir(`${ENDERECO_DA_FOLHA}?family=${encodeURIComponent(familia).replace(/%20/g, '+')}:wght@${peso}`, 1024 * 1024);
    if (!folha) return undefined;
    const endereco = Buffer.from(folha)
      .toString('utf8')
      .match(/url\((https:\/\/[^)\s'"]+\.(?:ttf|otf))\)/)?.[1];
    if (!endereco) throw new CatalogoIndisponivel('resposta');
    let url: URL;
    try {
      url = new URL(endereco);
    } catch {
      throw new CatalogoIndisponivel('endereco');
    }
    if (url.protocol !== 'https:' || url.hostname !== HOST_DOS_ARQUIVOS || url.port !== '' || url.username !== '') throw new CatalogoIndisponivel('endereco');
    return this.ir(url.toString(), BYTES_DA_FONTE);
  }
}
