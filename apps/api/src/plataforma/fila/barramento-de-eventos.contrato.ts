// Contrato da porta BarramentoDeEventos, contra o adaptador do pg-boss e o falso (ADR 020, exigência 4.2).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BarramentoDeEventos, FILAS, type Trabalho } from './barramento-de-eventos';

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function ate(condicao: () => boolean, limiteMs: number): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('a condição não aconteceu a tempo');
    await esperar(50);
  }
}

export function contratoDoBarramentoDeEventos(
  nome: string,
  criar: () => Promise<{ barramento: BarramentoDeEventos; limpar(): Promise<void> }>,
  tempos: { entregaMs: number; reentregaMs: number; adiamentoMs: number },
): void {
  describe(`contrato de BarramentoDeEventos: ${nome}`, () => {
    let barramento: BarramentoDeEventos;
    let limpar: () => Promise<void>;
    // um consumidor só para a suíte; cada teste registra o que fazer com os trabalhos da SUA conta
    const tratadores = new Map<string, (t: Trabalho) => Promise<void>>();

    beforeAll(async () => {
      ({ barramento, limpar } = await criar());
      await barramento.iniciar();
      await barramento.consumir(FILAS.exportacao, { concorrencia: 3 }, async (t) => {
        await tratadores.get(t.contaId)?.(t);
      });
    });
    afterAll(async () => {
      await barramento?.parar();
      await limpar?.();
    });

    it('entrega o trabalho publicado, com os mesmos identificadores', async () => {
      const trabalho = { contaId: randomUUID(), id: randomUUID() };
      const recebidos: Trabalho[] = [];
      tratadores.set(trabalho.contaId, async (t) => void recebidos.push(t));
      await barramento.publicar(FILAS.exportacao, trabalho);
      await ate(() => recebidos.length === 1, tempos.entregaMs);
      expect(recebidos).toEqual([trabalho]);
    });

    it('o trabalho só carrega identificadores: qualquer outra coisa é recusada ao publicar', async () => {
      await expect(barramento.publicar(FILAS.exportacao, { contaId: 'não-é-uuid', id: randomUUID() })).rejects.toThrow();
      await expect(barramento.publicar(FILAS.exportacao, { contaId: randomUUID(), id: randomUUID(), pedido: 'texto do pedido' } as unknown as Trabalho)).rejects.toThrow();
    });

    it('se o consumidor falha, o trabalho é entregue de novo', async () => {
      const trabalho = { contaId: randomUUID(), id: randomUUID() };
      let tentativas = 0;
      tratadores.set(trabalho.contaId, async () => {
        tentativas++;
        if (tentativas === 1) throw new Error('falha de propósito');
      });
      await barramento.publicar(FILAS.exportacao, trabalho);
      await ate(() => tentativas === 2, tempos.entregaMs + tempos.reentregaMs);
      // e não é entregue uma terceira vez depois de dar certo
      await esperar(Math.min(1500, tempos.reentregaMs));
      expect(tentativas).toBe(2);
    });

    it('uma conta por vez: dois trabalhos da mesma conta nunca rodam ao mesmo tempo; os de outra conta não esperam por ela', async () => {
      const [contaLenta, contaRapida] = [randomUUID(), randomUUID()];
      let rodando = 0;
      let maximo = 0;
      const ordem: string[] = [];
      tratadores.set(contaLenta, async (t) => {
        rodando++;
        maximo = Math.max(maximo, rodando);
        await esperar(700);
        rodando--;
        ordem.push(`lenta:${t.id}`);
      });
      tratadores.set(contaRapida, async () => void ordem.push('rapida'));
      const [um, dois] = [randomUUID(), randomUUID()];
      await barramento.publicar(FILAS.exportacao, { contaId: contaLenta, id: um });
      await barramento.publicar(FILAS.exportacao, { contaId: contaLenta, id: dois });
      await barramento.publicar(FILAS.exportacao, { contaId: contaRapida, id: randomUUID() });
      await ate(() => ordem.length === 3, tempos.entregaMs * 3 + 1400);
      expect(maximo).toBe(1);
      expect(ordem.filter((o) => o.startsWith('lenta')).sort()).toEqual([`lenta:${um}`, `lenta:${dois}`].sort());
      // a conta rápida não ficou atrás dos dois trabalhos da conta lenta
      expect(ordem.indexOf('rapida')).toBeLessThan(2);
    });
  });

  describe(`contrato de BarramentoDeEventos: ${nome} (a vez da conta)`, () => {
    // Medido em 2026-10-01: com a exclusão por conta feita pela própria fila, o trabalho seguinte de uma
    // conta ficou 123 s parado. A fila guardava "esta conta tem trabalho ativo" numa estatística que só
    // é refeita a cada minuto, e o consumidor que subiu logo depois acreditou nela.
    it('terminado um trabalho, o seguinte da mesma conta é entregue logo, mesmo a um consumidor que acabou de subir', async () => {
      const conta = randomUUID();
      const [um, dois] = [randomUUID(), randomUUID()];
      const terminados: string[] = [];
      const tratar = async (t: Trabalho) => {
        if (t.contaId !== conta) return;
        // tempo bastante para a manutenção da fila (1 s neste teste) passar com o trabalho rodando
        if (t.id === um) await esperar(2500);
        terminados.push(t.id);
      };

      const primeiro = await criar();
      await primeiro.barramento.iniciar();
      await primeiro.barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, tratar);
      await primeiro.barramento.publicar(FILAS.exportacao, { contaId: conta, id: um });
      await ate(() => terminados.length === 1, tempos.entregaMs + 2500);
      await primeiro.barramento.parar();
      await primeiro.limpar();

      const segundo = await criar();
      await segundo.barramento.iniciar();
      await segundo.barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, tratar);
      await segundo.barramento.publicar(FILAS.exportacao, { contaId: conta, id: dois });
      await ate(() => terminados.length === 2, tempos.entregaMs);
      expect(terminados).toEqual([um, dois]);
      await segundo.barramento.parar();
      await segundo.limpar();
    });
  });

  describe(`contrato de BarramentoDeEventos: ${nome} (trabalho com hora marcada)`, () => {
    it('publicado para depois, só é entregue depois da hora; as filas não se misturam', async () => {
      const { barramento, limpar } = await criar();
      await barramento.iniciar();
      const trabalho = { contaId: randomUUID(), id: randomUUID() };
      const naLimpeza: Trabalho[] = [];
      const naExportacao: Trabalho[] = [];
      await barramento.consumir(FILAS.limpezaDeExportacao, { concorrencia: 1 }, async (t) => void (t.contaId === trabalho.contaId && naLimpeza.push(t)));
      await barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, async (t) => void (t.contaId === trabalho.contaId && naExportacao.push(t)));
      const hora = new Date(Date.now() + 2500);
      await barramento.publicar(FILAS.limpezaDeExportacao, trabalho, { naoAntesDe: hora });
      await esperar(1500);
      expect(naLimpeza).toEqual([]);
      await ate(() => naLimpeza.length === 1, 1500 + tempos.entregaMs);
      expect(Date.now()).toBeGreaterThanOrEqual(hora.getTime() - 50);
      expect(naLimpeza).toEqual([trabalho]);
      expect(naExportacao).toEqual([]);
      await barramento.parar();
      await limpar();
    });
  });

  describe(`contrato de BarramentoDeEventos: ${nome} (mais de um worker)`, () => {
    it('responde: diz se a fila está no ar, antes e depois de parar', async () => {
      const { barramento, limpar } = await criar();
      expect(await barramento.responde()).toBe(false);
      await barramento.iniciar();
      expect(await barramento.responde()).toBe(true);
      await barramento.parar();
      expect(await barramento.responde()).toBe(false);
      await limpar();
    });

    it('quem trata pode adiar: o trabalho volta mais tarde, quantas vezes for preciso, sem contar como falha', async () => {
      const { barramento, limpar } = await criar();
      await barramento.iniciar();
      const trabalho = { contaId: randomUUID(), id: randomUUID() };
      const entregas: number[] = [];
      await barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, async (t) => {
        if (t.contaId !== trabalho.contaId) return undefined;
        entregas.push(Date.now());
        return entregas.length < 4 ? 'adiar' : undefined;
      });
      await barramento.publicar(FILAS.exportacao, trabalho);
      await ate(() => entregas.length === 4, tempos.entregaMs + 3 * (tempos.adiamentoMs + tempos.entregaMs));
      // adiado não volta na hora: espera o intervalo de reentrega
      expect((entregas[1] as number) - (entregas[0] as number)).toBeGreaterThanOrEqual(tempos.adiamentoMs * 0.8);
      await esperar(Math.min(1500, tempos.adiamentoMs + 500));
      expect(entregas).toHaveLength(4);
      await barramento.parar();
      await limpar();
    });

    it('justiça entre contas: com um trabalho por vez, o primeiro de uma conta passa na frente do terceiro de outra', async () => {
      const { barramento, limpar } = await criar();
      await barramento.iniciar();
      const [contaCheia, contaNova] = [randomUUID(), randomUUID()];
      const ordem: string[] = [];
      // tudo é publicado antes de haver consumidor: a ordem de saída é só da fila
      for (let posicao = 0; posicao < 3; posicao++) await barramento.publicar(FILAS.exportacao, { contaId: contaCheia, id: randomUUID() }, { jaNaFilaDaConta: posicao });
      await barramento.publicar(FILAS.exportacao, { contaId: contaNova, id: randomUUID() }, { jaNaFilaDaConta: 0 });
      await barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, async (t) => {
        if (t.contaId === contaCheia) ordem.push('cheia');
        if (t.contaId === contaNova) ordem.push('nova');
        return undefined;
      });
      await ate(() => ordem.length === 4, tempos.entregaMs * 4);
      // a conta nova não fica atrás dos três da conta cheia: sai até a segunda posição
      expect(ordem.indexOf('nova')).toBeLessThanOrEqual(1);
      await barramento.parar();
      await limpar();
    });
  });

  describe(`contrato de BarramentoDeEventos: ${nome} (desligamento)`, () => {
    it('parar espera o trabalho em curso terminar', async () => {
      const { barramento, limpar } = await criar();
      await barramento.iniciar();
      const trabalho = { contaId: randomUUID(), id: randomUUID() };
      let comecou = false;
      let terminou = false;
      await barramento.consumir(FILAS.exportacao, { concorrencia: 1 }, async (t) => {
        if (t.contaId !== trabalho.contaId) return;
        comecou = true;
        await esperar(600);
        terminou = true;
      });
      await barramento.publicar(FILAS.exportacao, trabalho);
      await ate(() => comecou, tempos.entregaMs);
      await barramento.parar();
      expect(terminou).toBe(true);
      await limpar();
    });
  });
}
