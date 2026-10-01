// Casos de uso da exportação (docs/mvp/backend.md, seções 7.6 e 9). Classe pura.
//
// Quem pede é a API; quem executa é o worker. O trabalho pesado nunca roda numa requisição.
// O worker recebe só (conta, id) e relê tudo sob o escopo da conta: o que veio na fila é hipótese.
import type { Documento } from '@otto/documento';
import { type RecursosConhecidos, type RecursosDaExportacao, relatorioDeExportacao, type TipoDeImagem } from '@otto/psd';
import {
  CODIGOS_DE_ERRO,
  DIAS_DE_RETENCAO_DA_EXPORTACAO,
  EXPORTACOES_NA_FILA_POR_CONTA,
  type Exportacao,
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
import type { ArquivoGerado, MotorDeExportacao } from './motor-de-exportacao';
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
  etapa: 'prancheta' | 'exportacao';
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

/** Exportação "rodando" sem sinal de vida há mais que isto é dada como interrompida. */
export const SEM_SINAL_DEPOIS_DE_MS = 120_000;
const INTERVALO_DO_SINAL_DE_VIDA_MS = 5_000;
const UM_DIA_MS = 86_400_000;
const TIPO_POR_EXTENSAO: Record<string, string> = { psd: 'image/vnd.adobe.photoshop', psb: 'image/vnd.adobe.photoshop', png: 'image/png' };
const TIPOS_DE_IMAGEM: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'] satisfies TipoDeImagem[];
/** Os avisos do relatório que também valem para imagem chapada. */
const AVISOS_QUE_VALEM_PARA_PNG = ['fonte-substituida', 'fonte-em-falta', 'imagem-em-falta'];

interface FonteAchada {
  registro: FonteRegistrada;
  postScript: string;
  /** Só quando foi preciso abrir o arquivo para achar o nome PostScript. */
  bytes?: Uint8Array;
}

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

function paraContrato(e: ExportacaoGuardada): Exportacao {
  const terminouComArquivo = e.estado === 'pronta' || e.estado === 'pronta_em_parte';
  return {
    id: e.id,
    documentoId: e.documentoId,
    versao: e.versao,
    formato: e.opcoes.formato,
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
    ...(e.relatorio && terminouComArquivo ? { relatorio: e.relatorio } : {}),
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
    const completo = relatorioDeExportacao(doc.arvore, conhecidos(achados), { pranchetas, arquivos: pedido.formato === 'psd' ? pedido.arquivos : 'por-prancheta' });
    if (pedido.formato === 'psd') return completo;
    // PNG não tem camada, fonte a instalar nem token: sobra o que falta e de onde veio cada imagem
    return { ...completo, camadas: [], tokens: [], fontes: [], avisos: completo.avisos.filter((a) => AVISOS_QUE_VALEM_PARA_PNG.includes(a.codigo)) };
  }

  /** Cria a exportação da versão atual do documento e põe na fila. */
  async pedir(escopo: EscopoDaConta, documentoId: string, pedido: PedidoDeExportacao): Promise<Exportacao> {
    const doc = await this.d.documentos.abrir(escopo, documentoId);
    if (!doc) throw new NaoEncontrado();
    const pranchetas = this.pranchetasDoPedido(doc.arvore, pedido.pranchetas);
    if ((await this.d.exportacoes.contarEmAndamento(escopo)) >= EXPORTACOES_NA_FILA_POR_CONTA)
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeExportacoes, { limite: EXPORTACOES_NA_FILA_POR_CONTA });

    const opcoes: OpcoesGuardadas =
      pedido.formato === 'psd' ? { formato: 'psd', arquivos: pedido.arquivos, pranchetas } : { formato: 'png', escala: pedido.escala, semFundo: pedido.semFundo, pranchetas };
    const criada = await this.d.exportacoes.criar(escopo, { id: this.d.gerarId(), documentoId, versao: doc.versao, nome: doc.nome, opcoes });
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
      formato: opcoes.formato,
      pranchetas: pranchetas.length,
      juntas: opcoes.formato === 'psd' && opcoes.arquivos === 'juntas',
    });
    return paraContrato(criada);
  }

  async consultar(escopo: EscopoDaConta, id: string): Promise<Exportacao> {
    const e = await this.d.exportacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    return paraContrato(e);
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
    if (e.expiraEm && e.expiraEm.getTime() <= this.agora().getTime()) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.exportacaoExpirada);
    return this.d.armazenamento.linkAssinado(escopo, arquivo.chaveDoObjeto, { validadeEmSegundos: VALIDADE_DO_LINK_EM_SEGUNDOS, nomeDoArquivo: arquivo.nome, tipoMime: arquivo.tipoMime });
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

    const gerados: ArquivoGuardado[] = [];
    const feitas: string[] = [];
    let falhas = 0;
    let erroCodigo: string | undefined;
    let relatorio: RelatorioDeExportacao | undefined;
    try {
      const guardado = await this.d.documentos.arvoreNaVersao(escopo, e.documentoId, e.versao);
      if (!guardado) {
        erroCodigo = 'documento_indisponivel';
      } else {
        const doc = guardado.arvore;
        const juntas = e.opcoes.formato === 'psd' && e.opcoes.arquivos === 'juntas';
        const nomes = new Set<string>();
        const usados: RecursosAchados = { fontes: [], imagens: [] };
        const bytesJaLidos = new Map<string, Uint8Array>();
        const entreEtapas = this.sinalDeVida(escopo, id);

        for (const grupo of juntas ? [e.opcoes.pranchetas] : e.opcoes.pranchetas.map((p) => [p])) {
          try {
            const achados = await this.acharRecursos(escopo, soAsPranchetas(doc, grupo));
            const recursos = await this.lerRecursos(escopo, achados, bytesJaLidos);
            const nome = juntas || e.opcoes.pranchetas.length === 1 ? e.nome : `${e.nome} - ${doc.pranchetas.find((p) => p.id === grupo[0])?.nome ?? ''}`;
            const arquivos: ArquivoGerado[] =
              e.opcoes.formato === 'psd'
                ? await this.d.motor.psd(doc, recursos, { nome, pranchetas: grupo, arquivos: e.opcoes.arquivos }, entreEtapas)
                : await this.d.motor.png(doc, recursos, { nome, pranchetas: grupo, escala: e.opcoes.escala, semFundo: e.opcoes.semFundo }, entreEtapas);
            for (const [i, gerado] of arquivos.entries()) {
              const indice = gerados.length;
              const extensao = extensaoDe(gerado.nome);
              const arquivo: ArquivoGuardado = {
                indice,
                nome: nomeLivre(gerado.nome, nomes),
                tipoMime: TIPO_POR_EXTENSAO[extensao] ?? 'application/octet-stream',
                bytes: gerado.bytes.byteLength,
                ...(juntas ? {} : { pranchetaId: grupo[0] as string }),
                chaveDoObjeto: chaveDeExportacao(escopo, e.id, indice, extensao),
              };
              // primeiro o objeto, depois a linha: um registro nunca aponta para objeto que não existe
              await this.d.armazenamento.guardar(escopo, arquivo.chaveDoObjeto, gerado.bytes, arquivo.tipoMime);
              await this.d.exportacoes.registrarArquivo(escopo, e.id, arquivo, i === 0 ? grupo.length : 0, this.agora());
              nomes.add(arquivo.nome);
              gerados.push(arquivo);
            }
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
        if (e.opcoes.formato === 'psd' && gerados.length > 0) {
          // o relatório do que de fato saiu, com os nomes de arquivo de verdade
          relatorio = { ...relatorioDeExportacao(doc, conhecidos(usados), { pranchetas: feitas, arquivos: e.opcoes.arquivos }), arquivos: gerados.map((a) => a.nome) };
        }
      }
    } catch (erro) {
      // falha fora de uma prancheta (banco, armazenamento): a exportação termina como falha, não fica "rodando"
      this.d.aoFalhar?.({ exportacaoId: e.id, etapa: 'exportacao', erro });
      erroCodigo = 'falha_na_exportacao';
    }

    const fim = this.agora();
    const estado = erroCodigo || gerados.length === 0 ? 'falhou' : falhas > 0 ? 'pronta_em_parte' : 'pronta';
    const duracaoMs = Math.max(0, fim.getTime() - comeco.getTime());
    await this.d.exportacoes.concluir(escopo, e.id, {
      estado,
      terminadaEm: fim,
      duracaoMs,
      ...(estado === 'falhou' ? { erroCodigo: erroCodigo ?? 'falha_na_exportacao' } : {}),
      ...(relatorio && estado !== 'falhou' ? { relatorio } : {}),
      // a data de vencimento é gravada sempre que existe arquivo guardado, mesmo que o estado final seja falha
      ...(gerados.length > 0 ? { expiraEm: new Date(fim.getTime() + DIAS_DE_RETENCAO_DA_EXPORTACAO * UM_DIA_MS) } : {}),
    });
    this.uso.registrar(escopo, {
      evento: 'exportacao_terminada',
      exportacaoId: e.id,
      documentoId: e.documentoId,
      formato: e.opcoes.formato,
      resultado: estado,
      pranchetas: e.pranchetasNoTotal,
      falhas,
      arquivos: gerados.length,
      bytes: gerados.reduce((soma, a) => soma + a.bytes, 0),
      esperaMs: Math.max(0, comeco.getTime() - e.criadaEm.getTime()),
      duracaoMs,
    });
    return 'feita';
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
