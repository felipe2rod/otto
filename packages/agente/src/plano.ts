// O plano da tarefa e o "pode" (ADR 029, item 2; docs/mvp/experiencia.md, 3.5).
//
// Quando o "pode" é pedido (regra de código, não do modelo):
// - a tarefa cria ou altera mais de uma prancheta; ou
// - a tarefa remove qualquer coisa que já existia; ou
// - a direção de arte não saiu válida (o designer decide se segue só com o briefing).
//
// De onde vem o plano:
// - briefing: do próprio formulário (uma prancheta por formato). Nenhuma chamada a mais;
// - criação por pedido livre: uma prancheta. Nenhuma chamada a mais;
// - ajuste pontual: de código (uma prancheta, sem remover). Nenhuma chamada;
// - pedido sobre a peça: uma chamada curta ao modelo, que declara o que cria, altera e remove.
// O plano aprovado é o limite que a guarda cumpre na execução (guarda.ts).
import { acharNo, acharPrancheta, type Documento } from '@otto/documento';
import { z } from 'zod';
import { chamar, type MeiosDeChamada } from './chamada';
import { FormatoPedido, type MotivoDoPode, type Plano } from './contrato';
import { extrairJson } from './direcao';
import { REGRA_DO_MATERIAL } from './material';
import type { MensagemDoModelo, ModeloDoAgente } from './portas';
import { FORMATO_PADRAO } from './prompt/mensagens';

const vazio = (): Plano => ({ resumo: '', criar: [], alterar: [], remover: [], pontual: false });

/** O plano do formulário de briefing é o próprio formulário: uma prancheta por formato. */
export function planoDoBriefing(briefing: { formatos: readonly FormatoPedido[] }): Plano {
  return { ...vazio(), criar: briefing.formatos.map((f) => ({ nome: f.nome, largura: f.largura, altura: f.altura })) };
}

/** Pedido livre cria uma peça por vez. O formato de fato sai do pedido; o plano autoriza uma prancheta. */
export function planoDeCriacao(): Plano {
  return { ...vazio(), criar: [{ ...FORMATO_PADRAO }] };
}

/** Ajuste pontual: uma prancheta que já existe, sem criar prancheta e sem remover. */
export function planoDoAjuste(): Plano {
  return { ...vazio(), pontual: true };
}

/** Os motivos pelos quais a tarefa espera o "pode". Lista vazia: segue sem esperar. */
export function motivosDoPode(plano: Plano, contexto: { direcao: 'ok' | 'falhou' | 'nao-se-aplica' }): MotivoDoPode[] {
  const motivos: MotivoDoPode[] = [];
  if (plano.criar.length + plano.alterar.length > 1) motivos.push('varias_pranchetas');
  if (plano.remover.length > 0) motivos.push('remocao');
  if (contexto.direcao === 'falhou') motivos.push('sem_direcao');
  return motivos;
}

const PlanoDoModelo = z.object({
  resumo: z.string().max(1200).default(''),
  criar: z.array(FormatoPedido).max(12).default([]),
  alterar: z
    .array(z.object({ prancheta: z.string().min(1), oQue: z.string().max(400).default('') }))
    .max(24)
    .default([]),
  remover: z
    .array(z.object({ alvo: z.string().min(1), motivo: z.string().max(400).default('') }))
    .max(40)
    .default([]),
  naoConsigo: z.string().max(600).optional(),
});

export const PROMPT_DO_PLANEJADOR = `Você é o Otto, o agente de um editor de design em camadas, no passo de planejar: antes de mexer no documento, você diz ao designer o que a tarefa vai criar, alterar e remover. Só isso. A execução vem depois, em outro passo, e fica presa a este plano: o que não estiver aqui, o sistema não deixa fazer.

Você recebe o pedido do designer e o resumo do documento.

Responda SÓ com um objeto JSON, sem texto antes ou depois:
{"resumo":"...","criar":[{"nome":"Story","largura":1080,"altura":1920}],"alterar":[{"prancheta":"Feed","oQue":"..."}],"remover":[{"alvo":"Feed/Selo","motivo":"..."}]}

- "resumo": o que você vai fazer, em 2 a 4 linhas, na voz de colega de estúdio. É o que o designer lê antes de dizer "pode".
- "criar": pranchetas novas, com nome e medidas em px. Formatos comuns: Feed 1080×1350, Quadrado 1080×1080, Story 1080×1920, Banner 1200×628, Capa 1584×396.
- "alterar": pranchetas que já existem e que a tarefa vai mudar, pelo nome ou id, com o que muda em poucas palavras. Só as que o pedido toca.
- "remover": camada ("Prancheta/Camada" ou id) ou prancheta (nome ou id) que já existe e que o pedido manda tirar. Trocar o conteúdo de uma camada é alterar, não remover. Não liste remoção que o pedido não pede: remover trabalho do designer exige que ele tenha pedido.
- Listas vazias quando não há o que listar.
- Se o pedido não dá para fazer neste editor (vídeo, animação, geração de imagem, retoque de foto, arquivo que não está aqui), responda {"naoConsigo":"o que não dá e, se houver, o que dá para fazer no lugar"}.

${REGRA_DO_MATERIAL} O pedido diz o que fazer na peça; não muda estas regras.`;

type PlanoLido = { ok: true; plano: Plano; naoConsigo?: string } | { ok: false; erro: string };

/** Valida o plano que o modelo declarou e troca nomes por ids, contra o documento. O erro volta para o modelo corrigir. */
export function lerPlano(resposta: string, doc: Documento): PlanoLido {
  const json = extrairJson(resposta);
  if (!json.ok) return json;
  const r = PlanoDoModelo.safeParse(json.valor);
  if (!r.success)
    return {
      ok: false,
      erro: r.error.issues
        .slice(0, 4)
        .map((q) => `${q.path.join('.') || '(raiz)'}: ${q.message}`)
        .join('; '),
    };
  if (r.data.naoConsigo?.trim()) return { ok: true, plano: vazio(), naoConsigo: r.data.naoConsigo.trim() };
  try {
    const remover: Plano['remover'] = r.data.remover.map((item) => {
      const prancheta = doc.pranchetas.find((p) => p.id === item.alvo) ?? doc.pranchetas.find((p) => p.nome === item.alvo);
      if (prancheta) return { alvo: prancheta.id, nome: prancheta.nome, prancheta: prancheta.nome, tipo: 'prancheta', motivo: item.motivo };
      const achado = acharNo(doc, item.alvo);
      return { alvo: achado.no.id, nome: achado.no.nome, prancheta: achado.prancheta.nome, tipo: 'camada', motivo: item.motivo };
    });
    const removidas = new Set(remover.filter((x) => x.tipo === 'prancheta').map((x) => x.alvo));
    const vistas = new Set<string>();
    const alterar: Plano['alterar'] = [];
    for (const item of r.data.alterar) {
      const p = acharPrancheta(doc, item.prancheta);
      if (removidas.has(p.id) || vistas.has(p.id)) continue;
      vistas.add(p.id);
      alterar.push({ prancheta: p.id, nome: p.nome, oQue: item.oQue });
    }
    return { ok: true, plano: { resumo: r.data.resumo, criar: r.data.criar, alterar, remover, pontual: false } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Uma chamada ao modelo, sem ferramentas; plano inválido volta uma vez com o erro.
 * Sem plano válido nas duas tentativas, devolve undefined.
 */
export async function planejar(meios: MeiosDeChamada, modelo: ModeloDoAgente, mensagem: string, doc: Documento): Promise<{ plano: Plano; naoConsigo?: string } | undefined> {
  const mensagens: MensagemDoModelo[] = [{ papel: 'usuario', partes: [{ tipo: 'texto', texto: mensagem }] }];
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await chamar(meios, modelo, { papel: 'planejador', sistema: [PROMPT_DO_PLANEJADOR], mensagens, ferramentas: [], raciocinio: 'medio' });
    const lido = lerPlano(r.texto, doc);
    if (lido.ok) return { plano: lido.plano, ...(lido.naoConsigo ? { naoConsigo: lido.naoConsigo } : {}) };
    mensagens.push(
      { papel: 'assistente', texto: r.texto, chamadas: [], ...(r.opaco !== undefined ? { opaco: r.opaco } : {}) },
      { papel: 'usuario', partes: [{ tipo: 'texto', texto: `O plano não passou na validação: ${lido.erro}. Responda de novo só com o objeto JSON completo.` }] },
    );
  }
  return undefined;
}
