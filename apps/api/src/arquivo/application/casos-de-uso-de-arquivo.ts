// Casos de uso de arquivo (docs/mvp/backend.md, seções 6.4, 7.4 e 10). Classe pura.
// Envio é hostil até prova em contrário: tipo pelo conteúdo, limite de bytes e de medidas,
// e nenhuma decodificação dentro da requisição.
import { createHash } from 'node:crypto';
import { type ArquivoEnviado, CODIGOS_DE_ERRO, type DadosDoArquivo, LIMITES, type TipoDeImagem, VetorImportado } from '@otto/shared';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { inspecionarImagem } from '../domain/inspecionar-imagem';
import type { ArmazenamentoDeArquivo } from './armazenamento-de-arquivo';
import { chaveDeArquivoDaConta } from './chave-de-objeto';
import type { OrigemDoArquivo, RepositorioDeArquivos } from './repositorio-de-arquivos';
import { importarSvg, SvgRecusado } from './vetor/importar-svg';
import { miniaturaDoVetor } from './vetor/miniatura-do-vetor';

export interface LimitesDeArquivo {
  bytesPorArquivo: number;
  ladoMaximoDeImagem: number;
  megapixelsNoMaximo: number;
}

export interface ConteudoDeArquivo {
  bytes: Uint8Array;
  tipo: string;
  sha256: string;
}

const SHA256 = /^[0-9a-f]{64}$/;

export class CasosDeUsoDeArquivo {
  constructor(
    private readonly arquivos: RepositorioDeArquivos,
    private readonly armazenamento: ArmazenamentoDeArquivo,
    private readonly gerarId: () => string,
    private readonly limites: LimitesDeArquivo,
    private readonly uso: RegistroDeUso = new RegistroDeUsoMudo(),
  ) {}

  /**
   * @param info `tipoDeclarado` é o Content-Type do envio: é ignorado (o tipo vem do conteúdo).
   *   `nome` é o nome do arquivo no computador da pessoa: é conteúdo, nunca vai para log nem para a chave.
   *   `origem` é de onde a imagem veio (banco, autor, licença): toda imagem trazida guarda a origem (ADR 032, item 4).
   */
  async enviarImagem(escopo: EscopoDaConta, conteudo: Uint8Array, info: { nome?: string; tipoDeclarado?: string; origem?: OrigemDoArquivo } = {}): Promise<ArquivoEnviado> {
    if (conteudo.byteLength > this.limites.bytesPorArquivo) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.arquivoGrandeDemais, { limiteEmBytes: this.limites.bytesPorArquivo });
    const inspecao = inspecionarImagem(conteudo);
    if (!inspecao.ok) throw new ErroDaAplicacao(inspecao.motivo === 'tipo_nao_aceito' ? CODIGOS_DE_ERRO.tipoNaoAceito : CODIGOS_DE_ERRO.imagemIlegivel);
    const { ladoMaximoDeImagem: ladoMaximo, megapixelsNoMaximo } = this.limites;
    if (inspecao.largura > ladoMaximo || inspecao.altura > ladoMaximo || inspecao.largura * inspecao.altura > megapixelsNoMaximo * 1_000_000) {
      throw new ErroDaAplicacao(CODIGOS_DE_ERRO.imagemGrandeDemais, { ladoMaximo, megapixelsNoMaximo });
    }

    const sha256 = createHash('sha256').update(conteudo).digest('hex');
    const chave = chaveDeArquivoDaConta(escopo, sha256);
    // primeiro o objeto, depois a linha: um registro nunca aponta para objeto que não existe
    await this.armazenamento.guardar(escopo, chave, conteudo, inspecao.tipo);
    const registrado = await this.arquivos.registrar(escopo, {
      id: this.gerarId(),
      sha256,
      tipoMime: inspecao.tipo,
      bytes: conteudo.byteLength,
      largura: inspecao.largura,
      altura: inspecao.altura,
      especie: 'imagem',
      chaveDoObjeto: chave,
      ...(info.nome ? { nomeOriginal: info.nome.slice(0, 200) } : {}),
      ...(info.origem ? { origem: info.origem } : {}),
    });
    this.uso.registrar(escopo, { evento: 'arquivo_enviado', tipo: inspecao.tipo, bytes: conteudo.byteLength, largura: inspecao.largura, altura: inspecao.altura });
    return { sha256, tipo: registrado.tipoMime as TipoDeImagem, largura: registrado.largura ?? inspecao.largura, altura: registrado.altura ?? inspecao.altura, bytes: registrado.bytes };
  }

  /**
   * Importa um SVG (logo, ícone) e devolve o nó vetorial pronto para criarNo. O SVG de origem fica
   * guardado como arquivo da conta (espécie "vetor"), mas nunca é servido de volta.
   * @param nome nome do arquivo no computador da pessoa: é conteúdo, nunca vai para log.
   */
  async importarVetor(escopo: EscopoDaConta, svg: string, nome: string | undefined): Promise<VetorImportado> {
    if (Buffer.byteLength(svg, 'utf8') > LIMITES.bytesDoSvg) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.corpoGrandeDemais, { limiteEmBytes: LIMITES.bytesDoSvg });
    let importado: ReturnType<typeof importarSvg>;
    try {
      importado = importarSvg(svg);
    } catch (e) {
      if (e instanceof SvgRecusado) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.svgInvalido, { motivo: e.motivo });
      throw e;
    }
    const conteudo = Buffer.from(svg, 'utf8');
    const sha256 = createHash('sha256').update(conteudo).digest('hex');
    const nomeGuardado = nome?.trim().slice(0, LIMITES.caracteresDoNome) || 'vetor.svg';
    const lido = this.vetorLido(importado, sha256, nomeGuardado);
    if (!lido) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.svgInvalido, { motivo: 'malformado' });

    const chave = chaveDeArquivoDaConta(escopo, sha256);
    await this.armazenamento.guardar(escopo, chave, conteudo, 'image/svg+xml');
    await this.arquivos.registrar(escopo, {
      id: this.gerarId(),
      sha256,
      tipoMime: 'image/svg+xml',
      bytes: conteudo.byteLength,
      largura: null,
      altura: null,
      especie: 'vetor',
      chaveDoObjeto: chave,
      nomeOriginal: nomeGuardado,
    });
    return lido;
  }

  /** O resultado passa pelo esquema do contrato: o que o importador produzir fora dele não sai daqui. */
  private vetorLido(importado: ReturnType<typeof importarSvg>, sha256: string, nome: string): VetorImportado | undefined {
    const lido = VetorImportado.safeParse({ no: { tipo: 'vetor', moldura: importado.moldura, caminhos: importado.caminhos, origem: { arquivo: sha256, nome } }, avisos: importado.avisos });
    // a miniatura sai dos caminhos JÁ validados, não do arquivo
    return lido.success ? { ...lido.data, miniatura: miniaturaDoVetor(lido.data.no) } : undefined;
  }

  /**
   * Um vetor que a conta já enviou, lido de novo do SVG guardado: o nó, os avisos e a miniatura. É como a
   * tela de marca e o formulário mostram o logo sem guardar o desenho no navegador, e como o worker monta
   * o material do briefing. O SVG em si continua sem sair.
   */
  async vetor(escopo: EscopoDaConta, sha256: string): Promise<VetorImportado> {
    if (!SHA256.test(sha256)) throw new NaoEncontrado();
    const registro = await this.arquivos.buscar(escopo, sha256);
    if (registro?.especie !== 'vetor') throw new NaoEncontrado();
    const bytes = await this.armazenamento.ler(escopo, registro.chaveDoObjeto);
    if (!bytes) throw new NaoEncontrado();
    try {
      const lido = this.vetorLido(importarSvg(Buffer.from(bytes).toString('utf8')), sha256, registro.nomeOriginal ?? 'vetor.svg');
      if (lido) return lido;
    } catch (e) {
      if (!(e instanceof SvgRecusado)) throw e;
    }
    // foi aceito no envio e não é mais (o importador mudou): para quem pede, não existe
    throw new NaoEncontrado();
  }

  /** O que a conta tem sobre um arquivo, sem os bytes. */
  async dados(escopo: EscopoDaConta, sha256: string): Promise<DadosDoArquivo> {
    if (!SHA256.test(sha256)) throw new NaoEncontrado();
    const r = await this.arquivos.buscar(escopo, sha256);
    if (!r) throw new NaoEncontrado();
    return {
      sha256: r.sha256,
      especie: r.especie,
      tipo: r.tipoMime,
      bytes: r.bytes,
      ...(r.largura && r.altura ? { largura: r.largura, altura: r.altura } : {}),
      ...(r.nomeOriginal ? { nome: r.nomeOriginal } : {}),
      ...(r.origem ? { origem: { banco: r.origem.banco, autor: r.origem.autor, licenca: r.origem.licenca, pagina: r.origem.url } } : {}),
    };
  }

  /**
   * Os bytes de uma imagem da conta. Toda leitura confere a conta dona: a linha em `arquivos`,
   * lida sob RLS, é a autorização. Sem linha, o armazenamento nem é chamado.
   * Vetor (SVG) não sai por aqui: SVG servido na mesma origem roda script.
   */
  async ler(escopo: EscopoDaConta, sha256: string): Promise<ConteudoDeArquivo> {
    if (!SHA256.test(sha256)) throw new NaoEncontrado();
    const registro = await this.arquivos.buscar(escopo, sha256);
    if (!registro || registro.especie === 'vetor') throw new NaoEncontrado();
    const bytes = await this.armazenamento.ler(escopo, registro.chaveDoObjeto);
    if (!bytes) throw new NaoEncontrado();
    return { bytes, tipo: registro.tipoMime, sha256 };
  }
}
