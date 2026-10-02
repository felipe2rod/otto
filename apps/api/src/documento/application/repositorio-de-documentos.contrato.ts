// Contrato da porta RepositorioDeDocumentos (ADR 020, exigência 4.2): a mesma suíte roda contra o
// adaptador do banco e contra o falso. Inclui o caso de escopo trocado (ADR 023).
import { randomUUID } from 'node:crypto';
import { type Documento, documentoVazio } from '@otto/documento';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { NovoLote, RepositorioDeDocumentos } from './repositorio-de-documentos';

export interface RepositorioSobTeste {
  repositorio: RepositorioDeDocumentos;
  contaA: EscopoDaConta;
  contaB: EscopoDaConta;
  /** Cria uma marca na conta e devolve o id. Só o adaptador do banco precisa (a chave estrangeira confere). */
  criarMarca?(escopo: EscopoDaConta): Promise<string>;
  /** Cria uma importação de PSD na conta e devolve o id. Só o adaptador do banco precisa (a chave estrangeira confere). */
  criarImportacao?(escopo: EscopoDaConta): Promise<string>;
}

const arvoreCom = (nome: string): Documento => ({ ...documentoVazio(), pranchetas: [{ id: randomUUID(), nome, tipo: 'prancheta', largura: 100, altura: 100, fundo: '#ffffff', filhos: [] }] });

const lote = (versao: number, extra: Partial<NovoLote> = {}): NovoLote => ({
  id: randomUUID(),
  chaveDoCliente: randomUUID(),
  versao,
  autoria: 'designer',
  tipo: 'edicao',
  descricao: `lote ${versao}`,
  operacoes: [{ op: 'criarPrancheta' }, { op: 'criarNo' }],
  tocados: ['a', 'b'],
  arvore: arvoreCom(`v${versao}`),
  ...extra,
});

export function contratoDoRepositorioDeDocumentos(nome: string, criar: () => Promise<RepositorioSobTeste>): void {
  describe(`contrato de RepositorioDeDocumentos: ${nome}`, () => {
    let r: RepositorioDeDocumentos;
    let A: EscopoDaConta;
    let B: EscopoDaConta;

    let criarMarca: (escopo: EscopoDaConta) => Promise<string>;
    let criarImportacao: (escopo: EscopoDaConta) => Promise<string>;

    beforeAll(async () => {
      const sob = await criar();
      ({ repositorio: r, contaA: A, contaB: B } = sob);
      criarMarca = sob.criarMarca ?? (async () => randomUUID());
      criarImportacao = sob.criarImportacao ?? (async () => randomUUID());
    });

    const novo = (escopo: EscopoDaConta, nomeDoDoc = 'doc', arvore = documentoVazio()) => r.criar(escopo, { id: randomUUID(), nome: nomeDoDoc, arvore });

    it('criar e abrir: o documento nasce na versão 0 com a árvore dada', async () => {
      const arvore = arvoreCom('Feed');
      const d = await novo(A, 'Promoção', arvore);
      expect(d).toMatchObject({ nome: 'Promoção', versao: 0, pranchetas: 1, arvore });
      expect(await r.abrir(A, d.id)).toMatchObject({ id: d.id, nome: 'Promoção', versao: 0, pranchetas: 1, arvore });
    });

    it('abrir o que não existe devolve undefined, inclusive com id que não é UUID', async () => {
      expect(await r.abrir(A, randomUUID())).toBeUndefined();
      expect(await r.abrir(A, 'não-é-uuid')).toBeUndefined();
    });

    it('escopo trocado: a conta B não abre, não renomeia, não arquiva, não lê histórico nem trava documento de A', async () => {
      const d = await novo(A, 'de A');
      expect(await r.abrir(B, d.id)).toBeUndefined();
      expect(await r.renomear(B, d.id, 'tomado')).toBeUndefined();
      expect(await r.arquivar(B, d.id)).toBe(false);
      expect(await r.historico(B, d.id, { limite: 10 })).toBeUndefined();
      let rodou = false;
      expect(
        await r.comTrava(B, d.id, async () => {
          rodou = true;
        }),
      ).toBeUndefined();
      expect(rodou).toBe(false);
      expect(await r.abrir(A, d.id)).toMatchObject({ nome: 'de A' });
    });

    it('listar: só os da conta, não arquivados, do mais recente para o mais antigo, com paginação', async () => {
      const antes = new Set((await r.listar(A, { limite: 100 })).itens.map((i) => i.id));
      const um = await novo(A, 'um');
      const dois = await novo(A, 'dois');
      const tres = await novo(A, 'três');
      const arquivado = await novo(A, 'arquivado');
      await novo(B, 'de B');
      await r.arquivar(A, arquivado.id);
      await r.renomear(A, um.id, 'um, mexido');
      const novos = async (pagina: { cursor?: string; limite: number }) => {
        const p = await r.listar(A, pagina);
        return { ...p, itens: p.itens.filter((i) => !antes.has(i.id)) };
      };
      expect((await novos({ limite: 100 })).itens.map((i) => i.nome)).toEqual(['um, mexido', 'três', 'dois']);
      const p1 = await r.listar(A, { limite: 2 });
      expect(p1.itens.map((i) => i.id)).toEqual([um.id, tres.id]);
      expect(p1.proximoCursor).not.toBeNull();
      const p2 = await r.listar(A, { limite: 2, cursor: p1.proximoCursor as string });
      expect(p2.itens[0]?.id).toBe(dois.id);
    });

    it('peça de exemplo: a conta sabe se já teve uma, mesmo depois de arquivada; a de outra conta não conta', async () => {
      const { contaA: nova, contaB: outra } = await criar();
      expect(await r.temExemplo(nova)).toBe(false);
      await r.criar(nova, { id: randomUUID(), nome: 'comum', arvore: documentoVazio() });
      expect(await r.temExemplo(nova)).toBe(false);
      const exemplo = await r.criar(nova, { id: randomUUID(), nome: 'exemplo', arvore: documentoVazio(), deExemplo: true });
      expect(await r.temExemplo(nova)).toBe(true);
      expect(await r.temExemplo(outra)).toBe(false);
      await r.arquivar(nova, exemplo.id);
      expect(await r.temExemplo(nova)).toBe(true);
    });

    it('a peça que nasce de uma importação: guarda de onde veio, é achada pela importação, e a importação não cria uma segunda', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const importacaoId = await criarImportacao(conta);
      expect(await r.daImportacao(conta, importacaoId)).toBeUndefined();
      const criada = await r.criar(conta, { id: randomUUID(), nome: 'importada', arvore: arvoreCom('Feed'), importacaoId });
      expect(criada).toMatchObject({ versao: 0, pranchetas: 1, importacaoId });
      expect(await r.daImportacao(conta, importacaoId)).toMatchObject({ id: criada.id, importacaoId });
      expect((await r.abrir(conta, criada.id))?.importacaoId).toBe(importacaoId);
      expect((await r.listar(conta, { limite: 10 })).itens.find((d) => d.id === criada.id)?.importacaoId).toBe(importacaoId);
      // nasce sem lote: a versão 0 é a árvore que a importação montou
      expect((await r.historico(conta, criada.id, { limite: 10 }))?.itens).toEqual([]);
      // a segunda peça da mesma importação não entra
      await expect(r.criar(conta, { id: randomUUID(), nome: 'de novo', arvore: documentoVazio(), importacaoId })).rejects.toThrow();
      // de outra conta, não se acha; e a arquivada continua sendo a peça da importação
      expect(await r.daImportacao(outra, importacaoId)).toBeUndefined();
      await r.arquivar(conta, criada.id);
      expect(await r.daImportacao(conta, importacaoId)).toMatchObject({ id: criada.id });
      expect(await r.daImportacao(conta, 'não-é-uuid')).toBeUndefined();
      // a peça comum não tem importação
      expect((await r.criar(conta, { id: randomUUID(), nome: 'comum', arvore: documentoVazio() })).importacaoId).toBeUndefined();
    });

    it('a marca da peça: é definida, vem na lista e filtra a lista; a peça de outra conta não é marcada', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const [marca, outraMarca] = [await criarMarca(conta), await criarMarca(conta)];
      const [comMarca, comOutra, semMarca] = [
        await r.criar(conta, { id: randomUUID(), nome: 'a', arvore: documentoVazio() }),
        await r.criar(conta, { id: randomUUID(), nome: 'b', arvore: documentoVazio() }),
        await r.criar(conta, { id: randomUUID(), nome: 'c', arvore: documentoVazio() }),
      ];
      expect(await r.definirMarca(conta, comMarca.id, marca)).toBe(true);
      expect(await r.definirMarca(conta, comOutra.id, outraMarca)).toBe(true);
      expect(await r.definirMarca(outra, comMarca.id, marca)).toBe(false);
      expect(await r.definirMarca(conta, randomUUID(), marca)).toBe(false);
      const todos = (await r.listar(conta, { limite: 10 })).itens;
      expect(todos.find((d) => d.id === comMarca.id)?.marcaId).toBe(marca);
      expect(todos.find((d) => d.id === semMarca.id)).not.toHaveProperty('marcaId');
      expect((await r.listar(conta, { limite: 10, marcaId: marca })).itens.map((d) => d.id)).toEqual([comMarca.id]);
      expect((await r.listar(conta, { limite: 10, marcaId: randomUUID() })).itens).toEqual([]);
      expect((await r.abrir(conta, comMarca.id))?.marcaId).toBe(marca);
    });

    it('miniatura: o pedido tem freio (uma vez por intervalo), e a gravação diz qual versão havia antes', async () => {
      const { contaA: conta, contaB: outra } = await criar();
      const doc = await r.criar(conta, { id: randomUUID(), nome: 'a', arvore: documentoVazio() });
      const t0 = new Date('2026-10-05T12:00:00.000Z');
      const mais = (segundos: number) => new Date(t0.getTime() + segundos * 1000);
      // o primeiro pedido passa; o segundo, dentro do intervalo, não
      expect(await r.pedirMiniatura(conta, doc.id, t0, mais(-20))).toBe(true);
      expect(await r.pedirMiniatura(conta, doc.id, mais(5), mais(-15))).toBe(false);
      expect(await r.pedirMiniatura(conta, doc.id, mais(25), mais(5))).toBe(true);
      expect(await r.pedirMiniatura(outra, doc.id, mais(100), mais(80))).toBe(false);
      expect(await r.pedirMiniatura(conta, randomUUID(), mais(100), mais(80))).toBe(false);

      expect((await r.abrir(conta, doc.id))?.miniaturaVersao).toBeUndefined();
      expect(await r.gravarMiniatura(conta, doc.id, 0)).toEqual({});
      expect(await r.gravarMiniatura(conta, doc.id, 3)).toEqual({ anterior: 0 });
      expect((await r.abrir(conta, doc.id))?.miniaturaVersao).toBe(3);
      expect((await r.listar(conta, { limite: 10 })).itens[0]?.miniaturaVersao).toBe(3);
      expect(await r.gravarMiniatura(outra, doc.id, 9)).toBeUndefined();
      // gravar a miniatura não mexe na data de alteração: a peça não sobe na lista por causa dela
      expect((await r.abrir(conta, doc.id))?.alteradoEm).toEqual(doc.alteradoEm);
    });

    it('arquivar: some de abrir e da lista; arquivar de novo devolve false', async () => {
      const d = await novo(A);
      expect(await r.arquivar(A, d.id)).toBe(true);
      expect(await r.abrir(A, d.id)).toBeUndefined();
      expect(await r.arquivar(A, d.id)).toBe(false);
    });

    it('comTrava + gravarLote: avança a versão, guarda a árvore de cada versão e o lote', async () => {
      const d = await novo(A);
      const l1 = lote(1);
      const resultado = await r.comTrava(A, d.id, async (doc) => {
        expect(doc.registro).toMatchObject({ id: d.id, versao: 0 });
        expect(await doc.arvore()).toEqual(documentoVazio());
        await doc.gravarLote(l1);
        return 'gravado';
      });
      expect(resultado).toBe('gravado');
      expect(await r.abrir(A, d.id)).toMatchObject({ versao: 1, pranchetas: 1, arvore: l1.arvore });
      await r.comTrava(A, d.id, async (doc) => {
        expect(await doc.arvoreDaVersao(0)).toEqual(documentoVazio());
        expect(await doc.arvoreDaVersao(1)).toEqual(l1.arvore);
        expect(await doc.arvoreDaVersao(7)).toBeUndefined();
        expect(await doc.lote(1)).toMatchObject({
          id: l1.id,
          chaveDoCliente: l1.chaveDoCliente,
          versao: 1,
          autoria: 'designer',
          tipo: 'edicao',
          descricao: 'lote 1',
          tocados: ['a', 'b'],
          quantidadeDeOperacoes: 2,
          desfeitoPor: null,
          reverteAteVersao: null,
          tarefaId: null,
        });
        expect(await doc.lote(2)).toBeUndefined();
        expect((await doc.lotePorChaveDoCliente(l1.chaveDoCliente as string))?.versao).toBe(1);
        expect(await doc.lotePorChaveDoCliente(randomUUID())).toBeUndefined();
      });
    });

    it('se a função lança, nada é gravado', async () => {
      const d = await novo(A);
      await expect(
        r.comTrava(A, d.id, async (doc) => {
          await doc.gravarLote(lote(1));
          throw new Error('desisti');
        }),
      ).rejects.toThrow('desisti');
      expect(await r.abrir(A, d.id)).toMatchObject({ versao: 0, arvore: documentoVazio() });
      expect((await r.historico(A, d.id, { limite: 10 }))?.itens).toEqual([]);
    });

    it('lote fora de ordem é recusado: a versão de um lote é sempre a atual mais 1', async () => {
      const d = await novo(A);
      await expect(r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(2)))).rejects.toThrow();
      expect(await r.abrir(A, d.id)).toMatchObject({ versao: 0 });
    });

    it('duas travas ao mesmo tempo no mesmo documento rodam uma depois da outra', async () => {
      const d = await novo(A);
      const vistas: number[] = [];
      const gravar = () =>
        r.comTrava(A, d.id, async (doc) => {
          vistas.push(doc.registro.versao);
          await new Promise((ok) => setTimeout(ok, 30));
          await doc.gravarLote(lote(doc.registro.versao + 1));
        });
      await Promise.all([gravar(), gravar(), gravar()]);
      expect(vistas.sort()).toEqual([0, 1, 2]);
      expect(await r.abrir(A, d.id)).toMatchObject({ versao: 3 });
    });

    it('reversão: guarda até que versão voltou; a cauda de reversões vem da mais nova para a mais velha; marcar e desmarcar desfeito', async () => {
      const d = await novo(A);
      const reversao = (versao: number, ate: number) => lote(versao, { tipo: 'reversao', reverteAteVersao: ate, operacoes: [], tocados: [], descricao: '' });
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(1)));
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(2)));
      const r3 = reversao(3, 1);
      await r.comTrava(A, d.id, async (doc) => {
        expect(await doc.caudaDeReversoes()).toEqual([]);
        await doc.gravarLote(r3);
        await doc.marcarDesfeito(2, r3.id);
      });
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(reversao(4, 0)));
      await r.comTrava(A, d.id, async (doc) => {
        expect((await doc.caudaDeReversoes()).map((l) => [l.versao, l.tipo, l.reverteAteVersao])).toEqual([
          [4, 'reversao', 0],
          [3, 'reversao', 1],
        ]);
        expect((await doc.lote(2))?.desfeitoPor).toBe(r3.id);
        await doc.marcarDesfeito(2, null);
        expect((await doc.lote(2))?.desfeitoPor).toBeNull();
      });
    });

    it('resumo do histórico: o lote atual, a cauda de reversões e o lote logo antes dela', async () => {
      const d = await novo(A);
      expect(await r.resumoDoHistorico(A, d.id)).toEqual({ cauda: [] });
      const reversao = (versao: number, ate: number) => lote(versao, { tipo: 'reversao', reverteAteVersao: ate, operacoes: [], tocados: [], descricao: '' });
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(1)));
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(2)));
      const soEdicoes = await r.resumoDoHistorico(A, d.id);
      expect([soEdicoes?.atual?.versao, soEdicoes?.cauda, soEdicoes?.antesDaCauda?.versao]).toEqual([2, [], 2]);
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(reversao(3, 1)));
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(reversao(4, 0)));
      const comCauda = await r.resumoDoHistorico(A, d.id);
      expect(comCauda?.atual?.versao).toBe(4);
      expect(comCauda?.cauda.map((l) => l.versao)).toEqual([4, 3]);
      expect(comCauda?.antesDaCauda?.versao).toBe(2);
      // escopo trocado e documento inexistente
      expect(await r.resumoDoHistorico(B, d.id)).toBeUndefined();
      expect(await r.resumoDoHistorico(A, randomUUID())).toBeUndefined();
    });

    it('árvore de uma versão, fora de trava: é o que a exportação lê', async () => {
      const d = await novo(A);
      const l1 = lote(1);
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(l1));
      await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(2)));
      expect(await r.arvoreNaVersao(A, d.id, 1)).toEqual({ nome: 'doc', arvore: l1.arvore });
      expect((await r.arvoreNaVersao(A, d.id, 0))?.arvore).toEqual(documentoVazio());
      expect(await r.arvoreNaVersao(A, d.id, 9)).toBeUndefined();
      expect(await r.arvoreNaVersao(B, d.id, 1)).toBeUndefined();
    });

    it('histórico: do mais novo para o mais velho, paginado', async () => {
      const d = await novo(A);
      for (const v of [1, 2, 3]) await r.comTrava(A, d.id, (doc) => doc.gravarLote(lote(v)));
      const p1 = await r.historico(A, d.id, { limite: 2 });
      expect(p1?.itens.map((l) => l.versao)).toEqual([3, 2]);
      const p2 = await r.historico(A, d.id, { limite: 2, cursor: p1?.proximoCursor as string });
      expect(p2?.itens.map((l) => l.versao)).toEqual([1]);
      expect(p2?.proximoCursor).toBeNull();
      expect(p2?.itens[0]?.criadoEm).toBeInstanceOf(Date);
    });

    it('renomear troca o nome e conta como alteração (sobe na lista), sem mudar a versão', async () => {
      const d = await novo(A, 'antes');
      const depois = await r.renomear(A, d.id, 'depois');
      expect(depois).toMatchObject({ id: d.id, nome: 'depois', versao: 0 });
      expect((depois?.alteradoEm.getTime() ?? 0) >= d.alteradoEm.getTime()).toBe(true);
    });
  });
}
