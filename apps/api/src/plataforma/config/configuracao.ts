// Configuração do processo, validada na subida. Faltou ou veio malformada: o processo não inicia.
// É o ÚNICO lugar (com main.ts e worker.ts, que só repassam) onde variável de ambiente é lida.
// Nome de fornecedor pode aparecer aqui, no valor que escolhe o adaptador (ADR 020, item 1).
import { type Alavancas, lerAlavancas } from '@otto/agente';
import { ContaId } from '@otto/shared';
import { z } from 'zod';

const Esquema = z
  .object({
    AMBIENTE: z.enum(['desenvolvimento', 'teste', 'producao']),
    PORTA: z.coerce.number().int().min(1).max(65535).default(3000),
    NIVEL_DE_LOG: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    BANCO_URL_APP: z.string().regex(/^postgres(ql)?:\/\//),
    // A URL do papel migrador não pode existir no processo que atende requisição (ADR 023, decisão 3).
    BANCO_URL_MIGRADOR: z.never().optional(),
    // Sem login no MVP (ADR 035, aceito pelo Felipe em 2026-10-02): o servidor resolve o escopo sempre
    // para uma conta fixa, semeada pela migração. Quando o login entrar, esta variável some e só
    // troca o adaptador de ResolvedorDeEscopo.
    CONTA_FIXA_ID: ContaId,
    // 's3' é o contrato (qualquer servidor compatível); 'disco-local' é o plano B, de uma máquina só.
    ARMAZENAMENTO_ADAPTADOR: z.enum(['s3', 'disco-local']),
    ARMAZENAMENTO_PASTA: z.string().min(1).optional(),
    ARMAZENAMENTO_ENDERECO: z
      .string()
      .regex(/^https?:\/\//)
      .optional(),
    // por onde o NAVEGADOR alcança o servidor de objetos: é para ele que o link de download é assinado
    ARMAZENAMENTO_ENDERECO_PUBLICO: z
      .string()
      .regex(/^https?:\/\//)
      .optional(),
    // só para o adaptador disco-local: assina os links de download que a própria API serve
    SEGREDO_DE_ASSINATURA: z.string().min(32).optional(),
    ARMAZENAMENTO_REGIAO: z.string().min(1).default('us-east-1'),
    ARMAZENAMENTO_BUCKET: z.string().min(1).optional(),
    ARMAZENAMENTO_CHAVE_DE_ACESSO: z.string().min(1).optional(),
    ARMAZENAMENTO_CHAVE_SECRETA: z.string().min(1).optional(),
    // Envio é hostil até prova em contrário (docs/mvp/backend.md, seção 10).
    BYTES_MAXIMOS_POR_ARQUIVO: z.coerce
      .number()
      .int()
      .min(1024)
      .max(200 * 1024 * 1024)
      .default(25 * 1024 * 1024),
    LADO_MAXIMO_DE_IMAGEM: z.coerce.number().int().min(16).max(30_000).default(12_000),
    MEGAPIXELS_MAXIMOS_DE_IMAGEM: z.coerce.number().int().min(1).max(400).default(80),
    // Quantas exportações cada processo de worker roda ao mesmo tempo. Cada uma ocupa um núcleo e tem a
    // própria memória de render (até 0,9 GB medido): o teto de memória do contêiner sai daqui.
    EXPORTACOES_AO_MESMO_TEMPO: z.coerce.number().int().min(1).max(8).default(2),
    // ---- importação de PSD ----
    // O pacote de PSD aguenta 300 MB. No MVP a API recebe o arquivo inteiro em memória e o worker o importa numa
    // thread de render: o teto padrão é 100 MB, e os de pixel ficam abaixo dos do pacote (64 e 400 milhões) para
    // caber, com folga, na memória do worker. Ver docs/mvp/backend.md, 17.14.
    PSD_BYTES_MAXIMOS: z.coerce
      .number()
      .int()
      .min(1024)
      .max(300 * 1024 * 1024)
      .default(100 * 1024 * 1024),
    PSD_MEGAPIXELS_POR_CAMADA: z.coerce.number().int().min(1).max(64).default(40),
    PSD_MEGAPIXELS_DE_TODAS_AS_CAMADAS: z.coerce.number().int().min(1).max(400).default(200),
    // Quantas importações cada processo de worker roda ao mesmo tempo (de contas diferentes).
    IMPORTACOES_AO_MESMO_TEMPO: z.coerce.number().int().min(1).max(4).default(1),
    // ---- a tarefa do Otto ----
    // Quantas tarefas cada processo de worker roda ao mesmo tempo (de contas diferentes). É quase só espera
    // de rede; o que pesa é o render de conferência, que roda no laço principal do worker.
    TAREFAS_AO_MESMO_TEMPO: z.coerce.number().int().min(1).max(16).default(2),
    // 'roteirizado' reproduz uma tarefa gravada, sem falar com modelo nenhum e sem custo: é o padrão fora de
    // produção. O valor escolhe o adaptador (ADR 020).
    MODELO_DO_AGENTE: z.enum(['roteirizado', 'claude']).default('roteirizado'),
    MODELO_CHAVE: z.string().min(8).optional(),
    MODELO_ENDERECO: z
      .string()
      .regex(/^https:\/\//)
      .optional(),
    MODELO_NOME: z.string().min(1).max(120).optional(),
    // 1: o roteiro demora o que demorou na gravação (7 minutos no de briefing). 0: responde na hora.
    VELOCIDADE_DO_ROTEIRO: z.coerce.number().min(0).max(1).default(0.05),
    // Limite operacional, não plano comercial: quantas tarefas uma conta pede por dia e quantas ficam na fila.
    TAREFAS_POR_DIA_POR_CONTA: z.coerce.number().int().min(1).max(10_000).default(30),
    TAREFAS_NA_FILA_POR_CONTA: z.coerce.number().int().min(1).max(50).default(3),
    // Teto nosso de tokens por dia, da plataforma inteira, abaixo do limite do fornecedor (45 milhões medidos em
    // 2026-10-02): passou, tarefa nova é recusada e a que roda fecha com o que já fez.
    TETO_DIARIO_DE_TOKENS: z.coerce.number().int().min(0).default(40_000_000),
    // Uma tarefa de briefing de dois formatos consome 2,2 a 2,6 milhões: com menos que isto sobrando no
    // fornecedor, não começa nem continua.
    RESTO_MINIMO_NO_FORNECEDOR: z.coerce.number().int().min(0).default(3_000_000),
    // O limite do fornecedor se comporta como um balde que se repõe (medido em 2026-10-02; docs/tecnico/custos.md,
    // seção 10; a confirmar): o tamanho do balde e quanto volta por hora. A reposição é o mínimo compatível com
    // as leituras; serve para a última leitura não trancar as tarefas quando ninguém está chamando o modelo.
    CAPACIDADE_DO_FORNECEDOR: z.coerce.number().int().min(0).default(4_500_000),
    REPOSICAO_POR_HORA_NO_FORNECEDOR: z.coerce.number().int().min(0).default(900_000),
    // Alavancas de custo do ciclo (@otto/agente, alavancas.ts): "nenhuma", "todas", ou números de 1 a 4 separados
    // por vírgula. Desligadas por padrão: ligar é decisão do Felipe, com o conjunto de avaliação rodado.
    ALAVANCAS_DE_CUSTO: z.string().max(120).default('nenhuma'),
    // ---- banco de imagens e catálogo de fontes (fatia 4) ----
    // A chave do banco de imagens de fábrica (ADR 032). É segredo. Ausente: a busca responde "indisponível" e
    // o Otto não recebe as ferramentas de imagem.
    PIXABAY_API_KEY: z.string().min(8).optional(),
    // Nada de trazer em massa: imagens de banco que uma conta traz por dia, e buscas novas por minuto.
    IMAGENS_TRAZIDAS_POR_DIA_POR_CONTA: z.coerce.number().int().min(1).max(10_000).default(100),
    BUSCAS_DE_IMAGEM_POR_MINUTO_POR_CONTA: z.coerce.number().int().min(1).max(100).default(20),
    // De onde a biblioteca traz família de fonte que ainda não tem. 'nenhum' (o padrão) não vai à rede: só as
    // fontes semeadas existem.
    CATALOGO_DE_FONTES: z.enum(['nenhum', 'google']).default('nenhum'),
  })
  .superRefine((env, ctx) => {
    const exigidas =
      env.ARMAZENAMENTO_ADAPTADOR === 'disco-local'
        ? (['ARMAZENAMENTO_PASTA'] as const)
        : (['ARMAZENAMENTO_ENDERECO', 'ARMAZENAMENTO_BUCKET', 'ARMAZENAMENTO_CHAVE_DE_ACESSO', 'ARMAZENAMENTO_CHAVE_SECRETA'] as const);
    for (const nome of exigidas) {
      if (!env[nome]) ctx.addIssue({ code: 'custom', path: [nome], message: `obrigatória com o adaptador ${env.ARMAZENAMENTO_ADAPTADOR}` });
    }
  });

export type ConfiguracaoDoArmazenamento =
  | { readonly adaptador: 'disco-local'; readonly pasta: string; readonly segredoDeAssinatura?: string }
  | {
      readonly adaptador: 's3';
      readonly endereco: string;
      readonly enderecoPublico: string;
      readonly regiao: string;
      readonly bucket: string;
      readonly chaveDeAcesso: string;
      readonly chaveSecreta: string;
    };

export interface Configuracao {
  readonly ambiente: 'desenvolvimento' | 'teste' | 'producao';
  readonly porta: number;
  readonly nivelDeLog: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly banco: { readonly urlDoApp: string };
  readonly contaFixaId: ContaId;
  readonly armazenamento: ConfiguracaoDoArmazenamento;
  readonly limites: { readonly bytesPorArquivo: number; readonly ladoMaximoDeImagem: number; readonly megapixelsNoMaximo: number };
  readonly worker: { readonly exportacoesAoMesmoTempo: number; readonly tarefasAoMesmoTempo: number; readonly importacoesAoMesmoTempo: number };
  /** Os tetos do PSD enviado: o do envio, e os de pixel que ficam por cima dos padrões de @otto/psd. */
  readonly importacao: { readonly bytesDoArquivo: number; readonly psd: { readonly pixelsDaMaiorCamada: number; readonly pixelsDeTodasAsCamadas: number } };
  readonly agente: ConfiguracaoDoAgente;
  /** A chave é segredo: não vai para log, evento nem resposta. */
  readonly bancoDeImagens: { readonly adaptador: 'nenhum' } | { readonly adaptador: 'pixabay'; readonly chave: string };
  readonly imagens: { readonly trazidasPorDia: number; readonly buscasNovasPorMinuto: number };
  readonly catalogoDeFontes: 'nenhum' | 'google';
}

export interface ConfiguracaoDoAgente {
  /** A chave é segredo: não vai para log, evento nem resposta. */
  readonly modelo:
    | { readonly adaptador: 'nenhum' }
    | { readonly adaptador: 'roteirizado'; readonly velocidade: number }
    | { readonly adaptador: 'claude'; readonly chave: string; readonly endereco?: string; readonly nome?: string };
  /**
   * O modelo que roda as tarefas é o de verdade? A API não chama o modelo, mas precisa saber: com o roteirizado
   * não há consumo, e o teto diário de tokens não recusa tarefa.
   */
  readonly modeloDeVerdade: boolean;
  readonly tarefasPorDia: number;
  readonly naFilaPorConta: number;
  readonly tetoDiarioDeTokens: number;
  readonly restoMinimoNoFornecedor: number;
  readonly capacidadeDoFornecedor: number;
  readonly reposicaoPorHoraNoFornecedor: number;
  readonly alavancas: Alavancas;
}

/** A mensagem cita o NOME das variáveis com problema e nunca o valor: o valor pode ser segredo. */
export class ConfiguracaoInvalida extends Error {
  constructor(readonly variaveis: readonly string[]) {
    super(`Configuração inválida. Variáveis com problema: ${variaveis.join(', ')}. Confira .env.example e o compose.yaml.`);
    this.name = 'ConfiguracaoInvalida';
  }
}

/**
 * @param servico Quem chama o modelo é só o worker. A API não recebe a chave do fornecedor: para ela a
 *   configuração do modelo é ignorada, mesmo que a variável exista no ambiente.
 */
export function lerConfiguracao(env: Record<string, string | undefined>, servico: 'api' | 'worker' = 'worker'): Configuracao {
  // variável vazia conta como ausente
  const limpo = Object.fromEntries(Object.entries(env).filter(([, valor]) => valor !== undefined && valor !== ''));
  const lido = Esquema.safeParse(limpo);
  if (!lido.success) {
    const variaveis = [...new Set(lido.error.issues.map((problema) => String(problema.path[0] ?? '(raiz)')))];
    throw new ConfiguracaoInvalida(variaveis);
  }
  const e = lido.data;
  let alavancas: Alavancas;
  try {
    alavancas = lerAlavancas(e.ALAVANCAS_DE_CUSTO);
  } catch {
    throw new ConfiguracaoInvalida(['ALAVANCAS_DE_CUSTO']);
  }
  if (servico === 'worker') {
    const comProblema: string[] = [];
    if (e.MODELO_DO_AGENTE === 'claude' && !e.MODELO_CHAVE) comProblema.push('MODELO_CHAVE');
    // produção não sobe respondendo com gravação
    if (e.AMBIENTE === 'producao' && e.MODELO_DO_AGENTE === 'roteirizado') comProblema.push('MODELO_DO_AGENTE');
    if (comProblema.length > 0) throw new ConfiguracaoInvalida(comProblema);
  }
  return Object.freeze({
    ambiente: e.AMBIENTE,
    porta: e.PORTA,
    nivelDeLog: e.NIVEL_DE_LOG,
    banco: Object.freeze({ urlDoApp: e.BANCO_URL_APP }),
    contaFixaId: e.CONTA_FIXA_ID,
    worker: Object.freeze({ exportacoesAoMesmoTempo: e.EXPORTACOES_AO_MESMO_TEMPO, tarefasAoMesmoTempo: e.TAREFAS_AO_MESMO_TEMPO, importacoesAoMesmoTempo: e.IMPORTACOES_AO_MESMO_TEMPO }),
    importacao: Object.freeze({
      bytesDoArquivo: e.PSD_BYTES_MAXIMOS,
      psd: Object.freeze({ pixelsDaMaiorCamada: e.PSD_MEGAPIXELS_POR_CAMADA * 1_000_000, pixelsDeTodasAsCamadas: e.PSD_MEGAPIXELS_DE_TODAS_AS_CAMADAS * 1_000_000 }),
    }),
    agente: Object.freeze({
      modelo: Object.freeze(
        servico === 'api'
          ? { adaptador: 'nenhum' as const }
          : e.MODELO_DO_AGENTE === 'claude'
            ? { adaptador: 'claude' as const, chave: e.MODELO_CHAVE as string, ...(e.MODELO_ENDERECO ? { endereco: e.MODELO_ENDERECO } : {}), ...(e.MODELO_NOME ? { nome: e.MODELO_NOME } : {}) }
            : { adaptador: 'roteirizado' as const, velocidade: e.VELOCIDADE_DO_ROTEIRO },
      ),
      modeloDeVerdade: e.MODELO_DO_AGENTE === 'claude',
      tarefasPorDia: e.TAREFAS_POR_DIA_POR_CONTA,
      naFilaPorConta: e.TAREFAS_NA_FILA_POR_CONTA,
      tetoDiarioDeTokens: e.TETO_DIARIO_DE_TOKENS,
      restoMinimoNoFornecedor: e.RESTO_MINIMO_NO_FORNECEDOR,
      capacidadeDoFornecedor: e.CAPACIDADE_DO_FORNECEDOR,
      reposicaoPorHoraNoFornecedor: e.REPOSICAO_POR_HORA_NO_FORNECEDOR,
      alavancas: Object.freeze(alavancas),
    }),
    bancoDeImagens: Object.freeze(e.PIXABAY_API_KEY ? { adaptador: 'pixabay' as const, chave: e.PIXABAY_API_KEY } : { adaptador: 'nenhum' as const }),
    imagens: Object.freeze({ trazidasPorDia: e.IMAGENS_TRAZIDAS_POR_DIA_POR_CONTA, buscasNovasPorMinuto: e.BUSCAS_DE_IMAGEM_POR_MINUTO_POR_CONTA }),
    catalogoDeFontes: e.CATALOGO_DE_FONTES,
    limites: Object.freeze({ bytesPorArquivo: e.BYTES_MAXIMOS_POR_ARQUIVO, ladoMaximoDeImagem: e.LADO_MAXIMO_DE_IMAGEM, megapixelsNoMaximo: e.MEGAPIXELS_MAXIMOS_DE_IMAGEM }),
    armazenamento: Object.freeze(
      e.ARMAZENAMENTO_ADAPTADOR === 'disco-local'
        ? { adaptador: 'disco-local' as const, pasta: e.ARMAZENAMENTO_PASTA as string, ...(e.SEGREDO_DE_ASSINATURA ? { segredoDeAssinatura: e.SEGREDO_DE_ASSINATURA } : {}) }
        : {
            adaptador: 's3' as const,
            endereco: e.ARMAZENAMENTO_ENDERECO as string,
            enderecoPublico: e.ARMAZENAMENTO_ENDERECO_PUBLICO ?? (e.ARMAZENAMENTO_ENDERECO as string),
            regiao: e.ARMAZENAMENTO_REGIAO,
            bucket: e.ARMAZENAMENTO_BUCKET as string,
            chaveDeAcesso: e.ARMAZENAMENTO_CHAVE_DE_ACESSO as string,
            chaveSecreta: e.ARMAZENAMENTO_CHAVE_SECRETA as string,
          },
    ),
  });
}
