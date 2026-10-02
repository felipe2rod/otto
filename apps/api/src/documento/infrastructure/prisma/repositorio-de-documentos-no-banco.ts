// Adaptador de RepositorioDeDocumentos sobre PostgreSQL (Prisma). Todo acesso passa por
// PrismaComEscopo.executar: transação com app.conta_id setado, e o RLS confere cada linha.
// O filtro por conta_id aqui é redundante com o RLS de propósito (ADR 023: os dois, em camadas).
import { Documento } from '@otto/documento';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { CursorInvalido, codificarCursor, lerCursor } from '../../../plataforma/paginacao/cursor';
import type { JsonDoBanco, PrismaComEscopo, TransacaoComEscopo } from '../../../plataforma/persistencia/prisma-com-escopo';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O que se lê de um lote. As operações ficam de fora: pesam, e o histórico não precisa delas. */
const CAMPOS_DO_LOTE = {
  id: true,
  chaveDoCliente: true,
  versao: true,
  autoria: true,
  tarefaId: true,
  tipo: true,
  reverteAteVersao: true,
  desfeitoPor: true,
  descricao: true,
  tocados: true,
  quantidadeDeOperacoes: true,
  criadoEm: true,
} as const;

interface LinhaDeDocumento {
  id: string;
  nome: string;
  versaoAtual: number;
  pranchetas: number;
  alteradoEm: Date;
  marcaId: string | null;
  miniaturaVersao: number | null;
  importacaoId: string | null;
}

const registro = (l: LinhaDeDocumento): RegistroDeDocumento => ({
  id: l.id,
  nome: l.nome,
  versao: l.versaoAtual,
  pranchetas: l.pranchetas,
  alteradoEm: l.alteradoEm,
  ...(l.marcaId ? { marcaId: l.marcaId } : {}),
  ...(l.miniaturaVersao !== null ? { miniaturaVersao: l.miniaturaVersao } : {}),
  ...(l.importacaoId ? { importacaoId: l.importacaoId } : {}),
});

const loteGravado = (l: { tocados: unknown } & Omit<LoteGravado, 'tocados'>): LoteGravado => ({ ...l, tocados: Array.isArray(l.tocados) ? l.tocados.map(String) : [] });

/** A árvore guardada é sempre relida pelo esquema: é ele quem conhece o formato e os padrões. */
const lerArvore = (json: unknown): Documento => Documento.parse(json);
const emJson = (arvore: Documento): JsonDoBanco => arvore as unknown as JsonDoBanco;
const bytesDe = (arvore: Documento): number => Buffer.byteLength(JSON.stringify(arvore), 'utf8');

export class RepositorioDeDocumentosNoBanco extends RepositorioDeDocumentos {
  constructor(private readonly prisma: PrismaComEscopo) {
    super();
  }

  temExemplo(escopo: EscopoDaConta): Promise<boolean> {
    return this.prisma.executar(escopo, async (tx) => (await tx.documento.count({ where: { contaId: escopo.contaId, deExemplo: true } })) > 0);
  }

  async daImportacao(escopo: EscopoDaConta, importacaoId: string): Promise<RegistroDeDocumento | undefined> {
    if (!UUID.test(importacaoId)) return undefined;
    const linha = await this.prisma.executar(escopo, (tx) => tx.documento.findFirst({ where: { contaId: escopo.contaId, importacaoId } }));
    return linha ? registro(linha) : undefined;
  }

  async criar(escopo: EscopoDaConta, novo: NovoDocumento): Promise<DocumentoGuardado> {
    return this.prisma.executar(escopo, async (tx) => {
      const linha = await tx.documento.create({
        data: {
          id: novo.id,
          contaId: escopo.contaId,
          nome: novo.nome,
          versaoAtual: 0,
          versaoDoFormato: novo.arvore.versaoDoFormato,
          pranchetas: novo.arvore.pranchetas.length,
          deExemplo: novo.deExemplo ?? false,
          ...(novo.importacaoId ? { importacaoId: novo.importacaoId } : {}),
        },
      });
      await tx.versaoDeDocumento.create({ data: { contaId: escopo.contaId, documentoId: novo.id, versao: 0, arvore: emJson(novo.arvore), bytes: bytesDe(novo.arvore) } });
      return { ...registro(linha), arvore: novo.arvore };
    });
  }

  async definirMarca(escopo: EscopoDaConta, id: string, marcaId: string): Promise<boolean> {
    if (!UUID.test(id) || !UUID.test(marcaId)) return false;
    return (await this.prisma.executar(escopo, (tx) => tx.documento.updateMany({ where: { id, contaId: escopo.contaId }, data: { marcaId } }))).count > 0;
  }

  async pedirMiniatura(escopo: EscopoDaConta, id: string, agora: Date, seAnteriorA: Date): Promise<boolean> {
    if (!UUID.test(id)) return false;
    // a condição vai no UPDATE: dois lotes ao mesmo tempo publicam um trabalho só
    const mudou = await this.prisma.executar(
      escopo,
      (tx) => tx.$executeRaw`
        UPDATE documentos SET miniatura_pedida_em = ${agora}
        WHERE id = ${id}::uuid AND conta_id = ${escopo.contaId}::uuid AND (miniatura_pedida_em IS NULL OR miniatura_pedida_em < ${seAnteriorA})`,
    );
    return mudou > 0;
  }

  async gravarMiniatura(escopo: EscopoDaConta, id: string, versao: number): Promise<{ anterior?: number } | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const antes = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId }, select: { miniaturaVersao: true } });
      if (!antes) return undefined;
      // sem tocar em alterado_em: a peça não sobe na lista por causa da miniatura
      await tx.documento.updateMany({ where: { id, contaId: escopo.contaId }, data: { miniaturaVersao: versao } });
      return antes.miniaturaVersao !== null ? { anterior: antes.miniaturaVersao } : {};
    });
  }

  async listar(escopo: EscopoDaConta, pagina: { cursor?: string; limite: number; marcaId?: string }): Promise<Pagina<RegistroDeDocumento>> {
    if (pagina.marcaId !== undefined && !UUID.test(pagina.marcaId)) return { itens: [], proximoCursor: null };
    const depoisDe = pagina.cursor ? lerPosicaoDaLista(pagina.cursor) : undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const linhas = await tx.documento.findMany({
        where: {
          contaId: escopo.contaId,
          arquivadoEm: null,
          ...(pagina.marcaId ? { marcaId: pagina.marcaId } : {}),
          ...(depoisDe ? { OR: [{ alteradoEm: { lt: depoisDe.alteradoEm } }, { alteradoEm: depoisDe.alteradoEm, id: { lt: depoisDe.id } }] } : {}),
        },
        orderBy: [{ alteradoEm: 'desc' }, { id: 'desc' }],
        take: pagina.limite + 1,
      });
      const itens = linhas.slice(0, pagina.limite).map(registro);
      const ultimo = itens.at(-1);
      return { itens, proximoCursor: ultimo && linhas.length > pagina.limite ? codificarCursor({ alteradoEm: ultimo.alteradoEm.toISOString(), id: ultimo.id }) : null };
    });
  }

  async abrir(escopo: EscopoDaConta, id: string): Promise<DocumentoGuardado | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const linha = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId, arquivadoEm: null } });
      if (!linha) return undefined;
      const versao = await tx.versaoDeDocumento.findUnique({ where: { documentoId_versao: { documentoId: id, versao: linha.versaoAtual } } });
      if (!versao?.arvore) throw new Error('documento sem a árvore da versão atual');
      return { ...registro(linha), arvore: lerArvore(versao.arvore) };
    });
  }

  async renomear(escopo: EscopoDaConta, id: string, nome: string): Promise<RegistroDeDocumento | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const alteradas = await tx.documento.updateMany({ where: { id, contaId: escopo.contaId, arquivadoEm: null }, data: { nome, alteradoEm: new Date() } });
      if (alteradas.count === 0) return undefined;
      const linha = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId } });
      return linha ? registro(linha) : undefined;
    });
  }

  async resumoDoHistorico(escopo: EscopoDaConta, id: string): Promise<ResumoDoHistorico | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const doc = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId, arquivadoEm: null }, select: { versaoAtual: true } });
      if (!doc) return undefined;
      if (doc.versaoAtual === 0) return { cauda: [] };
      // a edição mais recente marca o começo da cauda; tudo depois dela é reversão
      const ultimaEdicao = await tx.loteDeOperacoes.findFirst({ where: { documentoId: id, contaId: escopo.contaId, tipo: 'edicao' }, orderBy: { versao: 'desc' }, select: { versao: true } });
      const desde = ultimaEdicao?.versao ?? 0;
      const linhas = await tx.loteDeOperacoes.findMany({
        where: { documentoId: id, contaId: escopo.contaId, versao: { gte: Math.max(1, desde) } },
        orderBy: { versao: 'desc' },
        select: CAMPOS_DO_LOTE,
      });
      const lotes = linhas.map(loteGravado);
      const cauda = lotes.filter((l) => l.versao > desde);
      const antes = lotes.find((l) => l.versao === desde);
      const atual = lotes[0];
      return { ...(atual ? { atual } : {}), cauda, ...(antes ? { antesDaCauda: antes } : {}) };
    });
  }

  async arvoreNaVersao(escopo: EscopoDaConta, id: string, versao: number): Promise<{ nome: string; arvore: Documento } | undefined> {
    if (!UUID.test(id) || !Number.isInteger(versao) || versao < 0) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const doc = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId }, select: { nome: true } });
      if (!doc) return undefined;
      const linha = await tx.versaoDeDocumento.findUnique({ where: { documentoId_versao: { documentoId: id, versao } } });
      return linha?.arvore ? { nome: doc.nome, arvore: lerArvore(linha.arvore) } : undefined;
    });
  }

  async arquivar(escopo: EscopoDaConta, id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    return this.prisma.executar(escopo, async (tx) => {
      const alteradas = await tx.documento.updateMany({ where: { id, contaId: escopo.contaId, arquivadoEm: null }, data: { arquivadoEm: new Date() } });
      return alteradas.count > 0;
    });
  }

  async historico(escopo: EscopoDaConta, id: string, pagina: { cursor?: string; limite: number }): Promise<Pagina<LoteGravado> | undefined> {
    if (!UUID.test(id)) return undefined;
    const antesDe = pagina.cursor ? lerPosicaoDoHistorico(pagina.cursor) : undefined;
    return this.prisma.executar(escopo, async (tx) => {
      const existe = await tx.documento.findFirst({ where: { id, contaId: escopo.contaId, arquivadoEm: null }, select: { id: true } });
      if (!existe) return undefined;
      const linhas = await tx.loteDeOperacoes.findMany({
        where: { documentoId: id, contaId: escopo.contaId, ...(antesDe !== undefined ? { versao: { lt: antesDe } } : {}) },
        orderBy: { versao: 'desc' },
        take: pagina.limite + 1,
        select: CAMPOS_DO_LOTE,
      });
      const itens = linhas.slice(0, pagina.limite).map(loteGravado);
      const ultimo = itens.at(-1);
      return { itens, proximoCursor: ultimo && linhas.length > pagina.limite ? codificarCursor({ versao: ultimo.versao }) : null };
    });
  }

  async comTrava<T>(escopo: EscopoDaConta, id: string, fn: (doc: DocumentoTravado) => Promise<T>): Promise<T | undefined> {
    if (!UUID.test(id)) return undefined;
    return this.prisma.executar(escopo, async (tx) => {
      // FOR UPDATE: o segundo lote no mesmo documento espera o primeiro terminar e vê a versão nova
      const travadas = await tx.$queryRaw<{ id: string; nome: string; versao_atual: number; pranchetas: number; alterado_em: Date }[]>`
        SELECT id, nome, versao_atual, pranchetas, alterado_em FROM documentos
        WHERE id = ${id}::uuid AND conta_id = ${escopo.contaId}::uuid AND arquivado_em IS NULL
        FOR UPDATE`;
      const linha = travadas[0];
      if (!linha) return undefined;
      return fn(new DocumentoTravadoNoBanco(tx, escopo, { id: linha.id, nome: linha.nome, versao: linha.versao_atual, pranchetas: linha.pranchetas, alteradoEm: linha.alterado_em }));
    });
  }
}

class DocumentoTravadoNoBanco implements DocumentoTravado {
  private atual: RegistroDeDocumento;

  constructor(
    private readonly tx: TransacaoComEscopo,
    private readonly escopo: EscopoDaConta,
    registroInicial: RegistroDeDocumento,
  ) {
    this.atual = registroInicial;
  }

  get registro(): RegistroDeDocumento {
    return this.atual;
  }

  async arvore(): Promise<Documento> {
    const arvore = await this.arvoreDaVersao(this.atual.versao);
    if (!arvore) throw new Error('documento sem a árvore da versão atual');
    return arvore;
  }

  async arvoreDaVersao(versao: number): Promise<Documento | undefined> {
    const linha = await this.tx.versaoDeDocumento.findUnique({ where: { documentoId_versao: { documentoId: this.atual.id, versao } } });
    return linha?.arvore ? lerArvore(linha.arvore) : undefined;
  }

  async lote(versao: number): Promise<LoteGravado | undefined> {
    const linha = await this.tx.loteDeOperacoes.findUnique({ where: { documentoId_versao: { documentoId: this.atual.id, versao } }, select: CAMPOS_DO_LOTE });
    return linha ? loteGravado(linha) : undefined;
  }

  async lotePorChaveDoCliente(chave: string): Promise<LoteGravado | undefined> {
    if (!UUID.test(chave)) return undefined;
    const linha = await this.tx.loteDeOperacoes.findFirst({ where: { contaId: this.escopo.contaId, documentoId: this.atual.id, chaveDoCliente: chave }, select: CAMPOS_DO_LOTE });
    return linha ? loteGravado(linha) : undefined;
  }

  async primeiraVersaoDaTarefa(tarefaId: string): Promise<number | undefined> {
    // usa o índice (conta_id, tarefa_id) dos lotes
    const primeiro = await this.tx.loteDeOperacoes.findFirst({ where: { contaId: this.escopo.contaId, tarefaId, documentoId: this.atual.id }, orderBy: { versao: 'asc' }, select: { versao: true } });
    return primeiro?.versao;
  }

  async caudaDeReversoes(): Promise<LoteGravado[]> {
    // a edição mais recente marca o começo da cauda; tudo depois dela é reversão
    const ultimaEdicao = await this.tx.loteDeOperacoes.findFirst({
      where: { documentoId: this.atual.id, contaId: this.escopo.contaId, tipo: 'edicao' },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });
    const linhas = await this.tx.loteDeOperacoes.findMany({
      where: { documentoId: this.atual.id, contaId: this.escopo.contaId, versao: { gt: ultimaEdicao?.versao ?? 0 } },
      orderBy: { versao: 'desc' },
      select: CAMPOS_DO_LOTE,
    });
    return linhas.map(loteGravado);
  }

  async gravarLote(novo: NovoLote): Promise<void> {
    if (novo.versao !== this.atual.versao + 1) throw new Error('lote fora de ordem: a versão de um lote é a atual mais 1');
    const agora = new Date();
    await this.tx.loteDeOperacoes.create({
      data: {
        id: novo.id,
        contaId: this.escopo.contaId,
        documentoId: this.atual.id,
        versao: novo.versao,
        autoria: novo.autoria,
        tarefaId: novo.tarefaId ?? null,
        tipo: novo.tipo,
        reverteAteVersao: novo.reverteAteVersao ?? null,
        descricao: novo.descricao,
        operacoes: novo.operacoes as JsonDoBanco,
        quantidadeDeOperacoes: novo.operacoes.length,
        tocados: [...novo.tocados],
        chaveDoCliente: novo.chaveDoCliente ?? null,
        criadoEm: agora,
      },
    });
    await this.tx.versaoDeDocumento.create({ data: { contaId: this.escopo.contaId, documentoId: this.atual.id, versao: novo.versao, arvore: emJson(novo.arvore), bytes: bytesDe(novo.arvore) } });
    const pranchetas = novo.arvore.pranchetas.length;
    await this.tx.documento.update({ where: { id: this.atual.id }, data: { versaoAtual: novo.versao, pranchetas, alteradoEm: agora } });
    this.atual = { ...this.atual, versao: novo.versao, pranchetas, alteradoEm: agora };
  }

  async marcarDesfeito(versao: number, por: string | null): Promise<void> {
    await this.tx.loteDeOperacoes.update({ where: { documentoId_versao: { documentoId: this.atual.id, versao } }, data: { desfeitoPor: por } });
  }
}

function lerPosicaoDaLista(cursor: string): { alteradoEm: Date; id: string } {
  const lido = lerCursor(cursor);
  const alteradoEm = new Date(String(lido.alteradoEm));
  if (Number.isNaN(alteradoEm.getTime()) || typeof lido.id !== 'string' || !UUID.test(lido.id)) throw new CursorInvalido();
  return { alteradoEm, id: lido.id };
}

function lerPosicaoDoHistorico(cursor: string): number {
  const versao = Number(lerCursor(cursor).versao);
  if (!Number.isInteger(versao) || versao < 0) throw new CursorInvalido();
  return versao;
}
