// Casos de uso do banco de imagens (ADR 032; docs/mvp/backend.md, 17.12). É o mesmo caminho para a busca do
// editor e para as ferramentas do Otto. Classe pura; as regras do banco de fábrica são cumpridas AQUI:
// - toda busca é servida do cache por 24 horas (a segunda busca igual não vai ao banco);
// - a imagem é baixada para o armazenamento da conta; o documento nunca guarda endereço do banco;
// - `trazer` só aceita id que veio de uma busca das últimas 24 horas: o endereço baixado sai do cache do
//   servidor, nunca do pedido;
// - nada de trazer em massa: teto de imagens por dia e de buscas novas por minuto, por conta;
// - a origem (banco, autor, licença, página) fica guardada com o arquivo e volta em toda resposta.
// O texto da busca é dado de uso: não vai para log nem para evento (ADR 031).
import { createHash } from 'node:crypto';
import { CODIGOS_DE_ERRO, type ImagemTrazida, type OrientacaoDeImagem, type ResultadoDaBuscaDeImagens } from '@otto/shared';
import type { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import { inspecionarImagem } from '../../arquivo/domain/inspecionar-imagem';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { type BancoDeImagens, BancoIndisponivel, type ImagemNoBanco } from './banco-de-imagens';
import type { CacheDeBuscas } from './cache-de-buscas';

const HORA_EM_MS = 3_600_000;
const CARACTERES_DA_CONSULTA = 100;
/** A prévia é a versão de 640 px do banco: bem abaixo disto. */
const BYTES_DA_PREVIA = 2 * 1024 * 1024;
const BYTES_DA_IMAGEM = 25 * 1024 * 1024;
const ID_DO_RESULTADO = /^[A-Za-z0-9_-]{1,40}$/;

export interface LimitesDeImagens {
  /** Imagens que a conta traz de banco por dia (UTC). */
  trazidasPorDia: number;
  /** Buscas que de fato vão ao banco, por conta, por minuto. O que vem do cache não conta. */
  buscasNovasPorMinuto: number;
}

export interface DependenciasDeImagens {
  /** Ausente: este servidor não tem banco de imagens configurado. */
  banco?: BancoDeImagens;
  cache: CacheDeBuscas;
  arquivos: CasosDeUsoDeArquivo;
  registros: RepositorioDeArquivos;
  limites: LimitesDeImagens;
  agora?: () => Date;
  uso?: RegistroDeUso;
  /** O motivo, em código, quando o banco falha. Para o log. */
  aoFalhar?: (motivo: string) => void;
}

/** Quem pediu: a pessoa, no editor, ou o Otto, numa tarefa. Vai para o evento de uso. */
export type OrigemDoPedidoDeImagem = 'editor' | 'otto';

/** Caixa e espaços não fazem busca nova. O que vai ao banco é isto. */
export function normalizarConsulta(consulta: string): string {
  return consulta.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, CARACTERES_DA_CONSULTA).trim();
}

const inicioDoDia = (agora: Date): Date => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));

export class CasosDeUsoDeImagens {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;
  /** Quando cada conta foi ao banco, no último minuto. Por processo: é freio, não contabilidade. */
  private readonly idasAoBanco = new Map<string, number[]>();

  constructor(private readonly d: DependenciasDeImagens) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
  }

  private exigirBanco(): BancoDeImagens {
    if (!this.d.banco) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.bancoDeImagensIndisponivel);
    return this.d.banco;
  }

  private desde(banco: BancoDeImagens, horas: number): Date {
    return new Date(this.agora().getTime() - Math.min(horas, banco.capacidades.enderecosValemPorHoras) * HORA_EM_MS);
  }

  /** Erro do banco vira "indisponível" para quem pediu; o motivo, em código, vai para quem opera. */
  private async noBanco<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (erro) {
      if (!(erro instanceof BancoIndisponivel)) throw erro;
      this.d.aoFalhar?.(erro.motivo);
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.bancoDeImagensIndisponivel);
    }
  }

  async buscar(escopo: EscopoDaConta, pedido: { consulta: string; orientacao: OrientacaoDeImagem }, origem: OrigemDoPedidoDeImagem): Promise<ResultadoDaBuscaDeImagens> {
    const banco = this.exigirBanco();
    const consulta = normalizarConsulta(pedido.consulta);
    if (!consulta) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.pedidoInvalido, { campos: ['q'] });
    const inicio = this.agora().getTime();
    // a chave do cache é um hash: a tabela não guarda o que foi buscado
    const chave = createHash('sha256').update(`${banco.id}\n${consulta}\n${pedido.orientacao}`).digest('hex');
    const horasDeCache = Math.max(banco.capacidades.cacheObrigatorioEmHoras, 1);
    let itens = await this.d.cache.recente(banco.id, chave, this.desde(banco, horasDeCache));
    const doCache = itens !== undefined;
    if (!itens) {
      this.contarIdaAoBanco(escopo);
      itens = await this.noBanco(() => banco.buscar(consulta, pedido.orientacao));
      await this.d.cache.guardar(banco.id, chave, itens, this.agora());
    }
    this.uso.registrar(escopo, { evento: 'imagens_buscadas', banco: banco.id, origem, resultados: itens.length, doCache, duracaoMs: this.agora().getTime() - inicio });
    return {
      banco: { id: banco.id, nome: banco.nome, licenca: banco.licenca, ladoMaximo: banco.capacidades.ladoMaximo },
      // o que sai é só o que o contrato lista: os endereços do arquivo e da prévia ficam no servidor
      itens: itens.map((i) => ({
        banco: banco.id,
        id: i.id,
        descricao: i.descricao,
        largura: i.largura,
        altura: i.altura,
        autor: i.autor,
        pagina: i.pagina,
        previa: `/api/imagens/${banco.id}/${i.id}/previa`,
      })),
    };
  }

  private contarIdaAoBanco(escopo: EscopoDaConta): void {
    const agora = this.agora().getTime();
    const recentes = (this.idasAoBanco.get(escopo.contaId) ?? []).filter((quando) => agora - quando < 60_000);
    if (recentes.length >= this.d.limites.buscasNovasPorMinuto) {
      this.idasAoBanco.set(escopo.contaId, recentes);
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeImagens, { limite: this.d.limites.buscasNovasPorMinuto });
    }
    this.idasAoBanco.set(escopo.contaId, [...recentes, agora]);
  }

  /** Um resultado que este servidor viu numa busca recente. É a única fonte de endereço para baixar. */
  private async vista(banco: BancoDeImagens, bancoPedido: string, id: string): Promise<ImagemNoBanco | undefined> {
    if (bancoPedido !== banco.id || !ID_DO_RESULTADO.test(id)) return undefined;
    return this.d.cache.vista(banco.id, id, this.desde(banco, banco.capacidades.enderecosValemPorHoras));
  }

  /** A prévia de um resultado de busca, pelo servidor: o navegador não fala com o banco. */
  async previa(_escopo: EscopoDaConta, bancoPedido: string, id: string): Promise<{ bytes: Uint8Array; tipo: string }> {
    const banco = this.exigirBanco();
    const imagem = await this.vista(banco, bancoPedido, id);
    if (!imagem) throw new NaoEncontrado();
    const bytes = await this.noBanco(() => banco.baixar(imagem.urlDaPrevia, BYTES_DA_PREVIA));
    // o que vem de terceiros só é repassado se for mesmo imagem
    const inspecao = inspecionarImagem(bytes);
    if (!inspecao.ok) throw new NaoEncontrado();
    return { bytes, tipo: inspecao.tipo };
  }

  async trazer(escopo: EscopoDaConta, pedido: { banco: string; id: string }, origem: OrigemDoPedidoDeImagem): Promise<ImagemTrazida> {
    const banco = this.exigirBanco();
    const imagem = await this.vista(banco, pedido.banco, pedido.id);
    if (!imagem) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.imagemNaoBuscada);
    if ((await this.d.registros.contarTrazidosDesde(escopo, inicioDoDia(this.agora()))) >= this.d.limites.trazidasPorDia)
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeImagens, { limite: this.d.limites.trazidasPorDia });

    const bytes = await this.noBanco(() => banco.baixar(imagem.urlDoArquivo, BYTES_DA_IMAGEM));
    const jaTinha = (await this.d.registros.buscar(escopo, createHash('sha256').update(bytes).digest('hex'))) !== undefined;
    // daqui em diante é um envio como qualquer outro: tipo pelo conteúdo, limite de tamanho e de medida
    const enviado = await this.d.arquivos.enviarImagem(escopo, bytes, { origem: { banco: banco.nome, idExterno: imagem.id, autor: imagem.autor, licenca: banco.licenca, url: imagem.pagina } });
    this.uso.registrar(escopo, { evento: 'imagem_trazida', banco: banco.id, origem, bytes: enviado.bytes, largura: enviado.largura, altura: enviado.altura, jaTinha });
    return {
      ...enviado,
      origem: { banco: banco.nome, autor: imagem.autor, licenca: banco.licenca, pagina: imagem.pagina },
      // o documento guarda o hash e a origem em texto; a página da imagem fica com o arquivo, na conta
      no: {
        tipo: 'imagem',
        arquivo: enviado.sha256,
        larguraOriginal: enviado.largura,
        alturaOriginal: enviado.altura,
        origem: { banco: banco.nome, autor: imagem.autor, licenca: banco.licenca, url: '' },
      },
    };
  }
}
