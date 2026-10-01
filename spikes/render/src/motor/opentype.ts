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
