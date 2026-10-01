// Casos de uso de documento (docs/mvp/backend.md, seções 6.3 e 7.3). Classe pura: sem NestJS,
// sem Prisma, sem HTTP. Roda igual na API, no worker e num comando.
//
// Regras que moram aqui:
// - toda mudança de documento é um lote do catálogo, aplicado com a linha travada; não existe
//   caminho que grave a árvore vinda do cliente;
// - lote com versão base desatualizada é recusado com a versão atual;
// - o histórico só cresce: desfazer e refazer gravam um lote de reversão;
// - o hash de um arquivo não é autorização: arquivo novo num lote precisa existir na conta.
import { aplicarLote, type Documento, documentoVazio, loteDependeDeMedida } from '@otto/documento';
import {
  CODIGOS_DE_ERRO,
  type DocumentoAberto,
  type DocumentoRenomeado,
  type Historico,
  type ListaDeDocumentos,
  type LoteDoHistorico,
  type PedidoDeCriarDocumento,
  type PedidoDeDesfazer,
  type PedidoDeDuplicarDocumento,
  type PedidoDeLote,
  type PedidoDeRenomearDocumento,
  type RespostaDeDesfazer,
  type RespostaDeLote,
} from '@otto/shared';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import { ErroDaAplicacao, NaoEncontrado, PedidoInvalido } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { CursorInvalido } from '../../plataforma/paginacao/cursor';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { arquivosDaArvore } from '../domain/arquivos-da-arvore';
import { conteudoDe, planejarDesfazer, planejarRefazer } from '../domain/historico';
import { NOME_PADRAO_DE_DOCUMENTO, nomeDaCopia } from '../textos';
import type { MedidorDeTexto } from './medidor-de-texto';
import type { DocumentoGuardado, DocumentoTravado, LoteGravado, RegistroDeDocumento, RepositorioDeDocumentos } from './repositorio-de-documentos';

/** Tamanho máximo da árvore, em JSON. As peças da POC medem de 7 a 18 KB. */
export const LIMITE_DE_BYTES_DA_ARVORE = 4 * 1024 * 1024;

const bytesDe = (arvore: Documento): number => Buffer.byteLength(JSON.stringify(arvore), 'utf8');

const aberto = (d: DocumentoGuardado): DocumentoAberto => ({ id: d.id, nome: d.nome, versao: d.versao, arvore: d.arvore });

function doHistorico(l: LoteGravado): LoteDoHistorico {
  return {
    id: l.chaveDoCliente ?? l.id,
    versao: l.versao,
    autoria: l.autoria,
    ...(l.tarefaId ? { tarefaId: l.tarefaId } : {}),
    tipo: l.tipo,
    ...(l.reverteAteVersao !== null ? { reverteAteVersao: l.reverteAteVersao } : {}),
    descricao: l.descricao,
    tocados: l.tocados,
    quantidadeDeOperacoes: l.quantidadeDeOperacoes,
    quando: l.criadoEm.toISOString(),
    desfeito: l.desfeitoPor !== null,
  };
}

export class CasosDeUsoDeDocumento {
  constructor(
    private readonly documentos: RepositorioDeDocumentos,
    private readonly arquivos: RepositorioDeArquivos,
    private readonly medidores: MedidorDeTexto,
    private readonly gerarId: () => string,
    private readonly uso: RegistroDeUso = new RegistroDeUsoMudo(),
  ) {}

  async criar(escopo: EscopoDaConta, pedido: PedidoDeCriarDocumento): Promise<DocumentoAberto> {
    return aberto(await this.documentos.criar(escopo, { id: this.gerarId(), nome: pedido.nome ?? NOME_PADRAO_DE_DOCUMENTO, arvore: documentoVazio() }));
  }

  async listar(escopo: EscopoDaConta, pagina: { cursor?: string; limite: number }): Promise<ListaDeDocumentos> {
    const lista = await this.paginar(() => this.documentos.listar(escopo, pagina));
    const item = (r: RegistroDeDocumento) => ({ id: r.id, nome: r.nome, pranchetas: r.pranchetas, versao: r.versao, alteradoEm: r.alteradoEm.toISOString(), miniatura: null });
    return { itens: lista.itens.map(item), proximoCursor: lista.proximoCursor };
  }

  async abrir(escopo: EscopoDaConta, id: string): Promise<DocumentoAberto> {
    const doc = await this.documentos.abrir(escopo, id);
    if (!doc) throw new NaoEncontrado();
    return aberto(doc);
  }

  /** Renomear não é operação do catálogo nem passo do histórico: o nome é do registro. */
  async renomear(escopo: EscopoDaConta, id: string, pedido: PedidoDeRenomearDocumento): Promise<DocumentoRenomeado> {
    const registro = await this.documentos.renomear(escopo, id, pedido.nome);
    if (!registro) throw new NaoEncontrado();
    return { id: registro.id, nome: registro.nome };
  }

  /** A cópia nasce na versão 0, com a árvore atual do original e sem o histórico dele. */
  async duplicar(escopo: EscopoDaConta, id: string, pedido: PedidoDeDuplicarDocumento): Promise<DocumentoAberto> {
    const original = await this.documentos.abrir(escopo, id);
    if (!original) throw new NaoEncontrado();
    return aberto(await this.documentos.criar(escopo, { id: this.gerarId(), nome: pedido.nome ?? nomeDaCopia(original.nome), arvore: original.arvore }));
  }

  async arquivar(escopo: EscopoDaConta, id: string): Promise<void> {
    if (!(await this.documentos.arquivar(escopo, id))) throw new NaoEncontrado();
  }

  async historico(escopo: EscopoDaConta, id: string, pagina: { cursor?: string; limite: number }): Promise<Historico> {
    const lotes = await this.paginar(() => this.documentos.historico(escopo, id, pagina));
    if (!lotes) throw new NaoEncontrado();
    return { itens: lotes.itens.map(doHistorico), proximoCursor: lotes.proximoCursor };
  }

  async aplicarLote(escopo: EscopoDaConta, id: string, pedido: PedidoDeLote): Promise<RespostaDeLote> {
    return this.comTrava(escopo, id, async (doc) => {
      // reenvio do mesmo lote: devolve o que já foi gravado, sem olhar a versão base
      const repetido = await doc.lotePorChaveDoCliente(pedido.id);
      if (repetido) {
        const arvore = pedido.devolver ? await doc.arvoreDaVersao(repetido.versao) : undefined;
        return { versao: repetido.versao, lote: { id: pedido.id, tocados: repetido.tocados }, ...(arvore ? { arvore } : {}) };
      }
      this.conferirVersao(doc, pedido.versaoBase);

      const atual = await doc.arvore();
      const sessao = loteDependeDeMedida(pedido.operacoes) ? await this.medidores.abrir(atual, pedido.operacoes) : undefined;
      let resultado: ReturnType<typeof aplicarLote>;
      try {
        resultado = aplicarLote(atual, pedido.operacoes, { autoria: { tipo: 'designer' }, idDoLote: pedido.id, ...(sessao ? { medidor: sessao.medidor } : {}) });
      } finally {
        sessao?.liberar();
      }
      if (!resultado.ok) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.loteInvalido, { ...resultado.erro });

      await this.conferirArquivosNovos(escopo, atual, resultado.doc);
      if (bytesDe(resultado.doc) > LIMITE_DE_BYTES_DA_ARVORE) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.documentoGrandeDemais, { limiteEmBytes: LIMITE_DE_BYTES_DA_ARVORE });

      const versao = doc.registro.versao + 1;
      await doc.gravarLote({
        id: this.gerarId(),
        chaveDoCliente: pedido.id,
        versao,
        autoria: 'designer',
        tipo: 'edicao',
        descricao: pedido.descricao,
        operacoes: pedido.operacoes,
        tocados: resultado.tocados,
        arvore: resultado.doc,
      });
      // dado de uso (ADR 031): tipo e contagem das operações, nunca as operações
      const operacoesPorTipo: Record<string, number> = {};
      for (const o of pedido.operacoes) {
        const op = String((o as { op: unknown }).op);
        operacoesPorTipo[op] = (operacoesPorTipo[op] ?? 0) + 1;
      }
      this.uso.registrar(escopo, { evento: 'lote_aplicado', documentoId: id, autoria: 'designer', operacoesPorTipo, nosTocados: resultado.tocados.length, mediuTexto: sessao !== undefined, versao });
      return { versao, lote: { id: pedido.id, tocados: resultado.tocados }, ...(pedido.devolver ? { arvore: resultado.doc } : {}) };
    });
  }

  async desfazer(escopo: EscopoDaConta, id: string, pedido: PedidoDeDesfazer): Promise<RespostaDeDesfazer> {
    return this.comTrava(escopo, id, async (doc) => {
      this.conferirVersao(doc, pedido.versaoBase);
      const atual = await doc.lote(doc.registro.versao);
      const conteudo = conteudoDe(atual);
      const anterior = conteudo > 1 ? await doc.lote(conteudo - 1) : undefined;
      const plano = planejarDesfazer(atual, () => anterior);
      if (!plano) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.nadaParaDesfazer);
      const resposta = await this.reverter(doc, plano.restaurar);
      await doc.marcarDesfeito(plano.desfaz, resposta.loteId);
      return { versao: resposta.versao, arvore: resposta.arvore };
    });
  }

  async refazer(escopo: EscopoDaConta, id: string, pedido: PedidoDeDesfazer): Promise<RespostaDeDesfazer> {
    return this.comTrava(escopo, id, async (doc) => {
      this.conferirVersao(doc, pedido.versaoBase);
      const cauda = await doc.caudaDeReversoes();
      const antesDaCauda = doc.registro.versao - cauda.length;
      const plano = planejarRefazer(cauda, conteudoDe(antesDaCauda > 0 ? await doc.lote(antesDaCauda) : undefined));
      if (!plano) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.nadaParaRefazer);
      const resposta = await this.reverter(doc, plano.restaurar);
      await doc.marcarDesfeito(plano.refaz, null);
      return { versao: resposta.versao, arvore: resposta.arvore };
    });
  }

  /** Grava o lote de reversão que leva o documento à árvore de uma versão de conteúdo. */
  private async reverter(doc: DocumentoTravado, ateVersao: number): Promise<{ versao: number; arvore: Documento; loteId: string }> {
    const arvore = await doc.arvoreDaVersao(ateVersao);
    if (!arvore) throw new Error(`a versão ${ateVersao} do documento não tem árvore guardada`);
    const versao = doc.registro.versao + 1;
    const loteId = this.gerarId();
    await doc.gravarLote({ id: loteId, versao, autoria: 'designer', tipo: 'reversao', reverteAteVersao: ateVersao, descricao: '', operacoes: [], tocados: [], arvore });
    return { versao, arvore, loteId };
  }

  private conferirVersao(doc: DocumentoTravado, versaoBase: number): void {
    if (versaoBase !== doc.registro.versao) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.versaoDesatualizada, { versaoAtual: doc.registro.versao });
  }

  private async conferirArquivosNovos(escopo: EscopoDaConta, antes: Documento, depois: Documento): Promise<void> {
    const jaCitados = arquivosDaArvore(antes);
    const novos = [...arquivosDaArvore(depois)].filter((sha256) => !jaCitados.has(sha256));
    if (novos.length === 0) return;
    const daConta = await this.arquivos.quaisExistem(escopo, novos);
    const faltam = novos.filter((sha256) => !daConta.has(sha256));
    // só a contagem: dizer QUAL hash falta confirmaria a quem pergunta o que existe em outra conta
    if (faltam.length > 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoDesconhecido, { quantos: faltam.length });
  }

  private async comTrava<T>(escopo: EscopoDaConta, id: string, fn: (doc: DocumentoTravado) => Promise<T>): Promise<T> {
    let achou = false;
    const resultado = await this.documentos.comTrava(escopo, id, (doc) => {
      achou = true;
      return fn(doc);
    });
    if (!achou) throw new NaoEncontrado();
    return resultado as T;
  }

  private async paginar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof CursorInvalido) throw new PedidoInvalido(['cursor']);
      throw e;
    }
  }
}
