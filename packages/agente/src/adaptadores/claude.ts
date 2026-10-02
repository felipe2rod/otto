// Adaptador de ModeloDoAgente: Claude pela DigitalOcean (Serverless Inference), no formato Messages da
// Anthropic. É o único arquivo do pacote que conhece fornecedor (ADR 020).
//
// O que foi medido com a conta do Felipe (2026-09-29 e 2026-10-02) e decide a forma deste arquivo:
// - Claude só lê imagem pelo /v1/messages; no formato de chat completions ele recusa imagem;
// - ferramenta e imagem na mesma mensagem funcionam, com a imagem como bloco irmão do tool_result;
// - o cache_control no topo do pedido é ignorado: só marca explícita em bloco grava e lê cache. Sem as
//   marcas do histórico, uma peça custou R$ 11 (45% de cache); com elas, 97% de cache;
// - $ref e $defs no esquema de ferramenta não economizam token: a API expande antes de contar;
// - limites da conta: 120 pedidos por minuto, 1,5 milhão de tokens por minuto e 45 milhões por dia. O limite
//   diário não volta esperando: vira erro com código próprio, na hora.
//
// Veio de poc/src/servidor/modelo.ts (criarModeloClaudeDigitalOcean).
import Anthropic from '@anthropic-ai/sdk';
import {
  ErroDoModelo,
  type MensagemDoModelo,
  type ModeloDoAgente,
  type ParteDeConteudo,
  type PedidoAoModelo,
  type PrecoDoModelo,
  type Raciocinio,
  type RespostaDoModelo,
  type TipoDeImagem,
} from '../portas';

export const ENDERECO_PADRAO = 'https://inference.do-ai.run';
/** Sonnet 5 (ADR 029, item 4). O id é o do fornecedor; na Anthropic é claude-sonnet-5. */
export const MODELO_PADRAO = 'anthropic-claude-5-sonnet';

/**
 * Dólar por milhão de tokens (docs/tecnico/custos.md, seção 3: igual ao preço da Anthropic; escrita de cache
 * de 5 minutos a 1,25× a entrada). Modelo fora da tabela fica sem preço, e o ciclo perde só o teto em dinheiro.
 */
export const PRECOS: Record<string, PrecoDoModelo> = {
  'anthropic-claude-5-sonnet': { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 },
  'anthropic-claude-sonnet-5.5': { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 },
  'anthropic-claude-opus-5.5': { entrada: 4, saida: 20, cacheLido: 0.2, cacheCriado: 5 },
  'anthropic-claude-haiku-4.5': { entrada: 1, saida: 5, cacheLido: 0.1, cacheCriado: 1.25 },
};

/** O modelo que raciocina muito numa chamada passa de 5 minutos sem mandar cabeçalho (POC, 2026-09-28). */
const LIMITE_DA_CHAMADA_MS = 15 * 60 * 1000;
const SAIDA_MAXIMA = 32000;
/** Abaixo disso, o limite diário está esgotado para efeito prático: uma chamada do ciclo não cabe. */
const RESTO_MINIMO_DO_DIA = 200_000;
const TENTATIVAS_NO_LIMITE_DE_TAXA = 5;

const ESFORCO: Record<Raciocinio, 'low' | 'medium' | 'high'> = { baixo: 'low', medio: 'medium', alto: 'high' };

type Bloco = Anthropic.ContentBlockParam;

/** Tipo pela assinatura do arquivo em base64. O Claude recusa quando o tipo declarado não bate com o arquivo. */
export function tipoDaImagem(base64: string): TipoDeImagem | undefined {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return undefined;
}

const blocoDaParte = (p: ParteDeConteudo): Bloco =>
  p.tipo === 'texto' ? { type: 'text', text: p.texto } : { type: 'image', source: { type: 'base64', media_type: tipoDaImagem(p.base64) ?? p.mime, data: p.base64 } };

/**
 * O histórico do ciclo no formato Messages. Resposta de ferramenta vira tool_result na mensagem do usuário,
 * seguida das imagens que a acompanham. A resposta do assistente volta com os blocos originais (`opaco`),
 * para o raciocínio ir intacto na chamada seguinte.
 */
export function paraMensagensDoClaude(mensagens: readonly MensagemDoModelo[]): Anthropic.MessageParam[] {
  const saida: Anthropic.MessageParam[] = [];
  const doUsuario = (blocos: Bloco[]) => {
    const ultima = saida.at(-1);
    if (ultima?.role === 'user' && Array.isArray(ultima.content)) ultima.content.push(...blocos);
    else saida.push({ role: 'user', content: blocos });
  };
  for (const m of mensagens) {
    if (m.papel === 'usuario') doUsuario(m.partes.map(blocoDaParte));
    else if (m.papel === 'ferramentas')
      doUsuario([...m.resultados.map((r): Bloco => ({ type: 'tool_result', tool_use_id: r.idDaChamada, content: r.texto, ...(r.erro ? { is_error: true } : {}) })), ...m.anexos.map(blocoDaParte)]);
    else {
      const blocos =
        Array.isArray(m.opaco) && m.opaco.length
          ? (m.opaco as Bloco[])
          : [...(m.texto ? [{ type: 'text' as const, text: m.texto }] : []), ...m.chamadas.map((c): Bloco => ({ type: 'tool_use', id: c.id, name: c.nome, input: c.argumentos }))];
      saida.push({ role: 'assistant', content: blocos.length ? blocos : [{ type: 'text', text: '(sem resposta)' }] });
    }
  }
  return saida;
}

/**
 * Marca explícita no fim da última mensagem (grava o histórico até aqui) e no fim da mensagem do usuário
 * anterior (lê o que a chamada passada gravou, mesmo que o passo novo tenha mais de 20 blocos).
 * Devolve cópias: os blocos do assistente são os mesmos objetos que o ciclo guarda.
 */
export function marcarHistoricoParaCache(mensagens: readonly Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const saida = [...mensagens];
  const marcar = (i: number) => {
    const m = saida[i];
    if (!m || !Array.isArray(m.content) || m.content.length === 0) return;
    const ultimo = m.content.at(-1) as Bloco;
    if (ultimo.type === 'thinking' || ultimo.type === 'redacted_thinking') return;
    saida[i] = { ...m, content: [...m.content.slice(0, -1), { ...ultimo, cache_control: { type: 'ephemeral' } } as Bloco] };
  };
  const doUsuario = saida.flatMap((m, i) => (m.role === 'user' ? [i] : []));
  marcar(saida.length - 1);
  const anterior = doUsuario.at(-2);
  if (anterior !== undefined && anterior !== saida.length - 1) marcar(anterior);
  return saida;
}

/** O corpo do pedido. Quatro marcas de cache no máximo: ferramentas, prefixo do sistema e duas no histórico. */
export function paraPedidoDoClaude(pedido: PedidoAoModelo, modelo: string): Anthropic.MessageStreamParams {
  const tools: Anthropic.Tool[] = pedido.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.parametros as Anthropic.Tool.InputSchema }));
  const ultima = tools.at(-1);
  if (ultima) tools[tools.length - 1] = { ...ultima, cache_control: { type: 'ephemeral' } };
  return {
    model: modelo,
    max_tokens: SAIDA_MAXIMA,
    // só o primeiro bloco é o prefixo estável; o resto (nível de esforço, fontes da conta) fica depois da marca
    system: pedido.sistema.map((text, i) => ({ type: 'text' as const, text, ...(i === 0 ? { cache_control: { type: 'ephemeral' as const } } : {}) })),
    messages: marcarHistoricoParaCache(paraMensagensDoClaude(pedido.mensagens)),
    ...(tools.length ? { tools } : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: ESFORCO[pedido.raciocinio] },
  };
}

/** O que o adaptador usa do cliente do SDK. Os testes passam um falso. */
export interface ClienteDeMensagens {
  messages: { stream(params: Anthropic.MessageStreamParams, opcoes?: { signal?: AbortSignal }): { finalMessage(): Promise<Pick<Anthropic.Message, 'content' | 'stop_reason' | 'usage'>> } };
}

export interface OpcoesDoModeloClaude {
  /** Chave do fornecedor. Vem de variável de ambiente, por quem monta o adaptador; nunca é escrita em log. */
  chave: string;
  modelo?: string;
  endereco?: string;
  /** Avisado a cada resposta que traz o cabeçalho de limite: quanto resta do limite diário de tokens. */
  aoVerLimites?(limites: { restamNoDia?: number }): void;
  /** Só para teste. */
  cliente?: ClienteDeMensagens;
  /** Só para teste: como esperar antes de tentar de novo no limite de taxa. */
  esperar?(ms: number, sinal?: AbortSignal): Promise<void>;
}

function esperarComTemporizador(ms: number, sinal?: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const t = setTimeout(resolver, ms);
    sinal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolver();
      },
      { once: true },
    );
  });
}

function erroDoFornecedor(e: unknown, sinal?: AbortSignal): ErroDoModelo {
  if (e instanceof ErroDoModelo) return e;
  if (sinal?.aborted || e instanceof Anthropic.APIUserAbortError) return new ErroDoModelo('cancelada', 'chamada ao modelo cancelada');
  const detalhe = e instanceof Error ? e.message : String(e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new ErroDoModelo('credencial', `o fornecedor recusou a credencial ou o acesso ao modelo (HTTP ${e.status})`, detalhe);
  if (e instanceof Anthropic.RateLimitError) return new ErroDoModelo('limite_de_taxa', 'limite de taxa do fornecedor (HTTP 429)', detalhe);
  if (e instanceof Anthropic.APIConnectionError) return new ErroDoModelo('rede', 'sem conexão com o fornecedor de inferência', detalhe);
  if (e instanceof Anthropic.APIError) return new ErroDoModelo(e.status !== undefined && e.status >= 500 ? 'rede' : 'pedido_invalido', `o fornecedor respondeu HTTP ${e.status ?? '?'}`, detalhe);
  return new ErroDoModelo('desconhecido', 'falha sem código na chamada ao modelo', detalhe);
}

export interface ModeloClaude extends ModeloDoAgente {
  /** Lê os cabeçalhos de limite de uma resposta. Exposto para o cliente HTTP do adaptador e para teste. */
  observarCabecalhos?(cabecalhos: Headers): void;
}

export function criarModeloClaude(opcoes: OpcoesDoModeloClaude): ModeloClaude {
  const modelo = opcoes.modelo ?? MODELO_PADRAO;
  const esperar = opcoes.esperar ?? esperarComTemporizador;
  const observarCabecalhos = (cabecalhos: Headers) => {
    const resto = Number(cabecalhos.get('x-ratelimit-remaining-tokens-per-day') ?? Number.NaN);
    if (Number.isFinite(resto)) opcoes.aoVerLimites?.({ restamNoDia: resto });
  };
  const cliente: ClienteDeMensagens =
    opcoes.cliente ??
    new Anthropic({
      apiKey: opcoes.chave,
      baseURL: opcoes.endereco ?? ENDERECO_PADRAO,
      timeout: LIMITE_DA_CHAMADA_MS,
      maxRetries: 3,
      fetch: async (entrada, init) => {
        const resposta = await fetch(entrada, init);
        observarCabecalhos(resposta.headers);
        return resposta;
      },
    });
  const preco = PRECOS[modelo];

  return {
    nome: modelo,
    // medido em 2026-09-29: ferramenta, imagem e cache funcionam com Claude por este caminho
    capacidades: { imagem: true, ferramentas: true, cache: true },
    ...(preco ? { preco } : {}),
    observarCabecalhos,
    async responder(pedido): Promise<RespostaDoModelo> {
      const corpo = paraPedidoDoClaude(pedido, modelo);
      for (let tentativa = 0; ; tentativa++) {
        try {
          const r = await cliente.messages.stream(corpo, pedido.sinal ? { signal: pedido.sinal } : {}).finalMessage();
          if (r.stop_reason === 'refusal') throw new ErroDoModelo('recusa', 'o modelo recusou a chamada');
          const u = r.usage;
          return {
            texto: r.content
              .flatMap((b) => (b.type === 'text' ? [b.text] : []))
              .join('\n')
              .trim(),
            chamadas: r.content.flatMap((b) =>
              b.type === 'tool_use' ? [{ id: b.id, nome: b.name, argumentos: b.input && typeof b.input === 'object' && !Array.isArray(b.input) ? (b.input as Record<string, unknown>) : {} }] : [],
            ),
            opaco: r.content,
            uso: { entrada: u.input_tokens, cacheLido: u.cache_read_input_tokens ?? 0, cacheCriado: u.cache_creation_input_tokens ?? 0, saida: u.output_tokens },
            parada: r.stop_reason === 'tool_use' ? 'ferramentas' : r.stop_reason === 'max_tokens' ? 'limite-de-saida' : 'fim',
          };
        } catch (e) {
          if (!(e instanceof Anthropic.RateLimitError) || pedido.sinal?.aborted) throw erroDoFornecedor(e, pedido.sinal);
          // o limite diário só volta no dia seguinte: esperar não adianta, e a tarefa precisa saber por quê parou
          const restoDoDia = Number(e.headers?.get('x-ratelimit-remaining-tokens-per-day') ?? Number.NaN);
          if (Number.isFinite(restoDoDia) && restoDoDia < RESTO_MINIMO_DO_DIA) throw new ErroDoModelo('limite_diario', 'limite diário de tokens do fornecedor esgotado', e.message);
          if (tentativa >= TENTATIVAS_NO_LIMITE_DE_TAXA) throw erroDoFornecedor(e, pedido.sinal);
          const pedida = Number(e.headers?.get('retry-after'));
          await esperar(Number.isFinite(pedida) && pedida > 0 ? pedida * 1000 : Math.min(120_000, 15_000 * 2 ** tentativa), pedido.sinal);
        }
      }
    },
  };
}
