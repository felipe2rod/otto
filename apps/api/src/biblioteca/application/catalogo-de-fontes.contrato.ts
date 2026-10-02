// Contrato da porta CatalogoDeFontes: roda contra o adaptador de verdade (com respostas gravadas) e o falso.
import { CATEGORIAS_DE_FONTE } from '@otto/shared';
import { describe, expect, it } from 'vitest';
import { pareceFonte } from '../domain/fontes';
import type { CatalogoDeFontes } from './catalogo-de-fontes';

export interface CatalogoSobTeste {
  catalogo: CatalogoDeFontes;
  /** Uma família e um peso que este catálogo tem. */
  existe: { familia: string; peso: number };
  idas(): number;
}

export function contratoDoCatalogoDeFontes(nome: string, criar: () => CatalogoSobTeste): void {
  describe(`contrato de CatalogoDeFontes: ${nome}`, () => {
    it('lista famílias com categoria conhecida e pesos em ordem, da mais usada para a menos', async () => {
      const { catalogo } = criar();
      const familias = await catalogo.familias();
      expect(familias.length).toBeGreaterThan(0);
      for (const f of familias) {
        expect(f.familia.length).toBeGreaterThan(0);
        expect(CATEGORIAS_DE_FONTE).toContain(f.categoria);
        expect(f.pesos.length).toBeGreaterThan(0);
        expect(f.pesos).toEqual([...f.pesos].sort((a, b) => a - b));
        for (const p of f.pesos) expect(p >= 1 && p <= 1000 && Number.isInteger(p)).toBe(true);
      }
      expect(familias.map((f) => f.popularidade)).toEqual([...familias.map((f) => f.popularidade)].sort((a, b) => a - b));
      expect(new Set(familias.map((f) => f.familia)).size).toBe(familias.length);
    });

    it('pedir o catálogo de novo não vai à rede de novo', async () => {
      const sob = criar();
      await sob.catalogo.familias();
      const idas = sob.idas();
      await sob.catalogo.familias();
      expect(sob.idas()).toBe(idas);
    });

    it('baixa o arquivo de um peso que existe, e é um arquivo de fonte', async () => {
      const { catalogo, existe } = criar();
      const bytes = await catalogo.baixar(existe.familia, existe.peso);
      expect(bytes && pareceFonte(bytes)).toBe(true);
    });

    it('família ou peso que o catálogo não tem é undefined, não erro', async () => {
      const { catalogo, existe } = criar();
      expect(await catalogo.baixar('Família Que Não Existe', 400)).toBeUndefined();
      expect(await catalogo.baixar(existe.familia, 950)).toBeUndefined();
    });
  });
}
