// Configuração do processo, validada na subida. Faltou ou veio malformada: o processo não inicia.
// É o ÚNICO lugar (com main.ts e worker.ts, que só repassam) onde variável de ambiente é lida.
// Nome de fornecedor pode aparecer aqui, no valor que escolhe o adaptador (ADR 020, item 1).
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
    // SUPOSIÇÃO A CONFIRMAR com o Felipe (ADR 035, item 7): sem login no MVP, o servidor resolve
    // o escopo sempre para uma conta fixa, semeada pela migração. Quando o login entrar, esta
    // variável some e só troca o adaptador de ResolvedorDeEscopo.
    CONTA_FIXA_ID: ContaId,
    // 's3' é o contrato (qualquer servidor compatível); 'disco-local' é o plano B, de uma máquina só.
    ARMAZENAMENTO_ADAPTADOR: z.enum(['s3', 'disco-local']),
    ARMAZENAMENTO_PASTA: z.string().min(1).optional(),
    ARMAZENAMENTO_ENDERECO: z
      .string()
      .regex(/^https?:\/\//)
      .optional(),
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
  | { readonly adaptador: 'disco-local'; readonly pasta: string }
  | { readonly adaptador: 's3'; readonly endereco: string; readonly regiao: string; readonly bucket: string; readonly chaveDeAcesso: string; readonly chaveSecreta: string };

export interface Configuracao {
  readonly ambiente: 'desenvolvimento' | 'teste' | 'producao';
  readonly porta: number;
  readonly nivelDeLog: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly banco: { readonly urlDoApp: string };
  readonly contaFixaId: ContaId;
  readonly armazenamento: ConfiguracaoDoArmazenamento;
  readonly limites: { readonly bytesPorArquivo: number; readonly ladoMaximoDeImagem: number; readonly megapixelsNoMaximo: number };
}

/** A mensagem cita o NOME das variáveis com problema e nunca o valor: o valor pode ser segredo. */
export class ConfiguracaoInvalida extends Error {
  constructor(readonly variaveis: readonly string[]) {
    super(`Configuração inválida. Variáveis com problema: ${variaveis.join(', ')}. Confira .env.example e o compose.yaml.`);
    this.name = 'ConfiguracaoInvalida';
  }
}

export function lerConfiguracao(env: Record<string, string | undefined>): Configuracao {
  // variável vazia conta como ausente
  const limpo = Object.fromEntries(Object.entries(env).filter(([, valor]) => valor !== undefined && valor !== ''));
  const lido = Esquema.safeParse(limpo);
  if (!lido.success) {
    const variaveis = [...new Set(lido.error.issues.map((problema) => String(problema.path[0] ?? '(raiz)')))];
    throw new ConfiguracaoInvalida(variaveis);
  }
  const e = lido.data;
  return Object.freeze({
    ambiente: e.AMBIENTE,
    porta: e.PORTA,
    nivelDeLog: e.NIVEL_DE_LOG,
    banco: Object.freeze({ urlDoApp: e.BANCO_URL_APP }),
    contaFixaId: e.CONTA_FIXA_ID,
    limites: Object.freeze({ bytesPorArquivo: e.BYTES_MAXIMOS_POR_ARQUIVO, ladoMaximoDeImagem: e.LADO_MAXIMO_DE_IMAGEM, megapixelsNoMaximo: e.MEGAPIXELS_MAXIMOS_DE_IMAGEM }),
    armazenamento: Object.freeze(
      e.ARMAZENAMENTO_ADAPTADOR === 'disco-local'
        ? { adaptador: 'disco-local' as const, pasta: e.ARMAZENAMENTO_PASTA as string }
        : {
            adaptador: 's3' as const,
            endereco: e.ARMAZENAMENTO_ENDERECO as string,
            regiao: e.ARMAZENAMENTO_REGIAO,
            bucket: e.ARMAZENAMENTO_BUCKET as string,
            chaveDeAcesso: e.ARMAZENAMENTO_CHAVE_DE_ACESSO as string,
            chaveSecreta: e.ARMAZENAMENTO_CHAVE_SECRETA as string,
          },
    ),
  });
}
