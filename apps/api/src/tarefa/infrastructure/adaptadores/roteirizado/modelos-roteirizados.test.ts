import { type EntradaDaTarefa, idsDoRoteiro, type PedidoAoModelo, type Roteiro } from '@otto/agente';
import roteiroDoBriefing from '@otto/agente/roteiros/briefing-dois-formatos.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { contratoDeModelosDoOtto } from '../../../application/modelos-do-otto.contrato';
import { ModelosRoteirizados, roteiroPara } from './modelos-roteirizados';

contratoDeModelosDoOtto('roteirizado', () => new ModelosRoteirizados({ velocidade: 0 }));

const BRIEFING = roteiroDoBriefing.entrada as EntradaDaTarefa;
const pedido = (papel: string) => ({ papel, sistema: '', mensagens: [], ferramentas: [] }) as unknown as PedidoAoModelo;

describe('ModelosRoteirizados', () => {
  it('o roteiro sai do tipo da entrada, nunca do texto dela', () => {
    expect(roteiroPara({ tipo: 'ajuste', pedido: 'qualquer coisa' }).nome).toBe('ajuste-em-qualquer-peca');
    expect(roteiroPara(BRIEFING).nome).toBe('briefing-dois-formatos');
    expect(roteiroPara({ tipo: 'criar', pedido: 'x' }).nome).toBe('criar-uma-peca');
    expect(roteiroPara({ tipo: 'pedido', pedido: 'x' }).nome).toBe('pedido-dois-formatos');
  });

  it('em todo roteiro a primeira parte é o que vem antes da produção: o diretor (briefing e criar) ou o planejador (pedido)', () => {
    const modelos = new ModelosRoteirizados({ velocidade: 0 });
    const partes = (entrada: EntradaDaTarefa) =>
      (['preparo', 'execucao'] as const).map((parte) => (modelos.abrir({ entrada, parte, idsDoPreparo: 0 }).modelo as unknown as { restantes(): number }).restantes());
    expect(partes(BRIEFING)).toEqual([1, 12]);
    expect(partes({ tipo: 'criar', pedido: 'x' })).toEqual([1, 9]);
    expect(partes({ tipo: 'pedido', pedido: 'x' })).toEqual([1, 11]);
    expect(partes({ tipo: 'ajuste', pedido: 'x' })).toEqual([0, 2]);
  });

  it('a primeira parte recebe os passos de antes da execução; a segunda, o resto, numa conversa nova', async () => {
    const modelos = new ModelosRoteirizados({ velocidade: 0 });
    const preparo = modelos.abrir({ entrada: BRIEFING, parte: 'preparo', idsDoPreparo: 0 }).modelo as { restantes?: () => number } & ReturnType<ModelosRoteirizados['abrir']>['modelo'];
    const execucao = modelos.abrir({ entrada: BRIEFING, parte: 'execucao', idsDoPreparo: 0 }).modelo as typeof preparo;
    expect([preparo.restantes?.(), execucao.restantes?.()]).toEqual([1, 12]);
    // o passo da primeira parte é o do diretor; chamado com outro papel, o roteiro acusa a dessincronia
    await expect(preparo.responder(pedido('agente'))).rejects.toMatchObject({ codigo: 'resposta_invalida' });
    expect((await execucao.responder(pedido('agente'))).chamadas[0]?.nome).toBe('aplicarOperacoes');
  });

  it('o ajuste não tem primeira parte com modelo: tudo é execução', () => {
    const modelos = new ModelosRoteirizados({ velocidade: 0 });
    const restantes = (parte: 'preparo' | 'execucao') => (modelos.abrir({ entrada: { tipo: 'ajuste', pedido: 'x' }, parte, idsDoPreparo: 0 }).modelo as unknown as { restantes(): number }).restantes();
    expect([restantes('preparo'), restantes('execucao')]).toEqual([0, 2]);
  });

  it('os ids da segunda parte continuam de onde a primeira parou: são os da gravação, na ordem', () => {
    const daGravacao = idsDoRoteiro(roteiroDoBriefing as Roteiro);
    const gravados = Array.from({ length: 6 }, () => daGravacao());
    const modelos = new ModelosRoteirizados({ velocidade: 0 });
    const primeira = modelos.abrir({ entrada: BRIEFING, parte: 'preparo', idsDoPreparo: 0 });
    expect([primeira.novoId(), primeira.novoId()]).toEqual(gravados.slice(0, 2));
    const segunda = modelos.abrir({ entrada: BRIEFING, parte: 'execucao', idsDoPreparo: 2 });
    expect([segunda.novoId(), segunda.novoId()]).toEqual(gravados.slice(2, 4));
  });
});
