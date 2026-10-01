// Adaptador falso de BibliotecaDeFontes, para testes.
import { createHash } from 'node:crypto';
import { BibliotecaDeFontes, type FonteRegistrada, type NovaFonte } from '../../application/biblioteca-de-fontes';

export class BibliotecaDeFontesEmMemoria extends BibliotecaDeFontes {
  private readonly fontes: { registro: FonteRegistrada; conteudo: Uint8Array }[] = [];

  async listar(busca?: string): Promise<{ familia: string; pesos: number[] }[]> {
    const q = busca?.trim().toLowerCase();
    const porFamilia = new Map<string, number[]>();
    for (const { registro } of this.fontes) {
      if (q && !registro.familia.toLowerCase().includes(q)) continue;
      porFamilia.set(registro.familia, [...(porFamilia.get(registro.familia) ?? []), registro.peso]);
    }
    return [...porFamilia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([familia, pesos]) => ({ familia, pesos: pesos.sort((a, b) => a - b) }));
  }

  async pesosDa(familia: string): Promise<FonteRegistrada[]> {
    return this.fontes
      .filter((f) => f.registro.familia === familia)
      .map((f) => f.registro)
      .sort((a, b) => a.peso - b.peso);
  }

  async bytes(fonte: FonteRegistrada): Promise<Uint8Array | undefined> {
    return this.fontes.find((f) => f.registro.sha256 === fonte.sha256)?.conteudo;
  }

  async registrar(nova: NovaFonte): Promise<FonteRegistrada> {
    const existente = this.fontes.find((f) => f.registro.familia === nova.familia && f.registro.peso === nova.peso);
    if (existente) return existente.registro;
    const registro: FonteRegistrada = {
      familia: nova.familia,
      peso: nova.peso,
      nomePostScript: nova.nomePostScript,
      licenca: nova.licenca,
      sha256: createHash('sha256').update(nova.conteudo).digest('hex'),
      bytes: nova.conteudo.byteLength,
    };
    this.fontes.push({ registro, conteudo: Uint8Array.from(nova.conteudo) });
    return registro;
  }
}
