// Casos de uso da biblioteca de fontes (docs/mvp/backend.md, 7.4 e 17.12). As fontes do Otto são iguais
// para todas as contas: não há escopo de conta aqui.
//
// SOB DEMANDA. A biblioteca começa com as fontes semeadas. Uma família que não está nela e está no catálogo
// (porta CatalogoDeFontes) é trazida na primeira vez em que alguém a pede: os pesos de 300 a 700 que ela tem
// (ou, se não tem nenhum nessa faixa, o mais perto de 400). Daí em diante sai da biblioteca, para todo mundo.
// Quem lê fonte (medidor de texto, bancada do Otto, exportação) continua lendo só da biblioteca: por isso
// `garantir` é chamado ANTES, fora de transação (é rede).
import type { FonteDaBiblioteca, FonteDaLista, ListaDeFontes } from '@otto/shared';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import { licencaDoArquivo, nomePostScript, pareceFonte, pesoMaisProximo } from '../domain/fontes';
import type { BibliotecaDeFontes, FonteRegistrada } from './biblioteca-de-fontes';
import type { CatalogoDeFontes, CategoriaDeFonte, FamiliaDoCatalogo } from './catalogo-de-fontes';

/** A escala de pesos que o Otto usa. */
const PESOS_DO_OTTO: readonly number[] = [300, 400, 500, 600, 700];
/** Quantas famílias novas uma chamada de `garantir` traz. Um lote não vira download em massa. */
const FAMILIAS_NOVAS_POR_VEZ = 4;
/** Quantas famílias uma chamada chega a conferir na biblioteca. */
const FAMILIAS_CONFERIDAS_POR_VEZ = 40;
const RESULTADOS_DO_CATALOGO = 30;
const FAMILIAS_NOVAS_POR_HORA = 60;
const HORA_EM_MS = 3_600_000;
/** Quando o arquivo não declara licença. O texto casa com a regra "aberta, a conferir" de licenca-de-fonte.ts. */
const LICENCA_A_CONFERIR = 'Catálogo de fontes abertas (licença aberta, a conferir por família)';

export interface OpcoesDeFontes {
  /** Uma família foi trazida do catálogo. Só contagens: qual fonte uma peça usa é conteúdo (ADR 031). */
  aoBaixar?(baixada: { pesos: number; bytes: number; duracaoMs: number }): void;
  /** O catálogo falhou. `motivo` é código. */
  aoFalhar?(motivo: string): void;
  agora?: () => number;
  /** Quantas famílias novas este processo traz do catálogo por hora. A rota de fontes é aberta: sem teto, pedir o catálogo inteiro vira download em massa. */
  familiasNovasPorHora?: number;
}

export function pesosParaBaixar(pesosDoCatalogo: readonly number[]): number[] {
  const daEscala = pesosDoCatalogo.filter((p) => PESOS_DO_OTTO.includes(p));
  if (daEscala.length > 0) return daEscala;
  const maisPerto = pesoMaisProximo(pesosDoCatalogo, 400);
  return maisPerto === undefined ? [] : [maisPerto];
}

export class CasosDeUsoDeFontes {
  private readonly trazendo = new Map<string, Promise<void>>();
  /** Quando cada família nova foi trazida, na última hora. Por processo: é freio. */
  private trazidasNaHora: number[] = [];
  private readonly agora: () => number;

  constructor(
    private readonly biblioteca: BibliotecaDeFontes,
    private readonly catalogo?: CatalogoDeFontes,
    private readonly opcoes: OpcoesDeFontes = {},
  ) {
    this.agora = opcoes.agora ?? Date.now;
  }

  /** @param opcoes.catalogo inclui as famílias do catálogo que ainda não foram trazidas (`naBiblioteca: false`). */
  async listar(busca?: string, opcoes: { categoria?: CategoriaDeFonte; catalogo?: boolean } = {}): Promise<ListaDeFontes> {
    const daBiblioteca = await this.biblioteca.listar(busca);
    if (!opcoes.catalogo) return { itens: daBiblioteca };
    const doCatalogo = await this.familiasDoCatalogo();
    const categorias = new Map(doCatalogo.map((f) => [f.familia, f.categoria]));
    const naBiblioteca = new Set((await this.biblioteca.listar()).map((f) => f.familia));
    const primeiro: FonteDaLista[] = daBiblioteca
      .map((f) => ({ familia: f.familia, pesos: f.pesos, ...(categorias.has(f.familia) ? { categoria: categorias.get(f.familia) as CategoriaDeFonte } : {}), naBiblioteca: true }))
      // sem categoria conhecida, a fonte da biblioteca não some quando se filtra: só some a que é de outra categoria
      .filter((f) => !opcoes.categoria || f.categoria === opcoes.categoria);
    const depois = this.filtrar(doCatalogo, busca, opcoes.categoria)
      .filter((f) => !naBiblioteca.has(f.familia))
      .slice(0, RESULTADOS_DO_CATALOGO)
      .map((f) => ({ familia: f.familia, pesos: f.pesos, categoria: f.categoria, naBiblioteca: false }));
    return { itens: [...primeiro, ...depois] };
  }

  /** A busca que o Otto faz no catálogo (ferramenta buscarFontes). */
  async buscarNoCatalogo(consulta: string, categoria: string | undefined): Promise<{ familia: string; pesos: number[]; categoria: string }[]> {
    return this.filtrar(await this.familiasDoCatalogo(), consulta, categoria)
      .slice(0, 20)
      .map((f) => ({ familia: f.familia, pesos: f.pesos, categoria: f.categoria }));
  }

  private filtrar(familias: readonly FamiliaDoCatalogo[], busca: string | undefined, categoria: string | undefined): FamiliaDoCatalogo[] {
    const q = busca?.trim().toLowerCase() ?? '';
    return familias.filter((f) => (!q || f.familia.toLowerCase().includes(q)) && (!categoria || f.categoria === categoria));
  }

  /** O catálogo fora do ar não derruba a biblioteca: vale como catálogo vazio. */
  private async familiasDoCatalogo(): Promise<FamiliaDoCatalogo[]> {
    if (!this.catalogo) return [];
    try {
      return await this.catalogo.familias();
    } catch (erro) {
      this.opcoes.aoFalhar?.((erro as { motivo?: string }).motivo ?? 'desconhecido');
      return [];
    }
  }

  async detalhe(familia: string, peso: number): Promise<FonteDaBiblioteca> {
    const fonte = await this.maisProxima(familia, peso);
    return { familia: fonte.familia, peso: fonte.peso, nomePostScript: fonte.nomePostScript, arquivo: `/api/fontes/${encodeURIComponent(fonte.familia)}/${fonte.peso}/arquivo` };
  }

  async arquivo(familia: string, peso: number): Promise<{ bytes: Uint8Array; sha256: string; peso: number }> {
    const fonte = await this.maisProxima(familia, peso);
    const bytes = await this.biblioteca.bytes(fonte);
    if (!bytes) throw new NaoEncontrado();
    return { bytes, sha256: fonte.sha256, peso: fonte.peso };
  }

  /**
   * Traz do catálogo as famílias que ainda não estão na biblioteca. Nunca lança: o que não deu para trazer
   * fica como estava (o texto sai com a fonte de reserva do motor, e o relatório acusa a falta).
   */
  async garantir(familias: Iterable<string>): Promise<void> {
    if (!this.catalogo) return;
    let foraDaBiblioteca = 0;
    for (const familia of [...new Set(familias)].slice(0, FAMILIAS_CONFERIDAS_POR_VEZ)) {
      if (typeof familia !== 'string' || familia.length === 0 || familia.length > 80) continue;
      if ((await this.biblioteca.pesosDa(familia)).length > 0) continue;
      // conta toda família que não está na biblioteca, exista ou não no catálogo: nome inventado também gasta
      if (++foraDaBiblioteca > FAMILIAS_NOVAS_POR_VEZ) break;
      const doCatalogo = (await this.familiasDoCatalogo()).find((f) => f.familia === familia);
      if (!doCatalogo) continue;
      // quem já está sendo trazida não gasta o teto de novo
      if (!this.trazendo.has(familia) && !this.cabeMaisUma()) {
        this.opcoes.aoFalhar?.('teto_por_hora');
        break;
      }
      await this.trazer(doCatalogo);
    }
  }

  private cabeMaisUma(): boolean {
    const agora = this.agora();
    this.trazidasNaHora = this.trazidasNaHora.filter((quando) => agora - quando < HORA_EM_MS);
    if (this.trazidasNaHora.length >= (this.opcoes.familiasNovasPorHora ?? FAMILIAS_NOVAS_POR_HORA)) return false;
    this.trazidasNaHora.push(agora);
    return true;
  }

  /** Um download por família de cada vez: quem chega no meio espera o mesmo. */
  private trazer(familia: FamiliaDoCatalogo): Promise<void> {
    const emCurso = this.trazendo.get(familia.familia);
    if (emCurso) return emCurso;
    const tarefa = this.baixarERegistrar(familia).finally(() => this.trazendo.delete(familia.familia));
    this.trazendo.set(familia.familia, tarefa);
    return tarefa;
  }

  private async baixarERegistrar(familia: FamiliaDoCatalogo): Promise<void> {
    const catalogo = this.catalogo;
    if (!catalogo) return;
    const inicio = this.agora();
    let pesos = 0;
    let bytes = 0;
    try {
      for (const peso of pesosParaBaixar(familia.pesos)) {
        const conteudo = await catalogo.baixar(familia.familia, peso);
        // o que vem de fora só entra se for mesmo um arquivo de fonte
        if (!conteudo || !pareceFonte(conteudo)) continue;
        await this.biblioteca.registrar({ familia: familia.familia, peso, nomePostScript: nomePostScript(conteudo) ?? null, licenca: licencaDoArquivo(conteudo) ?? LICENCA_A_CONFERIR, conteudo });
        pesos++;
        bytes += conteudo.byteLength;
      }
    } catch (erro) {
      this.opcoes.aoFalhar?.((erro as { motivo?: string }).motivo ?? 'desconhecido');
    }
    if (pesos > 0) this.opcoes.aoBaixar?.({ pesos, bytes, duracaoMs: this.agora() - inicio });
  }

  private async maisProxima(familia: string, peso: number): Promise<FonteRegistrada> {
    if (!Number.isInteger(peso) || peso < 1 || peso > 1000) throw new NaoEncontrado();
    await this.garantir([familia]);
    const pesos = await this.biblioteca.pesosDa(familia);
    const escolhido = pesoMaisProximo(
      pesos.map((f) => f.peso),
      peso,
    );
    const fonte = pesos.find((f) => f.peso === escolhido);
    if (!fonte) throw new NaoEncontrado();
    return fonte;
  }
}
