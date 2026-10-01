// Catálogo fechado de operações (ADR 027, item 3). Designer e agente usam as mesmas.
// Um lote se aplica em transação: ou entra inteiro, ou nada entra.
import { z } from 'zod';
import {
  Cor,
  type Autoria,
  type Documento,
  caixaVisual,
  coresDoVetor,
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
  type No as TNo,
  type Prancheta,
  novoId,
  todasAsCamadas,
} from './esquema';

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
const NoNovo = z.discriminatedUnion('tipo', [semId(NoForma), semId(NoTexto), semId(NoImagem), semId(NoVetor), semId(NoAjuste), GrupoNovo] as never) as unknown as z.ZodType<
  Omit<TNo, 'id'>
>;

export const Operacao = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('criarPrancheta'),
    nome: z.string().min(1),
    largura: z.number().int().positive(),
    altura: z.number().int().positive(),
    fundo: Cor,
  }),
  z.object({
    op: z.literal('duplicarPrancheta'),
    prancheta: AlvoPrancheta,
    nome: z.string().min(1),
    largura: z.number().int().positive(),
    altura: z.number().int().positive(),
  }).describe('Copia a prancheta com todas as camadas para um novo formato. As camadas são reescaladas proporcionalmente só como ponto de partida: reposicione depois.'),
  z.object({
    op: z.literal('alterarPrancheta'),
    prancheta: AlvoPrancheta,
    props: z.object({ nome: z.string().min(1), fundo: Cor }).partial(),
  }),
  z.object({ op: z.literal('removerPrancheta'), prancheta: AlvoPrancheta }),
  z.object({
    op: z.literal('criarNo'),
    prancheta: AlvoPrancheta,
    no: NoNovo,
    grupo: Alvo.optional().describe('opcional: cria dentro deste grupo (no topo dele)'),
  }).describe('Cria uma camada no topo da prancheta (ou do grupo). Nome único dentro da prancheta.'),
  z.object({
    op: z.literal('agrupar'),
    alvos: z.array(Alvo).min(1).describe('camadas irmãs (mesmo pai)'),
    nome: z.string().min(1),
    modoDeMesclagem: ModoDoGrupo.optional(),
  }).describe('Põe as camadas num grupo novo, na posição da mais alta delas. O grupo pode ter máscara, opacidade e modo de mesclagem próprios.'),
  z.object({ op: z.literal('desagrupar'), alvo: Alvo }).describe('Desfaz o grupo, mantendo as camadas no lugar.'),
  z.object({
    op: z.literal('alterar'),
    alvo: Alvo,
    props: z.record(z.string(), z.unknown()).describe('propriedades a trocar, do mesmo tipo do nó (ex.: {"tamanho": 96, "cor": "token:primaria"}); null remove sombra, traco ou recorte'),
  }),
  z.object({
    op: z.literal('recolorir'),
    alvo: Alvo,
    cores: z.record(z.string(), Cor).describe('cor atual → cor nova (ex.: {"#0037a6": "token:texto"}); "*" troca todas (versão monocromática)'),
  }).describe('Troca as cores de um vetor (logo, ícone), no preenchimento e no traço, sem tocar no desenho. É o único jeito de recolorir um logo.'),
  z.object({ op: z.literal('mover'), alvo: Alvo, x: z.number(), y: z.number() }),
  z.object({
    op: z.literal('reordenar'),
    alvo: Alvo,
    posicao: z.union([z.enum(['frente', 'tras']), z.number().int().min(0)]).describe('"frente", "tras" ou índice (0 = embaixo)'),
  }),
  z.object({ op: z.literal('remover'), alvo: Alvo }),
  z.object({
    op: z.literal('alinhar'),
    alvos: z.array(Alvo).min(1),
    borda: z.enum(['esquerda', 'direita', 'topo', 'base', 'centro-horizontal', 'centro-vertical']),
    valor: z.number().optional().describe('coordenada exata a alinhar; sem ela, alinha ao primeiro alvo (ou à prancheta, com referencia)'),
    referencia: z.enum(['primeiro', 'prancheta']).default('primeiro'),
  }).describe('Alinha camadas pela TINTA (onde as letras e formas aparecem), não pela caixa. Ex.: todas as bordas esquerdas na margem.'),
  z.object({
    op: z.literal('distribuir'),
    alvos: z.array(Alvo).min(2).describe('na ordem de leitura (de cima para baixo ou da esquerda para a direita)'),
    eixo: z.enum(['vertical', 'horizontal']).default('vertical'),
    espaco: z.number().min(0).describe('espaço exato entre a tinta de um e a do seguinte, em px'),
  }).describe('Empilha camadas com espaço exato entre as tintas. O primeiro alvo não se move.'),
  z.object({
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
  }).describe('Cria ou redefine um estilo de texto da identidade (ex.: "titulo", "subtitulo", "corpo"). Toda camada ligada a ele muda junto.'),
  z.object({
    op: z.literal('aplicarEstiloDeTexto'),
    alvos: z.array(Alvo).min(1),
    estilo: z.string(),
  }).describe('Aplica um estilo de texto às camadas de texto (fonte, peso, tamanho, entrelinha, tracking) e as liga a ele.'),
  z.object({
    op: z.literal('definirToken'),
    nome: z.string().regex(/^[a-z0-9-]+$/),
    valor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).describe('Cria ou troca um token de cor. Todo nó que usa "token:nome" muda junto.'),
]);
export type Operacao = z.infer<typeof Operacao>;

export const Lote = z.object({
  descricao: z.string().min(1).describe('o que este lote faz, em uma frase'),
  operacoes: z.array(Operacao).min(1),
});
export type Lote = z.infer<typeof Lote>;

/** Onde uma camada de fato aparece. Texto: pela tinta das letras. Sem medidor, usa a caixa. */
export interface Medidor {
  tinta(no: TNo): { x: number; y: number; w: number; h: number };
}

type Caixa = { x: number; y: number; w: number; h: number };

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

/** Desloca a camada (e, se for grupo, tudo dentro); máscara de forma vai junto, como no Photoshop. */
function deslocar(no: TNo, dx: number, dy: number): void {
  const r = (v: number) => Math.round(v * 100) / 100;
  if (no.mascara?.tipo === 'forma') no.mascara = { ...no.mascara, x: r(no.mascara.x + dx), y: r(no.mascara.y + dy) };
  if (ehVisual(no)) {
    no.x = r(no.x + dx);
    no.y = r(no.y + dy);
  } else if (no.tipo === 'grupo') for (const f of no.filhos) deslocar(f, dx, dy);
}

export interface ErroDeOperacao {
  indice: number;
  op: string;
  alvo?: string;
  campo?: string;
  mensagem: string;
}

export type ResultadoDoLote =
  | { ok: true; doc: Documento; tocados: string[] }
  | { ok: false; erro: ErroDeOperacao };

class FalhaDeOperacao extends Error {
  constructor(
    mensagem: string,
    readonly campo?: string,
  ) {
    super(mensagem);
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
  /** a lista que contém o nó (filhos da prancheta ou do grupo) */
  irmaos: TNo[];
  indice: number;
  pai?: NoGrupo;
}

function procurar(lista: TNo[], teste: (n: TNo) => boolean, pai?: NoGrupo): Omit<NoAchado, 'prancheta'> | undefined {
  for (let i = 0; i < lista.length; i++) {
    const n = lista[i]!;
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
    const nome = alvo.slice(barra + 1).split('/').at(-1)!;
    const achado = procurar(prancheta.filhos, (n) => n.nome === nome);
    if (achado) return { prancheta, ...achado };
    throw new FalhaDeOperacao(`camada "${nome}" não existe em "${prancheta.nome}". Camadas: ${todasAsCamadas(prancheta.filhos).map((n) => n.nome).join(', ') || 'nenhuma'}`);
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

/** Dá id a uma camada nova (e aos filhos, se for grupo com filhos). */
function comIds(bruto: Record<string, unknown>): Record<string, unknown> {
  const filhos = Array.isArray(bruto.filhos) ? (bruto.filhos as Record<string, unknown>[]).map(comIds) : bruto.tipo === 'grupo' ? [] : undefined;
  return { ...bruto, id: novoId(), ...(filhos ? { filhos } : {}) };
}

function validarNo(bruto: unknown): TNo {
  const r = No.safeParse(bruto);
  if (!r.success) {
    const q = r.error.issues[0]!;
    throw new FalhaDeOperacao(q.message, q.path.join('.'));
  }
  return r.data;
}

function aplicarUma(doc: Documento, op: Operacao, autoria: Autoria, tocados: Set<string>, medidor: Medidor): void {
  switch (op.op) {
    case 'criarPrancheta': {
      if (doc.pranchetas.some((p) => p.nome === op.nome)) throw new FalhaDeOperacao(`já existe a prancheta "${op.nome}"`, 'nome');
      const p: Prancheta = { id: novoId(), nome: op.nome, tipo: 'prancheta', largura: op.largura, altura: op.altura, fundo: op.fundo, filhos: [] };
      doc.pranchetas.push(p);
      tocados.add(p.id);
      return;
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
        return { ...m, x: Math.round(cx - largura / 2), y: Math.round(cy - altura / 2), largura: Math.round(largura), altura: Math.round(altura), raio: Math.round(m.raio * s), suavizar: Math.round(m.suavizar * s) };
      };
      const copiar = (n: TNo): TNo => {
        const copia = { ...structuredClone(n), id: novoId() } as TNo;
        copia.mascara = escalarMascara(copia.mascara);
        if (copia.mascara === undefined) delete copia.mascara;
        if (copia.tipo === 'grupo') {
          copia.filhos = copia.filhos.map(copiar);
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
      const p: Prancheta = { id: novoId(), nome: op.nome, tipo: 'prancheta', largura: op.largura, altura: op.altura, fundo: origem.fundo, filhos };
      doc.pranchetas.push(p);
      tocados.add(p.id);
      todasAsCamadas(filhos).forEach((n) => tocados.add(n.id));
      return;
    }
    case 'alterarPrancheta': {
      const p = acharPrancheta(doc, op.prancheta);
      if (op.props.nome && op.props.nome !== p.nome && doc.pranchetas.some((x) => x.nome === op.props.nome)) {
        throw new FalhaDeOperacao(`já existe a prancheta "${op.props.nome}"`, 'nome');
      }
      Object.assign(p, op.props);
      tocados.add(p.id);
      return;
    }
    case 'removerPrancheta': {
      const p = acharPrancheta(doc, op.prancheta);
      const travada = todasAsCamadas(p.filhos).find((n) => n.bloqueado);
      if (travada) throw new FalhaDeOperacao(`a prancheta tem a camada bloqueada "${travada.nome}"`);
      doc.pranchetas = doc.pranchetas.filter((x) => x !== p);
      return;
    }
    case 'criarNo': {
      const p = acharPrancheta(doc, op.prancheta);
      const no = validarNo(comIds(op.no as Record<string, unknown>));
      for (const n of [no, ...(no.tipo === 'grupo' ? todasAsCamadas(no.filhos) : [])]) exigirNomeLivre(p, n.nome);
      if (op.grupo) {
        const destino = acharNo(doc, op.grupo);
        if (destino.prancheta !== p) throw new FalhaDeOperacao(`o grupo "${op.grupo}" não está em "${p.nome}"`, 'grupo');
        if (destino.no.tipo !== 'grupo') throw new FalhaDeOperacao(`"${destino.no.nome}" não é um grupo`, 'grupo');
        destino.no.filhos.push(no);
      } else p.filhos.push(no);
      tocados.add(no.id);
      return;
    }
    case 'agrupar': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      const irmaos = achados[0]!.irmaos;
      if (achados.some((a) => a.irmaos !== irmaos)) throw new FalhaDeOperacao('só dá para agrupar camadas que estão no mesmo nível (mesmo pai)', 'alvos');
      exigirNomeLivre(achados[0]!.prancheta, op.nome);
      for (const a of achados) exigirDesbloqueado(a.no, autoria);
      const ordenados = [...achados].sort((a, b) => a.indice - b.indice);
      const topo = ordenados.at(-1)!.indice;
      const grupo = validarNo({ id: novoId(), tipo: 'grupo', nome: op.nome, ...(op.modoDeMesclagem ? { modoDeMesclagem: op.modoDeMesclagem } : {}), filhos: ordenados.map((a) => a.no) });
      const ids = new Set(achados.map((a) => a.no.id));
      const restantes = irmaos.filter((n, i) => !ids.has(n.id) || i === topo);
      const posicao = restantes.findIndex((n) => n.id === irmaos[topo]!.id);
      restantes.splice(posicao, 1, grupo);
      irmaos.splice(0, irmaos.length, ...restantes);
      tocados.add(grupo.id);
      return;
    }
    case 'desagrupar': {
      const { no, irmaos, indice } = acharNo(doc, op.alvo);
      if (no.tipo !== 'grupo') throw new FalhaDeOperacao(`"${no.nome}" não é um grupo`, 'alvo');
      exigirDesbloqueado(no, autoria);
      irmaos.splice(indice, 1, ...no.filhos);
      no.filhos.forEach((f) => tocados.add(f.id));
      return;
    }
    case 'alterar': {
      const { prancheta, no, irmaos, indice } = acharNo(doc, op.alvo);
      exigirDesbloqueado(no, autoria, op.props);
      if ('id' in op.props || 'tipo' in op.props || 'filhos' in op.props) throw new FalhaDeOperacao('id, tipo e filhos não mudam por alterar', 'props');
      // null remove a propriedade opcional (sombra, traço, recorte, máscara); undefined não sobrevive ao JSON
      const mesclado: Record<string, unknown> = { ...no, ...op.props };
      for (const [k, v] of Object.entries(op.props)) if (v === null) delete mesclado[k];
      const novo = validarNo(mesclado);
      if (novo.nome !== no.nome) exigirNomeLivre(prancheta, novo.nome, no.id);
      // o desenho de um vetor importado é do cliente: cor muda (recolorir), forma não
      if (no.tipo === 'vetor' && no.origem && novo.tipo === 'vetor' && novo.caminhos.map((c) => c.d).join('|') !== no.caminhos.map((c) => c.d).join('|'))
        throw new FalhaDeOperacao(`o desenho de "${no.nome}" veio do arquivo ${no.origem.nome} e não muda por alterar. Para trocar cores use {"op":"recolorir","alvo":"${op.alvo}","cores":{"*":"token:..."}}; para o tamanho, largura e altura`, 'props.caminhos');
      irmaos[indice] = novo;
      tocados.add(no.id);
      return;
    }
    case 'recolorir': {
      const { no, irmaos, indice } = acharNo(doc, op.alvo);
      exigirDesbloqueado(no, autoria);
      if (no.tipo !== 'vetor') throw new FalhaDeOperacao(`"${no.nome}" é ${no.tipo}; recolorir vale para vetor (logo, ícone). Nas outras camadas use alterar`, 'alvo');
      const existentes = coresDoVetor(no);
      const chave = (c: string) => c.toLowerCase();
      const troca = new Map(Object.entries(op.cores).map(([de, para]) => [chave(de), para]));
      for (const de of troca.keys()) if (de !== '*' && !existentes.some((c) => chave(c) === de)) throw new FalhaDeOperacao(`"${no.nome}" não tem a cor ${de}. Cores do vetor: ${existentes.join(', ')}`, 'cores');
      const nova = (c: string) => troca.get(chave(c)) ?? troca.get('*') ?? c;
      irmaos[indice] = { ...no, caminhos: no.caminhos.map((c) => ({ ...c, ...(c.preenchimento ? { preenchimento: nova(c.preenchimento) } : {}), ...(c.traco ? { traco: { ...c.traco, cor: nova(c.traco.cor) } } : {}) })) };
      tocados.add(no.id);
      return;
    }
    case 'mover': {
      const { no } = acharNo(doc, op.alvo);
      exigirDesbloqueado(no, autoria);
      const c = caixaDe(no);
      if (!c) throw new FalhaDeOperacao(`"${no.nome}" é uma camada de ajuste e não tem posição`);
      deslocar(no, op.x - c.x, op.y - c.y);
      tocados.add(no.id);
      return;
    }
    case 'reordenar': {
      const { no, irmaos, indice } = acharNo(doc, op.alvo);
      exigirDesbloqueado(no, autoria);
      irmaos.splice(indice, 1);
      const destino = op.posicao === 'frente' ? irmaos.length : op.posicao === 'tras' ? 0 : Math.min(op.posicao, irmaos.length);
      irmaos.splice(destino, 0, no);
      tocados.add(no.id);
      return;
    }
    case 'remover': {
      const { no, irmaos, indice } = acharNo(doc, op.alvo);
      exigirDesbloqueado(no, autoria);
      irmaos.splice(indice, 1);
      return;
    }
    case 'alinhar': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      const prancheta = achados[0]!.prancheta;
      if (achados.some((a) => a.prancheta !== prancheta)) throw new FalhaDeOperacao('alinhar só funciona dentro de uma prancheta', 'alvos');
      const ponto = (c: Caixa) => ({ esquerda: c.x, direita: c.x + c.w, topo: c.y, base: c.y + c.h, 'centro-horizontal': c.x + c.w / 2, 'centro-vertical': c.y + c.h / 2 })[op.borda];
      const pranchetaComoCaixa = { x: 0, y: 0, w: prancheta.largura, h: prancheta.altura };
      const alvoValor = op.valor ?? ponto(op.referencia === 'prancheta' ? pranchetaComoCaixa : tintaDe(medidor, achados[0]!.no));
      const horizontal = op.borda === 'esquerda' || op.borda === 'direita' || op.borda === 'centro-horizontal';
      for (const { no } of achados) {
        exigirDesbloqueado(no, autoria);
        const delta = alvoValor - ponto(tintaDe(medidor, no));
        deslocar(no, horizontal ? delta : 0, horizontal ? 0 : delta);
        tocados.add(no.id);
      }
      return;
    }
    case 'distribuir': {
      const achados = op.alvos.map((a) => acharNo(doc, a));
      if (achados.some((a) => a.prancheta !== achados[0]!.prancheta)) throw new FalhaDeOperacao('distribuir só funciona dentro de uma prancheta', 'alvos');
      const vertical = op.eixo === 'vertical';
      const primeira = tintaDe(medidor, achados[0]!.no);
      let fim = vertical ? primeira.y + primeira.h : primeira.x + primeira.w;
      for (const { no } of achados.slice(1)) {
        exigirDesbloqueado(no, autoria);
        const c = tintaDe(medidor, no);
        const delta = fim + op.espaco - (vertical ? c.y : c.x);
        deslocar(no, vertical ? 0 : delta, vertical ? delta : 0);
        fim = vertical ? c.y + delta + c.h : c.x + delta + c.w;
        tocados.add(no.id);
      }
      return;
    }
    case 'definirEstiloDeTexto': {
      const estilo = { peso: 400 as const, entrelinha: 1.15, espacamento: 0, caixaAlta: false, versalete: false, ...op.estilo };
      doc.tokens.estilosDeTexto = { ...(doc.tokens.estilosDeTexto ?? {}), [op.nome]: estilo };
      // redefinir o estilo muda todas as camadas ligadas a ele, em todas as pranchetas
      for (const p of doc.pranchetas) {
        const refazer = (lista: TNo[]) =>
          lista.forEach((n, i) => {
            if (n.tipo === 'grupo') return refazer(n.filhos);
            if (n.tipo !== 'texto' || n.estiloDeTexto !== op.nome) return;
            if (n.bloqueado) return;
            lista[i] = validarNo({ ...n, ...estilo, estiloDeTexto: op.nome });
            tocados.add(n.id);
          });
        refazer(p.filhos);
      }
      return;
    }
    case 'aplicarEstiloDeTexto': {
      const estilo = doc.tokens.estilosDeTexto?.[op.estilo];
      if (!estilo) throw new FalhaDeOperacao(`o estilo "${op.estilo}" não existe; crie com definirEstiloDeTexto. Estilos: ${Object.keys(doc.tokens.estilosDeTexto ?? {}).join(', ') || 'nenhum'}`, 'estilo');
      for (const alvo of op.alvos) {
        const { no, irmaos, indice } = acharNo(doc, alvo);
        if (no.tipo !== 'texto') throw new FalhaDeOperacao(`"${no.nome}" não é texto`, 'alvos');
        exigirDesbloqueado(no, autoria);
        irmaos[indice] = validarNo({ ...no, ...estilo, estiloDeTexto: op.estilo });
        tocados.add(no.id);
      }
      return;
    }
    case 'definirToken': {
      doc.tokens.cores[op.nome] = op.valor.toLowerCase();
      return;
    }
  }
}

/** Aplica o lote numa cópia. O documento original nunca é mutado. */
export function aplicarLote(doc: Documento, operacoes: unknown[], autoria: Autoria, medidor: Medidor = medidorPorCaixa): ResultadoDoLote {
  const copia = structuredClone(doc);
  const tocados = new Set<string>();
  for (let i = 0; i < operacoes.length; i++) {
    const bruta = operacoes[i];
    const parse = Operacao.safeParse(bruta);
    const nomeOp = typeof bruta === 'object' && bruta && 'op' in bruta ? String((bruta as { op: unknown }).op) : '?';
    if (!parse.success) {
      const q = parse.error.issues[0]!;
      return { ok: false, erro: { indice: i, op: nomeOp, campo: q.path.join('.'), mensagem: q.message } };
    }
    try {
      aplicarUma(copia, parse.data, autoria, tocados, medidor);
    } catch (e) {
      const alvo = 'alvo' in parse.data ? parse.data.alvo : 'alvos' in parse.data ? parse.data.alvos.join(', ') : 'prancheta' in parse.data ? parse.data.prancheta : undefined;
      const erro: ErroDeOperacao = { indice: i, op: nomeOp, mensagem: e instanceof Error ? e.message : String(e) };
      if (alvo) erro.alvo = alvo;
      if (e instanceof FalhaDeOperacao && e.campo) erro.campo = e.campo;
      return { ok: false, erro };
    }
  }
  return { ok: true, doc: copia, tocados: [...tocados] };
}

export function descreverErro(e: ErroDeOperacao): string {
  return `operação ${e.indice} (${e.op})${e.alvo ? ` em "${e.alvo}"` : ''}${e.campo ? `, campo ${e.campo}` : ''}: ${e.mensagem}. Nada do lote foi aplicado.`;
}
