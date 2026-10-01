// Casos de uso da exportação (docs/mvp/backend.md, seções 7.6 e 9). Classe pura.
//
// Quem pede é a API; quem executa é o worker. O trabalho pesado nunca roda numa requisição.
// O worker recebe só (conta, id) e relê tudo sob o escopo da conta: o que veio na fila é hipótese.
import type { Documento } from '@otto/documento';
import {
  type RecursosConhecidos,
  type RecursosDaExportacao,
  type RelatorioDeExportacaoVetorial,
  type RelatorioDeExportacao as RelatorioDoPsd,
  relatorioDeExportacao,
  relatorioDeExportacaoVetorial,
  relatorioEmTexto,
  type TipoDeImagem,
} from '@otto/psd';
import {
  CODIGOS_DE_ERRO,
  DIAS_DE_RETENCAO_DA_EXPORTACAO,
  EXPORTACOES_NA_FILA_POR_CONTA,
  EXPORTACOES_NA_LISTA,
  type Exportacao,
  type ListaDeExportacoes,
  type PedidoDeExportacao,
  type RelatorioDeExportacao,
  VALIDADE_DO_LINK_EM_SEGUNDOS,
} from '@otto/shared';
import type { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { chaveDeExportacao } from '../../arquivo/application/chave-de-objeto';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import type { BibliotecaDeFontes, FonteRegistrada } from '../../biblioteca/application/biblioteca-de-fontes';
import { nomePostScript } from '../../biblioteca/domain/fontes';
import type { RepositorioDeDocumentos } from '../../documento/application/repositorio-de-documentos';
import { arquivosDaArvore } from '../../documento/domain/arquivos-da-arvore';
import { familiasCitadas } from '../../documento/domain/familias-citadas';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import type { ArquivoGerado, EntreEtapas, MotorDeExportacao } from './motor-de-exportacao';
import { fontesDoPacote, montarPacote } from './pacote';
import type { ArquivoGuardado, ExportacaoGuardada, OpcoesGuardadas, RepositorioDeExportacoes } from './repositorio-de-exportacoes';

/** Outra exportação da mesma conta está rodando. Quem consome a fila devolve o trabalho para tentar depois. */
export class ContaOcupada extends Error {
  constructor() {
    super('outra exportação da mesma conta está rodando');
    this.name = 'ContaOcupada';
  }
}

/** O que aconteceu de errado, sem conteúdo: a mensagem do erro pode citar nome de camada ou de fonte, e não sai daqui. */
export interface FalhaObservada {
  exportacaoId: string;
  etapa: 'prancheta' | 'exportacao' | 'limpeza';
  erro: unknown;
}

export interface DependenciasDaExportacao {
  documentos: RepositorioDeDocumentos;
  exportacoes: RepositorioDeExportacoes;
  arquivos: RepositorioDeArquivos;
  armazenamento: ArmazenamentoDeArquivo;
  fontes: BibliotecaDeFontes;
  fila: BarramentoDeEventos;
  motor: MotorDeExportacao;
  gerarId: () => string;
  agora?: () => Date;
  uso?: RegistroDeUso;
  aoFalhar?: (falha: FalhaObservada) => void;
}

/**
 * Exportação "rodando" sem sinal de vida há mais que isto é dada como interrompida. O sinal só é gravado
 * ENTRE as etapas do motor (o render é síncrono), e uma prancheta com desfoque de movimento levou 41 s
 * no PDF: 5 minutos dá folga de sete vezes sobre o pior caso medido.
 */
export const SEM_SINAL_DEPOIS_DE_MS = 300_000;
/**
 * Exportação "na_fila" há mais que isto é dada como abandonada: o trabalho da fila se perdeu ou esgotou
 * as tentativas (10 minutos esperando a vez da conta, mais 10 de um trabalho que expirou).
 */
export const NA_FILA_NO_MAXIMO_MS = 30 * 60_000;
/** A limpeza é agendada para um pouco depois do vencimento: relógio do worker e do banco não são o mesmo. */
const FOLGA_DA_LIMPEZA_MS = 60_000;
const INTERVALO_DO_SINAL_DE_VIDA_MS = 5_000;
const UM_DIA_MS = 86_400_000;
const TIPO_POR_EXTENSAO: Record<string, string> = {
  psd: 'image/vnd.adobe.photoshop',
  psb: 'image/vnd.adobe.photoshop',
  png: 'image/png',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
};
const TIPOS_DE_IMAGEM: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'] satisfies TipoDeImagem[];
/** Os avisos do relatório que também valem para imagem chapada. */
const AVISOS_QUE_VALEM_PARA_PNG = ['fonte-substituida', 'fonte-em-falta', 'imagem-em-falta'];

interface FonteAchada {
  registro: FonteRegistrada;
  postScript: string;
  /** Só quando foi preciso abrir o arquivo para achar o nome PostScript. */
  bytes?: Uint8Array;
}

/** O relatório como o núcleo o produz (os tipos dele são mais estreitos que os do contrato). */
type RelatorioDoNucleo = RelatorioDoPsd | RelatorioDeExportacaoVetorial;

/** O que do pedido decide o relatório. */
type FormaDoPedido = { formato: 'psd' | 'pdf'; arquivos: 'por-prancheta' | 'juntas' } | { formato: 'png' | 'svg' };

interface RecursosAchados {
  fontes: FonteAchada[];
  imagens: { arquivo: string; tipo: TipoDeImagem; chaveDoObjeto: string }[];
}

function extensaoDe(nome: string): string {
  const extensao = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
  return extensao in TIPO_POR_EXTENSAO ? extensao : 'bin';
}

/** O mesmo nome, com " (2)", " (3)"... antes da extensão, enquanto já estiver usado. */
function nomeLivre(nome: string, usados: ReadonlySet<string>): string {
  if (!usados.has(nome)) return nome;
  const ponto = nome.lastIndexOf('.');
  const [base, extensao] = ponto > 0 ? [nome.slice(0, ponto), nome.slice(ponto)] : [nome, ''];
  for (let n = 2; ; n++) {
    const candidato = `${base} (${n})${extensao}`;
    if (!usados.has(candidato)) return candidato;
  }
}

function paraContrato(e: ExportacaoGuardada, comRelatorio = true): Exportacao {
  const terminouComArquivo = e.estado === 'pronta' || e.estado === 'pronta_em_parte';
  return {
    id: e.id,
    documentoId: e.documentoId,
    versao: e.versao,
    formato: e.opcoes.formato,
    ...(e.opcoes.pacote ? { pacote: true } : {}),
    estado: e.estado,
    progresso: { pranchetasProntas: e.pranchetasProntas, pranchetasNoTotal: e.pranchetasNoTotal },
    arquivos: [...e.arquivos]
      .sort((a, b) => a.indice - b.indice)
      .map((a) => ({
        indice: a.indice,
        nome: a.nome,
        tipo: a.tipoMime,
        bytes: a.bytes,
        ...(a.pranchetaId ? { pranchetaId: a.pranchetaId } : {}),
        // a chave do objeto nunca sai; o endereço é estável e o link assinado nasce a cada pedido
        baixar: `/api/exportacoes/${e.id}/arquivos/${a.indice}`,
      })),
    falhas: e.falhas.map((f) => ({ pranchetaId: f.pranchetaId, codigo: f.codigo })),
    ...(e.relatorio && terminouComArquivo && comRelatorio ? { relatorio: e.relatorio } : {}),
    ...(e.estado === 'falhou' ? { erro: { codigo: e.erroCodigo ?? 'falha_na_exportacao' } } : {}),
    criadaEm: e.criadaEm.toISOString(),
    ...(e.terminadaEm && terminouComArquivo ? { prontaEm: e.terminadaEm.toISOString() } : {}),
    ...(e.expiraEm ? { expiraEm: e.expiraEm.toISOString() } : {}),
    ...(e.duracaoMs !== undefined ? { duracaoMs: e.duracaoMs } : {}),
  };
}

export class CasosDeUsoDeExportacao {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;

  constructor(private readonly d: DependenciasDaExportacao) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
  }

  /** O relatório antes de exportar: não renderiza, não cria exportação, não toca na fila. */
  async relatorio(escopo: EscopoDaConta, documentoId: string, pedido: PedidoDeExportacao): Promise<RelatorioDeExportacao> {
    const doc = await this.d.documentos.abrir(escopo, documentoId);
    if (!doc) throw new NaoEncontrado();
    const pranchetas = this.pranchetasDoPedido(doc.arvore, pedido.pranchetas);
    const achados = await this.acharRecursos(escopo, soAsPranchetas(doc.arvore, pranchetas));
    const relatorio = relatorioPara(doc.arvore, pedido, achados, pranchetas);
    if (!pedido.pacote) return relatorio;
    return { ...relatorio, pacote: { fontes: fontesDoPacote(fontesUsadas(relatorio, achados), (f) => achados.fontes.find((a) => a.registro === f)?.bytes) } };
  }

  /** Cria a exportação da versão atual do documento e põe na fila. */
  async pedir(escopo: EscopoDaConta, documentoId: string, pedido: PedidoDeExportacao): Promise<Exportacao> {
    const doc = await this.d.documentos.abrir(escopo, documentoId);
    if (!doc) throw new NaoEncontrado();
    const pranchetas = this.pranchetasDoPedido(doc.arvore, pedido.pranchetas);
    // o que parou não segura o limite da conta
    await this.darBaixaNasParadas(escopo);
    if ((await this.d.exportacoes.contarEmAndamento(escopo)) >= EXPORTACOES_NA_FILA_POR_CONTA)
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeExportacoes, { limite: EXPORTACOES_NA_FILA_POR_CONTA });

    const criada = await this.d.exportacoes.criar(escopo, {
      id: this.d.gerarId(),
      documentoId,
      versao: doc.versao,
      nome: doc.nome,
      opcoes: opcoesGuardadas(pedido, pranchetas),
      criadaEm: this.agora(),
    });
    try {
      // só identificadores na fila: nada de conteúdo, e nada em que o worker precise confiar
      await this.d.fila.publicar(FILAS.exportacao, { contaId: escopo.contaId, id: criada.id });
    } catch (erro) {
      // sem fila não há quem execute: a exportação não fica pendurada contando no limite da conta
      await this.d.exportacoes.concluir(escopo, criada.id, { estado: 'falhou', erroCodigo: CODIGOS_DE_ERRO.filaIndisponivel, terminadaEm: this.agora(), duracaoMs: 0 });
      this.d.aoFalhar?.({ exportacaoId: criada.id, etapa: 'exportacao', erro });
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.filaIndisponivel);
    }
    this.uso.registrar(escopo, {
      evento: 'exportacao_pedida',
      exportacaoId: criada.id,
      documentoId,
      formato: criada.opcoes.formato,
      pacote: criada.opcoes.pacote === true,
      pranchetas: pranchetas.length,
      juntas: saemJuntas(criada.opcoes),
    });
    return paraContrato(criada);
  }

  async consultar(escopo: EscopoDaConta, id: string): Promise<Exportacao> {
    let e = await this.d.exportacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    // Em curso há tempo bastante para ter parado: confere antes de responder, para quem acompanha não
    // ficar vendo "rodando" para sempre. A exportação normal (segundos) nunca entra aqui.
    if ((e.estado === 'na_fila' || e.estado === 'rodando') && this.agora().getTime() - e.criadaEm.getTime() > SEM_SINAL_DEPOIS_DE_MS) {
      if ((await this.darBaixaNasParadas(escopo)) > 0) e = (await this.d.exportacoes.buscar(escopo, id)) ?? e;
    }
    return paraContrato(e);
  }

  /**
   * As exportações em curso e as recentes de uma peça, da mais nova para a mais velha, sem o relatório.
   * É como o editor retoma depois de recarregar a página.
   */
  async listar(escopo: EscopoDaConta, documentoId: string): Promise<ListaDeExportacoes> {
    // peça de outra conta é "não encontrado", não lista vazia: a resposta é a mesma de id inexistente
    if (!(await this.d.documentos.historico(escopo, documentoId, { limite: 1 }))) throw new NaoEncontrado();
    await this.darBaixaNasParadas(escopo);
    const criadasDesde = new Date(this.agora().getTime() - DIAS_DE_RETENCAO_DA_EXPORTACAO * UM_DIA_MS);
    const itens = await this.d.exportacoes.listarDoDocumento(escopo, documentoId, { criadasDesde, limite: EXPORTACOES_NA_LISTA });
    return { itens: itens.map((e) => paraContrato(e, false)) };
  }

  /**
   * Um link assinado NOVO para um arquivo da exportação. A autorização é a linha da exportação lida
   * sob o escopo da conta: sem ela, o armazenamento nem é chamado.
   */
  async linkDoArquivo(escopo: EscopoDaConta, id: string, indice: number): Promise<string> {
    const e = await this.d.exportacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    if (e.estado === 'na_fila' || e.estado === 'rodando') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.exportacaoNaoPronta, { estado: e.estado });
    const arquivo = e.arquivos.find((a) => a.indice === indice);
    if (e.estado === 'falhou' || !arquivo) throw new NaoEncontrado();
    if (e.arquivosRemovidosEm || (e.expiraEm && e.expiraEm.getTime() <= this.agora().getTime())) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.exportacaoExpirada);
    const link = await this.d.armazenamento.linkAssinado(escopo, arquivo.chaveDoObjeto, { validadeEmSegundos: VALIDADE_DO_LINK_EM_SEGUNDOS, nomeDoArquivo: arquivo.nome, tipoMime: arquivo.tipoMime });
    // é o pedido do link, não o fim do download: o arquivo sai direto do armazenamento
    this.uso.registrar(escopo, { evento: 'exportacao_baixada', exportacaoId: e.id, documentoId: e.documentoId, formato: e.opcoes.formato, pacote: e.opcoes.pacote === true });
    return link;
  }

  /**
   * O trabalho do worker. `escopo` vem do que estava na fila e é hipótese: tudo é relido sob ele, e
   * exportação que não existe nessa conta não é processada.
   * - 'ignorada': não existe nesta conta, ou não está mais na fila (entrega repetida);
   * - lança ContaOcupada: outra exportação da conta está rodando; o trabalho volta para a fila.
   */
  async executar(escopo: EscopoDaConta, id: string): Promise<'feita' | 'ignorada'> {
    const comeco = this.agora();
    const inicio = await this.d.exportacoes.iniciar(escopo, id, comeco, new Date(comeco.getTime() - SEM_SINAL_DEPOIS_DE_MS));
    if (inicio.resultado === 'ignorada') return 'ignorada';
    if (inicio.resultado === 'ocupada') throw new ContaOcupada();
    const e = inicio.exportacao;
    const pacote = e.opcoes.pacote === true;

    /** O que foi guardado no armazenamento. */
    const guardados: ArquivoGuardado[] = [];
    /** Pacote: o que foi gerado fica em memória até o .zip ser montado. */
    const paraOPacote: ArquivoGerado[] = [];
    let falhas = 0;
    let erroCodigo: string | undefined;
    let relatorio: RelatorioDeExportacao | undefined;
    try {
      const guardado = await this.d.documentos.arvoreNaVersao(escopo, e.documentoId, e.versao);
      if (!guardado) {
        erroCodigo = 'documento_indisponivel';
      } else {
        const doc = guardado.arvore;
        const juntas = saemJuntas(e.opcoes);
        const nomes = new Set<string>();
        const feitas: string[] = [];
        const usados: RecursosAchados = { fontes: [], imagens: [] };
        const bytesJaLidos = new Map<string, Uint8Array>();
        const entreEtapas = this.sinalDeVida(escopo, id);

        for (const grupo of juntas ? [e.opcoes.pranchetas] : e.opcoes.pranchetas.map((p) => [p])) {
          try {
            const achados = await this.acharRecursos(escopo, soAsPranchetas(doc, grupo));
            const recursos = await this.lerRecursos(escopo, achados, bytesJaLidos);
            // O nome da prancheta entra sempre que a PEÇA tem mais de uma, mesmo exportando uma só: tentar
            // de novo a que falhou dá o mesmo nome de arquivo que ela teria da primeira vez.
            const nome = juntas || doc.pranchetas.length === 1 ? e.nome : `${e.nome} - ${doc.pranchetas.find((p) => p.id === grupo[0])?.nome ?? ''}`;
            const gerados = await this.gerar(doc, recursos, e.opcoes, nome, grupo, entreEtapas);
            for (const [i, gerado] of gerados.entries()) {
              const arquivo = { nome: nomeLivre(gerado.nome, nomes), bytes: gerado.bytes };
              nomes.add(arquivo.nome);
              if (pacote) paraOPacote.push(arquivo);
              else guardados.push(await this.guardar(escopo, e.id, guardados.length, arquivo, juntas ? undefined : grupo[0], i === 0 ? grupo.length : 0));
            }
            if (pacote) await this.d.exportacoes.registrarProgresso(escopo, e.id, grupo.length, this.agora());
            feitas.push(...grupo);
            usados.fontes.push(...achados.fontes);
            usados.imagens.push(...achados.imagens);
          } catch (erro) {
            this.d.aoFalhar?.({ exportacaoId: e.id, etapa: juntas ? 'exportacao' : 'prancheta', erro });
            if (juntas) break;
            falhas++;
            await this.d.exportacoes.registrarFalha(escopo, e.id, { pranchetaId: grupo[0] as string, codigo: 'falha_na_prancheta' }, this.agora());
          }
        }

        if (feitas.length > 0) {
          // o relatório do que de fato saiu, com os nomes de arquivo de verdade
          const doNucleo = { ...relatorioDoNucleo(doc, e.opcoes, usados, feitas), arquivos: [...nomes] };
          const fontes = pacote ? fontesDoPacote(fontesUsadas(doNucleo, usados), (f) => bytesJaLidos.get(`fonte:${f.sha256}`)) : undefined;
          // PNG fora de pacote não tem relatório: não há camada nem fonte para conferir
          if (e.opcoes.formato !== 'png') relatorio = { ...doNucleo, ...(fontes ? { pacote: { fontes } } : {}) };
          if (fontes) {
            const zip = montarPacote(
              {
                nome: e.nome,
                arquivos: paraOPacote,
                fontes,
                bytesDasFontes: new Map(
                  usados.fontes.flatMap((f) => (bytesJaLidos.has(`fonte:${f.registro.sha256}`) ? [[f.postScript, bytesJaLidos.get(`fonte:${f.registro.sha256}`) as Uint8Array] as const] : [])),
                ),
                relatorioEmTexto: relatorioEmTexto(e.nome, doNucleo),
              },
              this.agora(),
            );
            guardados.push(await this.guardar(escopo, e.id, 0, zip, undefined, 0));
          }
        }
      }
    } catch (erro) {
      // falha fora de uma prancheta (banco, armazenamento, pacote): a exportação termina como falha, não fica "rodando"
      this.d.aoFalhar?.({ exportacaoId: e.id, etapa: 'exportacao', erro });
      erroCodigo = 'falha_na_exportacao';
    }

    const fim = this.agora();
    const estado = erroCodigo || guardados.length === 0 ? 'falhou' : falhas > 0 ? 'pronta_em_parte' : 'pronta';
    const duracaoMs = Math.max(0, fim.getTime() - comeco.getTime());
    const expiraEm = guardados.length > 0 ? new Date(fim.getTime() + DIAS_DE_RETENCAO_DA_EXPORTACAO * UM_DIA_MS) : undefined;
    await this.d.exportacoes.concluir(escopo, e.id, {
      estado,
      terminadaEm: fim,
      duracaoMs,
      ...(estado === 'falhou' ? { erroCodigo: erroCodigo ?? 'falha_na_exportacao' } : {}),
      ...(relatorio && estado !== 'falhou' ? { relatorio } : {}),
      // a data de vencimento é gravada sempre que existe arquivo guardado, mesmo que o estado final seja falha
      ...(expiraEm ? { expiraEm } : {}),
    });
    if (expiraEm) await this.agendarLimpeza(escopo, e.id, expiraEm);
    this.uso.registrar(escopo, {
      evento: 'exportacao_terminada',
      exportacaoId: e.id,
      documentoId: e.documentoId,
      formato: e.opcoes.formato,
      pacote,
      resultado: estado,
      pranchetas: e.pranchetasNoTotal,
      falhas,
      arquivos: guardados.length,
      bytes: guardados.reduce((soma, a) => soma + a.bytes, 0),
      esperaMs: Math.max(0, comeco.getTime() - e.criadaEm.getTime()),
      duracaoMs,
    });
    return 'feita';
  }

  /**
   * O trabalho de limpeza, agendado para o vencimento: apaga do armazenamento os arquivos da exportação
   * e marca a linha. O registro (nomes, tamanhos, relatório) fica. Idempotente, e o `escopo` é hipótese
   * como em `executar`: exportação que não existe nessa conta não apaga nada.
   * Lança se ainda não venceu (o trabalho volta para a fila).
   */
  async limpar(escopo: EscopoDaConta, id: string): Promise<'limpa' | 'ignorada'> {
    const e = await this.d.exportacoes.buscar(escopo, id);
    if (!e || e.arquivosRemovidosEm || !e.expiraEm || e.estado === 'na_fila' || e.estado === 'rodando') return 'ignorada';
    if (e.expiraEm.getTime() > this.agora().getTime()) throw new Error('a exportação ainda não venceu');
    // primeiro os objetos, depois a marca: se cair no meio, a próxima entrega apaga o resto (apagar o que não existe não é erro)
    for (const arquivo of e.arquivos) await this.d.armazenamento.remover(escopo, arquivo.chaveDoObjeto);
    await this.d.exportacoes.marcarArquivosRemovidos(escopo, e.id, this.agora());
    this.uso.registrar(escopo, { evento: 'exportacao_limpa', exportacaoId: e.id, arquivos: e.arquivos.length, bytes: e.arquivos.reduce((soma, a) => soma + a.bytes, 0) });
    return 'limpa';
  }

  private darBaixaNasParadas(escopo: EscopoDaConta): Promise<number> {
    const agora = this.agora();
    return this.d.exportacoes.darBaixaNasParadas(escopo, agora, { naFilaDesde: new Date(agora.getTime() - NA_FILA_NO_MAXIMO_MS), semSinalDesde: new Date(agora.getTime() - SEM_SINAL_DEPOIS_DE_MS) });
  }

  /** Falhar em agendar não desfaz a exportação: os arquivos ficam além do prazo, e o log diz. */
  private async agendarLimpeza(escopo: EscopoDaConta, id: string, expiraEm: Date): Promise<void> {
    try {
      await this.d.fila.publicar(FILAS.limpezaDeExportacao, { contaId: escopo.contaId, id }, { naoAntesDe: new Date(expiraEm.getTime() + FOLGA_DA_LIMPEZA_MS) });
    } catch (erro) {
      this.d.aoFalhar?.({ exportacaoId: id, etapa: 'limpeza', erro });
    }
  }

  private gerar(doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesGuardadas, nome: string, pranchetas: readonly string[], entreEtapas: EntreEtapas): Promise<ArquivoGerado[]> {
    switch (opcoes.formato) {
      case 'psd':
        return this.d.motor.psd(doc, recursos, { nome, pranchetas, arquivos: opcoes.arquivos }, entreEtapas);
      case 'png':
        return this.d.motor.png(doc, recursos, { nome, pranchetas, escala: opcoes.escala, semFundo: opcoes.semFundo }, entreEtapas);
      case 'svg':
        return this.d.motor.svg(doc, recursos, { nome, pranchetas }, entreEtapas);
      case 'pdf':
        return this.d.motor.pdf(doc, recursos, { nome, pranchetas, arquivos: opcoes.arquivos }, entreEtapas);
    }
  }

  /** Guarda um arquivo no armazenamento e registra a linha dele. `pranchetas` é quanto ele faz o progresso andar. */
  private async guardar(escopo: EscopoDaConta, exportacaoId: string, indice: number, arquivo: ArquivoGerado, pranchetaId: string | undefined, pranchetas: number): Promise<ArquivoGuardado> {
    const extensao = extensaoDe(arquivo.nome);
    const guardado: ArquivoGuardado = {
      indice,
      nome: arquivo.nome,
      tipoMime: TIPO_POR_EXTENSAO[extensao] ?? 'application/octet-stream',
      bytes: arquivo.bytes.byteLength,
      ...(pranchetaId ? { pranchetaId } : {}),
      chaveDoObjeto: chaveDeExportacao(escopo, exportacaoId, indice, extensao),
    };
    // primeiro o objeto, depois a linha: um registro nunca aponta para objeto que não existe
    await this.d.armazenamento.guardar(escopo, guardado.chaveDoObjeto, arquivo.bytes, guardado.tipoMime);
    await this.d.exportacoes.registrarArquivo(escopo, exportacaoId, guardado, pranchetas, this.agora());
    return guardado;
  }

  /** Ids pedidos, conferidos contra o documento e postos na ordem dele. Sem pedido: todas. */
  private pranchetasDoPedido(doc: Documento, pedidas: readonly string[] | undefined): string[] {
    if (doc.pranchetas.length === 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.nadaParaExportar);
    if (!pedidas) return doc.pranchetas.map((p) => p.id);
    const desconhecidas = pedidas.filter((id) => !doc.pranchetas.some((p) => p.id === id));
    if (desconhecidas.length > 0) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.pranchetaDesconhecida, { pranchetas: desconhecidas });
    return doc.pranchetas.filter((p) => pedidas.includes(p.id)).map((p) => p.id);
  }

  /**
   * As fontes e as imagens que o documento usa e que existem: fonte na biblioteca do Otto, imagem NA CONTA.
   * A linha do arquivo, lida sob o escopo, é a autorização; hash citado que não é da conta fica de fora
   * (e aparece no relatório como "em falta").
   */
  private async acharRecursos(escopo: EscopoDaConta, doc: Documento): Promise<RecursosAchados> {
    const fontes: FonteAchada[] = [];
    for (const familia of familiasCitadas(doc)) {
      // todos os pesos da família: o motor escolhe o mais próximo do pedido, como no editor
      for (const registro of await this.d.fontes.pesosDa(familia)) {
        if (registro.nomePostScript) {
          fontes.push({ registro, postScript: registro.nomePostScript });
          continue;
        }
        const bytes = await this.d.fontes.bytes(registro);
        const postScript = bytes ? nomePostScript(bytes) : undefined;
        // sem nome PostScript o Photoshop não acha a fonte: fica "em falta" em vez de derrubar a exportação
        if (bytes && postScript) fontes.push({ registro, postScript, bytes });
      }
    }
    const imagens: RecursosAchados['imagens'] = [];
    for (const sha256 of arquivosDaArvore(doc)) {
      const registro = await this.d.arquivos.buscar(escopo, sha256);
      if (registro && TIPOS_DE_IMAGEM.includes(registro.tipoMime)) imagens.push({ arquivo: sha256, tipo: registro.tipoMime as TipoDeImagem, chaveDoObjeto: registro.chaveDoObjeto });
    }
    return { fontes, imagens };
  }

  private async lerRecursos(escopo: EscopoDaConta, achados: RecursosAchados, jaLidos: Map<string, Uint8Array>): Promise<RecursosDaExportacao> {
    const fontes: RecursosDaExportacao['fontes'][number][] = [];
    for (const f of achados.fontes) {
      const chave = `fonte:${f.registro.sha256}`;
      const bytes = jaLidos.get(chave) ?? f.bytes ?? (await this.d.fontes.bytes(f.registro));
      if (!bytes) continue;
      jaLidos.set(chave, bytes);
      fontes.push({ familia: f.registro.familia, peso: f.registro.peso, postScript: f.postScript, bytes });
    }
    const imagens: RecursosDaExportacao['imagens'][number][] = [];
    for (const i of achados.imagens) {
      const bytes = jaLidos.get(i.arquivo) ?? (await this.d.armazenamento.ler(escopo, i.chaveDoObjeto));
      if (!bytes) continue;
      jaLidos.set(i.arquivo, bytes);
      imagens.push({ arquivo: i.arquivo, tipo: i.tipo, bytes });
    }
    return { fontes, imagens };
  }

  /** Cede a vez ao laço de eventos entre as etapas do motor e, de tempos em tempos, grava o sinal de vida. */
  private sinalDeVida(escopo: EscopoDaConta, id: string): () => Promise<void> {
    let ultimo = Date.now();
    return async () => {
      await new Promise<void>((ok) => setImmediate(ok));
      if (Date.now() - ultimo < INTERVALO_DO_SINAL_DE_VIDA_MS) return;
      ultimo = Date.now();
      await this.d.exportacoes.bater(escopo, id, this.agora());
    };
  }
}

function soAsPranchetas(doc: Documento, ids: readonly string[]): Documento {
  return { ...doc, pranchetas: doc.pranchetas.filter((p) => ids.includes(p.id)) };
}

function conhecidos(achados: RecursosAchados): RecursosConhecidos {
  const fontes = new Map(achados.fontes.map((f) => [f.registro.sha256, { familia: f.registro.familia, peso: f.registro.peso, postScript: f.postScript }]));
  const imagens = new Map(achados.imagens.map((i) => [i.arquivo, { arquivo: i.arquivo, tipo: i.tipo }]));
  return { fontes: [...fontes.values()], imagens: [...imagens.values()] };
}

function saemJuntas(opcoes: FormaDoPedido): boolean {
  return (opcoes.formato === 'psd' || opcoes.formato === 'pdf') && opcoes.arquivos === 'juntas';
}

function opcoesGuardadas(pedido: PedidoDeExportacao, pranchetas: string[]): OpcoesGuardadas {
  const comum = { pranchetas, ...(pedido.pacote ? { pacote: true } : {}) };
  switch (pedido.formato) {
    case 'psd':
      return { formato: 'psd', arquivos: pedido.arquivos, ...comum };
    case 'png':
      return { formato: 'png', escala: pedido.escala, semFundo: pedido.semFundo, ...comum };
    case 'svg':
      return { formato: 'svg', ...comum };
    case 'pdf':
      return { formato: 'pdf', arquivos: pedido.arquivos, ...comum };
  }
}

/** O relatório do núcleo para o formato: o do PSD, o vetorial (SVG e PDF) ou, no PNG, só o que vale para imagem chapada. */
function relatorioDoNucleo(doc: Documento, forma: FormaDoPedido, achados: RecursosAchados, pranchetas: readonly string[]): RelatorioDoNucleo {
  const recursos = conhecidos(achados);
  if (forma.formato === 'svg' || forma.formato === 'pdf') return relatorioDeExportacaoVetorial(doc, recursos, { pranchetas, formato: forma.formato });
  if (forma.formato === 'psd') return relatorioDeExportacao(doc, recursos, { pranchetas, arquivos: forma.arquivos });
  // PNG não tem camada, fonte a instalar nem token: sobra o que falta e de onde veio cada imagem
  const completo = relatorioDeExportacao(doc, recursos, { pranchetas, arquivos: 'por-prancheta' });
  return { ...completo, camadas: [], tokens: [], fontes: [], avisos: completo.avisos.filter((a) => AVISOS_QUE_VALEM_PARA_PNG.includes(a.codigo)) };
}

const relatorioPara = (doc: Documento, forma: FormaDoPedido, achados: RecursosAchados, pranchetas: readonly string[]): RelatorioDeExportacao => relatorioDoNucleo(doc, forma, achados, pranchetas);

/** As fontes que o relatório diz que o arquivo usa, com o registro de cada uma na biblioteca. */
function fontesUsadas(relatorio: { fontes: readonly { postScript: string }[] }, achados: RecursosAchados): FonteAchada[] {
  return relatorio.fontes.flatMap((usada) => achados.fontes.find((f) => f.postScript === usada.postScript) ?? []);
}
