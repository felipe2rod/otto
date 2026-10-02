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

    it('guarda de onde o arquivo veio e o nome com que foi enviado, e devolve na busca', async () => {
      const doBanco = novo(undefined, {
        nomeOriginal: 'cafe.jpg',
        origem: { banco: 'Banco de fotos', idExterno: '195893', autor: 'alguém', licenca: 'Licença do banco', url: 'https://banco.exemplo.com/fotos/195893/' },
      });
      await r.registrar(A, doBanco);
      expect(await r.buscar(A, doBanco.sha256)).toMatchObject({
        nomeOriginal: 'cafe.jpg',
        origem: { banco: 'Banco de fotos', idExterno: '195893', autor: 'alguém', licenca: 'Licença do banco', url: 'https://banco.exemplo.com/fotos/195893/' },
      });
      const enviado = novo();
      await r.registrar(A, enviado);
      const lido = await r.buscar(A, enviado.sha256);
      expect(lido?.origem).toBeUndefined();
      expect(lido?.nomeOriginal).toBeUndefined();
    });

    it('conta quantos arquivos a conta trouxe de banco desde uma hora, sem contar os enviados nem os de outra conta', async () => {
      const origem = { banco: 'Banco de fotos', idExterno: '1', autor: 'a', licenca: 'l', url: 'https://banco.exemplo.com/x/' };
      const antes = new Date(Date.now() - 60_000);
      const [deA, deB] = [await r.contarTrazidosDesde(A, antes), await r.contarTrazidosDesde(B, antes)];
      await r.registrar(A, novo(undefined, { origem }));
      await r.registrar(A, novo(undefined, { origem: { ...origem, idExterno: '2' } }));
      await r.registrar(A, novo());
      // origem sem id de banco (textura do Otto) não é imagem trazida
      await r.registrar(A, novo(undefined, { origem: { banco: 'Texturas do Otto', autor: 'Otto', licenca: 'livre', url: '' } }));
      expect(await r.contarTrazidosDesde(A, antes)).toBe(deA + 2);
      expect(await r.contarTrazidosDesde(B, antes)).toBe(deB);
      expect(await r.contarTrazidosDesde(A, new Date(Date.now() + 60_000))).toBe(0);
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
