// Contrato da porta RepositorioDeImportacoes, contra o adaptador do banco e o falso (ADR 020, ADR 023).
import { randomUUID } from 'node:crypto';
import type { RelatorioDeImportacao } from '@otto/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import type { NovaImportacao, RepositorioDeImportacoes } from './repositorio-de-importacoes';

export interface RepositorioDeImportacoesSobTeste {
  repositorio: RepositorioDeImportacoes;
  /** Cada chamada devolve uma conta nova: os testes de limite e de "uma por vez" não se atrapalham. */
  novaConta(): Promise<EscopoDaConta>;
  /** Cria na conta a peça que nasceu da importação e devolve o id dela. */
  criarPeca(escopo: EscopoDaConta, importacaoId: string): Promise<string>;
}

const AGORA = new Date('2026-10-06T12:00:00.000Z');
const antes = (segundos: number) => new Date(AGORA.getTime() - segundos * 1000);
const depois = (segundos: number) => new Date(AGORA.getTime() + segundos * 1000);
const SHA = 'a'.repeat(64);
const RELATORIO: RelatorioDeImportacao = {
  arquivo: { formato: 'psd', largura: 1080, altura: 1350, camadas: 3, conversaoDeCor: 'srgb' },
  camadas: [{ prancheta: 'Feed', camada: 'Título', idDoNo: 'n1', tipo: 'texto', destino: 'editavel', mapeamento: 'no.texto' }],
  fontes: [{ familia: 'Anton', peso: 400, postScript: 'Anton-Regular' }],
  substituicoes: [],
  emFalta: { fontes: [] },
  avisos: [{ codigo: 'conferir-texto', texto: 'Confira o texto.' }],
};

export function contratoDoRepositorioDeImportacoes(nome: string, criar: () => Promise<RepositorioDeImportacoesSobTeste>): void {
  describe(`contrato de RepositorioDeImportacoes: ${nome}`, () => {
    let sob: RepositorioDeImportacoesSobTeste;
    let r: RepositorioDeImportacoes;

    beforeAll(async () => {
      sob = await criar();
      r = sob.repositorio;
    });

    const nova = (extra: Partial<NovaImportacao> = {}): NovaImportacao => {
      const id = randomUUID();
      return {
        id,
        nomeDoArquivo: 'campanha.psd',
        bytes: 123_456,
        sha256: SHA,
        formato: 'psd',
        largura: 1080,
        altura: 1350,
        camadas: 9,
        fontes: ['Anton-Regular', 'Gotham-Black'],
        chaveDoObjeto: `contas/x/importacoes/${id}/original.psd`,
        criadaEm: AGORA,
        expiraEm: depois(86_400),
        ...extra,
      };
    };
    const enviada = async (escopo: EscopoDaConta, extra: Partial<NovaImportacao> = {}) => {
      const criada = await r.criarSeCouber(escopo, nova(extra), 100);
      if (!criada) throw new Error('não coube');
      return criada;
    };
    const naFila = async (escopo: EscopoDaConta, extra: Partial<NovaImportacao> = {}) => {
      const e = await enviada(escopo, extra);
      const pedida = await r.pedir(escopo, e.id, { fontes: [] }, AGORA);
      if (!pedida || pedida === 'fora-do-estado') throw new Error('não entrou na fila');
      return pedida.importacao;
    };
    const rodando = async (escopo: EscopoDaConta) => {
      const e = await naFila(escopo);
      const inicio = await r.iniciar(escopo, e.id, AGORA, antes(300));
      if (inicio.resultado !== 'iniciada') throw new Error('não iniciou');
      return inicio.importacao;
    };

    it('nasce enviada, com o que a conferência viu, e é achada pelo id', async () => {
      const conta = await sob.novaConta();
      const n = nova();
      const criada = await r.criarSeCouber(conta, n, 5);
      expect(criada).toMatchObject({
        id: n.id,
        estado: 'enviada',
        nomeDoArquivo: 'campanha.psd',
        bytes: 123_456,
        sha256: SHA,
        formato: 'psd',
        largura: 1080,
        altura: 1350,
        camadas: 9,
        fontes: ['Anton-Regular', 'Gotham-Black'],
        chaveDoObjeto: n.chaveDoObjeto,
        tentativas: 0,
        criadaEm: AGORA,
        expiraEm: depois(86_400),
      });
      expect(criada?.documentoId).toBeUndefined();
      expect(await r.buscar(conta, n.id)).toEqual(criada);
      expect(await r.buscar(conta, randomUUID())).toBeUndefined();
      expect(await r.buscar(conta, 'não-é-uuid')).toBeUndefined();
    });

    it('escopo trocado: a conta B não acha, não pede, não descarta, não inicia, não conclui nem lista importação da conta A', async () => {
      const [A, B] = [await sob.novaConta(), await sob.novaConta()];
      const e = await enviada(A);
      expect(await r.buscar(B, e.id)).toBeUndefined();
      expect(await r.pedir(B, e.id, { fontes: [] }, AGORA)).toBeUndefined();
      expect(await r.descartar(B, e.id, AGORA)).toBe(false);
      expect(await r.listar(B, { criadasDesde: antes(3600), limite: 10 })).toEqual([]);
      expect(await r.darBaixaNasParadas(B, depois(10 * 86_400), { naFilaDesde: depois(9 * 86_400), semSinalDesde: depois(9 * 86_400) })).toEqual([]);
      await r.marcarArquivoRemovido(B, e.id, AGORA);

      const f = await naFila(A);
      expect(await r.iniciar(B, f.id, AGORA, antes(300))).toEqual({ resultado: 'ignorada' });
      await r.devolver(B, f.id);
      await r.concluir(B, f.id, { estado: 'falhou', erro: { codigo: 'falha_na_importacao' }, terminadaEm: AGORA, duracaoMs: 1 });
      await r.bater(B, f.id, depois(5));

      expect(await r.buscar(A, e.id)).toMatchObject({ estado: 'enviada' });
      expect((await r.buscar(A, e.id))?.arquivoRemovidoEm).toBeUndefined();
      expect(await r.buscar(A, f.id)).toMatchObject({ estado: 'na_fila' });
    });

    it('o limite conta as abertas (enviada, na fila, rodando) da conta, e só da conta', async () => {
      const [A, B] = [await sob.novaConta(), await sob.novaConta()];
      await enviada(A);
      await rodando(A);
      expect(await r.criarSeCouber(A, nova(), 2)).toBeUndefined();
      expect(await r.criarSeCouber(B, nova(), 2)).toBeDefined();
      // a que terminou ou foi descartada não conta
      const terceira = await r.criarSeCouber(A, nova(), 3);
      expect(terceira).toBeDefined();
      expect(await r.criarSeCouber(A, nova(), 3)).toBeUndefined();
      expect(await r.descartar(A, terceira?.id as string, AGORA)).toBe(true);
      expect(await r.criarSeCouber(A, nova(), 3)).toBeDefined();
    });

    it('envios simultâneos da mesma conta não passam do limite', async () => {
      const A = await sob.novaConta();
      const tentativas = await Promise.all(Array.from({ length: 6 }, () => r.criarSeCouber(A, nova(), 2)));
      expect(tentativas.filter(Boolean)).toHaveLength(2);
    });

    it('pedir: enviada vai para a fila com o pedido guardado, e diz quantas a conta tinha na frente', async () => {
      const A = await sob.novaConta();
      const [e1, e2] = [await enviada(A), await enviada(A)];
      const pedido = { nome: 'Campanha', fontes: [{ postScript: 'Gotham-Black', fazer: 'imagem' as const }] };
      const primeira = await r.pedir(A, e1.id, pedido, AGORA);
      expect(primeira).toMatchObject({ naFrente: 0, importacao: { id: e1.id, estado: 'na_fila', pedido, pedidaEm: AGORA } });
      expect(await r.pedir(A, e2.id, { fontes: [] }, AGORA)).toMatchObject({ naFrente: 1 });
      // pedir de novo não vale
      expect(await r.pedir(A, e1.id, { fontes: [] }, AGORA)).toBe('fora-do-estado');
      expect(await r.buscar(A, e1.id)).toMatchObject({ pedido });
      expect(await r.pedir(A, randomUUID(), { fontes: [] }, AGORA)).toBeUndefined();
    });

    it('pedir a que já venceu não vale', async () => {
      const A = await sob.novaConta();
      const e = await enviada(A, { expiraEm: antes(1) });
      expect(await r.pedir(A, e.id, { fontes: [] }, AGORA)).toBe('fora-do-estado');
      expect(await r.buscar(A, e.id)).toMatchObject({ estado: 'enviada' });
    });

    it('devolver: a que estava na fila volta a esperar o pedido, sem o pedido', async () => {
      const A = await sob.novaConta();
      const f = await naFila(A);
      await r.devolver(A, f.id);
      const voltou = await r.buscar(A, f.id);
      expect(voltou).toMatchObject({ estado: 'enviada' });
      expect(voltou?.pedido).toBeUndefined();
      expect(voltou?.pedidaEm).toBeUndefined();
      // a que está rodando não volta
      const rd = await rodando(A);
      await r.devolver(A, rd.id);
      expect(await r.buscar(A, rd.id)).toMatchObject({ estado: 'rodando' });
    });

    it('descartar: só a que espera o pedido', async () => {
      const A = await sob.novaConta();
      const e = await enviada(A);
      expect(await r.descartar(A, e.id, AGORA)).toBe(true);
      expect(await r.buscar(A, e.id)).toMatchObject({ estado: 'descartada', terminadaEm: AGORA });
      expect(await r.descartar(A, e.id, AGORA)).toBe(false);
      const f = await naFila(A);
      expect(await r.descartar(A, f.id, AGORA)).toBe(false);
      expect(await r.descartar(A, randomUUID(), AGORA)).toBe(false);
    });

    it('iniciar: uma por vez por conta; a segunda fica ocupada, a de outra conta roda, e a entrega repetida é ignorada', async () => {
      const [A, B] = [await sob.novaConta(), await sob.novaConta()];
      const [a1, a2, b1] = [await naFila(A), await naFila(A), await naFila(B)];
      const inicio = await r.iniciar(A, a1.id, AGORA, antes(300));
      expect(inicio).toMatchObject({ resultado: 'iniciada', importacao: { id: a1.id, estado: 'rodando', tentativas: 1 } });
      expect(await r.iniciar(A, a2.id, AGORA, antes(300))).toEqual({ resultado: 'ocupada' });
      expect(await r.iniciar(B, b1.id, AGORA, antes(300))).toMatchObject({ resultado: 'iniciada' });
      // a mesma, entregue de novo, com o dono vivo
      expect(await r.iniciar(A, a1.id, depois(1), antes(300))).toEqual({ resultado: 'ignorada' });
      // a que ainda espera o pedido não inicia
      const e = await enviada(A);
      expect(await r.iniciar(A, e.id, AGORA, antes(300))).toEqual({ resultado: 'ignorada' });
      expect(await r.iniciar(A, randomUUID(), AGORA, antes(300))).toEqual({ resultado: 'ignorada' });
      expect(await r.iniciar(A, 'não-é-uuid', AGORA, antes(300))).toEqual({ resultado: 'ignorada' });
    });

    it('de dois workers com o mesmo trabalho, um só inicia', async () => {
      const A = await sob.novaConta();
      const f = await naFila(A);
      const inicios = await Promise.all([r.iniciar(A, f.id, AGORA, antes(300)), r.iniciar(A, f.id, AGORA, antes(300)), r.iniciar(A, f.id, AGORA, antes(300))]);
      expect(inicios.filter((i) => i.resultado === 'iniciada')).toHaveLength(1);
    });

    it('a que ficou rodando sem sinal de vida não segura a conta: a seguinte inicia e a parada fecha como interrompida', async () => {
      const A = await sob.novaConta();
      const parada = await rodando(A);
      const seguinte = await naFila(A);
      // com sinal recente, a conta está ocupada
      await r.bater(A, parada.id, depois(200));
      expect(await r.iniciar(A, seguinte.id, depois(400), depois(100))).toEqual({ resultado: 'ocupada' });
      expect(await r.iniciar(A, seguinte.id, depois(600), depois(300))).toMatchObject({ resultado: 'iniciada' });
      expect(await r.buscar(A, parada.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'interrompida' } });
    });

    it('retomada: o trabalho reentregue de uma importação sem sinal recomeça uma vez; na segunda, falha como interrompida', async () => {
      const A = await sob.novaConta();
      const e = await rodando(A);
      const retomar = { semSinalDesde: depois(20), maximoDeTentativas: 2 };
      // o dono está vivo (o sinal é de AGORA, e o corte é anterior): ninguém retoma
      expect(await r.iniciar(A, e.id, depois(10), antes(300), { semSinalDesde: antes(10), maximoDeTentativas: 2 })).toEqual({ resultado: 'ignorada' });
      const retomada = await r.iniciar(A, e.id, depois(40), antes(300), retomar);
      expect(retomada).toMatchObject({ resultado: 'iniciada', retomada: true, importacao: { estado: 'rodando', tentativas: 2 } });
      // sem tentativa sobrando
      expect(await r.iniciar(A, e.id, depois(100), antes(300), { semSinalDesde: depois(80), maximoDeTentativas: 2 })).toEqual({ resultado: 'ignorada' });
      expect(await r.buscar(A, e.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'interrompida' }, tentativas: 2 });
    });

    it('concluir pronta: guarda o relatório, a duração e a peça criada, e a peça leva de volta à importação', async () => {
      const [A, B] = [await sob.novaConta(), await sob.novaConta()];
      const e = await rodando(A);
      const documentoId = await sob.criarPeca(A, e.id);
      await r.concluir(A, e.id, { estado: 'pronta', documentoId, relatorio: RELATORIO, terminadaEm: depois(3), duracaoMs: 3000 });
      const pronta = await r.buscar(A, e.id);
      expect(pronta).toMatchObject({ estado: 'pronta', documentoId, relatorio: RELATORIO, duracaoMs: 3000, terminadaEm: depois(3) });
      expect(pronta?.erro).toBeUndefined();
      expect(await r.daPeca(A, documentoId)).toEqual(pronta);
      expect(await r.daPeca(B, documentoId)).toBeUndefined();
      expect(await r.daPeca(A, randomUUID())).toBeUndefined();
      expect(await r.daPeca(A, 'não-é-uuid')).toBeUndefined();
      // concluir de novo não muda nada
      await r.concluir(A, e.id, { estado: 'falhou', erro: { codigo: 'falha_na_importacao' }, terminadaEm: depois(9), duracaoMs: 9 });
      expect(await r.buscar(A, e.id)).toEqual(pronta);
    });

    it('concluir falhou: guarda o código e, quando o arquivo foi recusado, o motivo e a frase', async () => {
      const A = await sob.novaConta();
      const e = await rodando(A);
      const erro = { codigo: 'psd_recusado', motivo: 'modo-de-cor', mensagem: 'O arquivo está em CMYK.' };
      await r.concluir(A, e.id, { estado: 'falhou', erro, terminadaEm: depois(1), duracaoMs: 1000 });
      const falha = await r.buscar(A, e.id);
      expect(falha).toMatchObject({ estado: 'falhou', erro, duracaoMs: 1000 });
      expect(falha?.documentoId).toBeUndefined();
      expect(falha?.relatorio).toBeUndefined();
      // terminada, deixa a conta livre
      const seguinte = await naFila(A);
      expect(await r.iniciar(A, seguinte.id, depois(2), antes(300))).toMatchObject({ resultado: 'iniciada' });
    });

    it('dar baixa: descarta a enviada que venceu, fecha a abandonada na fila e a que roda sem sinal, e devolve as que fechou', async () => {
      const A = await sob.novaConta();
      const vencida = await enviada(A, { expiraEm: depois(10) });
      const esperando = await enviada(A, { expiraEm: depois(86_400) });
      const abandonada = await naFila(A);
      const semSinal = await rodando(A);
      const fechadas = await r.darBaixaNasParadas(A, depois(3600), { naFilaDesde: depois(1800), semSinalDesde: depois(3300) });
      expect(fechadas.map((f) => f.id).sort()).toEqual([vencida.id, abandonada.id, semSinal.id].sort());
      expect(await r.buscar(A, vencida.id)).toMatchObject({ estado: 'descartada' });
      expect(await r.buscar(A, abandonada.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'abandonada' } });
      expect(await r.buscar(A, semSinal.id)).toMatchObject({ estado: 'falhou', erro: { codigo: 'interrompida' } });
      expect(await r.buscar(A, esperando.id)).toMatchObject({ estado: 'enviada' });
      // nada mais para fechar
      expect(await r.darBaixaNasParadas(A, depois(3600), { naFilaDesde: depois(1800), semSinalDesde: depois(3300) })).toEqual([]);
    });

    it('dar baixa não fecha a que roda com sinal de vida recente', async () => {
      const A = await sob.novaConta();
      const viva = await rodando(A);
      await r.bater(A, viva.id, depois(3500));
      expect(await r.darBaixaNasParadas(A, depois(3600), { naFilaDesde: depois(1800), semSinalDesde: depois(3300) })).toEqual([]);
      expect(await r.buscar(A, viva.id)).toMatchObject({ estado: 'rodando' });
    });

    it('lista as da conta, da mais nova para a mais velha, desde a data e até o limite', async () => {
      const A = await sob.novaConta();
      const velha = await enviada(A, { criadaEm: antes(10 * 86_400) });
      const meio = await enviada(A, { criadaEm: antes(60) });
      const recente = await enviada(A, { criadaEm: antes(10) });
      expect((await r.listar(A, { criadasDesde: antes(3600), limite: 10 })).map((i) => i.id)).toEqual([recente.id, meio.id]);
      expect((await r.listar(A, { criadasDesde: antes(3600), limite: 1 })).map((i) => i.id)).toEqual([recente.id]);
      expect((await r.listar(A, { criadasDesde: antes(30 * 86_400), limite: 10 })).map((i) => i.id)).toEqual([recente.id, meio.id, velha.id]);
    });

    it('marca que o arquivo enviado foi apagado, e o registro fica', async () => {
      const A = await sob.novaConta();
      const e = await enviada(A);
      await r.marcarArquivoRemovido(A, e.id, depois(5));
      expect(await r.buscar(A, e.id)).toMatchObject({ estado: 'enviada', arquivoRemovidoEm: depois(5), nomeDoArquivo: 'campanha.psd' });
    });
  });
}
