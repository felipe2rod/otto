// Os arquivos (por hash de conteúdo) que uma árvore cita. O hash não é autorização (ADR 023):
// antes de gravar um lote, a API confere que cada arquivo novo existe NA CONTA.
import { type Documento, todasAsCamadas } from '@otto/documento';

export function arquivosDaArvore(doc: Documento): Set<string> {
  const arquivos = new Set<string>();
  for (const prancheta of doc.pranchetas) {
    for (const no of todasAsCamadas(prancheta.filhos)) {
      if (no.tipo === 'imagem') arquivos.add(no.arquivo);
      if (no.mascara?.tipo === 'sujeito') arquivos.add(no.mascara.arquivo);
    }
  }
  return arquivos;
}
