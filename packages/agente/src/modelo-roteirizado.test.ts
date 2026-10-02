import { describe, expect, it } from 'vitest';
import { comGravacao, criarModeloRoteirizado, idsDoRoteiro } from './modelo-roteirizado';
import { ErroDoModelo, type PedidoAoModelo } from './portas';

const pedido = (papel: PedidoAoModelo['papel'] = 'agente', sinal?: AbortSignal): PedidoAoModelo => ({
  papel,
  sistema: ['s'],
  mensagens: [{ papel: 'usuario', partes: [{ tipo: 'texto', texto: 'oi' }] }],
  ferramentas: [],
  raciocinio: 'medio',
  ...(sinal ? { sinal } : {}),
});

describe('modelo roteirizado', () => {
  it('responde os passos na ordem, com id em cada chamada de ferramenta', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'vou fazer' }, { chamadas: [{ nome: 'verificar', argumentos: {} }] }] });
    expect(await m.responder(pedido())).toMatchObject({ texto: 'vou fazer', chamadas: [], parada: 'fim' });
    const r = await m.responder(pedido());
    expect(r.parada).toBe('ferramentas');
    expect(r.chamadas).toEqual([{ id: 'chamada-2-1', nome: 'verificar', argumentos: {} }]);
    expect(m.restantes()).toBe(0);
  });

  it('guarda o que recebeu, para o teste conferir o que o modelo viu', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a' }] });
    await m.responder(pedido('diretor'));
    expect(m.pedidos).toHaveLength(1);
    expect(m.pedidos[0]?.papel).toBe('diretor');
  });

  it('passo pode ser função do pedido', async () => {
    const m = criarModeloRoteirizado({ passos: [(p) => ({ texto: `papel ${p.papel}` })] });
    expect((await m.responder(pedido('revisor'))).texto).toBe('papel revisor');
  });

  it('acusa roteiro fora de sincronia e roteiro que acabou, com código', async () => {
    const m = criarModeloRoteirizado({ passos: [{ papel: 'diretor', texto: '{}' }] });
    await expect(m.responder(pedido('agente'))).rejects.toMatchObject({ codigo: 'resposta_invalida' });
    await expect(m.responder(pedido('agente'))).rejects.toBeInstanceOf(ErroDoModelo);
  });

  it('falha roteirizada sai com o código pedido', async () => {
    const m = criarModeloRoteirizado({ passos: [{ erro: 'rede' }] });
    await expect(m.responder(pedido())).rejects.toMatchObject({ codigo: 'rede' });
  });

  it('com velocidade, espera o tempo da gravação; o cancelamento interrompe a espera', async () => {
    const esperas: number[] = [];
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 8000 }] }, { velocidade: 0.5, esperar: async (ms) => void esperas.push(ms) });
    await m.responder(pedido());
    expect(esperas).toEqual([4000]);

    const controle = new AbortController();
    const lento = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 60_000 }] }, { velocidade: 1 });
    const resposta = lento.responder(pedido('agente', controle.signal));
    controle.abort();
    await expect(resposta).rejects.toMatchObject({ codigo: 'cancelada' });
  });

  it('sem velocidade, não espera nada', async () => {
    const m = criarModeloRoteirizado({ passos: [{ texto: 'a', duracaoMs: 60_000 }] }, { esperar: async () => Promise.reject(new Error('não devia esperar')) });
    expect((await m.responder(pedido())).texto).toBe('a');
  });
});

describe('gravação de roteiro', () => {
  it('grava texto, chamadas, uso e duração de cada resposta, e o roteiro gravado reproduz as mesmas respostas', async () => {
    let t = 0;
    const original = criarModeloRoteirizado({
      passos: [{ texto: 'plano', uso: { entrada: 10, saida: 5 } }, { chamadas: [{ nome: 'entregar', argumentos: { resumo: 'fiz', pendencias: [] }, id: 'x1' }] }],
    });
    const g = comGravacao(original, () => (t += 1500));
    await g.modelo.responder(pedido('agente'));
    await g.modelo.responder(pedido('agente'));
    const passos = g.passos();
    expect(passos).toEqual([
      { papel: 'agente', texto: 'plano', uso: { entrada: 10, cacheLido: 0, cacheCriado: 0, saida: 5 }, duracaoMs: 1500 },
      { papel: 'agente', chamadas: [{ id: 'x1', nome: 'entregar', argumentos: { resumo: 'fiz', pendencias: [] } }], uso: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 }, duracaoMs: 1500 },
    ]);
    const replay = criarModeloRoteirizado({ passos });
    expect((await replay.responder(pedido('agente'))).texto).toBe('plano');
    expect((await replay.responder(pedido('agente'))).chamadas[0]?.id).toBe('x1');
  });

  it('os ids da gravação voltam na mesma ordem', () => {
    const novoId = idsDoRoteiro({ ids: ['a', 'b'] });
    expect([novoId(), novoId()]).toEqual(['a', 'b']);
    expect(novoId()).toMatch(/^0199ffff-/);
  });
});
