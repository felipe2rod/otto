// Semeia a biblioteca com os arquivos de uma pasta, descritos por um indice.json.
// Idempotente: fonte que já existe (família e peso) fica como está.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { nomePostScript } from '../domain/fontes';
import type { BibliotecaDeFontes } from './biblioteca-de-fontes';

const Indice = z.object({
  licenca: z.string().nullable().default(null),
  fontes: z.array(z.object({ familia: z.string().min(1), peso: z.int().min(1).max(1000), arquivo: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/) })),
});

export interface ResultadoDaSemeadura {
  registradas: number;
  problemas: { arquivo: string; motivo: string }[];
}

export async function semearFontes(biblioteca: BibliotecaDeFontes, pasta: string): Promise<ResultadoDaSemeadura> {
  const bruto = JSON.parse(await readFile(path.join(pasta, 'indice.json'), 'utf8')) as { fontes?: { arquivo?: unknown }[] };
  const resultado: ResultadoDaSemeadura = { registradas: 0, problemas: [] };
  const lido = Indice.safeParse(bruto);
  if (!lido.success) {
    for (const f of bruto.fontes ?? []) resultado.problemas.push({ arquivo: String(f.arquivo), motivo: 'entrada do índice fora do formato' });
    return resultado;
  }
  for (const fonte of lido.data.fontes) {
    let conteudo: Buffer;
    try {
      conteudo = await readFile(path.join(pasta, fonte.arquivo));
    } catch {
      resultado.problemas.push({ arquivo: fonte.arquivo, motivo: 'arquivo não encontrado' });
      continue;
    }
    const postScript = nomePostScript(conteudo);
    if (!postScript) {
      resultado.problemas.push({ arquivo: fonte.arquivo, motivo: 'não é um arquivo de fonte legível' });
      continue;
    }
    await biblioteca.registrar({ familia: fonte.familia, peso: fonte.peso, nomePostScript: postScript, licenca: lido.data.licenca, conteudo });
    resultado.registradas++;
  }
  return resultado;
}
