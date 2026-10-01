// Contrato da porta RepositorioDeArquivos, contra o adaptador do banco e o falso (ADR 020, ADR 023).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { NovoArquivo, RepositorioDeArquivos } from './repositorio-de-arquivos';

const hash = () => randomUUID().replaceAll('-', '').repeat(2);
const novo = (sha256 = hash(), extra: Partial<NovoArquivo> = {}): NovoArquivo => ({
  id: randomUUID(),
  sha256,
  tipoMime: 'image/png',
  bytes: 123,
  largura: 10,
  altura: 20,
  especie: 'imagem',
  chaveDoObjeto: `contas/x/arquivos/${sha256}`,
  ...extra,
});

export function contratoDoRepositorioDeArquivos(nome: string, criar: () => Promise<{ repositorio: RepositorioDeArquivos; contaA: EscopoDaConta; contaB: EscopoDaConta }>): void {
  describe(`contrato de RepositorioDeArquivos: ${nome}`, () => {
    let r: RepositorioDeArquivos;
    let A: EscopoDaConta;
    let B: EscopoDaConta;
    beforeAll(async () => {
      ({ repositorio: r, contaA: A, contaB: B } = await criar());
    });

    it('registra e busca pelo hash', async () => {
      const a = novo(undefined, { nomeOriginal: 'foto do cliente.png', origem: { banco: 'Upload', autor: 'conta', licenca: 'da conta', url: '' } });
      expect(await r.registrar(A, a)).toMatchObject({ sha256: a.sha256, tipoMime: 'image/png', bytes: 123, largura: 10, altura: 20, especie: 'imagem', chaveDoObjeto: a.chaveDoObjeto });
      expect(await r.buscar(A, a.sha256)).toMatchObject({ sha256: a.sha256, chaveDoObjeto: a.chaveDoObjeto });
      expect(await r.buscar(A, hash())).toBeUndefined();
    });

    it('registrar o mesmo conteúdo de novo devolve o que já existe, sem alterar', async () => {
      const a = novo();
      await r.registrar(A, a);
      const segundo = await r.registrar(A, novo(a.sha256, { tipoMime: 'image/jpeg', bytes: 999, chaveDoObjeto: 'outra' }));
      expect(segundo).toMatchObject({ tipoMime: 'image/png', bytes: 123, chaveDoObjeto: a.chaveDoObjeto });
    });

    it('o hash não é autorização: a conta B não acha arquivo da conta A, e pode ter o mesmo conteúdo em registro próprio', async () => {
      const a = novo();
      await r.registrar(A, a);
      expect(await r.buscar(B, a.sha256)).toBeUndefined();
      expect(await r.quaisExistem(B, [a.sha256])).toEqual(new Set());
      await r.registrar(B, novo(a.sha256, { chaveDoObjeto: 'chave de B' }));
      expect((await r.buscar(B, a.sha256))?.chaveDoObjeto).toBe('chave de B');
      expect((await r.buscar(A, a.sha256))?.chaveDoObjeto).toBe(a.chaveDoObjeto);
    });

    it('quaisExistem devolve só os que a conta tem', async () => {
      const [um, dois] = [novo(), novo()];
      await r.registrar(A, um);
      await r.registrar(A, dois);
      expect(await r.quaisExistem(A, [um.sha256, hash(), dois.sha256])).toEqual(new Set([um.sha256, dois.sha256]));
      expect(await r.quaisExistem(A, [])).toEqual(new Set());
    });
  });
}
