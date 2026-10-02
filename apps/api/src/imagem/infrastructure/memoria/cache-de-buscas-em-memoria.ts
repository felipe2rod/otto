// Adaptador falso de CacheDeBuscas.
import type { ImagemNoBanco } from '../../application/banco-de-imagens';
import { CacheDeBuscas } from '../../application/cache-de-buscas';

export class CacheDeBuscasEmMemoria extends CacheDeBuscas {
  private readonly linhas: { banco: string; chave: string; quando: Date; resultados: ImagemNoBanco[] }[] = [];

  private recentes(banco: string, desde: Date) {
    return this.linhas.filter((l) => l.banco === banco && l.quando >= desde).sort((a, b) => b.quando.getTime() - a.quando.getTime());
  }

  async recente(banco: string, chave: string, desde: Date): Promise<ImagemNoBanco[] | undefined> {
    const linha = this.recentes(banco, desde).find((l) => l.chave === chave);
    return linha ? structuredClone(linha.resultados) : undefined;
  }

  async guardar(banco: string, chave: string, resultados: readonly ImagemNoBanco[], agora: Date): Promise<void> {
    this.linhas.push({ banco, chave, quando: agora, resultados: structuredClone([...resultados]) });
  }

  async vista(banco: string, id: string, desde: Date): Promise<ImagemNoBanco | undefined> {
    for (const linha of this.recentes(banco, desde)) {
      const achada = linha.resultados.find((r) => r.id === id);
      if (achada) return structuredClone(achada);
    }
    return undefined;
  }
}
