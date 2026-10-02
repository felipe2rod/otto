// Contrato da porta RepositorioDeExportacoes, contra o adaptador do banco e o falso (ADR 020, ADR 023).
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { ArquivoGuardado, NovaExportacao, RepositorioDeExportacoes } from './repositorio-de-exportacoes';

export interface RepositorioDeExportacoesSobTeste {
  repositorio: RepositorioDeExportacoes;
  contaA: EscopoDaConta;
  contaB: EscopoDaConta;
  /** Cria um documento na conta e devolve o id (a exportação aponta para um documento que existe). */
  criarDocumento(escopo: EscopoDaConta): Promise<string>;
}

const AGORA = new Date('2026-10-01T12:00:00.000Z');
const HA_MUITO_TEMPO = new Date('2026-10-01T11:00:00.000Z');
const depois = (segundos: number) => new Date(AGORA.getTime() + segundos * 1000);
const arquivo = (indice: number, extra: Partial<ArquivoGuardado> = {}): ArquivoGuardado => ({
  indice,
  nome: `Peça - ${indice}.psd`,
  tipoMime: 'image/vnd.adobe.photoshop',
  bytes: 1000 + indice,
  pranchetaId: `p${indice}`,
  chaveDoObjeto: `contas/x/exportacoes/y/${indice}.psd`,
  ...extra,
});

export function contratoDoRepositorioDeExportacoes(nome: string, criar: () => Promise<RepositorioDeExportacoesSobTeste>): void {
  describe(`contrato de RepositorioDeExportacoes: ${nome}`, () => {
    let sob: RepositorioDeExportacoesSobTeste;
    let r: RepositorioDeExportacoes;

    beforeAll(async () => {
      sob = await criar();
      r = sob.repositorio;
    });

    const nova = async (escopo: EscopoDaConta, extra: Partial<NovaExportacao> = {}): Promise<NovaExportacao> => ({
      id: randomUUID(),
      documentoId: await sob.criarDocumento(escopo),
      versao: 3,
      nome: 'Promoção',
      opcoes: { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p0', 'p1'] },
      ...extra,
    });

    it('nasce na fila, com o progresso zerado, e é achada pelo id', async () => {
      const n = await nova(sob.contaA);
      const criada = await r.criar(sob.contaA, n);
      expect(criada).toMatchObject({
        id: n.id,
        documentoId: n.documentoId,
        versao: 3,
        nome: 'Promoção',
        opcoes: n.opcoes,
        estado: 'na_fila',
        pranchetasNoTotal: 2,
        pranchetasProntas: 0,
        arquivos: [],
        falhas: [],
      });
      expect(await r.buscar(sob.contaA, n.id)).toEqual(criada);
      expect(await r.buscar(sob.contaA, randomUUID())).toBeUndefined();
      expect(await r.buscar(sob.contaA, 'não-é-uuid')).toBeUndefined();
    });

    it('escopo trocado: a conta B não acha, não inicia, não registra nem conclui exportação da conta A', async () => {
      const n = await nova(sob.contaA);
      await r.criar(sob.contaA, n);
      expect(await r.buscar(sob.contaB, n.id)).toBeUndefined();
      expect(await r.iniciar(sob.contaB, n.id, AGORA, HA_MUITO_TEMPO)).toEqual({ resultado: 'ignorada' });
      await r.registrarArquivo(sob.contaB, n.id, arquivo(0), 1, AGORA).catch(() => undefined);
      await r.concluir(sob.contaB, n.id, { estado: 'falhou', erroCodigo: 'x', terminadaEm: AGORA, duracaoMs: 1 }).catch(() => undefined);
      expect(await r.buscar(sob.contaA, n.id)).toMatchObject({ estado: 'na_fila', arquivos: [], pranchetasProntas: 0 });
    });

    it('iniciar: na_fila vira rodando uma vez só; a segunda chamada é ignorada', async () => {
      const escopo = sob.contaB;
      const n = await nova(escopo);
      await r.criar(escopo, n);
      const primeira = await r.iniciar(escopo, n.id, AGORA, HA_MUITO_TEMPO);
      expect(primeira.resultado).toBe('iniciada');
      expect(primeira.resultado === 'iniciada' && primeira.exportacao).toMatchObject({ id: n.id, estado: 'rodando' });
      expect(await r.iniciar(escopo, n.id, AGORA, HA_MUITO_TEMPO)).toEqual({ resultado: 'ignorada' });
      await r.concluir(escopo, n.id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('uma por vez por conta: com uma rodando, a outra da mesma conta fica "ocupada"; a de outra conta inicia', async () => {
      const [um, dois, deB] = [await nova(sob.contaA), await nova(sob.contaA), await nova(sob.contaB)];
      await r.criar(sob.contaA, um);
      await r.criar(sob.contaA, dois);
      await r.criar(sob.contaB, deB);
      expect((await r.iniciar(sob.contaA, um.id, AGORA, HA_MUITO_TEMPO)).resultado).toBe('iniciada');
      expect(await r.iniciar(sob.contaA, dois.id, AGORA, HA_MUITO_TEMPO)).toEqual({ resultado: 'ocupada' });
      expect((await r.buscar(sob.contaA, dois.id))?.estado).toBe('na_fila');
      expect((await r.iniciar(sob.contaB, deB.id, AGORA, HA_MUITO_TEMPO)).resultado).toBe('iniciada');
      expect(await r.contarEmAndamento(sob.contaA)).toBeGreaterThanOrEqual(2);
      // quando a primeira termina, a segunda entra
      await r.concluir(sob.contaA, um.id, { estado: 'pronta', terminadaEm: AGORA, expiraEm: depois(60), duracaoMs: 10 });
      expect((await r.iniciar(sob.contaA, dois.id, AGORA, HA_MUITO_TEMPO)).resultado).toBe('iniciada');
      await r.concluir(sob.contaA, dois.id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
      await r.concluir(sob.contaB, deB.id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('exportação "rodando" sem sinal de vida é dada como interrompida, e a conta volta a andar', async () => {
      const [travada, seguinte] = [await nova(sob.contaA), await nova(sob.contaA)];
      await r.criar(sob.contaA, travada);
      await r.criar(sob.contaA, seguinte);
      await r.iniciar(sob.contaA, travada.id, AGORA, HA_MUITO_TEMPO);
      // o worker morreu: 20 minutos depois, o limite de sinal de vida já passou do último batimento
      const maisTarde = depois(20 * 60);
      expect((await r.iniciar(sob.contaA, seguinte.id, maisTarde, depois(10 * 60))).resultado).toBe('iniciada');
      expect(await r.buscar(sob.contaA, travada.id)).toMatchObject({ estado: 'falhou', erroCodigo: 'interrompida' });
      await r.concluir(sob.contaA, seguinte.id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: maisTarde, duracaoMs: 1 });
    });

    it('com sinal de vida recente, a que está rodando não é interrompida', async () => {
      const [viva, seguinte] = [await nova(sob.contaB), await nova(sob.contaB)];
      await r.criar(sob.contaB, viva);
      await r.criar(sob.contaB, seguinte);
      await r.iniciar(sob.contaB, viva.id, AGORA, HA_MUITO_TEMPO);
      await r.bater(sob.contaB, viva.id, depois(15 * 60));
      expect(await r.iniciar(sob.contaB, seguinte.id, depois(20 * 60), depois(10 * 60))).toEqual({ resultado: 'ocupada' });
      await r.concluir(sob.contaB, viva.id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('registra arquivos e falhas, avança o progresso e conclui com relatório e vencimento', async () => {
      const escopo = sob.contaA;
      const n = await nova(escopo, { opcoes: { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p0', 'p1', 'p2'] } });
      await r.criar(escopo, n);
      await r.iniciar(escopo, n.id, AGORA, HA_MUITO_TEMPO);
      await r.registrarArquivo(escopo, n.id, arquivo(0), 1, AGORA);
      await r.registrarFalha(escopo, n.id, { pranchetaId: 'p1', codigo: 'falha_na_prancheta' }, AGORA);
      expect(await r.buscar(escopo, n.id)).toMatchObject({ estado: 'rodando', pranchetasProntas: 2, pranchetasNoTotal: 3, falhas: [{ pranchetaId: 'p1', codigo: 'falha_na_prancheta' }] });
      await r.registrarArquivo(escopo, n.id, arquivo(1, { pranchetaId: 'p2' }), 1, AGORA);
      const relatorio = { arquivos: ['a.psd'], camadas: [], tokens: [], fontes: [], substituicoes: [], emFalta: { fontes: [], imagens: [] }, imagens: [], avisos: [{ codigo: 'x', texto: 'y' }] };
      await r.concluir(escopo, n.id, { estado: 'pronta_em_parte', relatorio, terminadaEm: depois(5), expiraEm: depois(7 * 86_400), duracaoMs: 5000 });
      const fim = await r.buscar(escopo, n.id);
      expect(fim).toMatchObject({ estado: 'pronta_em_parte', pranchetasProntas: 3, duracaoMs: 5000, relatorio });
      expect(fim?.arquivos).toEqual([arquivo(0), arquivo(1, { pranchetaId: 'p2' })]);
      expect(fim?.expiraEm?.toISOString()).toBe(depois(7 * 86_400).toISOString());
      expect(fim?.terminadaEm?.toISOString()).toBe(depois(5).toISOString());
    });

    it('arquivo sem prancheta (PSD com todas juntas) cobre várias pranchetas de uma vez', async () => {
      const escopo = sob.contaB;
      const n = await nova(escopo, { opcoes: { formato: 'psd', arquivos: 'juntas', pranchetas: ['p0', 'p1'] } });
      await r.criar(escopo, n);
      await r.iniciar(escopo, n.id, AGORA, HA_MUITO_TEMPO);
      const { pranchetaId: _fora, ...semPrancheta } = arquivo(0);
      await r.registrarArquivo(escopo, n.id, semPrancheta, 2, AGORA);
      const lida = await r.buscar(escopo, n.id);
      expect(lida?.pranchetasProntas).toBe(2);
      expect(lida?.arquivos[0]).not.toHaveProperty('pranchetaId');
      await r.concluir(escopo, n.id, { estado: 'pronta', terminadaEm: AGORA, expiraEm: depois(60), duracaoMs: 1 });
    });

    it('concluir a que a fila recusou: na_fila vira falhou, e sai da conta das que estão em andamento', async () => {
      const escopo = sob.contaA;
      const antes = await r.contarEmAndamento(escopo);
      const n = await nova(escopo);
      await r.criar(escopo, n);
      expect(await r.contarEmAndamento(escopo)).toBe(antes + 1);
      await r.concluir(escopo, n.id, { estado: 'falhou', erroCodigo: 'fila_indisponivel', terminadaEm: AGORA, duracaoMs: 0 });
      expect(await r.buscar(escopo, n.id)).toMatchObject({ estado: 'falhou', erroCodigo: 'fila_indisponivel' });
      expect(await r.contarEmAndamento(escopo)).toBe(antes);
    });
  });

  describe(`contrato de RepositorioDeExportacoes: ${nome} (fechamento da fatia 2)`, () => {
    let sob: RepositorioDeExportacoesSobTeste;
    let r: RepositorioDeExportacoes;
    const concluida = { estado: 'pronta' as const, terminadaEm: AGORA, expiraEm: depois(7 * 86_400), duracaoMs: 10 };

    beforeAll(async () => {
      sob = await criar();
      r = sob.repositorio;
    });

    const criarEm = async (escopo: EscopoDaConta, documentoId: string, criadaEm: Date, opcoes: NovaExportacao['opcoes'] = { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p0'] }) => {
      const id = randomUUID();
      await r.criar(escopo, { id, documentoId, versao: 1, nome: 'Promoção', opcoes, criadaEm });
      return id;
    };

    it('guarda os formatos novos e a opção de pacote, e a data de criação que o caso de uso informa', async () => {
      const doc = await sob.criarDocumento(sob.contaA);
      const svg = await criarEm(sob.contaA, doc, AGORA, { formato: 'svg', pranchetas: ['p0'], pacote: true });
      const pdf = await criarEm(sob.contaA, doc, AGORA, { formato: 'pdf', arquivos: 'juntas', pranchetas: ['p0', 'p1'] });
      expect(await r.buscar(sob.contaA, svg)).toMatchObject({ opcoes: { formato: 'svg', pranchetas: ['p0'], pacote: true }, pranchetasNoTotal: 1 });
      expect(await r.buscar(sob.contaA, pdf)).toMatchObject({ opcoes: { formato: 'pdf', arquivos: 'juntas', pranchetas: ['p0', 'p1'] }, pranchetasNoTotal: 2 });
      expect((await r.buscar(sob.contaA, svg))?.criadaEm.toISOString()).toBe(AGORA.toISOString());
      for (const id of [svg, pdf]) await r.concluir(sob.contaA, id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('lista as exportações de UM documento, da mais nova para a mais velha, só as criadas desde a data pedida e até o limite', async () => {
      const [doc, outroDoc] = [await sob.criarDocumento(sob.contaA), await sob.criarDocumento(sob.contaA)];
      const velha = await criarEm(sob.contaA, doc, depois(-10 * 86_400));
      const ontem = await criarEm(sob.contaA, doc, depois(-86_400));
      const hoje = await criarEm(sob.contaA, doc, depois(-60));
      const deOutroDoc = await criarEm(sob.contaA, outroDoc, depois(-30));
      const ids = async (limite: number) => (await r.listarDoDocumento(sob.contaA, doc, { criadasDesde: depois(-7 * 86_400), limite })).map((e) => e.id);
      expect(await ids(10)).toEqual([hoje, ontem]);
      expect(await ids(1)).toEqual([hoje]);
      // de outra conta, o documento não tem exportação nenhuma; id que não é UUID também não
      expect(await r.listarDoDocumento(sob.contaB, doc, { criadasDesde: depois(-7 * 86_400), limite: 10 })).toEqual([]);
      expect(await r.listarDoDocumento(sob.contaA, 'não-é-uuid', { criadasDesde: depois(-7 * 86_400), limite: 10 })).toEqual([]);
      for (const id of [velha, ontem, hoje, deOutroDoc]) await r.concluir(sob.contaA, id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('dá baixa nas paradas da conta: na fila há tempo demais vira "abandonada"; rodando sem sinal de vida, "interrompida"; as outras ficam', async () => {
      const doc = await sob.criarDocumento(sob.contaA);
      const docDeB = await sob.criarDocumento(sob.contaB);
      const esquecida = await criarEm(sob.contaA, doc, depois(-3600));
      const recente = await criarEm(sob.contaA, doc, depois(-60));
      const deB = await criarEm(sob.contaB, docDeB, depois(-3600));
      const travada = await criarEm(sob.contaA, doc, depois(-3600));
      await r.iniciar(sob.contaA, travada, depois(-3500), HA_MUITO_TEMPO);

      const baixas = await r.darBaixaNasParadas(sob.contaA, AGORA, { naFilaDesde: depois(-1800), semSinalDesde: depois(-300) });
      expect(baixas).toBe(2);
      expect(await r.buscar(sob.contaA, esquecida)).toMatchObject({ estado: 'falhou', erroCodigo: 'abandonada' });
      expect(await r.buscar(sob.contaA, travada)).toMatchObject({ estado: 'falhou', erroCodigo: 'interrompida' });
      expect((await r.buscar(sob.contaA, esquecida))?.terminadaEm?.toISOString()).toBe(AGORA.toISOString());
      expect((await r.buscar(sob.contaA, recente))?.estado).toBe('na_fila');
      // a baixa é da conta do escopo: a exportação parada da conta B continua como estava
      expect((await r.buscar(sob.contaB, deB))?.estado).toBe('na_fila');
      expect(await r.darBaixaNasParadas(sob.contaA, AGORA, { naFilaDesde: depois(-1800), semSinalDesde: depois(-300) })).toBe(0);
      await r.concluir(sob.contaA, recente, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
      await r.concluir(sob.contaB, deB, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('registra progresso sem arquivo (pacote: os arquivos só são guardados no fim, dentro do .zip)', async () => {
      const doc = await sob.criarDocumento(sob.contaA);
      const id = await criarEm(sob.contaA, doc, AGORA, { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p0', 'p1'], pacote: true });
      await r.iniciar(sob.contaA, id, AGORA, HA_MUITO_TEMPO);
      await r.registrarProgresso(sob.contaB, id, 1, AGORA);
      expect((await r.buscar(sob.contaA, id))?.pranchetasProntas).toBe(0);
      await r.registrarProgresso(sob.contaA, id, 1, AGORA);
      expect(await r.buscar(sob.contaA, id)).toMatchObject({ estado: 'rodando', pranchetasProntas: 1, arquivos: [] });
      await r.concluir(sob.contaA, id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });
    });

    it('o limite da conta é atômico: de doze pedidos ao mesmo tempo, com limite de cinco, entram exatamente cinco', async () => {
      const escopo = (await criar()).contaA;
      const doc = await sob.criarDocumento(escopo);
      const pedidos = Array.from({ length: 12 }, () =>
        r.criarSeCouber(escopo, { id: randomUUID(), documentoId: doc, versao: 1, nome: 'Promoção', opcoes: { formato: 'png', escala: 1, semFundo: false, pranchetas: ['p0'] }, criadaEm: AGORA }, 5),
      );
      const resultados = await Promise.all(pedidos);
      const criadas = resultados.filter((x) => x !== undefined);
      expect(criadas).toHaveLength(5);
      expect(await r.contarEmAndamento(escopo)).toBe(5);
      // cada uma sabe quantas a conta já tinha na frente: é o que dá a vez entre contas na fila
      expect(criadas.map((c) => c.jaEmAndamento).sort()).toEqual([0, 1, 2, 3, 4]);
      expect(criadas[0]?.exportacao).toMatchObject({ estado: 'na_fila', tentativas: 0 });
      // o limite é por conta: outra conta entra
      const outra = sob.contaB;
      expect(
        await r.criarSeCouber(
          outra,
          { id: randomUUID(), documentoId: await sob.criarDocumento(outra), versao: 1, nome: 'x', opcoes: { formato: 'png', escala: 1, semFundo: false, pranchetas: ['p0'] } },
          5,
        ),
      ).toBeDefined();
    });

    describe('retomada depois de um worker morrer', () => {
      const RETOMAR = (semSinalDesde: Date) => ({ semSinalDesde, maximoDeTentativas: 2 });
      let escopo: EscopoDaConta;
      let doc: string;
      beforeAll(async () => {
        escopo = (await criar()).contaA;
        doc = await sob.criarDocumento(escopo);
      });
      const fechar = (id: string) => r.concluir(escopo, id, { estado: 'falhou', erroCodigo: 'teste', terminadaEm: AGORA, duracaoMs: 1 });

      it('o trabalho reentregue de uma exportação que parou no meio recomeça do zero: sem os arquivos, as falhas e o progresso da tentativa que morreu', async () => {
        const id = await criarEm(escopo, doc, AGORA, { formato: 'psd', arquivos: 'por-prancheta', pranchetas: ['p0', 'p1', 'p2'] });
        const primeira = await r.iniciar(escopo, id, AGORA, HA_MUITO_TEMPO);
        expect(primeira).toMatchObject({ resultado: 'iniciada', exportacao: { tentativas: 1 } });
        await r.registrarArquivo(escopo, id, arquivo(0), 1, depois(5));
        await r.registrarFalha(escopo, id, { pranchetaId: 'p1', codigo: 'falha_na_prancheta' }, depois(6));
        // o worker morreu aos 6 s. Aos 40 s a fila reentrega: sem sinal há mais de 20 s, é retomada.
        const retomada = await r.iniciar(escopo, id, depois(40), HA_MUITO_TEMPO, RETOMAR(depois(20)));
        expect(retomada).toMatchObject({ resultado: 'iniciada', retomada: true, exportacao: { estado: 'rodando', tentativas: 2, pranchetasProntas: 0, arquivos: [], falhas: [] } });
        // os arquivos da retomada entram nos mesmos índices
        await r.registrarArquivo(escopo, id, arquivo(0), 1, depois(41));
        expect((await r.buscar(escopo, id))?.arquivos).toEqual([arquivo(0)]);
        await fechar(id);
      });

      it('entrega repetida com o dono vivo (sinal de vida recente) é ignorada: ninguém toma a exportação de quem está rodando', async () => {
        const id = await criarEm(escopo, doc, AGORA);
        await r.iniciar(escopo, id, AGORA, HA_MUITO_TEMPO);
        await r.bater(escopo, id, depois(35));
        expect(await r.iniciar(escopo, id, depois(40), HA_MUITO_TEMPO, RETOMAR(depois(20)))).toEqual({ resultado: 'ignorada' });
        expect(await r.buscar(escopo, id)).toMatchObject({ estado: 'rodando', tentativas: 1 });
        await fechar(id);
      });

      it('a exportação que já foi retomada o máximo de vezes não é retomada de novo: falha como interrompida (ela pode ser o que derruba o worker)', async () => {
        const id = await criarEm(escopo, doc, AGORA);
        await r.iniciar(escopo, id, AGORA, HA_MUITO_TEMPO);
        expect((await r.iniciar(escopo, id, depois(40), HA_MUITO_TEMPO, RETOMAR(depois(20)))).resultado).toBe('iniciada');
        expect(await r.iniciar(escopo, id, depois(80), HA_MUITO_TEMPO, RETOMAR(depois(60)))).toEqual({ resultado: 'ignorada' });
        expect(await r.buscar(escopo, id)).toMatchObject({ estado: 'falhou', erroCodigo: 'interrompida', tentativas: 2 });
      });

      it('outra exportação da conta parada há pouco não é derrubada por quem chega: quem chega espera, para o trabalho dela poder retomá-la', async () => {
        const [parada, seguinte] = [await criarEm(escopo, doc, AGORA), await criarEm(escopo, doc, AGORA)];
        await r.iniciar(escopo, parada, AGORA, HA_MUITO_TEMPO);
        // aos 40 s, sem sinal há mais de 20 s mas há menos que o limite longo (aqui, 5 minutos)
        expect(await r.iniciar(escopo, seguinte, depois(40), depois(40 - 300), RETOMAR(depois(20)))).toEqual({ resultado: 'ocupada' });
        expect((await r.buscar(escopo, parada))?.estado).toBe('rodando');
        // a parada é retomada pelo trabalho dela, termina, e a seguinte entra
        expect((await r.iniciar(escopo, parada, depois(41), depois(41 - 300), RETOMAR(depois(21)))).resultado).toBe('iniciada');
        await fechar(parada);
        expect((await r.iniciar(escopo, seguinte, depois(42), depois(42 - 300), RETOMAR(depois(22)))).resultado).toBe('iniciada');
        await fechar(seguinte);
      });

      it('sem pedir retomada (como antes), a entrega repetida de uma exportação rodando é sempre ignorada', async () => {
        const id = await criarEm(escopo, doc, AGORA);
        await r.iniciar(escopo, id, AGORA, HA_MUITO_TEMPO);
        expect(await r.iniciar(escopo, id, depois(40), HA_MUITO_TEMPO)).toEqual({ resultado: 'ignorada' });
        await fechar(id);
      });
    });

    it('marca os arquivos como removidos sem apagar o registro; outra conta não marca', async () => {
      const doc = await sob.criarDocumento(sob.contaA);
      const id = await criarEm(sob.contaA, doc, AGORA);
      await r.iniciar(sob.contaA, id, AGORA, HA_MUITO_TEMPO);
      await r.registrarArquivo(sob.contaA, id, arquivo(0), 1, AGORA);
      await r.concluir(sob.contaA, id, concluida);
      expect((await r.buscar(sob.contaA, id))?.arquivosRemovidosEm).toBeUndefined();

      await r.marcarArquivosRemovidos(sob.contaB, id, depois(8 * 86_400));
      expect((await r.buscar(sob.contaA, id))?.arquivosRemovidosEm).toBeUndefined();

      await r.marcarArquivosRemovidos(sob.contaA, id, depois(8 * 86_400));
      const depoisDaLimpeza = await r.buscar(sob.contaA, id);
      expect(depoisDaLimpeza?.arquivosRemovidosEm?.toISOString()).toBe(depois(8 * 86_400).toISOString());
      expect(depoisDaLimpeza).toMatchObject({ estado: 'pronta', arquivos: [arquivo(0)] });
    });
  });
}
