// Adaptador falso de CatalogoDeFontes: famílias fixas, e um arquivo de fonte de verdade para qualquer peso.
import { CatalogoDeFontes, CatalogoIndisponivel, type FamiliaDoCatalogo } from '../../../application/catalogo-de-fontes';

export class CatalogoDeMentira extends CatalogoDeFontes {
  listagens = 0;
  baixados: string[] = [];
  /** Para simular o catálogo fora do ar. */
  foraDoAr = false;

  constructor(
    private readonly arquivo: Uint8Array,
    private readonly lista: readonly FamiliaDoCatalogo[] = [
      { familia: 'Poppins', categoria: 'sem serifa', pesos: [100, 200, 300, 400, 500, 600, 700, 800, 900], popularidade: 8 },
      { familia: 'Playfair Display', categoria: 'serifada', pesos: [400, 500, 600, 700, 800, 900], popularidade: 25 },
      { familia: 'Lilita One', categoria: 'display', pesos: [400], popularidade: 149 },
      { familia: 'Peso Pesado', categoria: 'display', pesos: [900], popularidade: 800 },
    ],
  ) {
    super();
  }

  async familias(): Promise<FamiliaDoCatalogo[]> {
    if (this.foraDoAr) throw new CatalogoIndisponivel('rede');
    this.listagens++;
    return structuredClone([...this.lista]);
  }

  async baixar(familia: string, peso: number): Promise<Uint8Array | undefined> {
    if (this.foraDoAr) throw new CatalogoIndisponivel('rede');
    if (!this.lista.find((f) => f.familia === familia)?.pesos.includes(peso)) return undefined;
    this.baixados.push(`${familia}|${peso}`);
    return this.arquivo;
  }
}
