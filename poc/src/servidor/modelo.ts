// Porta ModeloDoAgente (ADR 020, 029): o ciclo do agente não sabe qual modelo responde.
// Dois adaptadores, os dois na DigitalOcean: Chat Completions (Kimi e modelos abertos) e
// Messages da Anthropic (Claude). O Claude só lê imagem pelo /v1/messages (medido em 2026-09-29).
import { request } from 'node:https';
import Anthropic from '@anthropic-ai/sdk';

export type ParteDeConteudo = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type MensagemDoModelo =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ParteDeConteudo[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaDeFerramenta[]; [extra: string]: unknown }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChamadaDeFerramenta {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface DescricaoDeFerramenta {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Uso {
  entrada: number;
  saida: number;
  cacheLido: number;
  /** Tokens escritos no cache: custam 1,25× a entrada comum. */
  cacheCriado?: number;
}

export interface RespostaDoModelo {
  mensagem: Extract<MensagemDoModelo, { role: 'assistant' }>;
  uso: Uso;
}

export interface ModeloDoAgente {
  readonly nome: string;
  readonly capacidades: { imagem: boolean; ferramentas: boolean; cache: boolean };
  responder(mensagens: MensagemDoModelo[], ferramentas: DescricaoDeFerramenta[], sinal?: AbortSignal): Promise<RespostaDoModelo>;
}

export function criarModeloDigitalOcean(chave: string, modelo: string): ModeloDoAgente {
  return {
    nome: modelo,
    // medido em 2026-09-26 com a conta atual: kimi-k3 faz tool calling e lê imagem
    capacidades: { imagem: true, ferramentas: true, cache: false },
    async responder(mensagens, ferramentas, sinal) {
      let ultimoErro = '';
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        const init: RequestInit = {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, messages: mensagens, ...(ferramentas.length ? { tools: ferramentas, tool_choice: 'auto' } : {}), max_tokens: 16000 }),
        };
        let r: { ok: boolean; status: number };
        let texto: string;
        try {
          ({ status: r, texto } = await postar('https://inference.do-ai.run/v1/chat/completions', init, sinal));
        } catch (e) {
          // erro de rede ou chamada longa demais: tenta de novo, a não ser que a tarefa tenha sido cancelada
          if (sinal?.aborted) throw e;
          ultimoErro = `rede: ${e instanceof Error ? e.message : String(e)}`;
          await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
          continue;
        }
        if (r.ok) {
          const j = JSON.parse(texto) as {
            choices: Array<{ message: RespostaDoModelo['mensagem'] }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; cache_read_input_tokens?: number };
          };
          const m = j.choices[0]?.message;
          if (!m) throw new Error('resposta do modelo sem mensagem');
          return { mensagem: { ...m, role: 'assistant' }, uso: { entrada: j.usage?.prompt_tokens ?? 0, saida: j.usage?.completion_tokens ?? 0, cacheLido: j.usage?.cache_read_input_tokens ?? 0 } };
        }
        ultimoErro = `${r.status}: ${texto.slice(0, 300)}`;
        if (r.status < 500 && r.status !== 429) break;
        await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
      }
      throw new Error(`modelo ${modelo} falhou (${ultimoErro})`);
    },
  };
}

/**
 * POST com node:https. O fetch do Node desiste se o cabeçalho da resposta não chega em 300 s,
 * e um modelo que raciocina muito numa chamada passa disso (medido em 2026-09-28: tarefa morreu com "fetch failed").
 */
const LIMITE_DA_CHAMADA_MS = 15 * 60 * 1000;
function postar(url: string, init: RequestInit, sinal?: AbortSignal): Promise<{ status: { ok: boolean; status: number }; texto: string }> {
  return new Promise((resolver, rejeitar) => {
    const req = request(url, { method: 'POST', headers: init.headers as Record<string, string>, timeout: LIMITE_DA_CHAMADA_MS, ...(sinal ? { signal: sinal } : {}) }, (res) => {
      const partes: Buffer[] = [];
      res.on('data', (p: Buffer) => partes.push(p));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolver({ status: { ok: status >= 200 && status < 300, status }, texto: Buffer.concat(partes).toString('utf8') });
      });
      res.on('error', rejeitar);
    });
    req.on('timeout', () => req.destroy(new Error(`sem resposta em ${LIMITE_DA_CHAMADA_MS / 60000} min`)));
    req.on('error', rejeitar);
    req.end(init.body as string);
  });
}

type BlocoDoClaude = Anthropic.ContentBlockParam;

/** Tipo pela assinatura do arquivo em base64, não pelo que foi declarado. */
export function tipoDaImagem(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | undefined {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return undefined;
}

/**
 * Converte o histórico no formato Chat Completions (o que o ciclo do agente monta) para o da Anthropic.
 * Resposta de ferramenta vira tool_result na mensagem do usuário seguinte, junto com as imagens de render
 * que o ciclo manda logo depois. A resposta do Claude guarda os blocos originais em "blocos", para o
 * raciocínio voltar intacto na chamada seguinte.
 */
export function paraMensagensDoClaude(mensagens: MensagemDoModelo[]): { system: string; messages: Anthropic.MessageParam[] } {
  const system = mensagens.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages: Anthropic.MessageParam[] = [];
  const doUsuario = (blocos: BlocoDoClaude[]) => {
    const ultima = messages.at(-1);
    if (ultima?.role === 'user' && Array.isArray(ultima.content)) ultima.content.push(...blocos);
    else messages.push({ role: 'user', content: blocos });
  };
  for (const m of mensagens) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') doUsuario([{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }]);
    else if (m.role === 'user') {
      const partes = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
      doUsuario(
        partes.map((p): BlocoDoClaude => {
          if (p.type === 'text') return { type: 'text', text: p.text };
          const [, declarado, dados] = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(p.image_url.url) ?? [];
          if (!declarado || !dados) throw new Error('imagem precisa vir como data URL em base64');
          // o Claude recusa quando o tipo declarado não bate com o arquivo (prévia do Pixabay em PNG, 2026-09-29)
          return { type: 'image', source: { type: 'base64', media_type: tipoDaImagem(dados) ?? (declarado as 'image/jpeg'), data: dados } };
        }),
      );
    } else {
      const blocos = m.blocos as BlocoDoClaude[] | undefined;
      messages.push({
        role: 'assistant',
        content: blocos ?? [
          ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
          ...(m.tool_calls ?? []).map((c): BlocoDoClaude => ({ type: 'tool_use', id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || '{}') as Record<string, unknown> })),
        ],
      });
    }
  }
  return { system, messages };
}

/**
 * O SDK repete 429 com poucos segundos de espera; na DigitalOcean o limite dura mais que isso e a tarefa
 * morria no fim, com a peça quase pronta (Fermento Vivo, 2026-09-29). Aqui a espera cresce até 2 min.
 */
async function comEsperaNoLimite<T>(chamar: () => Promise<T>, sinal?: AbortSignal): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await chamar();
    } catch (e) {
      if (!(e instanceof Anthropic.RateLimitError) || tentativa >= 5 || sinal?.aborted) throw e;
      // o limite diário de tokens (45M na conta em 2026-09-29) só volta no dia seguinte: esperar não adianta
      const restamNoDia = Number(e.headers?.get('x-ratelimit-remaining-tokens-per-day') ?? Number.NaN);
      if (Number.isFinite(restamNoDia) && restamNoDia < 200_000)
        throw new Error(`limite diário de tokens da DigitalOcean esgotado (restam ${restamNoDia}); a conta volta a responder quando o limite diário renovar`);
      const pedida = Number(e.headers?.get('retry-after'));
      const espera = Number.isFinite(pedida) && pedida > 0 ? pedida * 1000 : Math.min(120_000, 15_000 * 2 ** tentativa);
      await new Promise((ok) => setTimeout(ok, espera));
    }
  }
}

/**
 * A DigitalOcean ignora o cache_control no topo do pedido: o histórico ia cheio a cada chamada e
 * só ferramentas + sistema saíam do cache (medido em 2026-09-29: 45% de cache, R$ 11 numa peça).
 * Marca explícita no fim da última mensagem (grava o histórico) e no fim da mensagem do usuário
 * anterior (lê o que a chamada passada gravou, mesmo que o passo novo tenha mais de 20 blocos).
 * Copia o bloco em vez de alterar: os blocos do assistente são os mesmos objetos do histórico.
 */
export function marcarHistoricoParaCache(messages: Anthropic.MessageParam[]): void {
  const marcar = (i: number) => {
    const m = messages[i];
    if (!m || !Array.isArray(m.content) || m.content.length === 0) return;
    const ultimo = m.content.at(-1)!;
    if (ultimo.type === 'thinking' || ultimo.type === 'redacted_thinking') return;
    m.content = [...m.content.slice(0, -1), { ...ultimo, cache_control: { type: 'ephemeral' } } as BlocoDoClaude];
  };
  const doUsuario = messages.flatMap((m, i) => (m.role === 'user' ? [i] : []));
  marcar(messages.length - 1);
  if (doUsuario.length >= 2) marcar(doUsuario.at(-2)!);
}

/** Claude pela DigitalOcean, no formato Messages: ferramenta, imagem e cache de prompt. */
export function criarModeloClaudeDigitalOcean(chave: string, modelo: string, esforco: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high'): ModeloDoAgente {
  const cliente = new Anthropic({ apiKey: chave, baseURL: 'https://inference.do-ai.run', timeout: LIMITE_DA_CHAMADA_MS, maxRetries: 3 });
  return {
    nome: modelo,
    capacidades: { imagem: true, ferramentas: true, cache: true },
    async responder(mensagens, ferramentas, sinal) {
      const { system, messages } = paraMensagensDoClaude(mensagens);
      const tools: Anthropic.Tool[] = ferramentas.map((f) => ({ name: f.function.name, description: f.function.description, input_schema: f.function.parameters as Anthropic.Tool.InputSchema }));
      // cache: prefixo fixo (ferramentas + sistema) e o histórico até a última mensagem
      if (tools.length) tools[tools.length - 1] = { ...tools.at(-1)!, cache_control: { type: 'ephemeral' } };
      marcarHistoricoParaCache(messages);
      const r = await comEsperaNoLimite(() => cliente.messages
        .stream(
          {
            model: modelo,
            max_tokens: 32000,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages,
            ...(tools.length ? { tools } : {}),
            thinking: { type: 'adaptive' },
            output_config: { effort: esforco },
          } as Anthropic.MessageStreamParams,
          sinal ? { signal: sinal } : {},
        )
        .finalMessage(), sinal);
      if (r.stop_reason === 'refusal') throw new Error(`o modelo recusou a chamada (${JSON.stringify((r as { stop_details?: unknown }).stop_details ?? null)})`);
      const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      const tool_calls: ChamadaDeFerramenta[] = r.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }] : []));
      const u = r.usage;
      return {
        mensagem: { role: 'assistant', content: texto || null, ...(tool_calls.length ? { tool_calls } : {}), blocos: r.content },
        uso: { entrada: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), saida: u.output_tokens, cacheLido: u.cache_read_input_tokens ?? 0, cacheCriado: u.cache_creation_input_tokens ?? 0 },
      };
    },
  };
}
