// Contrato da porta RepositorioDeCadastros, contra o adaptador do banco e o falso (ADR 020, ADR 023).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { DadosDeBriefing, DadosDeMarca, MarcaGuardada, RepositorioDeCadastros } from './repositorio-de-cadastros';

const SHA = 'c'.repeat(64);
const AGORA = new Date('2026-10-04T12:00:00.000Z');
const DEPOIS = new Date('2026-10-04T13:00:00.000Z');
const marca = (extra: Partial<DadosDeMarca> = {}): DadosDeMarca => ({ nome: 'Café Aurora', cores: {}, icones: [], restricoes: [], ...extra });
const briefing = (extra: Partial<DadosDeBriefing> = {}): DadosDeBriefing => ({ nome: 'Promoção da semana', dados: { versao: 1, textos: { rodape: '@cafeaurora' } }, ...extra });

export function contratoDoRepositorioDeCadastros(nome: string, criar: () => Promise<{ repositorio: RepositorioDeCadastros; contaA: EscopoDaConta; contaB: EscopoDaConta }>): void {
  describe(`contrato de RepositorioDeCadastros: ${nome}`, () => {
    let r: RepositorioDeCadastros;
    let A: EscopoDaConta;
    let B: EscopoDaConta;
    beforeAll(async () => {
      ({ repositorio: r, contaA: A, contaB: B } = await criar());
    });
    const novaMarca = async (escopo: EscopoDaConta, dados = marca()) => (await r.criarMarca(escopo, { id: randomUUID(), dados, agora: AGORA }, 100)) as MarcaGuardada;

    describe('marcas', () => {
      it('cria e devolve tudo o que guardou; marca só com nome é válida', async () => {
        const completa = marca({
          site: 'cafeaurora.com.br',
          cores: { primaria: '#0f3b2c', destaque: '#f4c430' },
          fonteDeTitulo: 'DM Serif Display',
          fonteDeTexto: 'IBM Plex Sans',
          logo: SHA,
          icones: [SHA],
          rodape: '@cafeaurora',
          restricoes: ['nunca foto de pessoa'],
        });
        const criada = await novaMarca(A, completa);
        expect(criada).toMatchObject({ ...completa, criadaEm: AGORA, alteradaEm: AGORA });
        expect(await r.buscarMarca(A, criada.id)).toEqual(criada);
        const soNome = await novaMarca(A, marca({ nome: 'Sem identidade' }));
        expect(await r.buscarMarca(A, soNome.id)).toEqual({ id: soNome.id, nome: 'Sem identidade', cores: {}, icones: [], restricoes: [], criadaEm: AGORA, alteradaEm: AGORA });
      });

      it('lista por nome', async () => {
        const { contaA: nova } = await criar();
        for (const n of ['Zebra', 'abacate', 'Mercado']) await r.criarMarca(nova, { id: randomUUID(), dados: marca({ nome: n }), agora: AGORA }, 100);
        expect((await r.listarMarcas(nova)).map((m) => m.nome).filter((n) => ['Zebra', 'abacate', 'Mercado'].includes(n))).toEqual(['abacate', 'Mercado', 'Zebra']);
      });

      it('substituir troca tudo: o que não vem deixa de existir', async () => {
        const criada = await novaMarca(A, marca({ site: 'x.com', logo: SHA, restricoes: ['a'] }));
        const trocada = await r.substituirMarca(A, criada.id, marca({ nome: 'Outro nome' }), DEPOIS);
        expect(trocada).toEqual({ id: criada.id, nome: 'Outro nome', cores: {}, icones: [], restricoes: [], criadaEm: AGORA, alteradaEm: DEPOIS });
        expect(await r.substituirMarca(A, randomUUID(), marca(), DEPOIS)).toBeUndefined();
      });

      it('o limite de marcas da conta é conferido na criação', async () => {
        const quantas = (await r.listarMarcas(B)).length;
        await novaMarca(B);
        expect(await r.criarMarca(B, { id: randomUUID(), dados: marca(), agora: AGORA }, quantas + 1)).toBe('limite');
        expect(await r.listarMarcas(B)).toHaveLength(quantas + 1);
      });

      it('a marca da conta A não existe para a conta B: nem busca, nem lista, nem troca, nem apaga', async () => {
        const deA = await novaMarca(A, marca({ nome: 'Segredo de A' }));
        expect(await r.buscarMarca(B, deA.id)).toBeUndefined();
        expect((await r.listarMarcas(B)).map((m) => m.id)).not.toContain(deA.id);
        expect(await r.substituirMarca(B, deA.id, marca({ nome: 'tomada por B' }), DEPOIS)).toBeUndefined();
        expect(await r.apagarMarca(B, deA.id)).toBe(false);
        expect((await r.buscarMarca(A, deA.id))?.nome).toBe('Segredo de A');
      });

      it('id que não é UUID não existe', async () => {
        expect(await r.buscarMarca(A, 'torto')).toBeUndefined();
        expect(await r.apagarMarca(A, "'; DROP TABLE marcas; --")).toBe(false);
        expect(await r.buscarBriefing(A, 'torto')).toBeUndefined();
      });
    });

    describe('briefings salvos', () => {
      it('cria, busca com os dados e lista sem eles, do alterado mais recentemente para o mais antigo', async () => {
        const { contaA: nova } = await criar();
        const m = (await r.criarMarca(nova, { id: randomUUID(), dados: marca(), agora: AGORA }, 100)) as MarcaGuardada;
        const antigo = await r.criarBriefing(nova, { id: randomUUID(), dados: briefing({ nome: 'Antigo' }), agora: AGORA }, 100);
        const recente = await r.criarBriefing(
          nova,
          { id: randomUUID(), dados: briefing({ nome: 'Recente', cuidado: 'autoral', dados: { versao: 1, marcaId: m.id, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }] } }), agora: DEPOIS },
          100,
        );
        if (typeof antigo === 'string' || typeof recente === 'string') throw new Error('não criou');
        expect(recente).toMatchObject({
          nome: 'Recente',
          cuidado: 'autoral',
          usos: 0,
          dados: { versao: 1, marcaId: m.id, formatos: [{ nome: 'Feed', largura: 1080, altura: 1350 }] },
          criadoEm: DEPOIS,
          alteradoEm: DEPOIS,
        });
        expect(await r.buscarBriefing(nova, recente.id)).toEqual(recente);
        const lista = (await r.listarBriefings(nova)).filter((b) => [antigo.id, recente.id].includes(b.id));
        expect(lista).toEqual([
          { id: recente.id, nome: 'Recente', marcaId: m.id, usos: 0, alteradoEm: DEPOIS },
          { id: antigo.id, nome: 'Antigo', usos: 0, alteradoEm: AGORA },
        ]);
      });

      it('briefing que cita marca que a conta não tem é recusado, inclusive a marca de outra conta', async () => {
        const deB = await novaMarca(B);
        expect(await r.criarBriefing(A, { id: randomUUID(), dados: briefing({ dados: { versao: 1, marcaId: randomUUID() } }), agora: AGORA }, 100)).toBe('marca');
        expect(await r.criarBriefing(A, { id: randomUUID(), dados: briefing({ dados: { versao: 1, marcaId: deB.id } }), agora: AGORA }, 100)).toBe('marca');
        const criado = await r.criarBriefing(A, { id: randomUUID(), dados: briefing(), agora: AGORA }, 100);
        if (typeof criado === 'string') throw new Error('não criou');
        expect(await r.substituirBriefing(A, criado.id, briefing({ dados: { versao: 1, marcaId: deB.id } }), DEPOIS)).toBe('marca');
      });

      it('apagar a marca não apaga o briefing: só desfaz o vínculo', async () => {
        const m = await novaMarca(A);
        const criado = await r.criarBriefing(A, { id: randomUUID(), dados: briefing({ dados: { versao: 1, marcaId: m.id, textos: { rodape: 'fica' } } }), agora: AGORA }, 100);
        if (typeof criado === 'string') throw new Error('não criou');
        expect(await r.apagarMarca(A, m.id)).toBe(true);
        expect(await r.buscarMarca(A, m.id)).toBeUndefined();
        expect((await r.buscarBriefing(A, criado.id))?.dados).toEqual({ versao: 1, textos: { rodape: 'fica' } });
        expect((await r.listarBriefings(A)).find((b) => b.id === criado.id)).not.toHaveProperty('marcaId');
      });

      it('substituir troca nome, dados e cuidado, e mantém os usos; contar uso soma sem mexer na data', async () => {
        const criado = await r.criarBriefing(A, { id: randomUUID(), dados: briefing({ cuidado: 'direto' }), agora: AGORA }, 100);
        if (typeof criado === 'string') throw new Error('não criou');
        expect(await r.contarUso(A, criado.id)).toBe(true);
        expect(await r.contarUso(A, criado.id)).toBe(true);
        expect(await r.buscarBriefing(A, criado.id)).toMatchObject({ usos: 2, alteradoEm: AGORA });
        const trocado = await r.substituirBriefing(A, criado.id, { nome: 'Novo nome', dados: { versao: 1 } }, DEPOIS);
        expect(trocado).toEqual({ id: criado.id, nome: 'Novo nome', dados: { versao: 1 }, usos: 2, criadoEm: AGORA, alteradoEm: DEPOIS });
        expect(await r.contarUso(A, randomUUID())).toBe(false);
      });

      it('o limite de briefings da conta é conferido na criação', async () => {
        const quantos = (await r.listarBriefings(B)).length;
        expect(await r.criarBriefing(B, { id: randomUUID(), dados: briefing(), agora: AGORA }, quantos + 1)).not.toBe('limite');
        expect(await r.criarBriefing(B, { id: randomUUID(), dados: briefing(), agora: AGORA }, quantos + 1)).toBe('limite');
      });

      it('o briefing da conta A não existe para a conta B', async () => {
        const deA = await r.criarBriefing(A, { id: randomUUID(), dados: briefing({ nome: 'Segredo de A' }), agora: AGORA }, 100);
        if (typeof deA === 'string') throw new Error('não criou');
        expect(await r.buscarBriefing(B, deA.id)).toBeUndefined();
        expect((await r.listarBriefings(B)).map((b) => b.id)).not.toContain(deA.id);
        expect(await r.substituirBriefing(B, deA.id, briefing({ nome: 'tomado' }), DEPOIS)).toBeUndefined();
        expect(await r.contarUso(B, deA.id)).toBe(false);
        expect(await r.apagarBriefing(B, deA.id)).toBe(false);
        expect(await r.buscarBriefing(A, deA.id)).toMatchObject({ nome: 'Segredo de A', usos: 0 });
        expect(await r.apagarBriefing(A, deA.id)).toBe(true);
        expect(await r.buscarBriefing(A, deA.id)).toBeUndefined();
      });
    });
  });
}
