import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CorpoGrandeDemais, CorpoInterrompido, lerCorpoComTeto } from './ler-corpo';

function pedido(cabecalhos: Record<string, string> = {}): { req: IncomingMessage; fluxo: PassThrough } {
  const fluxo = new PassThrough();
  return { req: Object.assign(fluxo, { headers: cabecalhos }) as unknown as IncomingMessage, fluxo };
}
const resposta = () => {
  const cabecalhos: Record<string, string> = {};
  return {
    cabecalhos,
    setHeader: (nome: string, valor: string) => {
      cabecalhos[nome] = valor;
      return undefined as never;
    },
  };
};

describe('lerCorpoComTeto', () => {
  it('com o tamanho declarado, devolve os bytes num bloco só', async () => {
    const { req, fluxo } = pedido({ 'content-length': '6' });
    const lendo = lerCorpoComTeto(req, resposta(), 10);
    fluxo.write(Buffer.from('abc'));
    fluxo.end(Buffer.from('def'));
    expect((await lendo).toString()).toBe('abcdef');
  });

  it('sem o tamanho declarado, junta os pedaços', async () => {
    const { req, fluxo } = pedido();
    const lendo = lerCorpoComTeto(req, resposta(), 10);
    fluxo.write(Buffer.from('abc'));
    fluxo.end(Buffer.from('de'));
    expect((await lendo).toString()).toBe('abcde');
  });

  it('tamanho declarado um pouco acima do teto: recusa na hora e joga fora o resto do envio, sem derrubar a conexão', async () => {
    const { req, fluxo } = pedido({ 'content-length': '11' });
    const res = resposta();
    await expect(lerCorpoComTeto(req, res, 10)).rejects.toMatchObject({ name: 'CorpoGrandeDemais', limiteEmBytes: 10 });
    expect(res.cabecalhos.Connection).toBeUndefined();
    // quem mandou recebe a resposta: o resto é lido e descartado
    fluxo.write(Buffer.alloc(11));
    await new Promise((ok) => setImmediate(ok));
    expect(fluxo.destroyed).toBe(false);
    expect(fluxo.readableLength).toBe(0);
  });

  it('tamanho declarado muito acima do teto: recusa, não lê nada e pede o fechamento da conexão', async () => {
    const { req, fluxo } = pedido({ 'content-length': '1000' });
    const res = resposta();
    await expect(lerCorpoComTeto(req, res, 10)).rejects.toBeInstanceOf(CorpoGrandeDemais);
    expect(res.cabecalhos.Connection).toBe('close');
    expect(fluxo.listenerCount('data')).toBe(0);
    expect(fluxo.isPaused()).toBe(true);
  });

  it('sem tamanho declarado, para de guardar quando passa do teto, e derruba a conexão se o envio não acaba', async () => {
    const { req, fluxo } = pedido();
    const res = resposta();
    const lendo = lerCorpoComTeto(req, res, 10);
    fluxo.write(Buffer.alloc(8));
    fluxo.write(Buffer.alloc(8));
    await expect(lendo).rejects.toBeInstanceOf(CorpoGrandeDemais);
    fluxo.write(Buffer.alloc(15));
    await new Promise((ok) => setImmediate(ok));
    expect(fluxo.destroyed).toBe(false);
    fluxo.write(Buffer.alloc(15));
    await new Promise((ok) => setImmediate(ok));
    expect(fluxo.destroyed).toBe(true);
  });

  it('quem declara pouco e manda muito é recusado no que passar do declarado', async () => {
    const { req, fluxo } = pedido({ 'content-length': '4' });
    const lendo = lerCorpoComTeto(req, resposta(), 100);
    fluxo.write(Buffer.alloc(8));
    await expect(lendo).rejects.toBeInstanceOf(CorpoGrandeDemais);
  });

  it('envio que termina antes do declarado, ou conexão que cai: interrompido', async () => {
    const curto = pedido({ 'content-length': '10' });
    const lendo = lerCorpoComTeto(curto.req, resposta(), 100);
    curto.fluxo.end(Buffer.alloc(3));
    await expect(lendo).rejects.toBeInstanceOf(CorpoInterrompido);
    const caiu = pedido();
    const outro = lerCorpoComTeto(caiu.req, resposta(), 100);
    caiu.fluxo.emit('aborted');
    await expect(outro).rejects.toBeInstanceOf(CorpoInterrompido);
  });
});
