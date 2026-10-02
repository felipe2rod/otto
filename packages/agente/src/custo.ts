// Custo por tarefa (ADR 029, item 5): tokens de entrada, de cache e de saída, imagens vistas, voltas,
// chamadas e tempo. Só números: pode ir para registro de uso (ADR 031). O dinheiro sai do preço que o
// modelo declara; o núcleo não conhece tabela de fornecedor.
import type { CustoDaTarefa } from './contrato';
import type { LimitesDoSistema, PapelDaChamada, PrecoDoModelo, UsoDoModelo } from './portas';

export function custoVazio(modelo: string): CustoDaTarefa {
  return {
    modelo,
    chamadas: 0,
    tokens: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 },
    porPapel: {},
    imagensVistas: 0,
    voltasDeConferencia: 0,
    lotes: 0,
    lotesRecusados: 0,
    duracaoMs: 0,
    dolares: null,
  };
}

/** Dólares de um uso, pelo preço por milhão de tokens. */
export function dolaresDoUso(uso: UsoDoModelo, preco: PrecoDoModelo): number {
  return (uso.entrada * preco.entrada + uso.cacheLido * preco.cacheLido + uso.cacheCriado * preco.cacheCriado + uso.saida * preco.saida) / 1_000_000;
}

/** Entrada total (cheia, lida do cache e escrita no cache) mais saída. */
export function totalDeTokens(c: CustoDaTarefa): number {
  return c.tokens.entrada + c.tokens.cacheLido + c.tokens.cacheCriado + c.tokens.saida;
}

/** Fração da entrada que veio do cache, de 0 a 1. */
export function fracaoDeCache(c: CustoDaTarefa): number {
  const entrada = c.tokens.entrada + c.tokens.cacheLido + c.tokens.cacheCriado;
  return entrada === 0 ? 0 : c.tokens.cacheLido / entrada;
}

export type TetoEstourado = 'limite_de_passos' | 'limite_de_custo' | 'limite_de_tempo';

/** Acumula o custo de uma parte da tarefa. Começa do custo da parte anterior, quando há. */
export class Contador {
  private readonly custo: CustoDaTarefa;
  private readonly inicio: number;
  private readonly duracaoAnterior: number;

  constructor(
    modelo: string,
    private readonly relogio: { agora(): number },
    anterior?: CustoDaTarefa,
  ) {
    this.custo = anterior ? structuredClone(anterior) : custoVazio(modelo);
    this.duracaoAnterior = anterior?.duracaoMs ?? 0;
    this.inicio = relogio.agora();
  }

  chamada(papel: PapelDaChamada, uso: UsoDoModelo, preco: PrecoDoModelo | undefined): void {
    const c = this.custo;
    c.chamadas++;
    c.tokens.entrada += uso.entrada;
    c.tokens.cacheLido += uso.cacheLido;
    c.tokens.cacheCriado += uso.cacheCriado;
    c.tokens.saida += uso.saida;
    const p = c.porPapel[papel] ?? { chamadas: 0, entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 };
    c.porPapel[papel] = {
      chamadas: p.chamadas + 1,
      entrada: p.entrada + uso.entrada,
      cacheLido: p.cacheLido + uso.cacheLido,
      cacheCriado: p.cacheCriado + uso.cacheCriado,
      saida: p.saida + uso.saida,
    };
    if (preco) c.dolares = (c.dolares ?? 0) + dolaresDoUso(uso, preco);
  }

  imagens(quantas: number): void {
    this.custo.imagensVistas += quantas;
  }
  volta(): void {
    this.custo.voltasDeConferencia++;
  }
  lote(): void {
    this.custo.lotes++;
  }
  loteRecusado(): void {
    this.custo.lotesRecusados++;
  }

  get chamadas(): number {
    return this.custo.chamadas;
  }
  get voltas(): number {
    return this.custo.voltasDeConferencia;
  }
  get lotes(): number {
    return this.custo.lotes;
  }

  /** O teto do sistema que já estourou, se algum. Conferido antes de cada chamada ao modelo. */
  estourou(limites: LimitesDoSistema): TetoEstourado | undefined {
    const c = this.total();
    if (c.chamadas >= limites.maximoDeChamadas) return 'limite_de_passos';
    if (totalDeTokens(c) >= limites.tetoDeTokens) return 'limite_de_custo';
    if (c.dolares !== null && c.dolares >= limites.tetoDeCusto) return 'limite_de_custo';
    if (c.duracaoMs >= limites.tetoDeTempoMs) return 'limite_de_tempo';
    return undefined;
  }

  total(): CustoDaTarefa {
    return { ...structuredClone(this.custo), duracaoMs: this.duracaoAnterior + (this.relogio.agora() - this.inicio) };
  }
}
