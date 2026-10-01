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
}
