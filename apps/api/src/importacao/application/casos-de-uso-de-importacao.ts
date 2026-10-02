// Casos de uso da importação de PSD (ADR 028, item 4; docs/mvp/backend.md, seção 17.14). Classe pura.
//
// O arquivo é de um terceiro e é hostil até prova em contrário:
// - na requisição só se lê a ESTRUTURA (inspecionarPsd e fontesDoPsd, de @otto/psd): tipo pelos bytes, tetos e as
//   fontes pedidas, sem decodificar um pixel;
// - o trabalho pesado (importarPsd) roda no worker, numa thread de render, uma importação por vez por conta;
// - o worker recebe só (conta, id) e relê tudo sob o escopo da conta: o que veio na fila é hipótese;
// - nome de arquivo, de camada e de fonte são conteúdo: ficam na linha da importação e na peça, sob RLS, e nunca
//   entram em evento de uso nem em log (ADR 031). Para o Otto, a peça importada é uma peça como outra qualquer:
//   o texto de uma camada é material, nunca instrução (ADR 029).
import type { Documento } from '@otto/documento';
import {
  ErroDeImportacao,
  type FonteDaExportacao,
  type FormatoDeArquivoEmCamadas,
  fontesDoPsd,
  inspecionarPsd,
  type LimitesDeImportacao,
  type PsdInspecionado,
  type ResultadoDaImportacao,
} from '@otto/psd';
import {
  CODIGOS_DE_ERRO,
  type EscolhaDeFonte,
  type FonteDoPsd,
  HORAS_DE_RETENCAO_DO_PSD_ENVIADO,
  IMPORTACOES_ABERTAS_POR_CONTA,
  IMPORTACOES_NA_LISTA,
  type Importacao,
  LIMITES,
  type ListaDeImportacoes,
  type PedidoDeImportacao,
  RelatorioDeImportacao,
} from '@otto/shared';
import type { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import { chaveDeArquivoDaConta, chaveDeImportacao } from '../../arquivo/application/chave-de-objeto';
import type { RepositorioDeArquivos } from '../../arquivo/application/repositorio-de-arquivos';
import type { BibliotecaDeFontes, FonteRegistrada } from '../../biblioteca/application/biblioteca-de-fontes';
import { pesosParaBaixar } from '../../biblioteca/application/casos-de-uso-de-fontes';
import type { CatalogoDeFontes, FamiliaDoCatalogo } from '../../biblioteca/application/catalogo-de-fontes';
import { pesoMaisProximo } from '../../biblioteca/domain/fontes';
import type { RepositorioDeDocumentos } from '../../documento/application/repositorio-de-documentos';
import { arquivosDaArvore } from '../../documento/domain/arquivos-da-arvore';
import { ErroDaAplicacao, NaoEncontrado, PedidoInvalido } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type BarramentoDeEventos, FILAS } from '../../plataforma/fila/barramento-de-eventos';
import { sha256EmPedacos } from '../../plataforma/hash/sha256-em-pedacos';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { chaveDaFamilia, pistaDoPostScript } from '../domain/pista-do-postscript';
import { NOME_DA_PECA_SEM_NOME, NOME_DO_ARQUIVO_SEM_NOME } from '../textos';
import type { MotorDeImportacao } from './motor-de-importacao';
import type { ConclusaoDaImportacao, ErroDaImportacao, ImportacaoGuardada, RepositorioDeImportacoes } from './repositorio-de-importacoes';

/** O que aconteceu de errado, sem conteúdo: a mensagem do erro pode citar nome de camada ou de fonte, e não sai daqui. */
export interface FalhaNaImportacao {
  importacaoId: string;
  etapa: 'importacao' | 'fila' | 'limpeza';
  erro: unknown;
}

export interface DependenciasDaImportacao {
  importacoes: RepositorioDeImportacoes;
  documentos: RepositorioDeDocumentos;
  arquivos: RepositorioDeArquivos;
  armazenamento: ArmazenamentoDeArquivo;
  fontes: BibliotecaDeFontes;
  /** De onde a biblioteca traz família que ainda não tem. Sem ele, fonte fora da biblioteca está em falta. */
  catalogo?: CatalogoDeFontes;
  /** Traz do catálogo para a biblioteca. Nunca lança. */
  sobDemanda?: { garantir(familias: Iterable<string>): Promise<void> };
  /** A marca da conta, para conferir a do pedido. */
  marcas: { buscarMarca(escopo: EscopoDaConta, id: string): Promise<unknown | undefined> };
  fila: BarramentoDeEventos;
  motor: MotorDeImportacao;
  /** A leitura do PSD (porta do especialista-grafico): na requisição, só para listar as fontes que o arquivo pede. */
  formato: FormatoDeArquivoEmCamadas;
  miniaturas?: { pedirAgora(escopo: EscopoDaConta, documentoId: string): Promise<void> };
  gerarId: () => string;
  agora?: () => Date;
  uso?: RegistroDeUso;
  aoFalhar?: (falha: FalhaNaImportacao) => void;
  /** `bytesDoArquivo`: o teto do envio. `psd`: os tetos do arquivo, por cima dos padrões de @otto/psd. */
  limites: { bytesDoArquivo: number; psd: Partial<LimitesDeImportacao> };
  /** Quantas importações abertas por conta. Padrão: o do contrato. */
  abertasPorConta?: number;
  /** Teto da árvore de uma peça. Padrão: o mesmo de qualquer lote (LIMITE_DE_BYTES_DA_ARVORE). */
  bytesDaArvoreNoMaximo?: number;
  intervaloDoSinalDeVidaMs?: number;
}

/**
 * Importação "rodando" sem sinal de vida há mais que isto é dada como interrompida. O sinal sai por relógio (a
 * importação roda numa thread), e o pior arquivo medido leva 4,4 s: 5 minutos é o mesmo prazo da exportação.
 */
export const SEM_SINAL_DEPOIS_DE_MS = 300_000;
/** Importação "na_fila" há mais que isto é dada como abandonada: o trabalho da fila se perdeu ou esgotou as tentativas. */
export const NA_FILA_NO_MAXIMO_MS = 30 * 60_000;
/** Retomada: o trabalho de uma importação "rodando" foi entregue de novo, e ela está sem sinal de vida há mais que isto. */
export const RETOMAR_SEM_SINAL_DEPOIS_DE_MS = 20_000;
/** Contando a primeira. Um arquivo que derruba o worker (falta de memória) é tentado duas vezes, não para sempre. */
export const TENTATIVAS_NO_MAXIMO = 2;
/** O mesmo teto de árvore de qualquer lote (casos-de-uso-de-documento.ts). */
const BYTES_DA_ARVORE_NO_MAXIMO = 4 * 1024 * 1024;
const INTERVALO_DO_SINAL_DE_VIDA_MS = 5_000;
/** A limpeza é agendada para um pouco depois do vencimento: relógio do worker e do banco não são o mesmo. */
const FOLGA_DA_LIMPEZA_MS = 60_000;
const UMA_HORA_MS = 3_600_000;
const DIAS_NA_LISTA = 7;
/** Quantas fontes de um arquivo o Otto acompanha, e o tamanho de um nome. O que passar disso vem como imagem. */
const FONTES_POR_ARQUIVO = 200;
const CARACTERES_DO_NOME_DE_FONTE = 200;
const CARACTERES_DO_NOME_DO_ARQUIVO = 200;
const TIPO_DO_ARQUIVO = 'image/vnd.adobe.photoshop';
const ESTADOS_FINAIS: readonly ImportacaoGuardada['estado'][] = ['pronta', 'falhou', 'descartada'];

/** O nome do arquivo como a pessoa o vê: sem o caminho, sem caractere de controle, com tamanho limitado. */
function nomeDoArquivo(bruto: string | undefined, formato: 'psd' | 'psb'): string {
  const base = (bruto ?? '').split(/[\\/]/).pop() ?? '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é justamente o caractere de controle que sai
  const limpo = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!limpo) return `${NOME_DO_ARQUIVO_SEM_NOME}.${formato}`;
  return limpo.length <= CARACTERES_DO_NOME_DO_ARQUIVO ? limpo : limpo.slice(-CARACTERES_DO_NOME_DO_ARQUIVO).trim();
}

/** O nome da peça que nasce do arquivo: o nome dele sem a extensão. */
function nomeDaPeca(arquivo: string): string {
  const semExtensao = arquivo
    .replace(/\.(psd|psb)$/i, '')
    .trim()
    .slice(0, LIMITES.caracteresDoNome)
    .trim();
  return semExtensao || NOME_DA_PECA_SEM_NOME;
}

/** O que será feito com cada fonte: a escolha do designer ou, sem ela, o padrão da situação. */
function acaoDa(fonte: FonteDoPsd, escolha: EscolhaDeFonte | undefined): 'usar' | 'baixar' | 'imagem' | 'substituir' {
  if (escolha?.fazer === 'imagem' || escolha?.fazer === 'substituir') return escolha.fazer;
  if (fonte.situacao === 'na_biblioteca') return 'usar';
  return fonte.situacao === 'no_catalogo' ? 'baixar' : 'imagem';
}

export class CasosDeUsoDeImportacao {
  private readonly agora: () => Date;
  private readonly uso: RegistroDeUso;

  constructor(private readonly d: DependenciasDaImportacao) {
    this.agora = d.agora ?? (() => new Date());
    this.uso = d.uso ?? new RegistroDeUsoMudo();
  }

  /**
   * Recebe o arquivo, confere pelos bytes e pelos tetos, e só então guarda. Não decodifica pixel.
   * @param info `nome` é o nome do arquivo no computador da pessoa: é conteúdo, nunca vai para log nem para a chave.
   */
  async enviar(escopo: EscopoDaConta, conteudo: Uint8Array, info: { nome?: string } = {}): Promise<Importacao> {
    const limiteEmBytes = this.d.limites.bytesDoArquivo;
    if (conteudo.byteLength > limiteEmBytes) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoGrandeDemais, { limiteEmBytes });
    const limites = this.limitesDoPsd();
    let inspecao: PsdInspecionado;
    let pedidas: string[];
    try {
      inspecao = inspecionarPsd(conteudo, limites);
      pedidas = fontesDoPsd(this.d.formato, conteudo, limites);
    } catch (erro) {
      if (erro instanceof ErroDeImportacao) {
        if (erro.codigo === 'arquivo-grande-demais') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoGrandeDemais, { limiteEmBytes });
        throw new ErroDaAplicacao(CODIGOS_DE_ERRO.psdRecusado, { motivo: erro.codigo, mensagem: erro.message });
      }
      throw erro;
    }
    // o que parou ou venceu não segura o limite da conta
    await this.arrumar(escopo);

    const agora = this.agora();
    const id = this.d.gerarId();
    const chave = chaveDeImportacao(escopo, id, inspecao.formato);
    const fontes = pedidas.filter((nome) => nome.length <= CARACTERES_DO_NOME_DE_FONTE).slice(0, FONTES_POR_ARQUIVO);
    const limite = this.d.abertasPorConta ?? IMPORTACOES_ABERTAS_POR_CONTA;
    // em pedaços: o hash de um arquivo de 100 MB não segura as outras requisições
    const sha256 = await sha256EmPedacos(conteudo);
    // primeiro o objeto, depois a linha: um registro nunca aponta para objeto que não existe
    await this.d.armazenamento.guardar(escopo, chave, conteudo, TIPO_DO_ARQUIVO);
    let criada: ImportacaoGuardada | undefined;
    try {
      criada = await this.d.importacoes.criarSeCouber(
        escopo,
        {
          id,
          nomeDoArquivo: nomeDoArquivo(info.nome, inspecao.formato),
          bytes: conteudo.byteLength,
          sha256,
          formato: inspecao.formato,
          largura: inspecao.largura,
          altura: inspecao.altura,
          camadas: inspecao.camadas,
          fontes,
          chaveDoObjeto: chave,
          criadaEm: agora,
          expiraEm: new Date(agora.getTime() + HORAS_DE_RETENCAO_DO_PSD_ENVIADO * UMA_HORA_MS),
        },
        limite,
      );
    } finally {
      // não coube (ou o banco falhou): o arquivo não fica guardado sem dono
      if (!criada) await this.d.armazenamento.remover(escopo, chave).catch(() => undefined);
    }
    if (!criada) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.limiteDeImportacoes, { limite });
    await this.agendarLimpeza(escopo, criada);
    const situadas = await (await this.prepararSituacao())(criada.fontes);
    this.uso.registrar(escopo, {
      evento: 'psd_enviado',
      importacaoId: id,
      formato: criada.formato,
      bytes: criada.bytes,
      largura: criada.largura,
      altura: criada.altura,
      camadas: criada.camadas,
      fontes: situadas.length,
      fontesEmFalta: situadas.filter((f) => f.situacao !== 'na_biblioteca').length,
    });
    return paraContrato(criada, situadas);
  }

  /** enviada → na fila, com as escolhas do designer. */
  async pedir(escopo: EscopoDaConta, id: string, pedido: PedidoDeImportacao): Promise<Importacao> {
    await this.arrumar(escopo);
    const e = await this.d.importacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    if (e.estado !== 'enviada') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.importacaoForaDoEstado, { estado: e.estado });
    if (pedido.marcaId && !(await this.d.marcas.buscarMarca(escopo, pedido.marcaId))) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.marcaDesconhecida);

    const situar = await this.prepararSituacao();
    const situadas = await situar(e.fontes);
    const catalogo = await this.familiasDoCatalogo();
    for (const escolha of pedido.fontes) {
      const fonte = situadas.find((f) => f.postScript === escolha.postScript);
      // a escolha só cita fonte que o arquivo pede; baixar só vale para a que existe (na biblioteca ou no catálogo)
      if (!fonte || (escolha.fazer === 'baixar' && fonte.situacao === 'em_falta')) throw new PedidoInvalido(['fontes']);
      if (escolha.fazer === 'substituir') {
        const existe = (await this.d.fontes.pesosDa(escolha.por.familia)).length > 0 || catalogo.some((f) => f.familia === escolha.por.familia);
        if (!existe) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.fonteDesconhecida, { familia: escolha.por.familia });
      }
    }

    const pedida = await this.d.importacoes.pedir(escopo, id, pedido, this.agora());
    if (!pedida) throw new NaoEncontrado();
    if (pedida === 'fora-do-estado') throw new ErroDaAplicacao(CODIGOS_DE_ERRO.importacaoForaDoEstado, { estado: (await this.d.importacoes.buscar(escopo, id))?.estado ?? 'descartada' });
    try {
      // só identificadores na fila; quem tem menos na fila passa na frente
      await this.d.fila.publicar(FILAS.importacao, { contaId: escopo.contaId, id }, { jaNaFilaDaConta: pedida.naFrente });
    } catch (erro) {
      // sem fila não há quem execute: a importação volta a esperar o pedido, e o arquivo enviado continua valendo
      await this.d.importacoes.devolver(escopo, id);
      this.d.aoFalhar?.({ importacaoId: id, etapa: 'fila', erro });
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.filaIndisponivel);
    }
    const escolhas = new Map(pedido.fontes.map((f) => [f.postScript, f]));
    const acoes = situadas.map((f) => acaoDa(f, escolhas.get(f.postScript)));
    this.uso.registrar(escopo, {
      evento: 'importacao_pedida',
      importacaoId: id,
      comNome: pedido.nome !== undefined,
      comMarca: pedido.marcaId !== undefined,
      viramImagem: acoes.filter((a) => a === 'imagem').length,
      baixadas: acoes.filter((a) => a === 'baixar').length,
      substituidas: acoes.filter((a) => a === 'substituir').length,
    });
    return paraContrato(pedida.importacao, situadas);
  }

  /** Desiste de um arquivo enviado e ainda não importado: apaga o arquivo. */
  async desistir(escopo: EscopoDaConta, id: string): Promise<void> {
    const e = await this.d.importacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    if (!(await this.d.importacoes.descartar(escopo, id, this.agora()))) {
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.importacaoForaDoEstado, { estado: (await this.d.importacoes.buscar(escopo, id))?.estado ?? e.estado });
    }
    await this.apagarArquivo(escopo, e);
    this.uso.registrar(escopo, { evento: 'importacao_descartada', importacaoId: id, motivo: 'desistencia', bytes: e.bytes });
  }

  async consultar(escopo: EscopoDaConta, id: string): Promise<Importacao> {
    let e = await this.d.importacoes.buscar(escopo, id);
    if (!e) throw new NaoEncontrado();
    // Só confere o que parou quando há tempo bastante para ter parado: a consulta normal (a cada 1 ou 2 segundos,
    // por alguns segundos) não grava nada.
    if (this.podeTerParado(e)) {
      await this.arrumar(escopo);
      e = (await this.d.importacoes.buscar(escopo, id)) ?? e;
    }
    if (ESTADOS_FINAIS.includes(e.estado) && !e.arquivoRemovidoEm) await this.apagarArquivo(escopo, e);
    return paraContrato(e, await (await this.prepararSituacao())(e.fontes));
  }

  /** As em curso e as recentes da conta, da mais nova para a mais velha, sem o relatório. */
  async listar(escopo: EscopoDaConta): Promise<ListaDeImportacoes> {
    await this.arrumar(escopo);
    const itens = await this.d.importacoes.listar(escopo, { criadasDesde: new Date(this.agora().getTime() - DIAS_NA_LISTA * 24 * UMA_HORA_MS), limite: IMPORTACOES_NA_LISTA });
    // a que terminou sem que o arquivo fosse apagado (o worker caiu logo depois de fechar): apaga agora
    for (const e of itens) if (ESTADOS_FINAIS.includes(e.estado) && !e.arquivoRemovidoEm) await this.apagarArquivo(escopo, e);
    const situar = await this.prepararSituacao();
    return { itens: await Promise.all(itens.map(async (e) => paraContrato(e, await situar(e.fontes), false))) };
  }

  /** A importação que criou a peça, com o relatório. Peça comum, de outra conta ou inexistente: o mesmo não encontrado. */
  async daPeca(escopo: EscopoDaConta, documentoId: string): Promise<Importacao> {
    const e = await this.d.importacoes.daPeca(escopo, documentoId);
    if (!e) throw new NaoEncontrado();
    return paraContrato(e, await (await this.prepararSituacao())(e.fontes));
  }

  /**
   * O trabalho do worker. `escopo` vem do que estava na fila e é hipótese: tudo é relido sob ele, e importação que
   * não existe nessa conta não é processada.
   * - 'ignorada': não existe nesta conta, ou não está mais na fila (entrega repetida);
   * - 'ocupada': outra importação da conta está rodando; quem consome a fila adia o trabalho.
   */
  async executar(escopo: EscopoDaConta, id: string): Promise<'feita' | 'ignorada' | 'ocupada'> {
    const comeco = this.agora();
    const inicio = await this.d.importacoes.iniciar(escopo, id, comeco, new Date(comeco.getTime() - SEM_SINAL_DEPOIS_DE_MS), {
      semSinalDesde: new Date(comeco.getTime() - RETOMAR_SEM_SINAL_DEPOIS_DE_MS),
      maximoDeTentativas: TENTATIVAS_NO_MAXIMO,
    });
    if (inicio.resultado !== 'iniciada') return inicio.resultado;
    const e = inicio.importacao;
    // Sinal de vida por relógio: a importação roda fora do laço principal. É por ele que outro worker sabe se pode retomar.
    const relogio = setInterval(() => void this.d.importacoes.bater(escopo, id, this.agora()).catch(() => undefined), this.d.intervaloDoSinalDeVidaMs ?? INTERVALO_DO_SINAL_DE_VIDA_MS);
    relogio.unref();

    let feito: { documentoId: string; resultado: ResultadoDaImportacao } | undefined;
    let erro: ErroDaImportacao | undefined;
    try {
      feito = await this.importar(escopo, e);
    } catch (falha) {
      if (falha instanceof ErroDeImportacao) erro = { codigo: CODIGOS_DE_ERRO.psdRecusado, motivo: falha.codigo, mensagem: falha.message };
      else if (falha instanceof FalhaConhecida) erro = { codigo: falha.codigo };
      else {
        // falha nossa (motor, thread que caiu, banco, armazenamento): só o tipo do erro sai daqui
        this.d.aoFalhar?.({ importacaoId: id, etapa: 'importacao', erro: falha });
        erro = { codigo: 'falha_na_importacao' };
      }
    } finally {
      clearInterval(relogio);
    }

    const fim = this.agora();
    const duracaoMs = Math.max(0, fim.getTime() - comeco.getTime());
    const conclusao: ConclusaoDaImportacao = feito
      ? { estado: 'pronta', documentoId: feito.documentoId, relatorio: RelatorioDeImportacao.parse(feito.resultado.relatorio), terminadaEm: fim, duracaoMs }
      : { estado: 'falhou', erro: erro ?? { codigo: 'falha_na_importacao' }, terminadaEm: fim, duracaoMs };
    // se isto lançar (banco fora), o trabalho volta para a fila e a retomada fecha com a mesma peça
    await this.d.importacoes.concluir(escopo, id, conclusao);
    // terminou, com ou sem peça: o arquivo enviado não é mais necessário
    await this.apagarArquivo(escopo, e);
    if (feito) await this.d.miniaturas?.pedirAgora(escopo, feito.documentoId);

    const camadas = feito?.resultado.relatorio.camadas ?? [];
    this.uso.registrar(escopo, {
      evento: 'importacao_terminada',
      importacaoId: id,
      ...(feito ? { documentoId: feito.documentoId } : {}),
      resultado: feito ? 'pronta' : 'falhou',
      ...(erro ? { erro: erro.codigo, ...(erro.motivo ? { motivo: erro.motivo } : {}) } : {}),
      tentativa: e.tentativas,
      formato: e.formato,
      bytes: e.bytes,
      camadas: e.camadas,
      pranchetas: feito?.resultado.doc.pranchetas.length ?? 0,
      camadasEditaveis: camadas.filter((c) => c.destino === 'editavel').length,
      camadasComoImagem: camadas.filter((c) => c.destino === 'imagem').length,
      camadasIgnoradas: camadas.filter((c) => c.destino === 'ignorado').length,
      imagens: feito?.resultado.imagens.length ?? 0,
      bytesDasImagens: feito?.resultado.imagens.reduce((soma, i) => soma + i.bytes.byteLength, 0) ?? 0,
      fontesEmFalta: feito?.resultado.relatorio.emFalta.fontes.length ?? 0,
      substituicoes: feito?.resultado.relatorio.substituicoes.length ?? 0,
      avisos: feito?.resultado.relatorio.avisos.length ?? 0,
      esperaMs: Math.max(0, comeco.getTime() - (e.pedidaEm ?? e.criadaEm).getTime()),
      duracaoMs,
    });
    return 'feita';
  }

  /**
   * O trabalho de limpeza, agendado para o vencimento do arquivo enviado: descarta a importação que ninguém pediu e
   * apaga o arquivo que ficou. Idempotente, e o `escopo` é hipótese como em `executar`.
   * Lança se ainda não é hora (o trabalho volta para a fila).
   */
  async limpar(escopo: EscopoDaConta, id: string): Promise<'limpa' | 'ignorada'> {
    const e = await this.d.importacoes.buscar(escopo, id);
    if (!e || e.arquivoRemovidoEm) return 'ignorada';
    if (e.estado === 'na_fila' || e.estado === 'rodando') throw new Error('a importação ainda está em curso');
    if (e.estado === 'enviada') {
      if (e.expiraEm.getTime() > this.agora().getTime()) throw new Error('o arquivo enviado ainda não venceu');
      if (await this.d.importacoes.descartar(escopo, id, this.agora())) this.uso.registrar(escopo, { evento: 'importacao_descartada', importacaoId: id, motivo: 'vencimento', bytes: e.bytes });
    }
    // primeiro o objeto, depois a marca: se cair no meio, a próxima entrega apaga (apagar o que não existe não é erro)
    await this.d.armazenamento.remover(escopo, e.chaveDoObjeto);
    await this.d.importacoes.marcarArquivoRemovido(escopo, id, this.agora());
    return 'limpa';
  }

  /** Lê o arquivo, importa, guarda as imagens e cria a peça. Devolve a peça e o que o motor produziu. */
  private async importar(escopo: EscopoDaConta, e: ImportacaoGuardada): Promise<{ documentoId: string; resultado: ResultadoDaImportacao }> {
    const bytes = await this.d.armazenamento.ler(escopo, e.chaveDoObjeto);
    if (!bytes) throw new FalhaConhecida('arquivo_indisponivel');
    const { fontes, substituicoes } = await this.fontesPara(e);
    // o motor relê o arquivo do zero, com os mesmos tetos do envio: o que está guardado também é hipótese
    const resultado = await this.d.motor.importar(bytes, { fontes, substituicoes, limites: this.limitesDoPsd() });

    if (Buffer.byteLength(JSON.stringify(resultado.doc), 'utf8') > (this.d.bytesDaArvoreNoMaximo ?? BYTES_DA_ARVORE_NO_MAXIMO)) throw new FalhaConhecida(CODIGOS_DE_ERRO.documentoGrandeDemais);
    // A chave de cada imagem é o hash do próprio conteúdo, e a árvore só cita imagem que veio junto: o hash não é
    // autorização, e uma árvore que citasse arquivo de fora não entra.
    const entregues = new Set<string>();
    for (const imagem of resultado.imagens) {
      if ((await sha256EmPedacos(imagem.bytes)) !== imagem.arquivo) throw new Error('imagem importada com chave diferente do conteúdo');
      entregues.add(imagem.arquivo);
    }
    for (const citado of arquivosDaArvore(resultado.doc)) if (!entregues.has(citado)) throw new Error('a árvore importada cita imagem que não veio');

    for (const imagem of resultado.imagens) {
      const chave = chaveDeArquivoDaConta(escopo, imagem.arquivo);
      // primeiro o objeto, depois a linha; gravar de novo o mesmo conteúdo (retomada) não muda nada
      await this.d.armazenamento.guardar(escopo, chave, imagem.bytes, imagem.tipo);
      await this.d.arquivos.registrar(escopo, {
        id: this.d.gerarId(),
        sha256: imagem.arquivo,
        tipoMime: imagem.tipo,
        bytes: imagem.bytes.byteLength,
        largura: imagem.largura,
        altura: imagem.altura,
        especie: imagem.origem === 'mascara' ? 'mascara' : 'imagem',
        chaveDoObjeto: chave,
      });
    }
    return { documentoId: await this.criarPeca(escopo, e, resultado.doc), resultado };
  }

  /** Cria a peça da importação, na versão 0. Na retomada, a peça que a tentativa anterior criou é a que vale. */
  private async criarPeca(escopo: EscopoDaConta, e: ImportacaoGuardada, arvore: Documento): Promise<string> {
    const existente = await this.d.documentos.daImportacao(escopo, e.id);
    if (existente) return existente.id;
    const criada = await this.d.documentos.criar(escopo, { id: this.d.gerarId(), nome: e.pedido?.nome ?? nomeDaPeca(e.nomeDoArquivo), arvore, importacaoId: e.id });
    const marcaId = e.pedido?.marcaId;
    // a marca foi conferida no pedido; se foi apagada de lá para cá, a peça fica sem marca
    if (marcaId && (await this.d.marcas.buscarMarca(escopo, marcaId))) await this.d.documentos.definirMarca(escopo, criada.id, marcaId);
    return criada.id;
  }

  /** As fontes que vão para o motor e as trocas pedidas, depois de trazer do catálogo o que o designer quis baixar. */
  private async fontesPara(e: ImportacaoGuardada): Promise<{ fontes: FonteDaExportacao[]; substituicoes: Record<string, string> }> {
    const escolhas = new Map((e.pedido?.fontes ?? []).map((f) => [f.postScript, f]));
    let situadas = await (await this.prepararSituacao())(e.fontes);
    const trazer = new Set<string>();
    for (const fonte of situadas) {
      const escolha = escolhas.get(fonte.postScript);
      const acao = acaoDa(fonte, escolha);
      if (acao === 'substituir' && escolha?.fazer === 'substituir') trazer.add(escolha.por.familia);
      else if (acao === 'baixar' && fonte.familia) trazer.add(fonte.familia);
    }
    if (trazer.size > 0 && this.d.sobDemanda) {
      // uma família por chamada: `garantir` tem teto por chamada, e nunca lança
      for (const familia of trazer) await this.d.sobDemanda.garantir([familia]);
      situadas = await (await this.prepararSituacao())(e.fontes);
    }

    const familias = new Set<string>();
    const trocas: [string, string][] = [];
    for (const fonte of situadas) {
      const escolha = escolhas.get(fonte.postScript);
      if (escolha?.fazer === 'imagem') continue;
      if (escolha?.fazer === 'substituir') {
        const pesos = await this.d.fontes.pesosDa(escolha.por.familia);
        const peso = pesoMaisProximo(
          pesos.map((p) => p.peso),
          escolha.por.peso,
        );
        const alvo = pesos.find((p) => p.peso === peso);
        // sem nome PostScript não há como dizer ao motor qual fonte entra no lugar: o texto vem como imagem
        if (alvo?.nomePostScript) {
          trocas.push([fonte.postScript, alvo.nomePostScript]);
          familias.add(alvo.familia);
        }
      } else if (fonte.situacao === 'na_biblioteca' && fonte.familia) familias.add(fonte.familia);
    }

    // a família inteira: o motor escolhe o peso de cada trecho, como no editor
    const fontes: FonteDaExportacao[] = [];
    for (const familia of familias) {
      for (const registro of await this.d.fontes.pesosDa(familia)) {
        const bytes = await this.d.fontes.bytes(registro);
        if (bytes) fontes.push({ familia: registro.familia, peso: registro.peso, bytes, ...(registro.nomePostScript ? { postScript: registro.nomePostScript } : {}) });
      }
    }
    return { fontes, substituicoes: Object.fromEntries(trocas) };
  }

  /**
   * Lê a biblioteca e o catálogo uma vez e devolve a função que situa as fontes de um arquivo.
   * O nome PostScript dá a pista da família (pista-do-postscript.ts); quem confirma é o nome PostScript da fonte
   * que o Otto tem.
   */
  private async prepararSituacao(): Promise<(pedidas: readonly string[]) => Promise<FonteDoPsd[]>> {
    const daBiblioteca = new Map((await this.d.fontes.listar()).map((f) => [chaveDaFamilia(f.familia), f.familia]));
    const doCatalogo = new Map((await this.familiasDoCatalogo()).map((f) => [chaveDaFamilia(f.familia), f]));
    const pesosDe = new Map<string, Promise<FonteRegistrada[]>>();
    const pesosDa = (familia: string): Promise<FonteRegistrada[]> => {
      const jaLido = pesosDe.get(familia);
      if (jaLido) return jaLido;
      const lendo = this.d.fontes.pesosDa(familia);
      pesosDe.set(familia, lendo);
      return lendo;
    };
    return async (pedidas) => {
      const situadas: FonteDoPsd[] = [];
      for (const postScript of pedidas) {
        const pista = pistaDoPostScript(postScript);
        const familia = daBiblioteca.get(pista.familia);
        if (familia) {
          const pesos = await pesosDa(familia);
          const exata = pesos.find((p) => p.nomePostScript === postScript);
          if (exata) {
            situadas.push({ postScript, situacao: 'na_biblioteca', familia: exata.familia, peso: exata.peso });
            continue;
          }
          // a família está na biblioteca, em outro peso (ou sem o itálico): fica a sugestão de troca
          const peso = pesoMaisProximo(
            pesos.map((p) => p.peso),
            pista.peso,
          );
          situadas.push({ postScript, situacao: 'em_falta', ...(peso !== undefined ? { sugestao: { familia, peso } } : {}) });
          continue;
        }
        const catalogada = doCatalogo.get(pista.familia);
        const pesos = catalogada ? pesosParaBaixar(catalogada.pesos) : [];
        if (catalogada && !pista.italico && pesos.includes(pista.peso)) situadas.push({ postScript, situacao: 'no_catalogo', familia: catalogada.familia, peso: pista.peso });
        else if (catalogada && pesos.length > 0) situadas.push({ postScript, situacao: 'em_falta', sugestao: { familia: catalogada.familia, peso: pesoMaisProximo(pesos, pista.peso) as number } });
        else situadas.push({ postScript, situacao: 'em_falta' });
      }
      return situadas;
    };
  }

  /** O catálogo fora do ar não derruba a importação: vale como catálogo vazio. */
  private async familiasDoCatalogo(): Promise<FamiliaDoCatalogo[]> {
    try {
      return (await this.d.catalogo?.familias()) ?? [];
    } catch {
      return [];
    }
  }

  /** Os tetos do arquivo: os do servidor por cima dos padrões do pacote, e o de bytes nunca acima do teto do envio. */
  private limitesDoPsd(): Partial<LimitesDeImportacao> {
    return { ...this.d.limites.psd, bytesDoArquivo: this.d.limites.bytesDoArquivo };
  }

  /** Há tempo bastante para a importação ter parado (vencido, abandonada na fila ou sem sinal de vida)? */
  private podeTerParado(e: ImportacaoGuardada): boolean {
    const agora = this.agora().getTime();
    if (e.estado === 'enviada') return e.expiraEm.getTime() <= agora;
    if (e.estado === 'na_fila') return agora - (e.pedidaEm ?? e.criadaEm).getTime() > NA_FILA_NO_MAXIMO_MS;
    return e.estado === 'rodando' && agora - (e.pedidaEm ?? e.criadaEm).getTime() > SEM_SINAL_DEPOIS_DE_MS;
  }

  /** Fecha o que parou nesta conta e apaga o arquivo de cada uma. */
  private async arrumar(escopo: EscopoDaConta): Promise<void> {
    const agora = this.agora();
    const fechadas = await this.d.importacoes.darBaixaNasParadas(escopo, agora, {
      naFilaDesde: new Date(agora.getTime() - NA_FILA_NO_MAXIMO_MS),
      semSinalDesde: new Date(agora.getTime() - SEM_SINAL_DEPOIS_DE_MS),
    });
    for (const fechada of fechadas) {
      if (fechada.estado === 'descartada') this.uso.registrar(escopo, { evento: 'importacao_descartada', importacaoId: fechada.id, motivo: 'vencimento', bytes: fechada.bytes });
      await this.apagarArquivo(escopo, fechada);
    }
  }

  /** Apaga o arquivo enviado e marca a linha. Falhar aqui não desfaz nada: a limpeza agendada tenta de novo. */
  private async apagarArquivo(escopo: EscopoDaConta, e: ImportacaoGuardada): Promise<void> {
    if (e.arquivoRemovidoEm) return;
    try {
      await this.d.armazenamento.remover(escopo, e.chaveDoObjeto);
      await this.d.importacoes.marcarArquivoRemovido(escopo, e.id, this.agora());
    } catch (erro) {
      this.d.aoFalhar?.({ importacaoId: e.id, etapa: 'limpeza', erro });
    }
  }

  /** Falhar em agendar não desfaz o envio: a consulta e a lista também fecham o que venceu. */
  private async agendarLimpeza(escopo: EscopoDaConta, e: ImportacaoGuardada): Promise<void> {
    try {
      await this.d.fila.publicar(FILAS.limpezaDeImportacao, { contaId: escopo.contaId, id: e.id }, { naoAntesDe: new Date(e.expiraEm.getTime() + FOLGA_DA_LIMPEZA_MS) });
    } catch (erro) {
      this.d.aoFalhar?.({ importacaoId: e.id, etapa: 'limpeza', erro });
    }
  }
}

/** Falha da importação que tem código próprio e não é defeito: vira `erro.codigo`, sem passar por quem observa falhas. */
class FalhaConhecida extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

function paraContrato(e: ImportacaoGuardada, fontes: FonteDoPsd[], comRelatorio = true): Importacao {
  return {
    id: e.id,
    estado: e.estado,
    arquivo: { nome: e.nomeDoArquivo, bytes: e.bytes, formato: e.formato, largura: e.largura, altura: e.altura, camadas: e.camadas },
    fontes,
    ...(e.pedido ? { pedido: e.pedido } : {}),
    ...(e.estado === 'pronta' && e.documentoId ? { documentoId: e.documentoId } : {}),
    ...(e.estado === 'pronta' && e.relatorio && comRelatorio ? { relatorio: e.relatorio } : {}),
    ...(e.estado === 'falhou' ? { erro: e.erro ?? { codigo: 'falha_na_importacao' } } : {}),
    criadaEm: e.criadaEm.toISOString(),
    ...(e.estado === 'pronta' && e.terminadaEm ? { prontaEm: e.terminadaEm.toISOString() } : {}),
    ...(e.estado === 'enviada' ? { expiraEm: e.expiraEm.toISOString() } : {}),
    ...(e.duracaoMs !== undefined ? { duracaoMs: e.duracaoMs } : {}),
  };
}
