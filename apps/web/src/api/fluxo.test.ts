// O fluxo de eventos da tarefa (text/event-stream), lido por fetch: o editor precisa mandar
// Last-Event-ID já na primeira conexão, e o EventSource do navegador não deixa.
import { describe, expect, it } from 'vitest';
import { criarLeitorDeFluxo, lerFluxo } from './fluxo';

describe('leitor do fluxo de eventos', () => {
  it('devolve cada evento completo, com id, tipo e dado já lido do JSON', () => {
    const ler = criarLeitorDeFluxo();
    const eventos = ler('retry: 2000\n\nid: 10\nevent: mensagem\ndata: {"tipo":"mensagem","texto":"oi"}\n\nevent: fim\ndata: {"estado":"aceita"}\n\n');
    expect(eventos).toEqual([
      { id: 10, evento: 'mensagem', dados: { tipo: 'mensagem', texto: 'oi' } },
      { evento: 'fim', dados: { estado: 'aceita' } },
    ]);
  });

  it('evento partido entre dois pedaços da rede só sai quando chega inteiro', () => {
    const ler = criarLeitorDeFluxo();
    expect(ler('id: 3\nevent: etapa\ndata: {"tipo":"eta')).toEqual([]);
    expect(ler('pa","etapa":"leitura"}\n')).toEqual([]);
    expect(ler('\n')).toEqual([{ id: 3, evento: 'etapa', dados: { tipo: 'etapa', etapa: 'leitura' } }]);
  });

  it('batimento (comentário), linha de retry e dado que não é JSON não viram evento', () => {
    const ler = criarLeitorDeFluxo();
    expect(ler(': batimento\n\nretry: 2000\n\nevent: lixo\ndata: {não é json\n\n')).toEqual([]);
  });

  it('aceita fim de linha com CRLF e dado em várias linhas', () => {
    const ler = criarLeitorDeFluxo();
    expect(ler('id: 1\r\nevent: x\r\ndata: {"a":\r\ndata: 1}\r\n\r\n')).toEqual([{ id: 1, evento: 'x', dados: { a: 1 } }]);
  });
});

describe('ler o fluxo de uma resposta', () => {
  const resposta = (pedacos: string[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controle) {
          for (const p of pedacos) controle.enqueue(new TextEncoder().encode(p));
          controle.close();
        },
      }),
    );

  it('entrega os eventos na ordem e diz se o servidor encerrou com "fim"', async () => {
    const recebidos: string[] = [];
    const comFim = await lerFluxo(resposta(['id: 1\nevent: etapa\ndata: {"tipo":"etapa"}\n\nevent: fim\nda', 'ta: {"estado":"em_revisao"}\n\n']), (e) => recebidos.push(e.evento));
    expect(recebidos).toEqual(['etapa', 'fim']);
    expect(comFim).toBe(true);
  });

  it('conexão que fecha sem "fim" não é fim: quem chamou reconecta', async () => {
    expect(await lerFluxo(resposta(['id: 1\nevent: etapa\ndata: {"tipo":"etapa"}\n\n']), () => undefined)).toBe(false);
  });
});
