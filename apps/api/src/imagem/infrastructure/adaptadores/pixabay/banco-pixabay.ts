// Adaptador de BancoDeImagens para o Pixabay (ADR 032, item 2). Regras da API conferidas em
// https://pixabay.com/api/docs/ em 2026-09-26, e a resposta gravada em gravacoes/ em 2026-10-02:
// - busca em https://pixabay.com/api/, com a chave na query string. POR ISSO NENHUM ERRO DAQUI CARREGA O
//   ENDEREÇO NEM A RESPOSTA: só um código. A chave não vai para log, evento nem mensagem;
// - acesso padrão entrega até 1280 px no lado maior (largeImageURL);
// - os endereços de arquivo valem por 24 horas e não podem ser usados como link permanente: quem chama baixa
//   para o armazenamento próprio;
// - 100 requisições por 60 s por chave, e toda busca tem de ser servida de cache por 24 horas.
// Só baixa de pixabay.com e cdn.pixabay.com, em https, sem seguir redirecionamento, com teto de bytes e de tempo.
import type { BancoDeImagensId, OrientacaoDeImagem } from '@otto/shared';
import { z } from 'zod';
import { BancoDeImagens, BancoIndisponivel, type CapacidadesDoBanco, type ImagemNoBanco } from '../../../application/banco-de-imagens';

const ENDERECO_DA_BUSCA = 'https://pixabay.com/api/';
const HOSTS_DO_BANCO: readonly string[] = ['pixabay.com', 'cdn.pixabay.com'];
const LADO_MAXIMO = 1280;
const RESULTADOS_POR_BUSCA = 12;
const TEMPO_LIMITE_MS = 20_000;
const ORIENTACAO = { horizontal: 'horizontal', vertical: 'vertical', todas: 'all' } as const;

const Resposta = z.object({
  hits: z.array(
    z.object({
      id: z.number().int().positive(),
      pageURL: z.string(),
      tags: z.string(),
      webformatURL: z.string(),
      largeImageURL: z.string(),
      imageWidth: z.number().positive(),
      imageHeight: z.number().positive(),
      user: z.string(),
    }),
  ),
});

type Buscar = (endereco: string, init: { signal: AbortSignal; redirect: 'error' }) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'body' | 'headers' | 'arrayBuffer'>>;

function doBanco(endereco: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return undefined;
  }
  // sem usuário, sem porta: só o host exato, em https
  return url.protocol === 'https:' && HOSTS_DO_BANCO.includes(url.hostname) && url.username === '' && url.password === '' && url.port === '' ? url : undefined;
}

export class BancoPixabay extends BancoDeImagens {
  readonly id: BancoDeImagensId = 'pixabay';
  readonly nome = 'Pixabay';
  readonly licenca = 'Licença de Conteúdo do Pixabay';
  readonly capacidades: CapacidadesDoBanco = { ladoMaximo: LADO_MAXIMO, cacheObrigatorioEmHoras: 24, linkDiretoProibido: true, requisicoesPorMinuto: 100, enderecosValemPorHoras: 24 };
  private readonly buscarNaRede: Buscar;

  /** @param opcoes.chave segredo: vem da configuração do processo. `buscar` é só para teste. */
  constructor(private readonly opcoes: { chave: string; buscar?: Buscar }) {
    super();
    this.buscarNaRede = opcoes.buscar ?? ((endereco, init) => fetch(endereco, init));
  }

  private async ir(endereco: string): ReturnType<Buscar> {
    try {
      return await this.buscarNaRede(endereco, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS), redirect: 'error' });
    } catch {
      // a mensagem do erro de rede pode citar o endereço, que na busca leva a chave: não é repassada
      throw new BancoIndisponivel('rede');
    }
  }

  async buscar(consulta: string, orientacao: OrientacaoDeImagem): Promise<ImagemNoBanco[]> {
    const parametros = new URLSearchParams({
      key: this.opcoes.chave,
      q: consulta.slice(0, 100),
      lang: 'pt',
      image_type: 'photo',
      orientation: ORIENTACAO[orientacao],
      safesearch: 'true',
      per_page: String(RESULTADOS_POR_BUSCA),
    });
    const resposta = await this.ir(`${ENDERECO_DA_BUSCA}?${parametros.toString()}`);
    if (resposta.status === 429) throw new BancoIndisponivel('limite');
    if (resposta.status === 400 || resposta.status === 401 || resposta.status === 403) throw new BancoIndisponivel('credencial');
    if (!resposta.ok) throw new BancoIndisponivel('rede');
    let lida: z.infer<typeof Resposta>;
    try {
      lida = Resposta.parse(await resposta.json());
    } catch {
      throw new BancoIndisponivel('resposta');
    }
    // resultado cujo endereço não é do banco é descartado: só se baixa de onde a porta deixa
    return lida.hits.flatMap((h) => {
      if (!doBanco(h.largeImageURL) || !doBanco(h.webformatURL) || !doBanco(h.pageURL)) return [];
      const escala = Math.min(1, LADO_MAXIMO / Math.max(h.imageWidth, h.imageHeight));
      return [
        {
          id: String(h.id),
          descricao: h.tags.slice(0, 300),
          largura: Math.max(1, Math.round(h.imageWidth * escala)),
          altura: Math.max(1, Math.round(h.imageHeight * escala)),
          autor: h.user.slice(0, 120),
          pagina: h.pageURL,
          urlDoArquivo: h.largeImageURL,
          urlDaPrevia: h.webformatURL,
        },
      ];
    });
  }

  async baixar(url: string, limiteEmBytes: number): Promise<Uint8Array> {
    const destino = doBanco(url);
    if (!destino) throw new BancoIndisponivel('endereco');
    const resposta = await this.ir(destino.toString());
    if (!resposta.ok) throw new BancoIndisponivel(resposta.status === 429 ? 'limite' : 'rede');
    const declarado = Number(resposta.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declarado) && declarado > limiteEmBytes) throw new BancoIndisponivel('tamanho');
    // o tamanho declarado pode mentir: conta os bytes enquanto lê, e para ao passar do limite
    if (!resposta.body) {
      const tudo = new Uint8Array(await resposta.arrayBuffer());
      if (tudo.byteLength > limiteEmBytes) throw new BancoIndisponivel('tamanho');
      return tudo;
    }
    const leitor = resposta.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > limiteEmBytes) {
          await leitor.cancel();
          throw new BancoIndisponivel('tamanho');
        }
        partes.push(value);
      }
    } catch (erro) {
      if (erro instanceof BancoIndisponivel) throw erro;
      throw new BancoIndisponivel('rede');
    }
    return Buffer.concat(partes, total);
  }
}
