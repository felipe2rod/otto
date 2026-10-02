import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ImagemNoBanco } from './banco-de-imagens';
import type { CacheDeBuscas } from './cache-de-buscas';

const chave = () => randomUUID().replaceAll('-', '').repeat(2);
const HORA = 3_600_000;
const T0 = new Date('2026-10-04T12:00:00.000Z');
const antes = (horas: number) => new Date(T0.getTime() - horas * HORA);

export function contratoDoCacheDeBuscas(nome: string, criar: () => Promise<CacheDeBuscas>): void {
  describe(`contrato de CacheDeBuscas: ${nome}`, () => {
    let cache: CacheDeBuscas;
    // cada execução usa um "banco" próprio: a tabela é global e só cresce
    const banco = `teste-${randomUUID().slice(0, 8)}`;
    const imagem = (id: string): ImagemNoBanco => ({
      id,
      descricao: 'café',
      largura: 1280,
      altura: 853,
      autor: 'alguém',
      pagina: `https://banco.exemplo.com/fotos/${id}/`,
      urlDoArquivo: `https://banco.exemplo.com/get/${id}_1280.jpg`,
      urlDaPrevia: `https://banco.exemplo.com/get/${id}_640.jpg`,
    });
    beforeAll(async () => {
      cache = await criar();
    });

    it('devolve o que guardou, enquanto a busca for mais nova que o prazo', async () => {
      const k = chave();
      expect(await cache.recente(banco, k, antes(24))).toBeUndefined();
      await cache.guardar(banco, k, [imagem('11'), imagem('12')], antes(2));
      expect(await cache.recente(banco, k, antes(24))).toEqual([imagem('11'), imagem('12')]);
      // passado o prazo, a busca não vale mais
      expect(await cache.recente(banco, k, antes(1))).toBeUndefined();
    });

    it('busca sem resultado também é guardada: lista vazia não é "nunca buscou"', async () => {
      const k = chave();
      await cache.guardar(banco, k, [], antes(1));
      expect(await cache.recente(banco, k, antes(24))).toEqual([]);
    });

    it('a busca mais nova vence a mais velha com a mesma chave; nada é apagado', async () => {
      const k = chave();
      await cache.guardar(banco, k, [imagem('21')], antes(30));
      await cache.guardar(banco, k, [imagem('22')], antes(3));
      expect(await cache.recente(banco, k, antes(24))).toEqual([imagem('22')]);
      expect(await cache.recente(banco, k, antes(48))).toEqual([imagem('22')]);
    });

    it('acha pelo id um resultado que apareceu em busca recente, e só nesse banco', async () => {
      await cache.guardar(banco, chave(), [imagem('31'), imagem('32')], antes(5));
      expect(await cache.vista(banco, '32', antes(24))).toEqual(imagem('32'));
      expect(await cache.vista(banco, '32', antes(4))).toBeUndefined();
      expect(await cache.vista(banco, '99', antes(24))).toBeUndefined();
      expect(await cache.vista('outro-banco', '32', antes(24))).toBeUndefined();
    });

    it('guardar uma busca apaga as que venceram há mais tempo que o prazo dado, e só elas', async () => {
      const [velha, recente, nova] = [chave(), chave(), chave()];
      await cache.guardar(banco, velha, [imagem('41')], antes(72));
      await cache.guardar(banco, recente, [imagem('42')], antes(10));
      await cache.guardar(banco, nova, [imagem('43')], T0, antes(48));
      expect(await cache.recente(banco, velha, antes(1000))).toBeUndefined();
      expect(await cache.vista(banco, '41', antes(1000))).toBeUndefined();
      expect(await cache.recente(banco, recente, antes(24))).toEqual([imagem('42')]);
      expect(await cache.recente(banco, nova, antes(24))).toEqual([imagem('43')]);
    });

    it('id malicioso não acha nada e não quebra a consulta', async () => {
      for (const id of ['"}]', "'; DROP TABLE buscas_de_imagens; --", '%', '', '3']) expect(await cache.vista(banco, id, antes(1000))).toBeUndefined();
    });
  });
}
