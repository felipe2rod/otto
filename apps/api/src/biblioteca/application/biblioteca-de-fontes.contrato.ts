// Contrato da porta BibliotecaDeFontes, contra o adaptador do banco e o falso.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BibliotecaDeFontes } from './biblioteca-de-fontes';

export function contratoDaBibliotecaDeFontes(nome: string, criar: () => Promise<BibliotecaDeFontes>): void {
  describe(`contrato de BibliotecaDeFontes: ${nome}`, () => {
    let b: BibliotecaDeFontes;
    // família única por execução: a biblioteca é global e a base de teste guarda o que outros testes puseram
    const familia = `Familia De Teste ${randomUUID().slice(0, 8)}`;
    const bytes = (n: number) => Uint8Array.from({ length: 64 }, (_, i) => (i * n) % 256);

    beforeAll(async () => {
      b = await criar();
      await b.registrar({ familia, peso: 700, nomePostScript: 'Teste-Bold', licenca: 'de teste', conteudo: bytes(7) });
      await b.registrar({ familia, peso: 400, nomePostScript: null, licenca: null, conteudo: bytes(4) });
    });

    it('registra e devolve os pesos da família, do mais leve para o mais pesado', async () => {
      const pesos = await b.pesosDa(familia);
      expect(pesos.map((f) => [f.familia, f.peso, f.nomePostScript, f.licenca, f.bytes])).toEqual([
        [familia, 400, null, null, 64],
        [familia, 700, 'Teste-Bold', 'de teste', 64],
      ]);
      expect(pesos[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('devolve os bytes de cada fonte', async () => {
      const [leve, pesada] = await b.pesosDa(familia);
      expect(Array.from((await b.bytes(leve as never)) as Uint8Array)).toEqual(Array.from(bytes(4)));
      expect(Array.from((await b.bytes(pesada as never)) as Uint8Array)).toEqual(Array.from(bytes(7)));
    });

    it('registrar de novo a mesma família e peso devolve a que já existe, sem trocar o arquivo', async () => {
      const deNovo = await b.registrar({ familia, peso: 700, nomePostScript: 'Outro', licenca: null, conteudo: bytes(9) });
      expect(deNovo.nomePostScript).toBe('Teste-Bold');
      expect(Array.from((await b.bytes(deNovo)) as Uint8Array)).toEqual(Array.from(bytes(7)));
    });

    it('família desconhecida não tem peso nenhum', async () => {
      expect(await b.pesosDa('Familia Que Não Existe')).toEqual([]);
    });

    it('lista por família, com os pesos, e busca sem diferenciar maiúscula', async () => {
      const achadas = await b.listar(familia.toUpperCase().slice(0, 20));
      expect(achadas.find((f) => f.familia === familia)).toEqual({ familia, pesos: [400, 700] });
      expect((await b.listar()).some((f) => f.familia === familia)).toBe(true);
      expect(await b.listar('zzz-nenhuma-família-tem-isto')).toEqual([]);
    });
  });
}
