// Importa um documento da POC (poc/dados/documentos/<id>.json) para uma conta do MVP.
// Só leitura do lado da POC. O documento entra na versão 0, com a árvore validada pelo esquema
// novo (@otto/documento): nome e id saem da árvore e vão para o registro.
//
// O HISTÓRICO DA POC NÃO É IMPORTADO: lá os ids dos nós eram aleatórios e cada lote guardava um
// snapshot; aqui o id do nó deriva do id do lote. Reaplicar os lotes antigos daria outra árvore.
import { createHash } from 'node:crypto';
import { Documento, todasAsCamadas } from '@otto/documento';
import { LIMITES } from '@otto/shared';
import type { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import type { OrigemDoArquivo } from '../../arquivo/application/repositorio-de-arquivos';
import type { RepositorioDeDocumentos } from '../../documento/application/repositorio-de-documentos';
import { arquivosDaArvore } from '../../documento/domain/arquivos-da-arvore';
import { NOME_PADRAO_DE_DOCUMENTO } from '../../documento/textos';
import { ErroDaAplicacao } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';

export interface ArquivoDaPoc {
  bytes: Uint8Array;
  origem?: OrigemDoArquivo;
}

export type ResultadoDaImportacao =
  | { resultado: 'importado'; id: string; familias: string[] }
  | { resultado: 'ja_existia'; id: string; familias: string[] }
  | { resultado: 'recusado'; motivo: string };

/** Id do documento no MVP, derivado do id da POC: importar de novo cai no mesmo documento. UUID versão 8. */
export function idDoDocumentoImportado(idNaPoc: string): string {
  const h = createHash('sha256').update(`otto:poc:documento:${idNaPoc}`).digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x80;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function familiasDe(arvore: Documento): string[] {
  const familias = new Set<string>(Object.values(arvore.tokens.estilosDeTexto).map((e) => e.fonte));
  for (const p of arvore.pranchetas) {
    for (const no of todasAsCamadas(p.filhos)) {
      if (no.tipo !== 'texto') continue;
      familias.add(no.fonte);
      for (const t of no.trechos ?? []) if (t.fonte) familias.add(t.fonte);
    }
  }
  return [...familias].sort();
}

export async function importarDocumentoDaPoc(
  deps: { documentos: RepositorioDeDocumentos; arquivos: CasosDeUsoDeArquivo },
  escopo: EscopoDaConta,
  idNaPoc: string,
  registro: unknown,
  lerArquivo: (sha256: string) => Promise<ArquivoDaPoc | undefined>,
): Promise<ResultadoDaImportacao> {
  const doc = typeof registro === 'object' && registro !== null ? (registro as { doc?: unknown }).doc : undefined;
  if (typeof doc !== 'object' || doc === null) return { resultado: 'recusado', motivo: 'o arquivo não é um registro de documento da POC' };

  const lida = Documento.safeParse(doc);
  if (!lida.success) {
    // só o caminho do campo (sem os índices) e o código do problema: a mensagem pode citar conteúdo
    const problema = lida.error.issues[0];
    const campo = problema?.path.filter((p) => typeof p === 'string').join('.') || '(raiz)';
    return { resultado: 'recusado', motivo: `fora do esquema do documento em ${campo} (${problema?.code ?? 'invalido'})` };
  }
  const arvore = lida.data;
  const familias = familiasDe(arvore);
  const id = idDoDocumentoImportado(idNaPoc);
  if (await deps.documentos.abrir(escopo, id)) return { resultado: 'ja_existia', id, familias };

  // primeiro confere TODOS os arquivos; só depois grava, para não deixar documento pela metade
  const citados = [...arquivosDaArvore(arvore)];
  const lidos: { sha256: string; arquivo: ArquivoDaPoc }[] = [];
  for (const sha256 of citados) {
    const arquivo = await lerArquivo(sha256);
    if (!arquivo) return { resultado: 'recusado', motivo: 'arquivo citado não está em poc/dados/arquivos' };
    lidos.push({ sha256, arquivo });
  }
  for (const { sha256, arquivo } of lidos) {
    try {
      const enviado = await deps.arquivos.enviarImagem(escopo, arquivo.bytes, arquivo.origem ? { origem: arquivo.origem } : {});
      if (enviado.sha256 !== sha256) return { resultado: 'recusado', motivo: 'arquivo citado tem conteúdo diferente do hash' };
    } catch (e) {
      if (e instanceof ErroDaAplicacao) return { resultado: 'recusado', motivo: `arquivo citado recusado: ${e.codigo}` };
      throw e;
    }
  }

  const nome = typeof (doc as { nome?: unknown }).nome === 'string' ? (doc as { nome: string }).nome.trim().slice(0, LIMITES.caracteresDoNome) : '';
  try {
    await deps.documentos.criar(escopo, { id, nome: nome || NOME_PADRAO_DE_DOCUMENTO, arvore });
  } catch {
    // o id já existe e não abre: foi importado antes e arquivado
    return { resultado: 'ja_existia', id, familias };
  }
  return { resultado: 'importado', id, familias };
}
