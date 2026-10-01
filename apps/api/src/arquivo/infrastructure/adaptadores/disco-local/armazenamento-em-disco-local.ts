// Adaptador de ArmazenamentoDeArquivo em disco local. É o que roda no desenvolvimento da fatia 0
// (volume "arquivos_locais" do compose, montado na API e no worker).
// NÃO serve para produção com mais de uma máquina: lá entra o adaptador compatível com S3.
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EscopoDaConta } from '../../../../plataforma/escopo/escopo-da-conta';
import { ArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo';
import { conferirChave, conferirChaveDaBiblioteca } from '../../../application/chave-de-objeto';

const naoExiste = (e: unknown): boolean => (e as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

export class ArmazenamentoEmDiscoLocal extends ArmazenamentoDeArquivo {
  private readonly pasta: string;

  constructor(pasta: string) {
    super();
    this.pasta = path.resolve(pasta);
  }

  /** conferirChave já recusou "..", barra dupla e caminho absoluto; aqui a chave só desce a partir da pasta. */
  private caminho(chave: string): string {
    return path.join(this.pasta, ...chave.split('/'));
  }

  async guardar(escopo: EscopoDaConta, chave: string, conteudo: Uint8Array, _tipoMime: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    await this.gravar(chave, conteudo);
  }

  async guardarNaBiblioteca(chave: string, conteudo: Uint8Array, _tipoMime: string): Promise<void> {
    conferirChaveDaBiblioteca(chave);
    await this.gravar(chave, conteudo);
  }

  async lerDaBiblioteca(chave: string): Promise<Uint8Array | undefined> {
    conferirChaveDaBiblioteca(chave);
    return this.lerDoDisco(chave);
  }

  private async gravar(chave: string, conteudo: Uint8Array): Promise<void> {
    const destino = this.caminho(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    // grava ao lado e renomeia: quem lê nunca vê arquivo pela metade
    const temporario = path.join(this.pasta, `.gravando-${randomUUID()}`);
    try {
      await writeFile(temporario, conteudo);
      await rename(temporario, destino);
    } finally {
      await rm(temporario, { force: true });
    }
  }

  async ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined> {
    conferirChave(escopo, chave, 'leitura');
    return this.lerDoDisco(chave);
  }

  private async lerDoDisco(chave: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.caminho(chave)));
    } catch (e) {
      if (naoExiste(e)) return undefined;
      throw e;
    }
  }

  async existe(escopo: EscopoDaConta, chave: string): Promise<boolean> {
    conferirChave(escopo, chave, 'leitura');
    try {
      await access(this.caminho(chave));
      return true;
    } catch (e) {
      if (naoExiste(e)) return false;
      throw e;
    }
  }

  async remover(escopo: EscopoDaConta, chave: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    await rm(this.caminho(chave), { force: true });
  }

  async responde(): Promise<boolean> {
    const sonda = path.join(this.pasta, `.sonda-${randomUUID()}`);
    try {
      await mkdir(this.pasta, { recursive: true });
      await writeFile(sonda, '');
      await rm(sonda, { force: true });
      return true;
    } catch {
      return false;
    }
  }
}
