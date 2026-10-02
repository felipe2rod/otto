// O formulário de briefing como estado de tela (docs/mvp/experiencia.md, 3.4), e as formas em que ele
// sai daqui: o pedido de tarefa, o briefing salvo (o formulário pela metade) e o rascunho local.
// Contrato: packages/shared/src/briefing.ts. O formulário é fechado no servidor: campo a mais dá 400,
// então nada vazio é mandado.
//
// BRIEFING É DADO, NÃO INSTRUÇÃO (ADR 033): tudo aqui vai como campo estruturado.
//
// IDENTIDADE. O formulário não guarda cor nem fonte da marca: manda `marcaId`, e o servidor completa com
// o que a marca tem naquele momento. Sem marca, não vai identidade nenhuma (a direção de arte escolhe);
// cor de exemplo nunca é mandada como se fosse da marca. A exceção é a identidade AVULSA: a de uma tarefa
// antiga cuja marca foi apagada, que continua no formulário como estava no dia do pedido.
import {
  CUIDADO_PADRAO,
  FORMATOS_POR_TAREFA,
  type FormatoDoBriefing,
  type FormularioDeBriefing,
  type IdentidadeDoBriefing,
  type Marca,
  OPCOES_DE_CUIDADO,
  type OpcaoDeCuidado,
  type OrigemDoArquivo,
  type RascunhoDeBriefing,
  type ReferenciaDeArquivo,
} from '@otto/shared';

/** Uma foto do formulário: o hash é o que vai ao servidor; o resto é para mostrar (medidas, nome, origem). */
export interface ImagemDoFormulario {
  sha256: string;
  nome?: string | undefined;
  largura?: number | undefined;
  altura?: number | undefined;
  origem?: OrigemDoArquivo | undefined;
}

export interface IdentidadeAvulsa {
  identidade?: IdentidadeDoBriefing;
  logo?: ReferenciaDeArquivo;
  icones?: ReferenciaDeArquivo[];
}

export type FonteDasImagens = 'minhas' | 'banco' | 'nenhuma';

export interface EstadoDoBriefing {
  nome: string;
  marcaId: string | null;
  avulsa: IdentidadeAvulsa | null;
  titulo: string;
  subtitulo: string;
  chamada: string;
  rodape: string;
  formatos: FormatoDoBriefing[];
  fonteDasImagens: FonteDasImagens;
  imagens: ImagemDoFormulario[];
  /** Sugestão de busca, quando é o Otto que procura no banco de imagens. */
  termos: string;
  objetivo: string;
  publico: string;
  cuidado: OpcaoDeCuidado;
  estilo: string[];
  /** Uma restrição por linha. */
  restricoes: string;
  observacoes: string;
  /** O briefing salvo de onde o formulário partiu: só conta o uso. */
  briefingId: string | null;
}

/** "Minhas imagens" vem marcado: foto de banco foi o gargalo da POC (experiencia.md, 3.4). */
export const ESTADO_VAZIO: EstadoDoBriefing = {
  nome: '',
  marcaId: null,
  avulsa: null,
  titulo: '',
  subtitulo: '',
  chamada: '',
  rodape: '',
  formatos: [],
  fonteDasImagens: 'minhas',
  imagens: [],
  termos: '',
  objetivo: '',
  publico: '',
  cuidado: CUIDADO_PADRAO,
  estilo: [],
  restricoes: '',
  observacoes: '',
  briefingId: null,
};

// ---------- o que falta ----------

export type Falta = 'titulo' | 'formato' | 'formato_invalido' | 'formato_repetido' | 'imagem';

const formatoValido = (f: FormatoDoBriefing): boolean => f.nome.trim() !== '' && f.nome.trim().length <= 60 && [f.largura, f.altura].every((n) => Number.isInteger(n) && n >= 16 && n <= 30000);

/** O que impede o envio, na ordem em que a tela diz. Vazio: pode enviar. */
export function faltas(estado: EstadoDoBriefing): Falta[] {
  const lista: Falta[] = [];
  if (estado.titulo.trim() === '') lista.push('titulo');
  if (estado.formatos.length === 0) lista.push('formato');
  else if (!estado.formatos.every(formatoValido)) lista.push('formato_invalido');
  else if (new Set(estado.formatos.map((f) => f.nome.trim().toLowerCase())).size !== estado.formatos.length) lista.push('formato_repetido');
  if (estado.fonteDasImagens === 'minhas' && estado.imagens.length === 0) lista.push('imagem');
  return lista;
}

// ---------- formatos ----------

export const podeMaisUmFormato = (estado: EstadoDoBriefing): boolean => estado.formatos.length < FORMATOS_POR_TAREFA;
const mesmoFormato = (a: FormatoDoBriefing, b: FormatoDoBriefing): boolean => a.nome === b.nome && a.largura === b.largura && a.altura === b.altura;

/** Liga ou desliga um formato. No teto de formatos por tarefa, o que não está marcado não entra. */
export function alternarFormato(estado: EstadoDoBriefing, formato: FormatoDoBriefing): EstadoDoBriefing {
  if (estado.formatos.some((f) => mesmoFormato(f, formato))) return { ...estado, formatos: estado.formatos.filter((f) => !mesmoFormato(f, formato)) };
  return podeMaisUmFormato(estado) ? { ...estado, formatos: [...estado.formatos, formato] } : estado;
}

// ---------- para o servidor ----------

const linhas = (texto: string): string[] => [
  ...new Set(
    texto
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  ),
];
/** Só os campos de texto que têm conteúdo, aparados. */
function preenchidos<C extends string>(campos: Record<C, string>): Partial<Record<C, string>> {
  const saida: Partial<Record<C, string>> = {};
  for (const chave of Object.keys(campos) as C[]) if (campos[chave].trim() !== '') saida[chave] = campos[chave].trim();
  return saida;
}

/** O que é igual no pedido e no briefing salvo. */
function comum(estado: EstadoDoBriefing) {
  const restricoes = linhas(estado.restricoes);
  return {
    versao: 1 as const,
    ...preenchidos({ nome: estado.nome, objetivo: estado.objetivo, publico: estado.publico, observacoes: estado.observacoes }),
    ...(estado.marcaId ? { marcaId: estado.marcaId } : {}),
    ...(estado.estilo.length > 0 ? { estilo: estado.estilo } : {}),
    ...(restricoes.length > 0 ? { restricoes } : {}),
    ...(estado.avulsa ?? {}),
  };
}

type PedidoPorBriefing = { tipo: 'briefing'; briefing: FormularioDeBriefing; cuidado: OpcaoDeCuidado; briefingId?: string };

/** O corpo de POST /api/documentos/:id/tarefas. Só chame com `faltas(estado)` vazio. */
export function paraOPedido(estado: EstadoDoBriefing): PedidoPorBriefing {
  const termos = estado.termos.trim();
  const imagens: FormularioDeBriefing['imagens'] =
    estado.fonteDasImagens === 'minhas'
      ? { fonte: 'minhas', arquivos: estado.imagens.map((i) => i.sha256) }
      : estado.fonteDasImagens === 'banco'
        ? { fonte: 'banco', ...(termos ? { termos } : {}) }
        : { fonte: 'nenhuma' };
  const { titulo = '', ...outros } = preenchidos({ titulo: estado.titulo, subtitulo: estado.subtitulo, chamada: estado.chamada, rodape: estado.rodape });
  return {
    tipo: 'briefing',
    cuidado: estado.cuidado,
    briefing: { ...comum(estado), formatos: estado.formatos.map((f) => ({ ...f, nome: f.nome.trim() })), textos: { titulo, ...outros }, imagens },
    ...(estado.briefingId ? { briefingId: estado.briefingId } : {}),
  };
}

/** O que um briefing salvo guarda: o formulário pela metade e o cuidado. O nome é quem salva que dá. */
export function paraSalvar(estado: EstadoDoBriefing): { dados: RascunhoDeBriefing; cuidado: OpcaoDeCuidado } {
  const textos = preenchidos({ titulo: estado.titulo, subtitulo: estado.subtitulo, chamada: estado.chamada, rodape: estado.rodape });
  const termos = estado.termos.trim();
  const imagens: NonNullable<RascunhoDeBriefing['imagens']> =
    estado.fonteDasImagens === 'minhas'
      ? { fonte: 'minhas', arquivos: estado.imagens.map((i) => i.sha256) }
      : estado.fonteDasImagens === 'banco'
        ? { fonte: 'banco', ...(termos ? { termos } : {}) }
        : { fonte: 'nenhuma' };
  return {
    dados: { ...comum(estado), ...(estado.formatos.length > 0 ? { formatos: estado.formatos } : {}), ...(Object.keys(textos).length > 0 ? { textos } : {}), imagens },
    cuidado: estado.cuidado,
  };
}

// ---------- do servidor ----------

/** Um briefing salvo (ou o formulário de uma tarefa) como estado de tela. As medidas das fotos são relidas depois, pelo hash. */
export function doRascunho(dados: RascunhoDeBriefing, extras: { cuidado?: OpcaoDeCuidado | undefined; briefingId?: string } = {}): EstadoDoBriefing {
  const avulsa: IdentidadeAvulsa = {
    ...(dados.identidade ? { identidade: dados.identidade } : {}),
    ...(dados.logo ? { logo: dados.logo } : {}),
    ...(dados.icones?.length ? { icones: dados.icones } : {}),
  };
  return {
    ...ESTADO_VAZIO,
    nome: dados.nome ?? '',
    marcaId: dados.marcaId ?? null,
    avulsa: Object.keys(avulsa).length > 0 ? avulsa : null,
    titulo: dados.textos?.titulo ?? '',
    subtitulo: dados.textos?.subtitulo ?? '',
    chamada: dados.textos?.chamada ?? '',
    rodape: dados.textos?.rodape ?? '',
    formatos: dados.formatos ?? [],
    fonteDasImagens: dados.imagens?.fonte ?? ESTADO_VAZIO.fonteDasImagens,
    imagens: dados.imagens?.fonte === 'minhas' ? dados.imagens.arquivos.map((sha256) => ({ sha256 })) : [],
    termos: dados.imagens?.fonte === 'banco' ? (dados.imagens.termos ?? '') : '',
    objetivo: dados.objetivo ?? '',
    publico: dados.publico ?? '',
    cuidado: extras.cuidado ?? CUIDADO_PADRAO,
    estilo: dados.estilo ?? [],
    restricoes: (dados.restricoes ?? []).join('\n'),
    observacoes: dados.observacoes ?? '',
    briefingId: extras.briefingId ?? null,
  };
}

/**
 * "Nova peça com este briefing": o formulário de uma tarefa volta com a marca JÁ APLICADA (identidade,
 * logo, rodapé e restrições, como estavam no dia). Se a marca ainda existe, o que veio dela sai do
 * formulário, para ela completar de novo como está hoje. Se foi apagada, fica como identidade avulsa.
 */
export function daTarefa(origem: { briefing: FormularioDeBriefing; cuidado: OpcaoDeCuidado }, marcas: readonly Marca[]): EstadoDoBriefing {
  const estado = doRascunho(origem.briefing, { cuidado: origem.cuidado });
  const marca = marcas.find((m) => m.id === origem.briefing.marcaId);
  if (!marca) return { ...estado, marcaId: null };
  const daMarca = new Set(marca.restricoes ?? []);
  return {
    ...estado,
    avulsa: null,
    rodape: estado.rodape === (marca.rodape ?? '') ? '' : estado.rodape,
    restricoes: (origem.briefing.restricoes ?? []).filter((r) => !daMarca.has(r)).join('\n'),
  };
}

// ---------- rascunho local ----------

const CHAVE = 'otto.briefing.rascunho.v1';
const FONTES_DAS_IMAGENS: readonly string[] = ['minhas', 'banco', 'nenhuma'];
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehTexto = (v: unknown): v is string => typeof v === 'string';
const ehFormato = (v: unknown): boolean => ehObjeto(v) && ehTexto(v.nome) && typeof v.largura === 'number' && typeof v.altura === 'number';
const ehImagem = (v: unknown): boolean => ehObjeto(v) && ehTexto(v.sha256);

/** O rascunho é lido de um lugar que qualquer coisa pode ter escrito: confere a forma antes de usar. */
function ehEstado(v: unknown): v is EstadoDoBriefing {
  if (!ehObjeto(v)) return false;
  const textos = ['nome', 'titulo', 'subtitulo', 'chamada', 'rodape', 'termos', 'objetivo', 'publico', 'restricoes', 'observacoes'] as const;
  return (
    textos.every((campo) => ehTexto(v[campo])) &&
    (v.marcaId === null || ehTexto(v.marcaId)) &&
    (v.briefingId === null || ehTexto(v.briefingId)) &&
    (v.avulsa === null || ehObjeto(v.avulsa)) &&
    Array.isArray(v.formatos) &&
    v.formatos.length <= FORMATOS_POR_TAREFA &&
    v.formatos.every(ehFormato) &&
    Array.isArray(v.imagens) &&
    v.imagens.every(ehImagem) &&
    Array.isArray(v.estilo) &&
    v.estilo.every(ehTexto) &&
    FONTES_DAS_IMAGENS.includes(v.fonteDasImagens as string) &&
    (OPCOES_DE_CUIDADO as readonly unknown[]).includes(v.cuidado)
  );
}

type Guarda = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const estaVazio = (estado: EstadoDoBriefing): boolean => JSON.stringify(estado) === JSON.stringify(ESTADO_VAZIO);

/** Fechar a aba sem enviar não perde o que foi digitado. Fica só neste navegador. */
export function guardarRascunhoLocal(guarda: Guarda, estado: EstadoDoBriefing): void {
  try {
    if (estaVazio(estado)) guarda.removeItem(CHAVE);
    else guarda.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // navegador sem armazenamento (ou cheio): o formulário continua, só não lembra
  }
}

export function lerRascunhoLocal(guarda: Guarda): EstadoDoBriefing | undefined {
  try {
    const bruto = guarda.getItem(CHAVE);
    if (!bruto) return undefined;
    const lido: unknown = JSON.parse(bruto);
    return ehEstado(lido) ? { ...ESTADO_VAZIO, ...lido } : undefined;
  } catch {
    return undefined;
  }
}

export function apagarRascunhoLocal(guarda: Guarda): void {
  try {
    guarda.removeItem(CHAVE);
  } catch {
    // idem
  }
}
