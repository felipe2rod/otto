// O pacote de exportação (docs/mvp/experiencia.md, 3.10): um .zip com os arquivos do formato pedido, a
// pasta de fontes usadas e o relatório em texto. Regra pura: recebe bytes, devolve bytes.
import { nomeDeArquivo } from '@otto/psd';
import type { FonteDoPacote } from '@otto/shared';
import type { FonteRegistrada } from '../../biblioteca/application/biblioteca-de-fontes';
import { situacaoDaLicenca } from '../../biblioteca/domain/licenca-de-fonte';
import { NOME_DA_PASTA_DE_FONTES, NOME_DO_RELATORIO_NO_PACOTE, secaoDeFontesDoPacote } from '../textos';
import { type ArquivoDoZip, montarZip } from './zip';

export interface FonteUsada {
  registro: FonteRegistrada;
  postScript: string;
}

/** Extensão do arquivo de fonte pelo começo dele: "OTTO" é OpenType com contornos PostScript. */
function extensaoDaFonte(bytes: Uint8Array | undefined): string {
  return bytes && bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f ? 'otf' : 'ttf';
}

/**
 * Para cada fonte que o arquivo exportado usa: vai dentro do pacote? Decide pela licença registrada
 * (biblioteca/domain/licenca-de-fonte.ts). `bytesDe` só serve para escolher a extensão do arquivo.
 */
export function fontesDoPacote(usadas: readonly FonteUsada[], bytesDe: (fonte: FonteRegistrada) => Uint8Array | undefined): FonteDoPacote[] {
  const vistas = new Set<string>();
  const fontes: FonteDoPacote[] = [];
  for (const { registro, postScript } of usadas) {
    if (vistas.has(postScript)) continue;
    vistas.add(postScript);
    const base = { familia: registro.familia, peso: registro.peso, postScript, licenca: registro.licenca };
    const situacao = situacaoDaLicenca(registro.licenca);
    if (situacao === 'permite' || situacao === 'a_conferir') {
      const nome = postScript.replace(/[^A-Za-z0-9._-]/g, '-');
      fontes.push({ ...base, incluida: true, arquivo: `${NOME_DA_PASTA_DE_FONTES}/${nome}.${extensaoDaFonte(bytesDe(registro))}` });
    } else {
      fontes.push({ ...base, incluida: false, motivo: situacao === 'desconhecida' ? 'licenca_desconhecida' : 'licenca_nao_permite' });
    }
  }
  return fontes.sort((a, b) => a.familia.localeCompare(b.familia) || a.peso - b.peso);
}

export interface ConteudoDoPacote {
  /** Nome da peça: vira o nome do .zip. */
  nome: string;
  arquivos: readonly ArquivoDoZip[];
  fontes: readonly FonteDoPacote[];
  /** Os bytes de cada fonte incluída, pelo nome PostScript. A que não tiver bytes fica de fora do .zip. */
  bytesDasFontes: ReadonlyMap<string, Uint8Array>;
  /** O relatório em markdown, como @otto/psd o escreve. */
  relatorioEmTexto: string;
}

export function montarPacote(conteudo: ConteudoDoPacote, quando: Date): { nome: string; bytes: Uint8Array } {
  const entradas: ArquivoDoZip[] = [...conteudo.arquivos];
  for (const fonte of conteudo.fontes) {
    const bytes = fonte.incluida && fonte.arquivo ? conteudo.bytesDasFontes.get(fonte.postScript) : undefined;
    if (bytes && fonte.arquivo) entradas.push({ nome: fonte.arquivo, bytes });
  }
  entradas.push({ nome: NOME_DO_RELATORIO_NO_PACOTE, bytes: new TextEncoder().encode(conteudo.relatorioEmTexto + secaoDeFontesDoPacote(conteudo.fontes)) });
  return { nome: `${nomeDeArquivo(conteudo.nome)}.zip`, bytes: montarZip(entradas, quando) };
}
