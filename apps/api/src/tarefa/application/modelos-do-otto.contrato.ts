// Contrato de ModelosDoOtto: o que o caso de uso espera de qualquer adaptador, sem falar com modelo nenhum.
import { describe, expect, it } from 'vitest';
import type { ModelosDoOtto } from './modelos-do-otto';

export function contratoDeModelosDoOtto(nome: string, criar: () => ModelosDoOtto): void {
  describe(`contrato de ModelosDoOtto: ${nome}`, () => {
    const AJUSTE = { tipo: 'ajuste', pedido: 'aumenta o título' } as const;

    it('abre um modelo com nome e capacidades, pronto para responder, nas duas partes da tarefa', () => {
      for (const parte of ['preparo', 'execucao'] as const) {
        const aberto = criar().abrir({ entrada: AJUSTE, parte, idsDoPreparo: 0 });
        expect(aberto.modelo.nome.length).toBeGreaterThan(0);
        expect(aberto.modelo.capacidades).toMatchObject({ ferramentas: true, imagem: true });
        expect(typeof aberto.modelo.responder).toBe('function');
      }
    });

    it('declara preço: sem ele não há custo por tarefa nem teto em dinheiro', () => {
      const { modelo } = criar().abrir({ entrada: AJUSTE, parte: 'execucao', idsDoPreparo: 0 });
      expect(modelo.preco).toMatchObject({ entrada: expect.any(Number), saida: expect.any(Number), cacheLido: expect.any(Number), cacheCriado: expect.any(Number) });
    });

    it('os ids novos são UUID e não se repetem', () => {
      const { novoId } = criar().abrir({ entrada: AJUSTE, parte: 'execucao', idsDoPreparo: 0 });
      const ids = [novoId(), novoId(), novoId(), novoId(), novoId()];
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(new Set(ids).size).toBe(5);
    });

    it('cada abertura é uma conversa nova: uma tarefa não continua de onde a outra parou', () => {
      const modelos = criar();
      expect(modelos.abrir({ entrada: AJUSTE, parte: 'execucao', idsDoPreparo: 0 }).modelo).not.toBe(modelos.abrir({ entrada: AJUSTE, parte: 'execucao', idsDoPreparo: 0 }).modelo);
    });
  });
}
