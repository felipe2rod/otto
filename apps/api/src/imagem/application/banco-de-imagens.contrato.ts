// Contrato da porta BancoDeImagens: roda contra todos os adaptadores, inclusive o falso (ADR 020).
// O adaptador de verdade roda contra respostas gravadas: sem rede no teste.
import { describe, expect, it } from 'vitest';
import { BancoDeImagens, BancoIndisponivel } from './banco-de-imagens';

export interface BancoSobTeste {
  banco: BancoDeImagens;
  /** Uma consulta que devolve resultados neste adaptador. */
  consulta: string;
  /** Quantas vezes o adaptador foi à rede (ou ao que faz as vezes dela). */
  idas(): number;
}

export function contratoDoBancoDeImagens(nome: string, criar: () => BancoSobTeste): void {
  describe(`contrato de BancoDeImagens: ${nome}`, () => {
    it('declara as regras do banco em vez de escondê-las', () => {
      const { banco } = criar();
      expect(banco.nome.length).toBeGreaterThan(0);
      expect(banco.licenca.length).toBeGreaterThan(0);
      expect(banco.capacidades.ladoMaximo).toBeGreaterThan(0);
      expect(banco.capacidades.cacheObrigatorioEmHoras).toBeGreaterThanOrEqual(0);
      expect(banco.capacidades.requisicoesPorMinuto).toBeGreaterThan(0);
      expect(typeof banco.capacidades.linkDiretoProibido).toBe('boolean');
    });

    it('a busca devolve id, medidas dentro do que a chave entrega, autor, página e os dois endereços em https', async () => {
      const { banco, consulta } = criar();
      const itens = await banco.buscar(consulta, 'todas');
      expect(itens.length).toBeGreaterThan(0);
      for (const i of itens) {
        expect(i.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
        expect(Math.max(i.largura, i.altura)).toBeLessThanOrEqual(banco.capacidades.ladoMaximo);
        expect(Math.min(i.largura, i.altura)).toBeGreaterThan(0);
        expect(Number.isInteger(i.largura) && Number.isInteger(i.altura)).toBe(true);
        for (const endereco of [i.pagina, i.urlDoArquivo, i.urlDaPrevia]) expect(new URL(endereco).protocol).toBe('https:');
      }
      expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length);
    });

    it('baixa o endereço que veio da busca', async () => {
      const { banco, consulta } = criar();
      const [primeiro] = await banco.buscar(consulta, 'todas');
      const bytes = await banco.baixar(primeiro?.urlDoArquivo as string, 5_000_000);
      expect(bytes.byteLength).toBeGreaterThan(0);
    });

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'https://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/api/saude/vivo',
      'https://exemplo.com/foto.jpg',
      'file:///etc/passwd',
      'https://usuario@exemplo.com/foto.jpg',
      'não é endereço',
    ])('recusa baixar %s sem ir à rede: só endereço do próprio banco', async (endereco) => {
      const sob = criar();
      const antes = sob.idas();
      await expect(sob.banco.baixar(endereco, 5_000_000)).rejects.toMatchObject({ motivo: 'endereco' });
      expect(sob.idas()).toBe(antes);
    });

    it('para de baixar quando o arquivo passa do limite', async () => {
      const { banco, consulta } = criar();
      const [primeiro] = await banco.buscar(consulta, 'todas');
      await expect(banco.baixar(primeiro?.urlDoArquivo as string, 10)).rejects.toBeInstanceOf(BancoIndisponivel);
    });
  });
}
