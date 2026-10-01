// Catálogo fechado de operações (ADR 027, item 3). Designer e agente usam as mesmas.
// Um lote se aplica em transação: ou entra inteiro, ou nada entra.
//
// Veio de poc/src/documento/operacoes.ts. O que mudou na migração:
// - nada é mutado: cada operação devolve um documento novo e reaproveita, por referência, tudo o que não tocou
//   (prancheta, grupo e nó). O cache do motor de render e os seletores do editor dependem disso;
// - o id de nó novo sai do id do lote (ids.ts), para navegador e servidor chegarem à mesma árvore;
// - o medidor de tinta entra por parâmetro: este pacote não conhece motor de render;
// - a mensagem de erro de validação sai em português.
import { z } from 'zod';
import { ptBR } from 'zod/locales';
import {
  type Autoria,
  type Caixa,
  Cor,
  caixaVisual,
  coresDoNo,
  coresDoVetor,
  type Documento,
  ehVisual,
  Mascara,
  ModoDoGrupo,
  No,
  NoAjuste,
  NoForma,
  type NoGrupo,
  NoImagem,
  NoTexto,
  NoVetor,
  type Prancheta,
  type No as TNo,
  todasAsCamadas,
} from './esquema';
import { deslocarNo } from './geometria';
import { type GeradorDeId, idsDoLote } from './ids';

/** Mensagens de validação em português: o agente lê o erro e corrige o lote. */
const EM_PORTUGUES = { error: ptBR().localeError };

/** Endereço de nó: id, ou caminho por nome "Prancheta/Camada". */
const Alvo = z.string().min(1).describe('id do nó ou caminho "NomeDaPrancheta/NomeDaCamada"');
/** Endereço de prancheta: id ou nome. */
const AlvoPrancheta = z.string().min(1).describe('id ou nome da prancheta');

const semId = <T extends z.ZodObject>(s: T) => s.omit({ id: true } as never);
const GrupoNovo = z.object({
  tipo: z.literal('grupo'),
  nome: z.string().min(1),
  opacidade: z.number().min(0).max(1).optional(),
  modoDeMesclagem: ModoDoGrupo.optional(),
  visivel: z.boolean().optional(),
  mascara: Mascara.optional(),
  recortadaNaDeBaixo: z.boolean().optional(),
});
const NoNovo = z.discriminatedUnion('tipo', [semId(NoForma), semId(NoTexto), semId(NoImagem), semId(NoVetor), semId(NoAjuste), GrupoNovo] as never) as unknown as z.ZodType<Omit<TNo, 'id'>>;

export const Operacao = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('criarPrancheta'),
    nome: z.string().min(1),
    largura: z.number().int().positive(),
    altura: z.number().int().positive(),
    fundo: Cor,
  }),
  z
    .object({
      op: z.literal('duplicarPrancheta'),
      prancheta: AlvoPrancheta,
      nome: z.string().min(1),
      largura: z.number().int().positive(),
      altura: z.number().int().positive(),
    })
    .describe('Copia a prancheta com todas as camadas para um novo formato. As camadas são reescaladas proporcionalmente só como ponto de partida: reposicione depois.'),
  z.object({
    op: z.literal('alterarPrancheta'),
    prancheta: AlvoPrancheta,
    props: z.object({ nome: z.string().min(1), fundo: Cor }).partial(),
  }),
  z.object({ op: z.literal('removerPrancheta'), prancheta: AlvoPrancheta }),
  z
    .object({
      op: z.literal('criarNo'),
      prancheta: AlvoPrancheta,
      no: NoNovo,
      grupo: Alvo.optional().describe('opcional: cria dentro deste grupo (no topo dele)'),
    })
    .describe('Cria uma camada no topo da prancheta (ou do grupo). Nome único dentro da prancheta.'),
  z
    .object({
      op: z.literal('agrupar'),
      alvos: z.array(Alvo).min(1).describe('camadas irmãs (mesmo pai)'),
      nome: z.string().min(1),
      modoDeMesclagem: ModoDoGrupo.optional(),
    })
    .describe('Põe as camadas num grupo novo, na posição da mais alta delas. O grupo pode ter máscara, opacidade e modo de mesclagem próprios.'),
  z.object({ op: z.literal('desagrupar'), alvo: Alvo }).describe('Desfaz o grupo, mantendo as camadas no lugar.'),
  z.object({
    op: z.literal('alterar'),
    alvo: Alvo,
    props: z.record(z.string(), z.unknown()).describe('propriedades a trocar, do mesmo tipo do nó (ex.: {"tamanho": 96, "cor": "token:primaria"}); null remove sombra, traco ou recorte'),
  }),
  z
    .object({
      op: z.literal('recolorir'),
      alvo: Alvo,
      cores: z.record(z.string(), Cor).describe('cor atual → cor nova (ex.: {"#0037a6": "token:texto"}); "*" troca todas (versão monocromática)'),
    })
    .describe('Troca as cores de um vetor (logo, ícone), no preenchimento e no traço, sem tocar no desenho. É o único jeito de recolorir um logo.'),
  z.object({ op: z.literal('mover'), alvo: Alvo, x: z.number(), y: z.number() }),
  z.object({
    op: z.literal('reordenar'),
    alvo: Alvo,
    posicao: z.union([z.enum(['frente', 'tras']), z.number().int().min(0)]).describe('"frente", "tras" ou índice (0 = embaixo)'),
  }),
  z
    .object({
      op: z.literal('duplicar'),
      alvo: Alvo,
      nome: z.string().min(1).optional().describe('nome da cópia; sem ele, "<nome> cópia"'),
      dx: z.number().default(0).describe('deslocamento da cópia em x'),
      dy: z.number().default(0).describe('deslocamento da cópia em y'),
    })
    .describe('Copia a camada (grupo: com tudo dentro) e põe a cópia logo acima da original, no mesmo grupo. A cópia nasce desbloqueada. O que vai dentro de um grupo copiado ganha " cópia" no nome.'),
  z
    .object({
      op: z.literal('transferir'),
      alvo: Alvo,
      grupo: Alvo.optional().describe('grupo de destino; sem ele, a raiz da prancheta'),
      prancheta: AlvoPrancheta.optional().describe('prancheta de destino; sem ela, a do grupo de destino ou a da própria camada'),
      posicao: z
        .union([z.enum(['frente', 'tras']), z.number().int().min(0)])
        .default('frente')
        .describe('"frente" (no topo do destino), "tras" ou índice (0 = embaixo)'),
    })
    .describe(
      'Tira a camada de onde está e a põe em outro grupo, na raiz da prancheta ou em outra prancheta, sem mudar x e y. Para só mudar a ordem entre irmãs, use reordenar. Se o nome já existir na prancheta de destino, ganha um número.',
    ),
  z.object({ op: z.literal('remover'), alvo: Alvo }),
  z
    .object({
      op: z.literal('alinhar'),
      alvos: z.array(Alvo).min(1),
      borda: z.enum(['esquerda', 'direita', 'topo', 'base', 'centro-horizontal', 'centro-vertical']),
      valor: z.number().optional().describe('coordenada exata a alinhar; sem ela, alinha ao primeiro alvo (ou à prancheta, com referencia)'),
      referencia: z.enum(['primeiro', 'prancheta']).default('primeiro'),
    })
    .describe('Alinha camadas pela TINTA (onde as letras e formas aparecem), não pela caixa. Ex.: todas as bordas esquerdas na margem.'),
  z
    .object({
      op: z.literal('distribuir'),
      alvos: z.array(Alvo).min(2).describe('na ordem de leitura (de cima para baixo ou da esquerda para a direita)'),
      eixo: z.enum(['vertical', 'horizontal']).default('vertical'),
      espaco: z.number().min(0).describe('espaço exato entre a tinta de um e a do seguinte, em px'),
    })
    .describe('Empilha camadas com espaço exato entre as tintas. O primeiro alvo não se move.'),
  z
    .object({
      op: z.literal('definirEstiloDeTexto'),
      nome: z.string().regex(/^[a-z0-9-]+$/),
      estilo: z.object({
        fonte: z.string(),
        peso: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
        tamanho: z.number().positive(),
        entrelinha: z.number().positive().optional(),
        espacamento: z.number().optional(),
        caixaAlta: z.boolean().optional(),
        versalete: z.boolean().optional(),
      }),
    })
    .describe('Cria ou redefine um estilo de texto da identidade (ex.: "titulo", "subtitulo", "corpo"). Toda camada ligada a ele muda junto.'),
  z
    .object({
      op: z.literal('aplicarEstiloDeTexto'),
      alvos: z.array(Alvo).min(1),
      estilo: z.string(),
    })
    .describe('Aplica um estilo de texto às camadas de texto (fonte, peso, tamanho, entrelinha, tracking) e as liga a ele.'),
  z
    .object({
      op: z.literal('definirToken'),
      nome: z.string().regex(/^[a-z0-9-]+$/),
      valor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .describe('Cria ou troca um token de cor. Todo nó que usa "token:nome" muda junto.'),
]);
export type Operacao = z.infer<typeof Operacao>;

export const Lote = z.object({
  descricao: z.string().min(1).describe('o que este lote faz, em uma frase'),
  operacoes: z.array(Operacao).min(1),
});
export type Lote = z.infer<typeof Lote>;

/**
 * Operações cujo resultado depende de medir a tinta do texto. O resultado só é o mesmo no navegador e no servidor
 * se os dois medirem com o mesmo motor e as mesmas fontes.
 */
export const OPERACOES_QUE_MEDEM = ['alinhar', 'distribuir'] as const;

export function loteDependeDeMedida(operacoes: readonly unknown[]): boolean {
  return operacoes.some((o) => typeof o === 'object' && o !== null && 'op' in o && (OPERACOES_QUE_MEDEM as readonly unknown[]).includes((o as { op: unknown }).op));
}

/** Onde uma camada de fato aparece. Texto: pela tinta das letras. É uma porta: quem implementa é o motor de render. */
export interface Medidor {
  tinta(no: TNo): Caixa;
}

/** O que um lote precisa além das operações. */
export interface ContextoDoLote {
  autoria: Autoria;
  /**
   * Id do lote, gerado por quem o cria (editor ou agente) e repetido por quem o aplica de novo (servidor).
   * Os ids dos nós novos derivam dele.
   */
  idDoLote: string;
  /** Sem medidor, alinhar e distribuir medem pela caixa da camada. */
  medidor?: Medidor;
  /** Só para teste ou importação: troca a derivação padrão dos ids. */
  gerarId?: GeradorDeId;
}

function uniao(caixas: Caixa[]): Caixa | undefined {
  if (caixas.length === 0) return undefined;
  const x0 = Math.min(...caixas.map((c) => c.x));
  const y0 = Math.min(...caixas.map((c) => c.y));
  const x1 = Math.max(...caixas.map((c) => c.x + c.w));
  const y1 = Math.max(...caixas.map((c) => c.y + c.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Caixa de qualquer camada: visual pela caixa, grupo pela união dos filhos, ajuste não tem. */
export function caixaDe(no: TNo, medir: (n: TNo) => Caixa = (n) => (ehVisual(n) ? caixaVisual(n) : { x: 0, y: 0, w: 0, h: 0 })): Caixa | undefined {
  if (ehVisual(no)) return medir(no);
  if (no.tipo === 'grupo') return uniao(no.filhos.map((f) => caixaDe(f, medir)).filter((c): c is Caixa => Boolean(c)));
  return undefined;
}

const medidorPorCaixa: Medidor = { tinta: (n) => caixaDe(n) ?? { x: 0, y: 0, w: 0, h: 0 } };

/** Tinta de qualquer camada (grupo: união das tintas dos filhos). */
function tintaDe(medidor: Medidor, no: TNo): Caixa {
  const c = caixaDe(no, (n) => medidor.tinta(n));
  if (!c) throw new FalhaDeOperacao(`"${no.nome}" é uma camada de ajuste e não tem posição`);
  return c;
}

export interface ErroDeOperacao {
  indice: number;
  op: string;
  alvo?: string;
  campo?: string;
  mensagem: string;
}

export type ResultadoDoLote = { ok: true; doc: Documento; tocados: string[] } | { ok: false; erro: ErroDeOperacao };

class FalhaDeOperacao extends Error {
  readonly campo: string | undefined;
  constructor(mensagem: string, campo?: string) {
    super(mensagem);
    this.campo = campo;
  }
}

export function acharPrancheta(doc: Documento, alvo: string): Prancheta {
  const p = doc.pranchetas.find((x) => x.id === alvo) ?? doc.pranchetas.find((x) => x.nome === alvo);
  if (!p) throw new FalhaDeOperacao(`prancheta "${alvo}" não existe. Pranchetas: ${doc.pranchetas.map((x) => x.nome).join(', ') || 'nenhuma'}`);
  return p;
}

export interface NoAchado {
  prancheta: Prancheta;
  no: TNo;
  /** a lista que contém o nó (filhos da prancheta ou do grupo). Não mutar. */
  irmaos: readonly TNo[];
  indice: number;
  pai?: NoGrupo;
}

function procurar(lista: readonly TNo[], teste: (n: TNo) => boolean, pai?: NoGrupo): Omit<NoAchado, 'prancheta'> | undefined {
  for (let i = 0; i < lista.length; i++) {
    const n = lista[i] as TNo;
    if (teste(n)) return { no: n, irmaos: lista, indice: i, ...(pai ? { pai } : {}) };
    if (n.tipo === 'grupo') {
      const dentro = procurar(n.filhos, teste, n);
      if (dentro) return dentro;
    }
  }
  return undefined;
}

export function acharNo(doc: Documento, alvo: string): NoAchado {
  for (const prancheta of doc.pranchetas) {
    const achado = procurar(prancheta.filhos, (n) => n.id === alvo);
    if (achado) return { prancheta, ...achado };
  }
  const barra = alvo.indexOf('/');
  if (barra > 0) {
    const prancheta = acharPrancheta(doc, alvo.slice(0, barra));
    const nome = alvo
      .slice(barra + 1)
      .split('/')
      .at(-1) as string;
    const achado = procurar(prancheta.filhos, (n) => n.nome === nome);
    if (achado) return { prancheta, ...achado };
    throw new FalhaDeOperacao(
      `camada "${nome}" não existe em "${prancheta.nome}". Camadas: ${
        todasAsCamadas(prancheta.filhos)
          .map((n) => n.nome)
          .join(', ') || 'nenhuma'
      }`,
    );
  }
  throw new FalhaDeOperacao(`nó "${alvo}" não existe. Use o id ou "Prancheta/Camada".`);
}

function exigirDesbloqueado(no: TNo, autoria: Autoria, props?: Record<string, unknown>): void {
  const travada = no.bloqueado ? no : no.tipo === 'grupo' ? todasAsCamadas(no.filhos).find((n) => n.bloqueado) : undefined;
  if (!travada) return;
  const soDesbloqueia = travada === no && props && Object.keys(props).length === 1 && props.bloqueado === false;
  if (autoria.tipo === 'designer' && soDesbloqueia) return;
  throw new FalhaDeOperacao(`a camada "${travada.nome}" está bloqueada e não pode ser alterada`);
}

function exigirNomeLivre(prancheta: Prancheta, nome: string, exceto?: string): void {
  if (todasAsCamadas(prancheta.filhos).some((n) => n.nome === nome && n.id !== exceto)) {
    throw new FalhaDeOperacao(`já existe uma camada "${nome}" em "${prancheta.nome}"; nomes são únicos dentro da prancheta`, 'nome');
  }
}

/** O primeiro nome livre a partir de "base": base, "base 2", "base 3"... "ocupados" recebe o escolhido. */
function nomeLivre(ocupados: Set<string>, base: string): string {
  let nome = base;
  for (let n = 2; ocupados.has(nome); n++) nome = `${base} ${n}`;
  ocupados.add(nome);
  return nome;
}

function validarNo(bruto: unknown): TNo {
  const r = No.safeParse(bruto, EM_PORTUGUES);
  if (!r.success) {
    const q = r.error.issues[0] as z.core.$ZodIssue;
    throw new FalhaDeOperacao(q.message, q.path.join('.'));
  }
  return r.data;
}

// ---------- troca sem mutação: copia só o caminho até o que mudou ----------

/** Troca a prancheta de mesmo id; as outras continuam sendo o mesmo objeto. */
function comPrancheta(doc: Documento, nova: Prancheta): Documento {
  return { ...doc, pranchetas: doc.pranchetas.map((p) => (p.id === nova.id ? nova : p)) };
}

/** Dentro de "filhos", troca a lista de filhos do grupo de id dado. Devolve undefined se o grupo não está ali. */
function trocarFilhosDoGrupo(filhos: readonly TNo[], idDoGrupo: string, fn: (lista: readonly TNo[]) => TNo[]): TNo[] | undefined {
  for (let i = 0; i < filhos.length; i++) {
    const n = filhos[i] as TNo;
    if (n.tipo !== 'grupo') continue;
    const dentro = n.id === idDoGrupo ? fn(n.filhos) : trocarFilhosDoGrupo(n.filhos, idDoGrupo, fn);
    if (!dentro) continue;
    const copia = filhos.slice();
    copia[i] = { ...n, filhos: dentro };
    return copia;
  }
  return undefined;
}

/** Aplica "fn" à lista em que o nó achado vive (filhos da prancheta ou de um grupo) e devolve o documento novo. */
function comIrmaos(doc: Documento, achado: Pick<NoAchado, 'prancheta' | 'pai'>, fn: (lista: readonly TNo[]) => TNo[]): Documento {
  const p = achado.prancheta;
  const filhos = achado.pai ? trocarFilhosDoGrupo(p.filhos, achado.pai.id, fn) : fn(p.filhos);
  if (!filhos) throw new FalhaDeOperacao(`o grupo "${achado.pai?.nome}" não está mais em "${p.nome}"`);
  return comPrancheta(doc, { ...p, filhos });
}

/** Troca um nó por outro (ou por vários, ou por nenhum), no mesmo lugar. */
function substituir(doc: Documento, achado: NoAchado, novos: readonly TNo[]): Documento {
  return comIrmaos(doc, achado, (lista) => [...lista.slice(0, achado.indice), ...novos, ...lista.slice(achado.indice + 1)]);
}

/** Aplica "fn" a todo nó que não é grupo, preservando a referência de tudo o que "fn" devolveu igual. */
function mapearFolhas(filhos: readonly TNo[], fn: (n: TNo) => TNo): TNo[] {
  let mudou = false;
  const novos = filhos.map((n) => {
    const novo = n.tipo === 'grupo' ? comFilhos(n, mapearFolhas(n.filhos, fn)) : fn(n);
    if (novo !== n) mudou = true;
    return novo;
  });
  return mudou ? novos : (filhos as TNo[]);
}

function comFilhos(g: NoGrupo, filhos: TNo[]): NoGrupo {
  return filhos === g.filhos ? g : { ...g, filhos };
}

interface Estado {
  doc: Documento;
  autoria: Autoria;
  tocados: Set<string>;
  medidor: Medidor;
  /** Id do próximo nó criado por esta operação. */
  novoId: () => string;
}

function aplicarUma(e: Estado, op: Operacao): Documento {
  const { doc, autoria, tocados, medidor } = e;
  switch (op.op) {
    case 'criarPrancheta': {
      if (doc.pranchetas.some((p) => p.nome === op.nome)) throw new FalhaDeOperacao(`já existe a prancheta "${op.nome}"`, 'nome');
      const p: Prancheta = { id: e.novoId(), nome: op.nome, tipo: 'prancheta', largura: op.largura, altura: op.altura, fundo: op.fundo, filhos: [] };
      tocados.add(p.id);
      return { ...doc, pranchetas: [...doc.pranchetas, p] };
    }
    case 'duplicarPrancheta': {
      const origem = acharPrancheta(doc, op.prancheta);
      if (doc.pranchetas.some((p) => p.nome === op.nome)) throw new FalhaDeOperacao(`já existe a prancheta "${op.nome}"`, 'nome');
      const sx = op.largura / origem.largura;
      const sy = op.altura / origem.altura;
      const s = Math.min(sx, sy);
      const escalarMascara = (m: TNo['mascara']): TNo['mascara'] => {
        if (m?.tipo !== 'forma') return m;
        const largura = m.largura * s;
        const altura = m.altura * s;
        const cx = (m.x + m.largura / 2) * sx;
        const cy = (m.y + m.altura / 2) * sy;
        return {
          ...m,
          x: Math.round(cx - largura / 2),
          y: Math.round(cy - altura / 2),
          largura: Math.round(largura),
          altura: Math.round(altura),
          raio: Math.round(m.raio * s),
          suavizar: Math.round(m.suavizar * s),
        };
      };
      const idDaPrancheta = e.novoId();
      const copiar = (n: TNo): TNo => {
        // cópia funda: o nó novo não divide nada com o de origem
        const copia = { ...structuredClone(n), id: e.novoId() } as TNo;
        const mascara = escalarMascara(copia.mascara);
        if (mascara === undefined) delete copia.mascara;
        else copia.mascara = mascara;
        if (copia.tipo === 'grupo') {
          copia.filhos = n.tipo === 'grupo' ? n.filhos.map(copiar) : [];
          return copia;
        }
        if (!ehVisual(copia)) return copia;
        const largura = copia.largura * s;
        const altura = copia.altura * s;
        // centro da camada acompanha a proporção da prancheta; o tamanho usa a menor escala para não distorcer
        const cx = (copia.x + copia.largura / 2) * sx;
        const cy = (copia.y + copia.altura / 2) * sy;
        Object.assign(copia, { x: Math.round(cx - largura / 2), y: Math.round(cy - altura / 2), largura: Math.round(largura), altura: Math.round(altura) });
        if (copia.tipo === 'texto') copia.tamanho = Math.max(1, Math.round(copia.tamanho * s));
        if (copia.tipo === 'forma') {
          copia.raio = Math.round(copia.raio * s);
          if (copia.traco) copia.traco.espessura = Math.max(1, Math.round(copia.traco.espessura * s));
        }
        if (copia.tipo === 'imagem' && copia.recorte) copia.recorte.raio = Math.round(copia.recorte.raio * s);
        if (copia.sombra) copia.sombra = { ...copia.sombra, distancia: Math.round(copia.sombra.distancia * s), desfoque: Math.round(copia.sombra.desfoque * s) };
        return copia;
      };
      const filhos = origem.filhos.map(copiar);
      const p: Prancheta = { id: idDaPrancheta, nome: op.nome, tipo: 'prancheta', largura: op.largura, altura: op.altura, fundo: origem.fundo, filhos };
      tocados.add(p.id);
      for (const n of todasAsCamadas(filhos)) tocados.add(n.id);
      return { ...doc, pranchetas: [...doc.pranchetas, p] };
    }
    case 'alterarPrancheta': {
      const p = acharPrancheta(doc, op.prancheta);
      if (op.props.nome && op.props.nome !== p.nome && doc.pranchetas.some((x) => x.nome === op.props.nome)) {
        throw new FalhaDeOperacao(`já existe a prancheta "${op.props.nome}"`, 'nome');
      }
      tocados.add(p.id);
      return comPrancheta(doc, { ...p, ...(op.props.nome !== undefined ? { nome: op.props.nome } : {}), ...(op.props.fundo !== undefined ? { fundo: op.props.fundo } : {}) });
    }
    case 'removerPrancheta': {
      const p = acharPrancheta(doc, op.prancheta);
      const travada = todasAsCamadas(p.filhos).find((n) => n.bloqueado);
      if (travada) throw new FalhaDeOperacao(`a prancheta tem a camada bloqueada "${travada.nome}"`);
      return { ...doc, pranchetas: doc.pranchetas.filter((x) => x !== p) };
    }
    case 'criarNo': {
      const p = acharPrancheta(doc, op.prancheta);
      const no = validarNo({ ...(op.no as Record<string, unknown>), id: e.novoId(), ...((op.no as { tipo: string }).tipo === 'grupo' ? { filhos: [] } : {}) });
      exigirNomeLivre(p, no.nome);
      tocados.add(no.id);
      if (!op.grupo) return comPrancheta(doc, { ...p, filhos: [...p.filhos, no] });
      const destino = acharNo(doc, op.grupo);
      if (destino.prancheta !== p) throw new FalhaDeOperacao(`o grupo "${op.grupo}" não está em "${p.nome}"`, 'grupo');
      if (destino.no.tipo !== 'grupo') throw new FalhaDeOperacao(`"${destino.no.nome}" não é um grupo`, 'grupo');
      return substituir(doc, destino, [{ ...destino.no, filhos: [...destino.no.filhos, no] }]);
    }
    case 'agrupar': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      const primeiro = achados[0] as NoAchado;
      if (achados.some((a) => a.irmaos !== primeiro.irmaos)) throw new FalhaDeOperacao('só dá para agrupar camadas que estão no mesmo nível (mesmo pai)', 'alvos');
      exigirNomeLivre(primeiro.prancheta, op.nome);
      for (const a of achados) exigirDesbloqueado(a.no, autoria);
      const ordenados = [...achados].sort((a, b) => a.indice - b.indice);
      const topo = (ordenados.at(-1) as NoAchado).indice;
      const grupo = validarNo({ id: e.novoId(), tipo: 'grupo', nome: op.nome, ...(op.modoDeMesclagem ? { modoDeMesclagem: op.modoDeMesclagem } : {}), filhos: [] }) as NoGrupo;
      // os filhos entram por referência, sem passar de novo pela validação: continuam sendo os mesmos objetos
      const comOsFilhos: NoGrupo = { ...grupo, filhos: ordenados.map((a) => a.no) };
      const ids = new Set(achados.map((a) => a.no.id));
      tocados.add(grupo.id);
      return comIrmaos(doc, primeiro, (lista) => lista.flatMap((n, i) => (i === topo ? [comOsFilhos] : ids.has(n.id) ? [] : [n])));
    }
    case 'desagrupar': {
      const achado = acharNo(doc, op.alvo);
      const { no } = achado;
      if (no.tipo !== 'grupo') throw new FalhaDeOperacao(`"${no.nome}" não é um grupo`, 'alvo');
      exigirDesbloqueado(no, autoria);
      for (const f of no.filhos) tocados.add(f.id);
      return substituir(doc, achado, no.filhos);
    }
    case 'alterar': {
      const achado = acharNo(doc, op.alvo);
      const { prancheta, no } = achado;
      exigirDesbloqueado(no, autoria, op.props);
      if ('id' in op.props || 'tipo' in op.props || 'filhos' in op.props) throw new FalhaDeOperacao('id, tipo e filhos não mudam por alterar', 'props');
      // null remove a propriedade opcional (sombra, traço, recorte, máscara); undefined não sobrevive ao JSON
      const mesclado: Record<string, unknown> = { ...no, ...op.props };
      for (const [k, v] of Object.entries(op.props)) if (v === null) delete mesclado[k];
      // grupo: valida sem os filhos e devolve os mesmos objetos de filho, para não trocar o que não mudou
      const novo = no.tipo === 'grupo' ? ({ ...(validarNo({ ...mesclado, filhos: [] }) as NoGrupo), filhos: no.filhos } satisfies NoGrupo) : validarNo(mesclado);
      if (novo.nome !== no.nome) exigirNomeLivre(prancheta, novo.nome, no.id);
      // o desenho de um vetor importado é do cliente: cor muda (recolorir), forma não
      if (no.tipo === 'vetor' && no.origem && novo.tipo === 'vetor' && novo.caminhos.map((c) => c.d).join('|') !== no.caminhos.map((c) => c.d).join('|'))
        throw new FalhaDeOperacao(
          `o desenho de "${no.nome}" veio do arquivo ${no.origem.nome} e não muda por alterar. Para trocar cores use {"op":"recolorir","alvo":"${op.alvo}","cores":{"*":"token:..."}}; para o tamanho, largura e altura`,
          'props.caminhos',
        );
      tocados.add(no.id);
      return substituir(doc, achado, [novo]);
    }
    case 'recolorir': {
      const achado = acharNo(doc, op.alvo);
      const { no } = achado;
      exigirDesbloqueado(no, autoria);
      if (no.tipo !== 'vetor') throw new FalhaDeOperacao(`"${no.nome}" é ${no.tipo}; recolorir vale para vetor (logo, ícone). Nas outras camadas use alterar`, 'alvo');
      const existentes = coresDoVetor(no);
      const chave = (c: string) => c.toLowerCase();
      const troca = new Map(Object.entries(op.cores).map(([de, para]) => [chave(de), para]));
      for (const de of troca.keys())
        if (de !== '*' && !existentes.some((c) => chave(c) === de)) throw new FalhaDeOperacao(`"${no.nome}" não tem a cor ${de}. Cores do vetor: ${existentes.join(', ')}`, 'cores');
      const nova = (c: string) => troca.get(chave(c)) ?? troca.get('*') ?? c;
      tocados.add(no.id);
      return substituir(doc, achado, [
        {
          ...no,
          caminhos: no.caminhos.map((c) => ({ ...c, ...(c.preenchimento ? { preenchimento: nova(c.preenchimento) } : {}), ...(c.traco ? { traco: { ...c.traco, cor: nova(c.traco.cor) } } : {}) })),
        },
      ]);
    }
    case 'mover': {
      const achado = acharNo(doc, op.alvo);
      const { no } = achado;
      exigirDesbloqueado(no, autoria);
      const c = caixaDe(no);
      if (!c) throw new FalhaDeOperacao(`"${no.nome}" é uma camada de ajuste e não tem posição`);
      tocados.add(no.id);
      return substituir(doc, achado, [deslocarNo(no, op.x - c.x, op.y - c.y)]);
    }
    case 'reordenar': {
      const achado = acharNo(doc, op.alvo);
      const { no } = achado;
      exigirDesbloqueado(no, autoria);
      tocados.add(no.id);
      return comIrmaos(doc, achado, (lista) => {
        const sem = lista.filter((_, i) => i !== achado.indice);
        const destino = op.posicao === 'frente' ? sem.length : op.posicao === 'tras' ? 0 : Math.min(op.posicao, sem.length);
        return [...sem.slice(0, destino), no, ...sem.slice(destino)];
      });
    }
    case 'duplicar': {
      const achado = acharNo(doc, op.alvo);
      const { prancheta, no, irmaos } = achado;
      if (op.nome !== undefined) exigirNomeLivre(prancheta, op.nome);
      const ocupados = new Set(todasAsCamadas(prancheta.filhos).map((n) => n.nome));
      const copiar = (n: TNo, raiz: boolean): TNo => {
        // cópia funda: o nó novo não divide nada com o de origem. O id sai do lote, na ordem em que a árvore é percorrida
        const copia = { ...structuredClone(n), id: e.novoId(), nome: raiz && op.nome !== undefined ? op.nome : nomeLivre(ocupados, `${n.nome} cópia`), bloqueado: false } as TNo;
        tocados.add(copia.id);
        if (copia.tipo === 'grupo' && n.tipo === 'grupo') copia.filhos = n.filhos.map((f) => copiar(f, false));
        return copia;
      };
      if (op.nome !== undefined) ocupados.add(op.nome);
      const copia = deslocarNo(copiar(no, true), op.dx, op.dy);
      // base de um conjunto de recorte: a cópia vai acima das camadas presas a ela, para não virar a base delas
      let depois = achado.indice + 1;
      if (!no.recortadaNaDeBaixo) while (irmaos[depois]?.recortadaNaDeBaixo) depois++;
      return comIrmaos(doc, achado, (lista) => [...lista.slice(0, depois), copia, ...lista.slice(depois)]);
    }
    case 'transferir': {
      const achado = acharNo(doc, op.alvo);
      const { no } = achado;
      exigirDesbloqueado(no, autoria);
      const grupo = op.grupo !== undefined ? acharNo(doc, op.grupo) : undefined;
      if (grupo && grupo.no.tipo !== 'grupo') throw new FalhaDeOperacao(`"${grupo.no.nome}" não é um grupo`, 'grupo');
      const destino = op.prancheta !== undefined ? acharPrancheta(doc, op.prancheta) : (grupo?.prancheta ?? achado.prancheta);
      if (grupo && grupo.prancheta !== destino) throw new FalhaDeOperacao(`o grupo "${grupo.no.nome}" está em "${grupo.prancheta.nome}", não em "${destino.nome}"`, 'grupo');
      if (grupo && (grupo.no === no || (no.tipo === 'grupo' && todasAsCamadas(no.filhos).includes(grupo.no))))
        throw new FalhaDeOperacao(`o grupo "${no.nome}" não pode ir para dentro dele mesmo`, 'grupo');
      if (grupo?.no.bloqueado) throw new FalhaDeOperacao(`o grupo "${grupo.no.nome}" está bloqueado e não recebe camadas`, 'grupo');
      // outra prancheta: o nome é único dentro dela. O que colidir ganha número; o id continua o mesmo
      let transferido = no;
      if (destino !== achado.prancheta) {
        const ocupados = new Set(todasAsCamadas(destino.filhos).map((n) => n.nome));
        const renomear = (n: TNo): TNo => {
          const nome = nomeLivre(ocupados, n.nome);
          const filhos = n.tipo === 'grupo' ? n.filhos.map(renomear) : undefined;
          const mudouDentro = n.tipo === 'grupo' && filhos?.some((f, i) => f !== n.filhos[i]);
          if (nome === n.nome && !mudouDentro) return n;
          if (nome !== n.nome) tocados.add(n.id);
          return { ...n, nome, ...(filhos ? { filhos } : {}) } as TNo;
        };
        transferido = renomear(no);
      }
      tocados.add(no.id);
      const inserir = (lista: readonly TNo[]): TNo[] => {
        const indice = op.posicao === 'frente' ? lista.length : op.posicao === 'tras' ? 0 : Math.min(op.posicao, lista.length);
        return [...lista.slice(0, indice), transferido, ...lista.slice(indice)];
      };
      const sem = substituir(doc, achado, []);
      const prancheta = sem.pranchetas.find((p) => p.id === destino.id) as Prancheta;
      if (!grupo) return comPrancheta(sem, { ...prancheta, filhos: inserir(prancheta.filhos) });
      const filhos = trocarFilhosDoGrupo(prancheta.filhos, grupo.no.id, inserir);
      if (!filhos) throw new FalhaDeOperacao(`o grupo "${grupo.no.nome}" não está mais em "${prancheta.nome}"`, 'grupo');
      return comPrancheta(sem, { ...prancheta, filhos });
    }
    case 'remover': {
      const achado = acharNo(doc, op.alvo);
      exigirDesbloqueado(achado.no, autoria);
      return substituir(doc, achado, []);
    }
    case 'alinhar': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      const prancheta = (achados[0] as NoAchado).prancheta;
      if (achados.some((a) => a.prancheta !== prancheta)) throw new FalhaDeOperacao('alinhar só funciona dentro de uma prancheta', 'alvos');
      const ponto = (c: Caixa) => ({ esquerda: c.x, direita: c.x + c.w, topo: c.y, base: c.y + c.h, 'centro-horizontal': c.x + c.w / 2, 'centro-vertical': c.y + c.h / 2 })[op.borda];
      const pranchetaComoCaixa = { x: 0, y: 0, w: prancheta.largura, h: prancheta.altura };
      const alvoValor = op.valor ?? ponto(op.referencia === 'prancheta' ? pranchetaComoCaixa : tintaDe(medidor, (achados[0] as NoAchado).no));
      const horizontal = op.borda === 'esquerda' || op.borda === 'direita' || op.borda === 'centro-horizontal';
      let atual = doc;
      for (const { no: original } of achados) {
        // acha de novo pelo id: um alvo anterior do mesmo lote pode ter trocado o caminho até este
        const achado = acharNo(atual, original.id);
        exigirDesbloqueado(achado.no, autoria);
        const delta = alvoValor - ponto(tintaDe(medidor, achado.no));
        atual = substituir(atual, achado, [deslocarNo(achado.no, horizontal ? delta : 0, horizontal ? 0 : delta)]);
        tocados.add(original.id);
      }
      return atual;
    }
    case 'distribuir': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      if (achados.some((a) => a.prancheta !== (achados[0] as NoAchado).prancheta)) throw new FalhaDeOperacao('distribuir só funciona dentro de uma prancheta', 'alvos');
      const vertical = op.eixo === 'vertical';
      const primeira = tintaDe(medidor, (achados[0] as NoAchado).no);
      let fim = vertical ? primeira.y + primeira.h : primeira.x + primeira.w;
      let atual = doc;
      for (const { no: original } of achados.slice(1)) {
        const achado = acharNo(atual, original.id);
        exigirDesbloqueado(achado.no, autoria);
        const c = tintaDe(medidor, achado.no);
        const delta = fim + op.espaco - (vertical ? c.y : c.x);
        atual = substituir(atual, achado, [deslocarNo(achado.no, vertical ? 0 : delta, vertical ? delta : 0)]);
        fim = vertical ? c.y + delta + c.h : c.x + delta + c.w;
        tocados.add(original.id);
      }
      return atual;
    }
    case 'definirEstiloDeTexto': {
      const estilo = {
        peso: 400 as const,
        entrelinha: 1.15,
        espacamento: 0,
        caixaAlta: false,
        versalete: false,
        fonte: op.estilo.fonte,
        tamanho: op.estilo.tamanho,
        ...(op.estilo.peso !== undefined ? { peso: op.estilo.peso } : {}),
        ...(op.estilo.entrelinha !== undefined ? { entrelinha: op.estilo.entrelinha } : {}),
        ...(op.estilo.espacamento !== undefined ? { espacamento: op.estilo.espacamento } : {}),
        ...(op.estilo.caixaAlta !== undefined ? { caixaAlta: op.estilo.caixaAlta } : {}),
        ...(op.estilo.versalete !== undefined ? { versalete: op.estilo.versalete } : {}),
      };
      // redefinir o estilo muda todas as camadas ligadas a ele, em todas as pranchetas; as outras ficam como estão
      const pranchetas = doc.pranchetas.map((p) => {
        const filhos = mapearFolhas(p.filhos, (n) => {
          if (n.tipo !== 'texto' || n.estiloDeTexto !== op.nome || n.bloqueado) return n;
          tocados.add(n.id);
          return validarNo({ ...n, ...estilo, estiloDeTexto: op.nome });
        });
        return filhos === p.filhos ? p : { ...p, filhos };
      });
      return { ...doc, tokens: { ...doc.tokens, estilosDeTexto: { ...doc.tokens.estilosDeTexto, [op.nome]: estilo } }, pranchetas };
    }
    case 'aplicarEstiloDeTexto': {
      const estilo = doc.tokens.estilosDeTexto[op.estilo];
      if (!estilo) throw new FalhaDeOperacao(`o estilo "${op.estilo}" não existe; crie com definirEstiloDeTexto. Estilos: ${Object.keys(doc.tokens.estilosDeTexto).join(', ') || 'nenhum'}`, 'estilo');
      let atual = doc;
      for (const alvo of op.alvos) {
        const achado = acharNo(atual, alvo);
        const { no } = achado;
        if (no.tipo !== 'texto') throw new FalhaDeOperacao(`"${no.nome}" não é texto`, 'alvos');
        exigirDesbloqueado(no, autoria);
        atual = substituir(atual, achado, [validarNo({ ...no, ...estilo, estiloDeTexto: op.estilo })]);
        tocados.add(no.id);
      }
      return atual;
    }
    case 'definirToken': {
      // as pranchetas não mudam de objeto, mas a cor de quem usa o token muda: essas camadas contam como tocadas,
      // e quem guarda render em cache precisa olhar também para doc.tokens.cores
      const referencia = `token:${op.nome}`;
      for (const p of doc.pranchetas) {
        if (p.fundo === referencia) tocados.add(p.id);
        for (const n of todasAsCamadas(p.filhos)) if (coresDoNo(n).includes(referencia)) tocados.add(n.id);
      }
      return { ...doc, tokens: { ...doc.tokens, cores: { ...doc.tokens.cores, [op.nome]: op.valor.toLowerCase() } } };
    }
  }
}

/**
 * Aplica o lote e devolve um documento novo. O original nunca é mutado, e tudo o que o lote não tocou
 * (prancheta, grupo, nó, tokens) continua sendo o mesmo objeto no documento novo.
 */
export function aplicarLote(doc: Documento, operacoes: readonly unknown[], contexto: ContextoDoLote): ResultadoDoLote {
  const gerarId = contexto.gerarId ?? idsDoLote(contexto.idDoLote);
  const tocados = new Set<string>();
  let atual = doc;
  for (let i = 0; i < operacoes.length; i++) {
    const bruta = operacoes[i];
    const parse = Operacao.safeParse(bruta, EM_PORTUGUES);
    const nomeOp = typeof bruta === 'object' && bruta && 'op' in bruta ? String((bruta as { op: unknown }).op) : '?';
    if (!parse.success) {
      const q = parse.error.issues[0] as z.core.$ZodIssue;
      const desconhecida = q.path.length === 1 && q.path[0] === 'op';
      return { ok: false, erro: { indice: i, op: nomeOp, campo: q.path.join('.'), mensagem: desconhecida ? `a operação "${nomeOp}" não existe no catálogo` : q.message } };
    }
    let sequencia = 0;
    try {
      atual = aplicarUma({ doc: atual, autoria: contexto.autoria, tocados, medidor: contexto.medidor ?? medidorPorCaixa, novoId: () => gerarId(i, sequencia++) }, parse.data);
    } catch (e) {
      const alvo = 'alvo' in parse.data ? parse.data.alvo : 'alvos' in parse.data ? parse.data.alvos.join(', ') : 'prancheta' in parse.data ? parse.data.prancheta : undefined;
      const erro: ErroDeOperacao = { indice: i, op: nomeOp, mensagem: e instanceof Error ? e.message : String(e) };
      if (alvo) erro.alvo = alvo;
      if (e instanceof FalhaDeOperacao && e.campo) erro.campo = e.campo;
      return { ok: false, erro };
    }
  }
  return { ok: true, doc: atual, tocados: [...tocados] };
}

export function descreverErro(e: ErroDeOperacao): string {
  return `operação ${e.indice} (${e.op})${e.alvo ? ` em "${e.alvo}"` : ''}${e.campo ? `, campo ${e.campo}` : ''}: ${e.mensagem}. Nada do lote foi aplicado.`;
}
