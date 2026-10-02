// A miniatura da peça (docs/mvp/backend.md, 17.13): um JPEG pequeno da primeira prancheta, para a lista de
// peças. É render, então sai da fila e roda no worker (nunca na requisição):
// - ao fim de uma tarefa do Otto, na hora;
// - depois de edição do designer, com atraso e com freio: uma miniatura por intervalo, não uma por tecla.
// O trabalho da fila leva só a conta e o id da peça, e o worker relê a peça sob a conta do trabalho.
// A miniatura é conteúdo da conta: sai por rota que confere a conta, e não vai para log.
import type { Documento } from '@otto/documento';
import type { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { chaveDeMiniatura } from '../../arquivo/application/chave-de-objeto';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import type { RepositorioDeDocumentos } from './repositorio-de-documentos';

/** Lado maior da miniatura, em pixels. */
export const LADO_DA_MINIATURA = 480;
/** Quanto se espera depois de uma edição para renderizar, e o intervalo mínimo entre dois pedidos da mesma peça. */
export const ATRASO_DEPOIS_DE_EDICAO_MS = 20_000;

/** Porta: quem desenha a miniatura. Quem implementa carrega fontes e imagens depois de conferir a conta. */
export abstract class RenderDeMiniatura {
  /** JPEG da prancheta, com o lado maior em `ladoMaximo`. */
  abstract renderizar(escopo: EscopoDaConta, peca: { nome: string; arvore: Documento }, prancheta: string, ladoMaximo: number): Promise<Uint8Array>;
}

export interface DependenciasDaMiniatura {
  documentos: RepositorioDeDocumentos;
  armazenamento: ArmazenamentoDeArquivo;
  fila: BarramentoDeEventos;
  render: RenderDeMiniatura;
  agora?: () => Date;
  uso?: RegistroDeUso;
}

export class CasosDeUsoDeMiniatura {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;

  constructor(private readonly d: DependenciasDaMiniatura) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
  }

  /** Depois de uma edição do designer. Nunca lança: a miniatura não pode derrubar a edição. */
  async pedirDepoisDeEdicao(escopo: EscopoDaConta, documentoId: string): Promise<void> {
    const agora = this.agora();
    await this.pedir(escopo, documentoId, new Date(agora.getTime() - ATRASO_DEPOIS_DE_EDICAO_MS), new Date(agora.getTime() + ATRASO_DEPOIS_DE_EDICAO_MS));
  }

  /** Ao fim de uma tarefa do Otto: sem atraso e sem freio. Nunca lança. */
  async pedirAgora(escopo: EscopoDaConta, documentoId: string): Promise<void> {
    await this.pedir(escopo, documentoId, new Date(this.agora().getTime() + 1), undefined);
  }

  private async pedir(escopo: EscopoDaConta, documentoId: string, seAnteriorA: Date, naoAntesDe: Date | undefined): Promise<void> {
    try {
      // o freio é do banco: com vários processos, o trabalho é publicado uma vez só por intervalo
      if (!(await this.d.documentos.pedirMiniatura(escopo, documentoId, this.agora(), seAnteriorA))) return;
      await this.d.fila.publicar(FILAS.miniaturaDaPeca, { contaId: escopo.contaId, id: documentoId }, naoAntesDe ? { naoAntesDe } : {});
    } catch {
      // fila ou banco fora: a peça fica com a miniatura antiga até a próxima edição
    }
  }

  /**
   * O trabalho do worker. `escopo` vem do que estava na fila e é hipótese: a peça é relida sob ele.
   * 'ignorada': a peça não existe nesta conta, não tem prancheta, ou já tem a miniatura desta versão.
   */
  async gerar(escopo: EscopoDaConta, documentoId: string): Promise<'feita' | 'ignorada'> {
    const peca = await this.d.documentos.abrir(escopo, documentoId);
    const prancheta = peca?.arvore.pranchetas[0];
    if (!peca || !prancheta || peca.miniaturaVersao === peca.versao) return 'ignorada';
    const inicio = this.agora().getTime();
    const jpeg = await this.d.render.renderizar(escopo, { nome: peca.nome, arvore: peca.arvore }, prancheta.id, LADO_DA_MINIATURA);
    // primeiro o objeto, depois o registro: a lista nunca aponta para miniatura que não existe
    await this.d.armazenamento.guardar(escopo, chaveDeMiniatura(escopo, documentoId, peca.versao), jpeg, 'image/jpeg');
    const gravada = await this.d.documentos.gravarMiniatura(escopo, documentoId, peca.versao);
    if (gravada?.anterior !== undefined && gravada.anterior !== peca.versao) await this.d.armazenamento.remover(escopo, chaveDeMiniatura(escopo, documentoId, gravada.anterior)).catch(() => undefined);
    this.uso.registrar(escopo, { evento: 'miniatura_gerada', documentoId, versao: peca.versao, bytes: jpeg.byteLength, duracaoMs: this.agora().getTime() - inicio });
    return 'feita';
  }

  /** Os bytes da miniatura guardada. A conta é conferida pela leitura da peça. */
  async ler(escopo: EscopoDaConta, documentoId: string): Promise<{ bytes: Uint8Array; versao: number }> {
    const peca = await this.d.documentos.abrir(escopo, documentoId);
    if (!peca || peca.miniaturaVersao === undefined || peca.arvore.pranchetas.length === 0) throw new NaoEncontrado();
    const bytes = await this.d.armazenamento.ler(escopo, chaveDeMiniatura(escopo, documentoId, peca.miniaturaVersao));
    if (!bytes) throw new NaoEncontrado();
    return { bytes, versao: peca.miniaturaVersao };
  }
}
