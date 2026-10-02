// Primeira parte da suíte "duas-contas" do ADR 023 (item 6): com o escopo de A, tenta alcançar B.
// Em nenhum caso o resultado é linha de outra conta. O caminho HTTP entra na fatia 1, com as rotas.
import { randomUUID } from 'node:crypto';
import { lerContaId } from '@otto/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EscopoDaConta, EscopoDivergente } from '../../src/plataforma/escopo/escopo-da-conta';
import { PrismaComEscopo } from '../../src/plataforma/persistencia/prisma-com-escopo';
import { comoApp, comoMigrador, urlDoAppDeTeste } from './conexoes';

const contaA = randomUUID();
const contaB = randomUUID();
const docDeA = randomUUID();
const docDeB = randomUUID();
const escopoA = EscopoDaConta.abrir(lerContaId(contaA));
const escopoB = EscopoDaConta.abrir(lerContaId(contaB));
let prisma: PrismaComEscopo;

beforeAll(async () => {
  // Conta só nasce pelo migrador: otto_app não tem INSERT em contas.
  await comoMigrador(async (c) => {
    for (const [conta, doc, nome] of [
      [contaA, docDeA, 'A'],
      [contaB, docDeB, 'B'],
    ] as const) {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.conta_id', $1, true)`, [conta]);
      await c.query(`INSERT INTO contas (id, nome) VALUES ($1, $2)`, [conta, `Conta ${nome} de teste`]);
      await c.query(`INSERT INTO documentos (id, conta_id, nome, versao_do_formato) VALUES ($1, $2, $3, 1)`, [doc, conta, `Documento de ${nome}`]);
      await c.query('COMMIT');
    }
  });
  prisma = new PrismaComEscopo(urlDoAppDeTeste());
});

afterAll(async () => {
  await prisma?.fechar();
});

describe('isolamento entre contas no banco', () => {
  it('com o escopo de A, a lista de documentos só tem os de A', async () => {
    const docs = await prisma.executar(escopoA, (tx) => tx.documento.findMany());
    expect(docs.map((d) => d.id)).toEqual([docDeA]);
  });

  it('com o escopo de A, buscar o documento de B pelo id não acha nada', async () => {
    expect(await prisma.executar(escopoA, (tx) => tx.documento.findUnique({ where: { id: docDeB } }))).toBeNull();
  });

  it('SQL cru com WHERE 1=1 no escopo de A devolve só linhas de A', async () => {
    const linhas = await prisma.executar(escopoA, (tx) => tx.$queryRaw<{ conta_id: string }[]>`SELECT conta_id FROM documentos WHERE 1 = 1`);
    expect(linhas.map((l) => l.conta_id)).toEqual([contaA]);
  });

  it('com o escopo de A, a tabela de contas só mostra A', async () => {
    const contas = await prisma.executar(escopoA, (tx) => tx.conta.findMany());
    expect(contas.map((c) => c.id)).toEqual([contaA]);
  });

  it('gravar com conta_id de B no escopo de A falha, e nada é gravado', async () => {
    const intruso = randomUUID();
    await expect(prisma.executar(escopoA, (tx) => tx.documento.create({ data: { id: intruso, contaId: contaB, nome: 'intruso', versaoDoFormato: 1 } }))).rejects.toThrow(/row-level security/);
    expect(await prisma.executar(escopoB, (tx) => tx.documento.findUnique({ where: { id: intruso } }))).toBeNull();
  });

  it('alterar o documento de B no escopo de A não altera linha nenhuma', async () => {
    const r = await prisma.executar(escopoA, (tx) => tx.documento.updateMany({ where: { id: docDeB }, data: { nome: 'tomado' } }));
    expect(r.count).toBe(0);
    expect((await prisma.executar(escopoB, (tx) => tx.documento.findUnique({ where: { id: docDeB } })))?.nome).toBe('Documento de B');
  });

  it('filho apontando para mãe de outra conta viola a chave estrangeira composta', async () => {
    // versão do documento de B, gravada com conta_id de A: passa pelo WITH CHECK e para na chave composta
    await expect(prisma.executar(escopoA, (tx) => tx.versaoDeDocumento.create({ data: { contaId: contaA, documentoId: docDeB, versao: 1, arvore: {}, bytes: 2 } }))).rejects.toThrow(
      /foreign key|Foreign key/,
    );
  });

  it('importação de PSD: a de B não aparece no escopo de A, não é gravada com a conta de B, e peça de A não aponta para importação de B', async () => {
    const importacao = (id: string, conta: string) => ({
      id,
      contaId: conta,
      nomeDoArquivo: 'segredo.psd',
      bytes: 10,
      sha256: 'a'.repeat(64),
      formato: 'psd',
      largura: 10,
      altura: 10,
      camadas: 1,
      chaveDoObjeto: `contas/${conta}/importacoes/${id}/original.psd`,
      expiraEm: new Date(Date.now() + 86_400_000),
    });
    const deB = randomUUID();
    await prisma.executar(escopoB, (tx) => tx.importacao.create({ data: importacao(deB, contaB) }));
    expect(await prisma.executar(escopoA, (tx) => tx.importacao.findMany())).toEqual([]);
    expect(await prisma.executar(escopoA, (tx) => tx.$queryRaw`SELECT id FROM importacoes WHERE 1 = 1`)).toEqual([]);
    expect((await prisma.executar(escopoA, (tx) => tx.importacao.updateMany({ where: { id: deB }, data: { estado: 'descartada' } }))).count).toBe(0);
    await expect(prisma.executar(escopoA, (tx) => tx.importacao.create({ data: importacao(randomUUID(), contaB) }))).rejects.toThrow(/row-level security/);
    // peça de A dizendo que nasceu da importação de B: passa pelo WITH CHECK e para na chave composta
    await expect(prisma.executar(escopoA, (tx) => tx.documento.create({ data: { id: randomUUID(), contaId: contaA, nome: 'intrusa', versaoDoFormato: 1, importacaoId: deB } }))).rejects.toThrow(
      /foreign key|Foreign key/,
    );
    // otto_app não apaga importação: o registro fica
    await expect(prisma.executar(escopoB, (tx) => tx.importacao.deleteMany({ where: { id: deB } }))).rejects.toThrow(/permission denied|permissão/i);
  });

  it('o escopo não vaza pela conexão: depois de A, uma transação de B só vê B', async () => {
    for (let i = 0; i < 12; i++) {
      const [deA, deB] = await Promise.all([prisma.executar(escopoA, (tx) => tx.documento.findMany()), prisma.executar(escopoB, (tx) => tx.documento.findMany())]);
      expect(deA.map((d) => d.id)).toEqual([docDeA]);
      expect(deB.map((d) => d.id)).toEqual([docDeB]);
    }
  });

  it('sem escopo aberto, consulta a tabela de negócio é erro, não lista vazia', async () => {
    await comoApp(async (c) => {
      await expect(c.query('SELECT * FROM documentos')).rejects.toThrow(/app\.conta_id/);
    });
  });

  it('transação dentro de transação com outro escopo é recusada', async () => {
    await expect(prisma.executar(escopoA, () => prisma.executar(escopoB, (tx) => tx.documento.findMany()))).rejects.toBeInstanceOf(EscopoDivergente);
  });

  it('otto_app não apaga lote nem versão (o histórico é só de acréscimo)', async () => {
    await expect(prisma.executar(escopoA, (tx) => tx.$executeRaw`DELETE FROM lotes_de_operacoes`)).rejects.toThrow(/permission denied/);
    await expect(prisma.executar(escopoA, (tx) => tx.$executeRaw`DELETE FROM versoes_de_documento`)).rejects.toThrow(/permission denied/);
  });

  it('a sonda de saúde responde sem abrir escopo e sem tocar tabela de negócio', async () => {
    expect(await prisma.responde()).toBe(true);
  });
});

describe('a conta fixa do MVP (sem login, uma conta semeada pela migração: ADR 035)', () => {
  it('existe, com o id fixo, e é visível só no próprio escopo', async () => {
    const fixa = '01990000-0000-7000-8000-000000000001';
    const contas = await prisma.executar(EscopoDaConta.abrir(lerContaId(fixa)), (tx) => tx.conta.findMany());
    expect(contas.map((c) => c.id)).toEqual([fixa]);
  });
});
