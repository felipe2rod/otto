// O esquema da direção de arte, sozinho: só zod. É o que o contrato (contrato.ts) e o editor precisam;
// o prompt do diretor e a chamada ao modelo ficam em direcao.ts.
import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor em #RRGGBB');

export const ARQUETIPOS_ACEITOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'livre'] as const;

export const Direcao = z.object({
  leituraDaMarca: z.string().min(20).describe('o que a identidade já decidiu: cor e papel de cada uma, título (família, peso, caixa, tracking), forma, foto, densidade, tom'),
  conceito: z.string().min(10).describe('a ideia visual da peça em uma frase (não é descrição de layout)'),
  assinatura: z.string().min(10).describe('o traço visual próprio desta peça, que se repete em todos os formatos e a faz reconhecível'),
  arquetipo: z.enum(ARQUETIPOS_ACEITOS),
  porque: z.string().min(10),
  hierarquia: z.array(z.string()).min(2).max(5),
  paleta: z.object({ dominante: Hex, apoio: Hex, acento: Hex, texto: Hex }),
  tipografia: z.object({
    titulo: z.object({ familia: z.string().min(2), peso: z.number(), caixaAlta: z.boolean(), espacamento: z.number() }),
    texto: z.object({ familia: z.string().min(2), peso: z.number() }),
  }),
  imagem: z.object({ papel: z.string(), buscarPor: z.array(z.string()).max(4), tratamento: z.string() }),
  forma: z.string().describe('botão, raio dos cantos, fios, formas de apoio'),
  tecnicas: z.array(z.string()).max(4),
  evitar: z.array(z.string()).min(1).max(8),
});
export type Direcao = z.infer<typeof Direcao>;
