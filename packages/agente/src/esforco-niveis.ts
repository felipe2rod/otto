// Os nomes dos níveis de esforço criativo, sozinhos: só zod. É o que o contrato (contrato.ts) precisa;
// o que cada nível pede ao agente, ao diretor e ao revisor fica em esforco.ts.
import { z } from 'zod';

export const ESFORCOS_CRIATIVOS = ['SIMPLE', 'STANDARD', 'REFINED', 'CREATIVE', 'ADVANCED', 'CONCEPTUAL', 'ICONIC'] as const;
export type EsforcoCriativo = (typeof ESFORCOS_CRIATIVOS)[number];
export const EsforcoCriativoSchema = z.enum(ESFORCOS_CRIATIVOS);
