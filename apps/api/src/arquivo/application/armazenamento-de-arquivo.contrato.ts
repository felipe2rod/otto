// Contrato da porta ArmazenamentoDeArquivo (ADR 020, exigência 4.2). Uma suíte, N adaptadores:
// todo adaptador, inclusive o falso, passa por aqui. É a única prova de que a porta é uma porta.
import { lerContaId } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EscopoDaConta, EscopoDivergente } from '../../plataforma/escopo/escopo-da-conta';
import type { ArmazenamentoDeArquivo } from './armazenamento-de-arquivo';
import { ChaveDeObjetoInvalida, chaveDeArquivoDaConta } from './chave-de-objeto';

export interface AdaptadorSobTeste {
  armazenamento: ArmazenamentoDeArquivo;
  /** Segue um link assinado como um navegador seguiria. Cada adaptador tem o seu jeito de servir. */
  baixar(link: string): Promise<{ status: number; bytes?: Uint8Array; disposicao?: string | null; tipo?: string | null }>;
  limpar(): Promise<void>;
}

export function contratoDoArmazenamentoDeArquivo(nome: string, criar: () => Promise<AdaptadorSobTeste>): void {
  describe(`contrato de ArmazenamentoDeArquivo: ${nome}`, () => {
    const contaA = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a'));
    const contaB = EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b'));
    const sha = (letra: string) => letra.repeat(64);
    let sob: AdaptadorSobTeste;

    beforeAll(async () => {
      sob = await criar();
    });
    afterAll(async () => {
      await sob?.limpar();
    });

    it('responde quando está no ar', async () => {
      expect(await sob.armazenamento.responde()).toBe(true);
    });

    it('guarda e devolve os mesmos bytes, inclusive binário', async () => {
      const chave = chaveDeArquivoDaConta(contaA, sha('1'));
      const bytes = Uint8Array.from({ length: 512 }, (_, i) => i % 256);
      await sob.armazenamento.guardar(contaA, chave, bytes, 'image/png');
      const lido = await sob.armazenamento.ler(contaA, chave);
      expect(lido).toBeDefined();
      expect(Array.from(lido as Uint8Array)).toEqual(Array.from(bytes));
      expect(await sob.armazenamento.existe(contaA, chave)).toBe(true);
    });

    it('objeto que não existe: ler devolve undefined e existe devolve false', async () => {
      const chave = chaveDeArquivoDaConta(contaA, sha('2'));
      expect(await sob.armazenamento.ler(contaA, chave)).toBeUndefined();
      expect(await sob.armazenamento.existe(contaA, chave)).toBe(false);
    });

    it('guardar duas vezes na mesma chave não falha (o conteúdo é o próprio endereço)', async () => {
      const chave = chaveDeArquivoDaConta(contaA, sha('3'));
      const bytes = new TextEncoder().encode('mesmo conteúdo');
      await sob.armazenamento.guardar(contaA, chave, bytes, 'text/plain');
      await sob.armazenamento.guardar(contaA, chave, bytes, 'text/plain');
      expect(new TextDecoder().decode(await sob.armazenamento.ler(contaA, chave))).toBe('mesmo conteúdo');
    });

    it('remover apaga; remover o que não existe não falha', async () => {
      const chave = chaveDeArquivoDaConta(contaA, sha('4'));
      await sob.armazenamento.guardar(contaA, chave, new Uint8Array([1, 2, 3]), 'application/octet-stream');
      await sob.armazenamento.remover(contaA, chave);
      expect(await sob.armazenamento.ler(contaA, chave)).toBeUndefined();
      await expect(sob.armazenamento.remover(contaA, chave)).resolves.toBeUndefined();
    });

    it('escopo trocado: a conta B não lê, não confere, não grava nem apaga chave da conta A', async () => {
      const chaveDeA = chaveDeArquivoDaConta(contaA, sha('5'));
      await sob.armazenamento.guardar(contaA, chaveDeA, new Uint8Array([9]), 'image/png');
      await expect(sob.armazenamento.ler(contaB, chaveDeA)).rejects.toBeInstanceOf(EscopoDivergente);
      await expect(sob.armazenamento.existe(contaB, chaveDeA)).rejects.toBeInstanceOf(EscopoDivergente);
      await expect(sob.armazenamento.guardar(contaB, chaveDeA, new Uint8Array([0]), 'image/png')).rejects.toBeInstanceOf(EscopoDivergente);
      await expect(sob.armazenamento.remover(contaB, chaveDeA)).rejects.toBeInstanceOf(EscopoDivergente);
      // e o objeto de A continua intacto
      expect(Array.from((await sob.armazenamento.ler(contaA, chaveDeA)) as Uint8Array)).toEqual([9]);
    });

    it('a mesma chave relativa em contas diferentes são objetos diferentes (sem deduplicação entre contas)', async () => {
      await sob.armazenamento.guardar(contaA, chaveDeArquivoDaConta(contaA, sha('6')), new Uint8Array([1]), 'image/png');
      expect(await sob.armazenamento.existe(contaB, chaveDeArquivoDaConta(contaB, sha('6')))).toBe(false);
    });

    it('recusa chave que tenta sair da pasta da conta', async () => {
      const base = `contas/${contaA.contaId}`;
      for (const chave of [`${base}/../${contaB.contaId}/arquivos/${sha('7')}`, `${base}/arquivos/../../x`, `/etc/passwd`, `${base}//x`, `${base}\\x`, `${base}/arquivos/`, '']) {
        await expect(sob.armazenamento.ler(contaA, chave), chave).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
        await expect(sob.armazenamento.guardar(contaA, chave, new Uint8Array([1]), 'image/png'), chave).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
      }
    });

    it('o que o Otto guarda na biblioteca é lido por qualquer conta, sem escopo de conta para gravar', async () => {
      const chave = `biblioteca/fontes/${sha('8')}.ttf`;
      await sob.armazenamento.guardarNaBiblioteca(chave, new Uint8Array([7, 7, 7]), 'font/ttf');
      expect(Array.from((await sob.armazenamento.lerDaBiblioteca(chave)) as Uint8Array)).toEqual([7, 7, 7]);
      expect(Array.from((await sob.armazenamento.ler(contaA, chave)) as Uint8Array)).toEqual([7, 7, 7]);
      expect(Array.from((await sob.armazenamento.ler(contaB, chave)) as Uint8Array)).toEqual([7, 7, 7]);
      expect(await sob.armazenamento.lerDaBiblioteca(`biblioteca/fontes/${sha('9')}.ttf`)).toBeUndefined();
    });

    it('a porta da biblioteca não alcança arquivo de conta', async () => {
      const chaveDeA = chaveDeArquivoDaConta(contaA, sha('a'));
      await sob.armazenamento.guardar(contaA, chaveDeA, new Uint8Array([1]), 'image/png');
      await expect(sob.armazenamento.lerDaBiblioteca(chaveDeA)).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
      await expect(sob.armazenamento.guardarNaBiblioteca(chaveDeA, new Uint8Array([2]), 'image/png')).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
      await expect(sob.armazenamento.guardarNaBiblioteca('biblioteca/../contas/x', new Uint8Array([2]), 'image/png')).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
      expect(Array.from((await sob.armazenamento.ler(contaA, chaveDeA)) as Uint8Array)).toEqual([1]);
    });

    describe('link assinado de vida curta', () => {
      const chaveDaExportacao = (escopo: EscopoDaConta, n: string) => `contas/${escopo.contaId}/exportacoes/01990000-0000-7000-8000-0000000000e${n}/0.psd`;
      const opcoes = { validadeEmSegundos: 60, nomeDoArquivo: 'Promoção "de verão" - Feed.psd', tipoMime: 'image/vnd.adobe.photoshop' };

      it('entrega os bytes, como anexo, com o nome pedido e o tipo', async () => {
        const chave = chaveDaExportacao(contaA, '1');
        await sob.armazenamento.guardar(contaA, chave, new Uint8Array([8, 66, 80, 83]), opcoes.tipoMime);
        const link = await sob.armazenamento.linkAssinado(contaA, chave, opcoes);
        const r = await sob.baixar(link);
        expect(r.status).toBe(200);
        expect(Array.from(r.bytes as Uint8Array)).toEqual([8, 66, 80, 83]);
        expect(r.disposicao).toContain('attachment');
        expect(decodeURIComponent(r.disposicao ?? '')).toContain('Promoção "de verão" - Feed.psd');
        expect(r.tipo).toContain('image/vnd.adobe.photoshop');
      });

      it('o link não carrega credencial fixa nem dá acesso a outro objeto: trocar um caractere invalida', async () => {
        const chave = chaveDaExportacao(contaA, '2');
        await sob.armazenamento.guardar(contaA, chave, new Uint8Array([1]), opcoes.tipoMime);
        const link = await sob.armazenamento.linkAssinado(contaA, chave, opcoes);
        const meio = Math.floor(link.length - 6);
        const adulterado = `${link.slice(0, meio)}${link[meio] === 'a' ? 'b' : 'a'}${link.slice(meio + 1)}`;
        expect((await sob.baixar(adulterado)).status).toBeGreaterThanOrEqual(400);
      });

      it('vence: depois da validade o link não entrega mais', async () => {
        const chave = chaveDaExportacao(contaA, '3');
        await sob.armazenamento.guardar(contaA, chave, new Uint8Array([1]), opcoes.tipoMime);
        const link = await sob.armazenamento.linkAssinado(contaA, chave, { ...opcoes, validadeEmSegundos: 1 });
        expect((await sob.baixar(link)).status).toBe(200);
        await new Promise((ok) => setTimeout(ok, 2500));
        expect((await sob.baixar(link)).status).toBeGreaterThanOrEqual(400);
      });

      it('escopo trocado: a conta B não consegue link para chave da conta A', async () => {
        const chave = chaveDaExportacao(contaA, '4');
        await sob.armazenamento.guardar(contaA, chave, new Uint8Array([1]), opcoes.tipoMime);
        await expect(sob.armazenamento.linkAssinado(contaB, chave, opcoes)).rejects.toBeInstanceOf(EscopoDivergente);
      });

      it('recusa chave malformada e validade fora do razoável', async () => {
        await expect(sob.armazenamento.linkAssinado(contaA, `contas/${contaA.contaId}/../x/y/z`, opcoes)).rejects.toBeInstanceOf(ChaveDeObjetoInvalida);
        const chave = chaveDaExportacao(contaA, '5');
        await expect(sob.armazenamento.linkAssinado(contaA, chave, { ...opcoes, validadeEmSegundos: 0 })).rejects.toThrow();
        await expect(sob.armazenamento.linkAssinado(contaA, chave, { ...opcoes, validadeEmSegundos: 7200 })).rejects.toThrow();
      });
    });

    it('a biblioteca do Otto é lida por qualquer conta, e nenhuma conta grava nela', async () => {
      expect(await sob.armazenamento.ler(contaA, 'biblioteca/fontes/inexistente.ttf')).toBeUndefined();
      expect(await sob.armazenamento.existe(contaB, 'biblioteca/fontes/inexistente.ttf')).toBe(false);
      await expect(sob.armazenamento.guardar(contaA, 'biblioteca/fontes/x.ttf', new Uint8Array([1]), 'font/ttf')).rejects.toBeInstanceOf(EscopoDivergente);
      await expect(sob.armazenamento.remover(contaA, 'biblioteca/fontes/x.ttf')).rejects.toBeInstanceOf(EscopoDivergente);
    });
  });
}
