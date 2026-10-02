// Modelo falso com roteiro: responde o que o roteiro manda, na ordem, sem falar com modelo nenhum.
// Serve a três coisas: os testes do ciclo; o worker e o editor desenvolverem a tarefa do Otto de ponta a
// ponta sem gastar token (docs/mvp/backend.md, 8.5); e reproduzir uma tarefa de verdade, gravada por
// `comGravacao` (avaliacao/), com os mesmos passos e os mesmos tempos.
//
// Um roteiro gravado só se repete igual se o documento de partida e os ids forem os mesmos: os ids dos nós
// saem do id do lote. Por isso o roteiro guarda a sequência de ids que a tarefa usou (`ids`), e
// `idsDoRoteiro` os devolve na mesma ordem para a porta `novoId`.
import { type CodigoDeErroDoModelo, ErroDoModelo, type ModeloDoAgente, type PapelDaChamada, type PedidoAoModelo, type PrecoDoModelo, type RespostaDoModelo, type UsoDoModelo } from './portas';

export interface PassoDoRoteiro {
  /** Quem deveria estar chamando neste passo. Se o ciclo chamar com outro papel, o roteiro saiu de sincronia e o passo falha. */
  papel?: PapelDaChamada;
  texto?: string;
  chamadas?: { nome: string; argumentos: Record<string, unknown>; id?: string }[];
  uso?: Partial<UsoDoModelo>;
  /** Quanto a resposta demorou na gravação, em ms. Na reprodução, é multiplicado pela velocidade. */
  duracaoMs?: number;
  /** Em vez de responder, falha com este código. */
  erro?: CodigoDeErroDoModelo;
}

export type Passo = PassoDoRoteiro | ((pedido: PedidoAoModelo) => PassoDoRoteiro);

export interface Roteiro {
  nome: string;
  descricao?: string;
  /** A entrada da tarefa que o roteiro responde (EntradaDaTarefa). */
  entrada?: unknown;
  /** Os ids que a porta `novoId` devolveu na gravação, na ordem. */
  ids?: string[];
  passos: PassoDoRoteiro[];
}

export interface OpcoesDoModeloRoteirizado {
  nome?: string;
  /** 0: responde na hora (padrão, para teste). 1: demora o que demorou na gravação. 0.1: dez vezes mais rápido. */
  velocidade?: number;
  preco?: PrecoDoModelo;
  capacidades?: ModeloDoAgente['capacidades'];
  /** Como esperar. Padrão: temporizador, interrompido pelo sinal de cancelamento. */
  esperar?(ms: number, sinal?: AbortSignal): Promise<void>;
}

export interface ModeloRoteirizado extends ModeloDoAgente {
  /** Os pedidos que o ciclo fez, na ordem: é por aqui que o teste vê o que o modelo recebeu. */
  readonly pedidos: PedidoAoModelo[];
  /** Passos que ainda não foram usados. */
  restantes(): number;
}

function esperarComTemporizador(ms: number, sinal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (sinal?.aborted) return rejeitar(new ErroDoModelo('cancelada', 'cancelada durante a espera do roteiro'));
    const t = setTimeout(resolver, ms);
    sinal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        rejeitar(new ErroDoModelo('cancelada', 'cancelada durante a espera do roteiro'));
      },
      { once: true },
    );
  });
}

// ---------- roteiro que se adapta à peça ----------
//
// Um roteiro escrito para desenvolver não sabe em que peça vai rodar. Para servir em qualquer uma, o passo
// pode trazer marcas, trocadas pelo que o ciclo mandou ao modelo na primeira mensagem da conversa:
//   {{prancheta}}   a prancheta da primeira camada de texto da peça (ou a primeira prancheta)
//   {{texto}}       o nome dessa primeira camada de texto
//   {{nova:Feed}}   "Feed" se a peça não tem prancheta com esse nome; senão "Feed 2", "Feed 3"...
// O modelo de verdade lê o documento; o roteiro lê o mesmo texto, do mesmo lugar.

export interface VariaveisDoPedido {
  /** Nomes das pranchetas que a peça tinha quando a conversa começou. */
  pranchetas: string[];
  prancheta?: string;
  texto?: string;
}

interface CamadaResumida {
  nome?: unknown;
  tipo?: unknown;
  filhosDeBaixoParaCima?: unknown;
}

function primeiroTexto(camadas: unknown): string | undefined {
  if (!Array.isArray(camadas)) return undefined;
  for (const c of camadas as CamadaResumida[]) {
    if (c?.tipo === 'texto' && typeof c.nome === 'string') return c.nome;
    const dentro = primeiroTexto(c?.filhosDeBaixoParaCima);
    if (dentro) return dentro;
  }
  return undefined;
}

/** O que o roteiro consegue saber da peça, pelo material "documento" da primeira mensagem do pedido. */
export function variaveisDoPedido(pedido: Pick<PedidoAoModelo, 'mensagens'>): VariaveisDoPedido {
  const primeira = pedido.mensagens[0];
  const texto = primeira?.papel === 'usuario' ? primeira.partes.flatMap((p) => (p.tipo === 'texto' ? [p.texto] : [])).join('\n') : '';
  const cerca = /<material-([0-9a-z]{8}) origem="documento">\n([\s\S]*?)\n<\/material-\1>/.exec(texto)?.[2];
  if (!cerca) return { pranchetas: [] };
  try {
    const resumo = JSON.parse(cerca) as { pranchetas?: { nome?: unknown; camadasDeBaixoParaCima?: unknown }[] };
    const lista = (resumo.pranchetas ?? []).filter((p): p is { nome: string; camadasDeBaixoParaCima?: unknown } => typeof p?.nome === 'string');
    const comTexto = lista.map((p) => ({ prancheta: p.nome, texto: primeiroTexto(p.camadasDeBaixoParaCima) })).find((p) => p.texto);
    const prancheta = comTexto?.prancheta ?? lista[0]?.nome;
    return { pranchetas: lista.map((p) => p.nome), ...(prancheta ? { prancheta } : {}), ...(comTexto?.texto ? { texto: comTexto.texto } : {}) };
  } catch {
    // tarefa de criação: uma prancheta por linha, "Nome 1080×1350"
    const pranchetas = cerca
      .split('\n')
      .map((l) => l.replace(/\s+\d+×\d+\s*$/, '').trim())
      .filter(Boolean);
    return { pranchetas, ...(pranchetas[0] ? { prancheta: pranchetas[0] } : {}) };
  }
}

function nomeNovo(base: string, existentes: readonly string[]): string {
  let nome = base;
  for (let n = 2; existentes.includes(nome); n++) nome = `${base} ${n}`;
  return nome;
}

/** Troca as marcas em todo texto do valor (em profundidade). Marca desconhecida fica como está. */
function trocarMarcas<T>(valor: T, v: VariaveisDoPedido): T {
  if (typeof valor === 'string') {
    return valor.replace(/\{\{(prancheta|texto|nova:([^{}]+))\}\}/g, (_tudo, marca: string, base: string | undefined) => {
      if (base !== undefined) return nomeNovo(base, v.pranchetas);
      const achado = marca === 'prancheta' ? v.prancheta : v.texto;
      if (achado === undefined)
        throw new ErroDoModelo('resposta_invalida', marca === 'texto' ? 'o roteiro pede uma camada de texto e a peça não tem nenhuma' : 'o roteiro pede uma prancheta e a peça não tem nenhuma');
      return achado;
    }) as T;
  }
  if (Array.isArray(valor)) return valor.map((x) => trocarMarcas(x, v)) as T;
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, x]) => [k, trocarMarcas(x, v)])) as T;
  return valor;
}

export function criarModeloRoteirizado(roteiro: { passos: readonly Passo[] }, opcoes: OpcoesDoModeloRoteirizado = {}): ModeloRoteirizado {
  const pedidos: PedidoAoModelo[] = [];
  let proximo = 0;
  const esperar = opcoes.esperar ?? esperarComTemporizador;
  return {
    nome: opcoes.nome ?? 'roteiro',
    capacidades: opcoes.capacidades ?? { imagem: true, ferramentas: true, cache: false },
    ...(opcoes.preco ? { preco: opcoes.preco } : {}),
    pedidos,
    restantes: () => roteiro.passos.length - proximo,
    async responder(pedido): Promise<RespostaDoModelo> {
      // cópia: o ciclo continua mexendo no histórico depois da chamada
      pedidos.push({ ...pedido, mensagens: structuredClone(pedido.mensagens) });
      const indice = proximo++;
      const bruto = roteiro.passos[indice];
      if (!bruto) throw new ErroDoModelo('resposta_invalida', `o roteiro acabou no passo ${indice + 1}`);
      const passo = typeof bruto === 'function' ? bruto(pedido) : bruto;
      if (passo.papel && passo.papel !== pedido.papel)
        throw new ErroDoModelo('resposta_invalida', `o roteiro esperava "${passo.papel}" no passo ${indice + 1} e o ciclo chamou como "${pedido.papel}"`);
      const demora = (passo.duracaoMs ?? 0) * (opcoes.velocidade ?? 0);
      if (demora > 0) await esperar(demora, pedido.sinal);
      if (pedido.sinal?.aborted) throw new ErroDoModelo('cancelada', 'cancelada');
      if (passo.erro) throw new ErroDoModelo(passo.erro, `falha roteirizada no passo ${indice + 1}`);
      const temMarca = JSON.stringify([passo.texto ?? '', passo.chamadas ?? []]).includes('{{');
      const variaveis = temMarca ? variaveisDoPedido(pedido) : { pranchetas: [] };
      const chamadas = (passo.chamadas ?? []).map((c, i) => ({
        id: c.id ?? `chamada-${indice + 1}-${i + 1}`,
        nome: c.nome,
        argumentos: temMarca ? trocarMarcas(c.argumentos, variaveis) : c.argumentos,
      }));
      return {
        texto: temMarca ? trocarMarcas(passo.texto ?? '', variaveis) : (passo.texto ?? ''),
        chamadas,
        uso: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0, ...passo.uso },
        parada: chamadas.length ? 'ferramentas' : 'fim',
      };
    },
  };
}

/** A porta `novoId` de um roteiro gravado: devolve os ids da gravação, na ordem; acabando, gera outros. */
export function idsDoRoteiro(roteiro: Pick<Roteiro, 'ids'>): () => string {
  let i = 0;
  return () => roteiro.ids?.[i++] ?? `0199ffff-0000-7000-8000-${String(i).padStart(12, '0')}`;
}

export interface Gravacao {
  modelo: ModeloDoAgente;
  /** Os passos gravados até aqui, na ordem das chamadas. */
  passos(): PassoDoRoteiro[];
}

/**
 * Envolve um modelo de verdade e grava cada resposta como passo de roteiro. O raciocínio do modelo não é
 * gravado (só texto, chamadas, uso e tempo). `agora` é o relógio da porta.
 */
export function comGravacao(modelo: ModeloDoAgente, agora: () => number): Gravacao {
  const passos: PassoDoRoteiro[] = [];
  return {
    passos: () => structuredClone(passos),
    modelo: {
      nome: modelo.nome,
      capacidades: modelo.capacidades,
      ...(modelo.preco ? { preco: modelo.preco } : {}),
      async responder(pedido) {
        const inicio = agora();
        const r = await modelo.responder(pedido);
        passos.push({
          papel: pedido.papel,
          ...(r.texto ? { texto: r.texto } : {}),
          ...(r.chamadas.length ? { chamadas: r.chamadas.map((c) => ({ id: c.id, nome: c.nome, argumentos: c.argumentos })) } : {}),
          uso: r.uso,
          duracaoMs: agora() - inicio,
        });
        return r;
      },
    },
  };
}
