// Casos de uso de arquivo (docs/mvp/backend.md, seções 6.4, 7.4 e 10). Classe pura.
// Envio é hostil até prova em contrário: tipo pelo conteúdo, limite de bytes e de medidas,
// e nenhuma decodificação dentro da requisição.
import { createHash } from 'node:crypto';
import { type ArquivoEnviado, CODIGOS_DE_ERRO, LIMITES, type TipoDeImagem, VetorImportado } from '@otto/shared';
import { ErroDaAplicacao, NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { inspecionarImagem } from '../domain/inspecionar-imagem';
import type { ArmazenamentoDeArquivo } from './armazenamento-de-arquivo';
import { chaveDeArquivoDaConta } from './chave-de-objeto';
import type { OrigemDoArquivo, RepositorioDeArquivos } from './repositorio-de-arquivos';
import { importarSvg, SvgRecusado } from './vetor/importar-svg';

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
    // o resultado passa pelo esquema do contrato: o que o importador produzir fora dele não sai daqui
    const lido = VetorImportado.safeParse({
      no: { tipo: 'vetor', moldura: importado.moldura, caminhos: importado.caminhos, origem: { arquivo: sha256, nome: nomeGuardado } },
      avisos: importado.avisos,
    });
    if (!lido.success) throw new ErroDaAplicacao(CODIGOS_DE_ERRO.svgInvalido, { motivo: 'malformado' });

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
    return lido.data;
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
