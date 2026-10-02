// Adaptador falso de RepositorioDeDocumentos: é o que os testes de caso de uso usam.
// Passa pelo mesmo contrato do adaptador do banco (repositorio-de-documentos.contrato.ts).
import type { Documento } from '@otto/documento';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { codificarCursor, lerCursor } from '../../../plataforma/paginacao/cursor';
import {
  type DocumentoGuardado,
  type DocumentoTravado,
  type LoteGravado,
  type NovoDocumento,
  type NovoLote,
  type Pagina,
  type RegistroDeDocumento,
  RepositorioDeDocumentos,
  type ResumoDoHistorico,
} from '../../application/repositorio-de-documentos';

interface Guardado {
  contaId: string;
  registro: RegistroDeDocumento;
  arquivado: boolean;
  arvores: Map<number, Documento>;
  lotes: LoteGravado[];
}

export class RepositorioDeDocumentosEmMemoria extends RepositorioDeDocumentos {
  private docs = new Map<string, Guardado>();
  private relogio = 0;
  /** Uma transação por vez, como a trava de linha do banco. */
  private fila: Promise<unknown> = Promise.resolve();

  private agora(): Date {
    // sempre crescente, para a ordem da lista ser determinística no teste
    this.relogio += 1;
    return new Date(1_790_000_000_000 + this.relogio);
  }

  private achar(escopo: EscopoDaConta, id: string): Guardado | undefined {
    const g = this.docs.get(id);
    return g && g.contaId === escopo.contaId && !g.arquivado ? g : undefined;
  }

  private readonly comExemplo = new Set<string>();

  async temExemplo(escopo: EscopoDaConta): Promise<boolean> {
    return this.comExemplo.has(escopo.contaId);
  }

  async daImportacao(escopo: EscopoDaConta, importacaoId: string): Promise<RegistroDeDocumento | undefined> {
    const g = [...this.docs.values()].find((d) => d.contaId === escopo.contaId && d.registro.importacaoId === importacaoId);
    return g ? { ...g.registro } : undefined;
  }

  async criar(escopo: EscopoDaConta, novo: NovoDocumento): Promise<DocumentoGuardado> {
    if (novo.importacaoId && [...this.docs.values()].some((d) => d.registro.importacaoId === novo.importacaoId)) throw new Error('a importação já criou uma peça');
    if (novo.deExemplo) this.comExemplo.add(escopo.contaId);
    const registro: RegistroDeDocumento = {
      id: novo.id,
      nome: novo.nome,
      versao: 0,
      pranchetas: novo.arvore.pranchetas.length,
      alteradoEm: this.agora(),
      ...(novo.importacaoId ? { importacaoId: novo.importacaoId } : {}),
    };
    this.docs.set(novo.id, { contaId: escopo.contaId, registro, arquivado: false, arvores: new Map([[0, novo.arvore]]), lotes: [] });
    return { ...registro, arvore: novo.arvore };
  }

  private readonly miniaturasPedidas = new Map<string, Date>();

  async definirMarca(escopo: EscopoDaConta, id: string, marcaId: string): Promise<boolean> {
    const g = this.achar(escopo, id);
    if (!g) return false;
    g.registro = { ...g.registro, marcaId };
    return true;
  }

  async pedirMiniatura(escopo: EscopoDaConta, id: string, agora: Date, seAnteriorA: Date): Promise<boolean> {
    if (!this.achar(escopo, id)) return false;
    const ultima = this.miniaturasPedidas.get(id);
    if (ultima && ultima >= seAnteriorA) return false;
    this.miniaturasPedidas.set(id, agora);
    return true;
  }

  async gravarMiniatura(escopo: EscopoDaConta, id: string, versao: number): Promise<{ anterior?: number } | undefined> {
    const g = this.achar(escopo, id);
    if (!g) return undefined;
    const anterior = g.registro.miniaturaVersao;
    g.registro = { ...g.registro, miniaturaVersao: versao };
    return anterior !== undefined ? { anterior } : {};
  }

  async listar(escopo: EscopoDaConta, pagina: { cursor?: string; limite: number; marcaId?: string }): Promise<Pagina<RegistroDeDocumento>> {
    const todos = [...this.docs.values()]
      .filter((g) => g.contaId === escopo.contaId && !g.arquivado && (pagina.marcaId === undefined || g.registro.marcaId === pagina.marcaId))
      .map((g) => g.registro)
      .sort((a, b) => b.alteradoEm.getTime() - a.alteradoEm.getTime() || (a.id < b.id ? 1 : -1));
    const depoisDe = pagina.cursor ? lerCursor(pagina.cursor) : undefined;
    const inicio = depoisDe ? todos.findIndex((r) => r.id === depoisDe.id) + 1 : 0;
    const itens = todos.slice(inicio, inicio + pagina.limite).map((r) => ({ ...r }));
    const ultimo = itens.at(-1);
    return { itens, proximoCursor: ultimo && inicio + pagina.limite < todos.length ? codificarCursor({ alteradoEm: ultimo.alteradoEm.toISOString(), id: ultimo.id }) : null };
  }

  async abrir(escopo: EscopoDaConta, id: string): Promise<DocumentoGuardado | undefined> {
    const g = this.achar(escopo, id);
    return g ? { ...g.registro, arvore: g.arvores.get(g.registro.versao) as Documento } : undefined;
  }

  async renomear(escopo: EscopoDaConta, id: string, nome: string): Promise<RegistroDeDocumento | undefined> {
    const g = this.achar(escopo, id);
    if (!g) return undefined;
    g.registro = { ...g.registro, nome, alteradoEm: this.agora() };
    return { ...g.registro };
  }

  async resumoDoHistorico(escopo: EscopoDaConta, id: string): Promise<ResumoDoHistorico | undefined> {
    const g = this.achar(escopo, id);
    if (!g) return undefined;
    const cauda: LoteGravado[] = [];
    for (let i = g.lotes.length - 1; i >= 0 && g.lotes[i]?.tipo === 'reversao'; i--) cauda.push({ ...(g.lotes[i] as LoteGravado) });
    const atual = g.lotes.at(-1);
    const antes = g.lotes[g.lotes.length - cauda.length - 1];
    return { ...(atual ? { atual: { ...atual } } : {}), cauda, ...(antes ? { antesDaCauda: { ...antes } } : {}) };
  }

  async arvoreNaVersao(escopo: EscopoDaConta, id: string, versao: number): Promise<{ nome: string; arvore: Documento } | undefined> {
    const g = this.achar(escopo, id);
    const arvore = g?.arvores.get(versao);
    return g && arvore ? { nome: g.registro.nome, arvore } : undefined;
  }

  async arquivar(escopo: EscopoDaConta, id: string): Promise<boolean> {
    const g = this.achar(escopo, id);
    if (!g) return false;
    g.arquivado = true;
    return true;
  }

  async historico(escopo: EscopoDaConta, id: string, pagina: { cursor?: string; limite: number }): Promise<Pagina<LoteGravado> | undefined> {
    const g = this.achar(escopo, id);
    if (!g) return undefined;
    const antesDe = pagina.cursor ? Number(lerCursor(pagina.cursor).versao) : Number.POSITIVE_INFINITY;
    const todos = g.lotes.filter((l) => l.versao < antesDe).sort((a, b) => b.versao - a.versao);
    const itens = todos.slice(0, pagina.limite).map((l) => ({ ...l }));
    const ultimo = itens.at(-1);
    return { itens, proximoCursor: ultimo && todos.length > pagina.limite ? codificarCursor({ versao: ultimo.versao }) : null };
  }

  comTrava<T>(escopo: EscopoDaConta, id: string, fn: (doc: DocumentoTravado) => Promise<T>): Promise<T | undefined> {
    const rodar = async (): Promise<T | undefined> => {
      const g = this.achar(escopo, id);
      if (!g) return undefined;
      // trabalha numa cópia: se fn lançar, nada muda (é o ROLLBACK)
      const copia: Guardado = { ...g, registro: { ...g.registro }, arvores: new Map(g.arvores), lotes: g.lotes.map((l) => ({ ...l })) };
      const travado: DocumentoTravado = {
        get registro() {
          return copia.registro;
        },
        arvore: async () => copia.arvores.get(copia.registro.versao) as Documento,
        arvoreDaVersao: async (versao) => copia.arvores.get(versao),
        lote: async (versao) => copia.lotes.find((l) => l.versao === versao),
        lotePorChaveDoCliente: async (chave) => copia.lotes.find((l) => l.chaveDoCliente === chave),
        primeiraVersaoDaTarefa: async (tarefaId) => copia.lotes.find((l) => l.tarefaId === tarefaId)?.versao,
        caudaDeReversoes: async () => {
          const cauda: LoteGravado[] = [];
          for (let i = copia.lotes.length - 1; i >= 0 && copia.lotes[i]?.tipo === 'reversao'; i--) cauda.push(copia.lotes[i] as LoteGravado);
          return cauda;
        },
        gravarLote: async (novo: NovoLote) => {
          if (novo.versao !== copia.registro.versao + 1) throw new Error('versão fora de ordem');
          copia.lotes.push({
            id: novo.id,
            chaveDoCliente: novo.chaveDoCliente ?? null,
            versao: novo.versao,
            autoria: novo.autoria,
            tarefaId: novo.tarefaId ?? null,
            tipo: novo.tipo,
            reverteAteVersao: novo.reverteAteVersao ?? null,
            desfeitoPor: null,
            descricao: novo.descricao,
            tocados: [...novo.tocados],
            quantidadeDeOperacoes: novo.operacoes.length,
            criadoEm: this.agora(),
          });
          copia.arvores.set(novo.versao, novo.arvore);
          copia.registro = { ...copia.registro, versao: novo.versao, pranchetas: novo.arvore.pranchetas.length, alteradoEm: this.agora() };
        },
        marcarDesfeito: async (versao, por) => {
          const lote = copia.lotes.find((l) => l.versao === versao);
          if (lote) lote.desfeitoPor = por;
        },
      };
      const resultado = await fn(travado);
      this.docs.set(id, copia);
      return resultado;
    };
    const vez = this.fila.then(rodar, rodar);
    this.fila = vez.catch(() => undefined);
    return vez;
  }
}
