// Adaptador falso de ArmazenamentoDeArquivo (ADR 020, item 3b): é o que os testes usam.
// Passa pela mesma suíte de contrato do adaptador real.

import type { EscopoDaConta } from '../../../../plataforma/escopo/escopo-da-conta';
import { ArmazenamentoDeArquivo, type ArquivoDoLink, conferirValidade, type OpcoesDoLink } from '../../../application/armazenamento-de-arquivo';
import { conferirChave, conferirChaveDaBiblioteca } from '../../../application/chave-de-objeto';
import { AssinadorDeLinks, ROTA_DOS_LINKS_LOCAIS } from '../links-locais';

export class ArmazenamentoEmMemoria extends ArmazenamentoDeArquivo {
  private readonly objetos = new Map<string, Uint8Array>();
  private readonly links = new AssinadorDeLinks('segredo-do-adaptador-falso-só-para-testes-0123456789');

  async linkAssinado(escopo: EscopoDaConta, chave: string, opcoes: OpcoesDoLink): Promise<string> {
    conferirChave(escopo, chave, 'leitura');
    conferirValidade(opcoes.validadeEmSegundos);
    return `${ROTA_DOS_LINKS_LOCAIS}/${this.links.assinar({ chave, nome: opcoes.nomeDoArquivo, tipo: opcoes.tipoMime }, opcoes.validadeEmSegundos)}`;
  }

  async abrirLinkProprio(token: string): Promise<ArquivoDoLink | undefined> {
    const dados = this.links.abrir(token);
    const bytes = dados ? this.objetos.get(dados.chave) : undefined;
    return dados && bytes ? { bytes: Uint8Array.from(bytes), nome: dados.nome, tipo: dados.tipo } : undefined;
  }

  async guardar(escopo: EscopoDaConta, chave: string, conteudo: Uint8Array, _tipoMime: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    this.objetos.set(chave, Uint8Array.from(conteudo));
  }

  async ler(escopo: EscopoDaConta, chave: string): Promise<Uint8Array | undefined> {
    conferirChave(escopo, chave, 'leitura');
    const bytes = this.objetos.get(chave);
    return bytes ? Uint8Array.from(bytes) : undefined;
  }

  async existe(escopo: EscopoDaConta, chave: string): Promise<boolean> {
    conferirChave(escopo, chave, 'leitura');
    return this.objetos.has(chave);
  }

  async remover(escopo: EscopoDaConta, chave: string): Promise<void> {
    conferirChave(escopo, chave, 'escrita');
    this.objetos.delete(chave);
  }

  async guardarNaBiblioteca(chave: string, conteudo: Uint8Array, _tipoMime: string): Promise<void> {
    conferirChaveDaBiblioteca(chave);
    this.objetos.set(chave, Uint8Array.from(conteudo));
  }

  async lerDaBiblioteca(chave: string): Promise<Uint8Array | undefined> {
    conferirChaveDaBiblioteca(chave);
    const bytes = this.objetos.get(chave);
    return bytes ? Uint8Array.from(bytes) : undefined;
  }

  async responde(): Promise<boolean> {
    return true;
  }
}
