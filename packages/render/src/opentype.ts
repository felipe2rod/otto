// Lê do arquivo de fonte os recursos OpenType que ele declara (GSUB e GPOS).
// O motor liga qualquer recurso pelo nome; saber se a fonte TEM o recurso é o que decide
// entre o versalete desenhado (smcp) e o sintético.

export interface RecursosOpenType {
  gsub: string[];
  gpos: string[];
}

function etiquetasDaTabela(v: DataView, inicio: number): string[] {
  // cabeçalho GSUB/GPOS: versão (4), ScriptList (2), FeatureList (2), LookupList (2)
  const lista = inicio + v.getUint16(inicio + 6);
  const quantidade = v.getUint16(lista);
  const etiquetas = new Set<string>();
  for (let i = 0; i < quantidade; i++) {
    const p = lista + 2 + i * 6;
    etiquetas.add(String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)));
  }
  return [...etiquetas].sort();
}

/**
 * Nome PostScript da fonte (registro 6 da tabela "name"). É por ele que o Photoshop procura a fonte instalada
 * para a camada de texto continuar editável (ADR 028). Arquivo que não é fonte, ou cortado: undefined, nunca exceção.
 */
export function nomePostScript(bytes: Uint8Array): string | undefined {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const tabelas = v.getUint16(4);
    for (let i = 0; i < tabelas; i++) {
      const p = 12 + i * 16;
      if (String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)) !== 'name') continue;
      const inicio = v.getUint32(p + 8);
      const registros = v.getUint16(inicio + 2);
      const textos = inicio + v.getUint16(inicio + 4);
      for (let j = 0; j < registros; j++) {
        const r = inicio + 6 + j * 12;
        if (v.getUint16(r + 6) !== 6) continue;
        const plataforma = v.getUint16(r);
        const tamanho = v.getUint16(r + 8);
        const onde = textos + v.getUint16(r + 10);
        let nome = '';
        // Unicode e Windows guardam em UTF-16 de ordem alta; Macintosh, um byte por letra
        if (plataforma === 0 || plataforma === 3) for (let k = 0; k + 1 < tamanho; k += 2) nome += String.fromCharCode(v.getUint16(onde + k));
        else for (let k = 0; k < tamanho; k++) nome += String.fromCharCode(v.getUint8(onde + k));
        if (nome) return nome;
      }
    }
  } catch {
    // leitura fora do arquivo: não é uma fonte bem formada
  }
  return undefined;
}

/**
 * Altura da maiúscula da fonte, em fração do corpo (sCapHeight da tabela OS/2, versão 2 ou maior).
 * É por ela que o Photoshop alinha a primeira linha de um texto em caixa gravado sem os dados dele.
 * Fonte sem o campo: undefined.
 */
export function alturaDaMaiuscula(bytes: Uint8Array): number | undefined {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    let unidades: number | undefined;
    let maiuscula: number | undefined;
    for (let i = 0; i < v.getUint16(4); i++) {
      const p = 12 + i * 16;
      const tabela = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
      const inicio = v.getUint32(p + 8);
      if (tabela === 'head') unidades = v.getUint16(inicio + 18);
      if (tabela === 'OS/2' && v.getUint16(inicio) >= 2) maiuscula = v.getInt16(inicio + 88);
    }
    return unidades && maiuscula && maiuscula > 0 ? maiuscula / unidades : undefined;
  } catch {
    return undefined;
  }
}

export function recursosOpenType(bytes: Uint8Array): RecursosOpenType {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tabelas = v.getUint16(4);
  const saida: RecursosOpenType = { gsub: [], gpos: [] };
  for (let i = 0; i < tabelas; i++) {
    const p = 12 + i * 16;
    const nome = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    const deslocamento = v.getUint32(p + 8);
    if (nome === 'GSUB') saida.gsub = etiquetasDaTabela(v, deslocamento);
    if (nome === 'GPOS') saida.gpos = etiquetasDaTabela(v, deslocamento);
  }
  return saida;
}
