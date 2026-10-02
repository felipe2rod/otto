// Logo e ícones do briefing entram por referência, como a foto entra pelo hash: o modelo vê só
// arquivo, moldura e cores. Copiar o desenho (milhares de caracteres) na resposta corrompia o logo
// e alongava a chamada além do limite de rede (rodadas A e B do CROVÉ, POC, 2026-09-28).
// Veio de poc/src/servidor/agente.ts.

/** Desenho de um vetor do cliente (logo, ícone), guardado fora da conversa com o modelo. */
export interface VetorDoMaterial {
  moldura: [number, number];
  caminhos: unknown[];
  origem: { arquivo: string; nome: string };
}

type CaminhoLido = { preenchimento?: string; traco?: { cor: string } };
type ItemComVetor = { usarEste?: { moldura?: [number, number]; caminhos?: CaminhoLido[]; origem?: { arquivo: string; nome: string } } };

export function vetoresDoBriefing(briefing: unknown): { paraOAgente: unknown; vetores: Map<string, VetorDoMaterial> } {
  const vetores = new Map<string, VetorDoMaterial>();
  if (!briefing || typeof briefing !== 'object') return { paraOAgente: briefing, vetores };
  const referencia = (item: unknown) => {
    const v = (item as ItemComVetor | undefined)?.usarEste;
    if (!v?.moldura || !v.caminhos || !v.origem) return item;
    vetores.set(v.origem.arquivo, { moldura: v.moldura, caminhos: v.caminhos, origem: v.origem });
    const { usarEste: _u, ...resto } = item as Record<string, unknown>;
    const cores = [...new Set(v.caminhos.flatMap((c) => [c.preenchimento, c.traco?.cor].filter(Boolean)))];
    return { ...resto, usarEste: { tipo: 'vetor', arquivo: v.origem.arquivo, moldura: v.moldura, cores, ...(v.caminhos.some((c) => c.traco) ? { contorno: true } : {}) } };
  };
  const b = briefing as Record<string, unknown>;
  const paraOAgente = { ...b, ...(b.logo ? { logo: referencia(b.logo) } : {}), ...(Array.isArray(b.icones) ? { icones: b.icones.map(referencia) } : {}) };
  return { paraOAgente, vetores };
}

/** Troca {"tipo":"vetor","arquivo":hash} em criarNo pelo desenho completo; a altura (ou a largura) sai da proporção da moldura. */
export function expandirVetores(operacoes: unknown[], vetores: Map<string, VetorDoMaterial>): unknown[] {
  return operacoes.map((op) => {
    const o = op as { op?: string; no?: Record<string, unknown> } | null;
    if (o?.op !== 'criarNo' || o.no?.tipo !== 'vetor' || typeof o.no.arquivo !== 'string' || o.no.caminhos) return op;
    const v = vetores.get(o.no.arquivo);
    if (!v) throw new Error(`o vetor "${o.no.arquivo}" não está no material. Disponíveis: ${[...vetores.keys()].join(', ') || 'nenhum'}`);
    const { arquivo: _a, ...no } = o.no;
    const [mw, mh] = v.moldura;
    const largura = typeof no.largura === 'number' ? no.largura : typeof no.altura === 'number' ? (no.altura * mw) / mh : mw;
    const altura = typeof no.altura === 'number' ? no.altura : (largura * mh) / mw;
    return { ...o, no: { ...no, largura, altura, moldura: v.moldura, caminhos: v.caminhos, origem: v.origem } };
  });
}
