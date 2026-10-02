// O que entra e o que sai do ciclo do agente, como dado validado por zod: a entrada da tarefa, o plano,
// o preparo (o que se guarda entre a primeira parte e o "pode"), os eventos de progresso e o resultado.
// É o que o servidor grava e o editor mostra. Este arquivo só importa zod e dois esquemas leves: é a entrada
// `@otto/agente/contrato`, para quem quer os tipos e a validação sem carregar o ciclo nem o prompt.
// É o que o servidor grava e o editor mostra. Nada aqui cita modelo, fornecedor ou custo em texto de tela.
//
// ADR 031: `EventoDaTarefa`, `Plano`, `Preparo` e `Entrega` carregam conteúdo do trabalho (texto de plano,
// nome de camada, operações). Vão para o banco, sob a conta. Não vão para log nem para evento de uso.
import { z } from 'zod';
import { Direcao } from './direcao-esquema';
import { EsforcoCriativoSchema } from './esforco-niveis';

// ---------- entrada ----------

export const FormatoPedido = z.object({
  nome: z.string().min(1).max(60),
  largura: z.number().int().min(16).max(30000),
  altura: z.number().int().min(16).max(30000),
});
export type FormatoPedido = z.infer<typeof FormatoPedido>;

/**
 * Briefing do formulário (ADR 033). O formulário de verdade é da fatia 4 e o esquema dele vai morar em
 * packages/shared; aqui está o que o ciclo usa. Campo a mais passa adiante: o briefing inteiro chega ao
 * modelo como material, entre cercas.
 */
export const Briefing = z.looseObject({
  nome: z.string().max(200).optional(),
  formatos: z.array(FormatoPedido).min(1).max(6),
  textos: z.record(z.string(), z.string().max(2000)).optional(),
});
export type Briefing = z.infer<typeof Briefing>;

const Pedido = z.string().trim().min(1).max(4000);
/** Camadas que o designer tinha selecionadas ao pedir ("sobre: Título"). É dado da tarefa, não instrução. */
const Selecao = z.array(z.string().min(1).max(200)).max(50);

export const EntradaDaTarefa = z.discriminatedUnion('tipo', [
  /** Formulário de briefing: cria uma prancheta por formato. */
  z.object({ tipo: z.literal('briefing'), briefing: Briefing, esforco: EsforcoCriativoSchema.optional() }),
  /** Pedido livre que cria UMA peça do zero. */
  z.object({ tipo: z.literal('criar'), pedido: Pedido, esforco: EsforcoCriativoSchema.optional() }),
  /** Pedido sobre a peça aberta: adaptar formato, variações, revisar, mexer em várias camadas. Passa por plano. */
  z.object({ tipo: z.literal('pedido'), pedido: Pedido, selecao: Selecao.optional(), esforco: EsforcoCriativoSchema.optional() }),
  /** Ajuste pontual numa prancheta, sem remover nada: o caminho rápido. Sem direção, sem plano do modelo, sem revisor. */
  z.object({ tipo: z.literal('ajuste'), pedido: Pedido, selecao: Selecao.optional() }),
]);
export type EntradaDaTarefa = z.infer<typeof EntradaDaTarefa>;

// ---------- plano ----------

export const Plano = z.object({
  /** O que o Otto vai fazer, em poucas linhas, para o designer ler. Vazio quando o plano saiu do formulário. */
  resumo: z.string().max(1200),
  /** Pranchetas novas. */
  criar: z.array(FormatoPedido).max(12),
  /** Pranchetas que já existem e serão alteradas. */
  alterar: z.array(z.object({ prancheta: z.string(), nome: z.string(), oQue: z.string().max(400) })).max(24),
  /** O que já existia e vai sair. Nunca vem misturado com o resto: é o que mais pede o "pode". */
  remover: z.array(z.object({ alvo: z.string(), nome: z.string(), prancheta: z.string(), tipo: z.enum(['camada', 'prancheta']), motivo: z.string().max(400) })).max(40),
  /**
   * Ajuste pontual: o plano não lista prancheta, mas a execução só deixa tocar UMA prancheta que já existia,
   * sem criar prancheta e sem remover o que já existia.
   */
  pontual: z.boolean().default(false),
});
export type Plano = z.infer<typeof Plano>;

export const MotivoDoPode = z.enum(['varias_pranchetas', 'remocao', 'sem_direcao']);
export type MotivoDoPode = z.infer<typeof MotivoDoPode>;

/** A direção em poucas linhas, para o cartão do "pode" (docs/mvp/experiencia.md, 3.5). */
export const CartaoDaDirecao = z.object({
  conceito: z.string(),
  assinatura: z.string(),
  paleta: z.array(z.object({ papel: z.enum(['dominante', 'apoio', 'acento', 'texto']), cor: z.string() })),
  tipografia: z.object({ titulo: z.string(), texto: z.string() }),
  imagem: z.string(),
});
export type CartaoDaDirecao = z.infer<typeof CartaoDaDirecao>;

// ---------- custo ----------

const Tokens = z.object({ entrada: z.number(), cacheLido: z.number(), cacheCriado: z.number(), saida: z.number() });

/** Só números e códigos: pode ir para registro de uso (ADR 031). Não vai ao navegador (docs/mvp/backend.md, 7.5). */
export const CustoDaTarefa = z.object({
  modelo: z.string(),
  chamadas: z.number(),
  tokens: Tokens,
  porPapel: z.record(z.string(), Tokens.extend({ chamadas: z.number() })),
  /** Imagens mandadas ao modelo: renders, prévias de foto e referências da marca. */
  imagensVistas: z.number(),
  /** Vezes que a verificação rodou a pedido do agente. */
  voltasDeConferencia: z.number(),
  lotes: z.number(),
  lotesRecusados: z.number(),
  duracaoMs: z.number(),
  /** Pelo preço que o modelo declara. null: o modelo não declarou preço. */
  dolares: z.number().nullable(),
});
export type CustoDaTarefa = z.infer<typeof CustoDaTarefa>;

// ---------- preparo: a primeira parte, guardada como dado ----------

export const VERSAO_DO_PREPARO = 1;

/**
 * Resultado da primeira parte da tarefa (entender e planejar). O servidor guarda; a aprovação do designer
 * dispara a segunda parte, que começa conversa nova com o modelo tendo isto na entrada. Nada depende de
 * retomar a conversa da primeira parte.
 */
export const Preparo = z.object({
  versao: z.literal(VERSAO_DO_PREPARO),
  /** null: a direção não saiu válida (ou a tarefa não tem direção: pedido e ajuste). */
  direcao: Direcao.nullable(),
  cartao: CartaoDaDirecao.nullable(),
  plano: Plano,
  /** A tarefa espera o "pode" do designer antes da segunda parte. */
  pedeConfirmacao: z.boolean(),
  motivos: z.array(MotivoDoPode),
  /** O Otto disse que não consegue fazer o que foi pedido. Não há segunda parte: a tarefa termina aqui. */
  naoConsigo: z.string().max(600).optional(),
  custo: CustoDaTarefa,
});
export type Preparo = z.infer<typeof Preparo>;

// ---------- etapas ----------

export const ETAPAS = ['leitura', 'direcao', 'plano', 'producao', 'conferencia', 'revisao', 'ajustes', 'entrega'] as const;
export const Etapa = z.enum(ETAPAS);
export type Etapa = z.infer<typeof Etapa>;

const PranchetaDaEtapa = z.object({ id: z.string().optional(), nome: z.string() });

/** Uma linha da lista de etapas que o painel mostra (docs/mvp/experiencia.md, 3.6). */
export const EtapaPrevista = z.object({ etapa: Etapa, prancheta: PranchetaDaEtapa.optional(), rodada: z.number().optional() });
export type EtapaPrevista = z.infer<typeof EtapaPrevista>;

// ---------- pendências e entrega ----------

export const TIPOS_DE_PENDENCIA = [
  'aviso_da_verificacao',
  'sem_conferencia',
  'resolucao_da_imagem',
  'imagem_de_banco',
  'marca_de_terceiro',
  'texto_escrito_pelo_otto',
  'nao_consigo',
  'fora_do_ajuste',
  'limite_de_conferencias',
  'limite_de_passos',
  'limite_de_custo',
  'limite_de_tempo',
  'interrompida',
  'erro',
  'outro',
] as const;

export const Pendencia = z.object({
  tipo: z.enum(TIPOS_DE_PENDENCIA),
  /** Frase provisória. O editor monta a dele pelo tipo (a marca ainda vai fechar o texto). */
  texto: z.string(),
  /** Ids das camadas a que se refere, para "ver". */
  camadas: z.array(z.string()),
  prancheta: z.string().optional(),
  /** Quem disse: o Otto na entrega, a verificação automática, ou o sistema (teto, interrupção). */
  origem: z.enum(['otto', 'verificacao', 'sistema']),
  regra: z.string().optional(),
  gravidade: z.enum(['erro', 'aviso']).optional(),
});
export type Pendencia = z.infer<typeof Pendencia>;

export const Entrega = z.object({ resumo: z.string(), pendencias: z.array(Pendencia) });
export type Entrega = z.infer<typeof Entrega>;

// ---------- eventos de progresso ----------

const AvisoDoLint = z.object({ regra: z.string(), gravidade: z.enum(['erro', 'aviso']), prancheta: z.string(), no: z.string().optional(), camada: z.string().optional(), mensagem: z.string() });

export const MOTIVOS_DE_RECUSA = ['lote_invalido', 'operacao_recusada', 'fora_do_plano', 'remocao_sem_plano', 'prancheta_a_mais', 'fora_do_ajuste', 'vetor_desconhecido'] as const;

export const EventoDaTarefa = z.discriminatedUnion('tipo', [
  /** Mudança de etapa. Vem do ciclo, não de dedução sobre os lotes. */
  z.object({ tipo: z.literal('etapa'), etapa: Etapa, prancheta: PranchetaDaEtapa.optional(), rodada: z.number().optional() }),
  /** A lista de etapas que a tarefa deve percorrer, para o painel desenhar as que faltam. Pode ser refeita. */
  z.object({ tipo: z.literal('etapas'), previstas: z.array(EtapaPrevista) }),
  z.object({ tipo: z.literal('direcao'), direcao: Direcao.nullable(), cartao: CartaoDaDirecao.nullable() }),
  z.object({ tipo: z.literal('plano'), plano: Plano, pedeConfirmacao: z.boolean(), motivos: z.array(MotivoDoPode) }),
  /** Fala do Otto durante o trabalho. Vai para o registro fechado ("como o Otto está trabalhando"). */
  z.object({ tipo: z.literal('mensagem'), texto: z.string() }),
  z.object({ tipo: z.literal('lote'), loteId: z.string(), descricao: z.string(), tocados: z.array(z.string()), operacoes: z.array(z.unknown()), versao: z.number().optional() }),
  z.object({ tipo: z.literal('lote-recusado'), motivo: z.enum(MOTIVOS_DE_RECUSA), detalhe: z.string().optional() }),
  z.object({ tipo: z.literal('render'), pranchetaId: z.string(), detalhe: z.boolean() }),
  /** `pranchetas`: ids das pranchetas conferidas nesta verificação, para o painel dizer qual foi conferida e com que resultado. */
  z.object({ tipo: z.literal('verificacao'), avisos: z.array(AvisoDoLint), novos: z.number(), pranchetas: z.array(z.string()).optional() }),
  z.object({ tipo: z.literal('imagem'), acao: z.enum(['busca', 'trazida', 'sujeito']), resultados: z.number().optional(), arquivo: z.string().optional() }),
  z.object({ tipo: z.literal('revisao'), rodada: z.number(), texto: z.string() }),
  z.object({ tipo: z.literal('erro'), codigo: z.string(), ferramenta: z.string().optional() }),
  z.object({ tipo: z.literal('entrega'), resumo: z.string(), pendencias: z.array(Pendencia) }),
]);
export type EventoDaTarefa = z.infer<typeof EventoDaTarefa>;

// ---------- resultado ----------

export const FINS_DA_TAREFA = ['entregue', 'cancelada', 'erro', 'limite_de_passos', 'limite_de_custo', 'limite_de_tempo'] as const;
export const FimDaTarefa = z.enum(FINS_DA_TAREFA);
export type FimDaTarefa = z.infer<typeof FimDaTarefa>;

export const ResultadoDaTarefa = z.object({
  /** Como o trabalho parou. Só "entregue" é entrega completa; o resto é entrega parcial, com o que foi feito preservado. */
  fim: FimDaTarefa,
  entrega: Entrega,
  /** A última versão foi renderizada, olhada e verificada antes da entrega. Falso em toda entrega parcial. */
  conferida: z.boolean(),
  /** Lotes aplicados. Zero: não há conjunto de alterações para revisar. */
  lotes: z.number(),
  /** Código do erro quando fim é "erro" (os de ErroDoModelo, ou "interno"). */
  erro: z.string().optional(),
  custo: CustoDaTarefa,
});
export type ResultadoDaTarefa = z.infer<typeof ResultadoDaTarefa>;

export { ARQUETIPOS_ACEITOS, Direcao } from './direcao-esquema';
export { ESFORCOS_CRIATIVOS, type EsforcoCriativo, EsforcoCriativoSchema } from './esforco-niveis';
