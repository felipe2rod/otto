// Casos de uso da biblioteca de fontes (docs/mvp/backend.md, 7.4). As fontes do Otto são iguais
// para todas as contas: não há escopo de conta aqui.
import type { FonteDaBiblioteca, ListaDeFontes } from '@otto/shared';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import { pesoMaisProximo } from '../domain/fontes';
import type { BibliotecaDeFontes, FonteRegistrada } from './biblioteca-de-fontes';

export class CasosDeUsoDeFontes {
  constructor(private readonly biblioteca: BibliotecaDeFontes) {}

  async listar(busca?: string): Promise<ListaDeFontes> {
    return { itens: await this.biblioteca.listar(busca) };
  }

  async detalhe(familia: string, peso: number): Promise<FonteDaBiblioteca> {
    const fonte = await this.maisProxima(familia, peso);
    return { familia: fonte.familia, peso: fonte.peso, nomePostScript: fonte.nomePostScript, arquivo: `/api/fontes/${encodeURIComponent(fonte.familia)}/${fonte.peso}/arquivo` };
  }

  async arquivo(familia: string, peso: number): Promise<{ bytes: Uint8Array; sha256: string; peso: number }> {
    const fonte = await this.maisProxima(familia, peso);
    const bytes = await this.biblioteca.bytes(fonte);
    if (!bytes) throw new NaoEncontrado();
    return { bytes, sha256: fonte.sha256, peso: fonte.peso };
  }

  private async maisProxima(familia: string, peso: number): Promise<FonteRegistrada> {
    if (!Number.isInteger(peso) || peso < 1 || peso > 1000) throw new NaoEncontrado();
    const pesos = await this.biblioteca.pesosDa(familia);
    const escolhido = pesoMaisProximo(
      pesos.map((f) => f.peso),
      peso,
    );
    const fonte = pesos.find((f) => f.peso === escolhido);
    if (!fonte) throw new NaoEncontrado();
    return fonte;
  }
}
