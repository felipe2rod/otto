// Adaptador de ArmazenamentoDeArquivo para qualquer servidor compatível com S3 (ADR 020: o contrato
// é S3; o fornecedor é detalhe de endereço e credencial). No desenvolvimento é o serviço
// "armazenamento" do compose; na produção, o serviço de objetos da hospedagem.
// O SDK e os tipos dele não saem deste arquivo.
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EscopoDaConta } from '../../../../plataforma/escopo/escopo-da-conta';
import { ArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo';
import { conferirChave, conferirChaveDaBiblioteca } from '../../../application/chave-de-objeto';

export interface OpcoesDoS3 {
  endereco: string;
  regiao: string;
  bucket: string;
  chaveDeAcesso: string;
  chaveSecreta: string;
  /** Prefixo dentro do bucket, antes da chave. Serve aos testes; vazio na operação normal. */
  prefixo?: string;
}

const naoExiste = (e: unknown): boolean => {
  const erro = e as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  return erro?.name === 'NoSuchKey' || erro?.name === 'NotFound' || erro?.$metadata?.httpStatusCode === 404;
};

export class ArmazenamentoS3 extends ArmazenamentoDeArquivo {
  private readonly cliente: S3Client;
  private readonly bucket: string;
  private readonly prefixo: string;

  constructor(opcoes: OpcoesDoS3) {
    super();
    this.bucket = opcoes.bucket;
    this.prefixo = opcoes.prefixo ? `${opcoes.prefixo}/` : '';
    this.cliente = new S3Client({
      endpoint: opcoes.endereco,
      region: opcoes.regiao,
      // bucket no caminho, não no nome do host: é o que os servidores compatíveis aceitam sem DNS próprio
      forcePathStyle: true,
      credentials: { accessKeyId: opcoes.chaveDeAcesso, secretAccessKey: opcoes.chaveSecreta },
      maxAttempts: 3,
    });
  }

  private objeto(chave: string): { Bucket: string; Key: string } {
    return { Bucket: this.bucket, Key: `${this.prefixo}${chave}` };
  }

  async guardar(escopo: EscopoDaConta, chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    await this.enviar(chave, conteudo, tipoMime);
  }

  async guardarNaBiblioteca(chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void> {
    conferirChaveDaBiblioteca(chave);
    await this.enviar(chave, conteudo, tipoMime);
  }

  async lerDaBiblioteca(chave: string): Promise<Uint8Array | undefined> {
    conferirChaveDaBiblioteca(chave);
    return this.baixar(chave);
  }

  private async enviar(chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void> {
    await this.cliente.send(new PutObjectCommand({ ...this.objeto(chave), Body: conteudo, ContentType: tipoMime, ContentLength: conteudo.byteLength }));
  }

  async ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined> {
    conferirChave(escopo, chave, 'leitura');
    return this.baixar(chave);
  }

  private async baixar(chave: string): Promise<Uint8Array | undefined> {
    try {
      const resposta = await this.cliente.send(new GetObjectCommand(this.objeto(chave)));
      return resposta.Body ? await resposta.Body.transformToByteArray() : new Uint8Array();
    } catch (e) {
      if (naoExiste(e)) return undefined;
      throw e;
    }
  }

  async existe(escopo: EscopoDaConta, chave: string): Promise<boolean> {
    conferirChave(escopo, chave, 'leitura');
    try {
      await this.cliente.send(new HeadObjectCommand(this.objeto(chave)));
      return true;
    } catch (e) {
      if (naoExiste(e)) return false;
      throw e;
    }
  }

  async remover(escopo: EscopoDaConta, chave: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    await this.cliente.send(new DeleteObjectCommand(this.objeto(chave)));
  }

  async responde(): Promise<boolean> {
    try {
      await this.cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  fechar(): void {
    this.cliente.destroy();
  }
}
