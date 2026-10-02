// O adaptador do Claude sem rede: a conversão do histórico, as marcas de cache e o mapa de erros.
// A chamada de verdade é medida pelo comando de avaliação (avaliacao/), não por teste unitário.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { MensagemDoModelo, PedidoAoModelo } from '../portas';
import { type ClienteDeMensagens, criarModeloClaude, MODELO_PADRAO, marcarHistoricoParaCache, paraMensagensDoClaude, paraPedidoDoClaude, tipoDaImagem } from './claude';

const historico: MensagemDoModelo[] = [
  { papel: 'usuario', partes: [{ tipo: 'texto', texto: 'tarefa' }] },
  { papel: 'assistente', texto: 'vou olhar', chamadas: [{ id: 't1', nome: 'renderizar', argumentos: { prancheta: 'Feed' } }] },
  {
    papel: 'ferramentas',
    resultados: [{ idDaChamada: 't1', texto: 'render anexado' }],
    anexos: [
      { tipo: 'texto', texto: 'Render:' },
      { tipo: 'imagem', mime: 'image/png', base64: '/9j/QUJD' },
    ],
  },
];
const pedido = (extra: Partial<PedidoAoModelo> = {}): PedidoAoModelo => ({
  papel: 'agente',
  sistema: ['prefixo estável', 'contexto da tarefa'],
  mensagens: historico,
  ferramentas: [
    { nome: 'renderizar', descricao: 'd', parametros: { type: 'object', properties: {} } },
    { nome: 'entregar', descricao: 'd', parametros: { type: 'object', properties: {} } },
  ],
  raciocinio: 'medio',
  ...extra,
});

describe('histórico do ciclo para o formato de mensagens', () => {
  it('resposta de ferramenta e imagens do render vão na mesma mensagem do usuário, resultado primeiro', () => {
    const m = paraMensagensDoClaude(historico);
    expect(m).toHaveLength(3);
    expect(m[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'vou olhar' },
        { type: 'tool_use', id: 't1', name: 'renderizar', input: { prancheta: 'Feed' } },
      ],
    });
    expect(m[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'render anexado' },
        { type: 'text', text: 'Render:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/QUJD' } },
      ],
    });
  });

  it('o tipo da imagem sai da assinatura do arquivo, não do que foi declarado', () => {
    expect(tipoDaImagem('iVBORw0KGgoAAAA')).toBe('image/png');
    expect(tipoDaImagem('/9j/4AAQ')).toBe('image/jpeg');
    expect(tipoDaImagem('UklGRiQAAABXRUJQ')).toBe('image/webp');
    expect(tipoDaImagem('xxxx')).toBeUndefined();
  });

  it('resultado com erro leva a marca de erro', () => {
    const m = paraMensagensDoClaude([{ papel: 'ferramentas', resultados: [{ idDaChamada: 't1', texto: 'Lote recusado', erro: true }], anexos: [] }]);
    expect(m[0]?.content).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'Lote recusado', is_error: true }]);
  });

  it('devolve os blocos originais do assistente, com o raciocínio, quando o ciclo os guardou', () => {
    const blocos = [
      { type: 'thinking', thinking: '', signature: 'x' },
      { type: 'text', text: 'oi' },
    ];
    const m = paraMensagensDoClaude([
      { papel: 'usuario', partes: [{ tipo: 'texto', texto: 'a' }] },
      { papel: 'assistente', texto: 'oi', chamadas: [], opaco: blocos },
    ]);
    expect(m[1]).toEqual({ role: 'assistant', content: blocos });
  });

  it('mensagens seguidas do usuário viram uma só', () => {
    const m = paraMensagensDoClaude([
      { papel: 'ferramentas', resultados: [{ idDaChamada: 't1', texto: 'ok' }], anexos: [] },
      { papel: 'usuario', partes: [{ tipo: 'texto', texto: 'continue' }] },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0]?.content).toHaveLength(2);
  });

  it('assistente sem texto e sem chamada ainda vira um bloco: a API recusa conteúdo vazio', () => {
    const m = paraMensagensDoClaude([{ papel: 'assistente', texto: '', chamadas: [] }]);
    expect(m[0]?.content).toEqual([{ type: 'text', text: '(sem resposta)' }]);
  });
});

describe('marcas de cache (o fornecedor ignora a marca no topo do pedido)', () => {
  const marcas = (v: unknown): number => (JSON.stringify(v).match(/"cache_control"/g) ?? []).length;
  const ultimoBloco = (m: { content: unknown } | undefined) => (Array.isArray(m?.content) ? (m.content.at(-1) as { cache_control?: unknown }) : undefined);

  it('marca o fim da última mensagem e o fim da mensagem do usuário anterior, copiando os blocos', () => {
    const m = paraMensagensDoClaude([
      ...historico,
      { papel: 'assistente', texto: 'ok', chamadas: [{ id: 't2', nome: 'verificar', argumentos: {} }] },
      { papel: 'ferramentas', resultados: [{ idDaChamada: 't2', texto: 'sem erro' }], anexos: [] },
    ]);
    const antes = JSON.stringify(m);
    const marcado = marcarHistoricoParaCache(m);
    expect(JSON.stringify(m)).toBe(antes); // não muta o que recebeu
    expect(marcas(marcado)).toBe(2);
    expect(ultimoBloco(marcado[4])?.cache_control).toEqual({ type: 'ephemeral' });
    expect(ultimoBloco(marcado[2])?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('não marca bloco de raciocínio', () => {
    const m = marcarHistoricoParaCache([{ role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }] }]);
    expect(marcas(m)).toBe(0);
  });

  it('o pedido inteiro leva no máximo quatro marcas: ferramentas, prefixo do sistema e duas no histórico', () => {
    const p = paraPedidoDoClaude(pedido(), MODELO_PADRAO);
    expect(marcas(p)).toBe(4);
    expect(marcas(p.tools)).toBe(1);
    expect(((p.tools ?? []) as { cache_control?: unknown }[]).at(-1)?.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.system).toEqual([
      { type: 'text', text: 'prefixo estável', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'contexto da tarefa' },
    ]);
    expect((p as { cache_control?: unknown }).cache_control).toBeUndefined();
  });

  it('sem ferramentas (diretor, revisor), o pedido não manda a lista e marca só o sistema e o histórico', () => {
    const p = paraPedidoDoClaude(pedido({ ferramentas: [], sistema: ['só um bloco'], mensagens: [historico[0] as MensagemDoModelo] }), MODELO_PADRAO);
    expect(p.tools).toBeUndefined();
    expect(marcas(p)).toBe(2);
  });
});

describe('o pedido', () => {
  it('raciocínio adaptativo, com o esforço da chamada; sem escolha forçada de ferramenta', () => {
    const esforco = (r: PedidoAoModelo['raciocinio']) => (paraPedidoDoClaude(pedido({ raciocinio: r }), MODELO_PADRAO) as { output_config?: { effort?: string } }).output_config?.effort;
    expect([esforco('baixo'), esforco('medio'), esforco('alto')]).toEqual(['low', 'medium', 'high']);
    const p = paraPedidoDoClaude(pedido(), MODELO_PADRAO);
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.tool_choice).toBeUndefined();
    expect(p.model).toBe(MODELO_PADRAO);
  });
});

const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 };
function clienteFalso(respostas: (() => unknown)[]): ClienteDeMensagens & { pedidos: unknown[] } {
  const pedidos: unknown[] = [];
  return {
    pedidos,
    messages: {
      stream: (params) => {
        pedidos.push(params);
        const proxima = respostas.shift();
        // o falso devolve o que o teste mandar, inclusive resposta incompleta: é o que se quer exercitar
        return { finalMessage: async () => (proxima ? proxima() : Promise.reject(new Error('sem resposta'))) as never };
      },
    },
  };
}
const erroDaApi = (status: number, cabecalhos: Record<string, string> = {}) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'detalhe do fornecedor' } }, 'detalhe do fornecedor', new Headers(cabecalhos));

describe('a resposta e os erros', () => {
  it('lê texto, chamadas, uso com cache e guarda os blocos para devolver intactos', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Vou montar.' },
      { type: 'tool_use', id: 'tu1', name: 'verificar', input: { prancheta: 'Feed' } },
    ];
    const cliente = clienteFalso([() => ({ content, stop_reason: 'tool_use', usage })]);
    const modelo = criarModeloClaude({ chave: 'x', cliente });
    const r = await modelo.responder(pedido());
    expect(r.texto).toBe('Vou montar.');
    expect(r.chamadas).toEqual([{ id: 'tu1', nome: 'verificar', argumentos: { prancheta: 'Feed' } }]);
    expect(r.uso).toEqual({ entrada: 10, cacheLido: 300, cacheCriado: 40, saida: 20 });
    expect(r.parada).toBe('ferramentas');
    expect(r.opaco).toBe(content);
  });

  it('declara as capacidades medidas e o preço do modelo padrão', () => {
    const modelo = criarModeloClaude({ chave: 'x', cliente: clienteFalso([]) });
    expect(modelo.nome).toBe(MODELO_PADRAO);
    expect(modelo.capacidades).toEqual({ imagem: true, ferramentas: true, cache: true });
    expect(modelo.preco).toEqual({ entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 });
  });

  it('recusa do modelo vira erro com código', async () => {
    const modelo = criarModeloClaude({ chave: 'x', cliente: clienteFalso([() => ({ content: [], stop_reason: 'refusal', usage })]) });
    await expect(modelo.responder(pedido())).rejects.toMatchObject({ codigo: 'recusa' });
  });

  it('limite diário esgotado não espera: falha logo, com código próprio', async () => {
    const cliente = clienteFalso([() => Promise.reject(erroDaApi(429, { 'x-ratelimit-remaining-tokens-per-day': '1200' }))]);
    const modelo = criarModeloClaude({ chave: 'x', cliente, esperar: async () => Promise.reject(new Error('não devia esperar')) });
    await expect(modelo.responder(pedido())).rejects.toMatchObject({ codigo: 'limite_diario' });
  });

  it('limite de taxa espera e tenta de novo; se não passar, falha com código', async () => {
    const esperas: number[] = [];
    const limite = () => Promise.reject(erroDaApi(429, { 'retry-after': '2' }));
    const cliente = clienteFalso([limite, () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage })]);
    const modelo = criarModeloClaude({ chave: 'x', cliente, esperar: async (ms) => void esperas.push(ms) });
    expect((await modelo.responder(pedido())).texto).toBe('ok');
    expect(esperas).toEqual([2000]);

    const sempre = criarModeloClaude({ chave: 'x', cliente: clienteFalso(Array.from({ length: 10 }, () => limite)), esperar: async () => undefined });
    await expect(sempre.responder(pedido())).rejects.toMatchObject({ codigo: 'limite_de_taxa' });
  });

  it('credencial, pedido inválido e falha do serviço têm cada um o seu código, e a mensagem não leva o detalhe do fornecedor', async () => {
    const codigoDe = async (status: number) => {
      const modelo = criarModeloClaude({ chave: 'x', cliente: clienteFalso([() => Promise.reject(erroDaApi(status))]) });
      return modelo.responder(pedido()).then(
        () => 'ok',
        (e: { codigo: string; message: string; detalhe?: string }) => {
          expect(e.message).not.toContain('detalhe do fornecedor');
          expect(e.detalhe).toContain('detalhe do fornecedor');
          return e.codigo;
        },
      );
    };
    expect(await codigoDe(401)).toBe('credencial');
    expect(await codigoDe(403)).toBe('credencial');
    expect(await codigoDe(400)).toBe('pedido_invalido');
    expect(await codigoDe(503)).toBe('rede');
  });

  it('cancelamento vira "cancelada"', async () => {
    const controle = new AbortController();
    controle.abort();
    const modelo = criarModeloClaude({ chave: 'x', cliente: clienteFalso([() => Promise.reject(new Anthropic.APIUserAbortError())]) });
    await expect(modelo.responder(pedido({ sinal: controle.signal }))).rejects.toMatchObject({ codigo: 'cancelada' });
  });

  it('avisa quanto resta do limite diário, quando o fornecedor diz', async () => {
    const vistos: number[] = [];
    const modelo = criarModeloClaude({
      chave: 'x',
      cliente: clienteFalso([() => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage })]),
      aoVerLimites: (l) => void vistos.push(l.restamNoDia ?? -1),
    });
    modelo.observarCabecalhos?.(new Headers({ 'x-ratelimit-remaining-tokens-per-day': '4500000' }));
    expect(vistos).toEqual([4500000]);
  });
});
