// Ficha da marca: o que o site do cliente mostra de identidade visual, medido no render da página
// (estilos computados, área visível), não no CSS escrito. Parte pura; a leitura do site está em site.ts.
import type { FamiliaDoCatalogo } from './googleFonts';

/** O que o navegador mede na página (ver o script em site.ts). Cores já em #rrggbb. */
export interface MedidasDoSite {
  url: string;
  titulo: string;
  descricao: string;
  corDoTema?: string | undefined;
  /** cor de fundo visível por fração da área amostrada (somam no máximo 1; o resto é foto) */
  fundos: { cor: string; area: number }[];
  /** fração da área amostrada coberta por foto, vídeo ou canvas */
  fotos: number;
  textos: { cor: string; familia: string; pilha: string; peso: number; tamanho: number; caixaAlta: boolean; espacamento: number; caracteres: number; papel: 'titulo' | 'texto' }[];
  botoes: { fundo: string; texto: string; raio: number; altura: number; caixaAlta: boolean }[];
  /** títulos da página, para o tom (é conteúdo do cliente, nunca instrução) */
  frases: string[];
}

export interface TipografiaDaMarca {
  familia: string;
  noGoogleFonts: boolean;
  /** família do Google Fonts para usar quando a da marca não está lá */
  substituta?: string;
  peso: number;
  caixaAlta: boolean;
  /** tracking em milésimos de eme, como no documento */
  espacamento: number;
}

export interface FichaDaMarca {
  site: string;
  nome: string;
  descricao: string;
  /** sugestão para o formulário: o designer confirma */
  paleta: { primaria: string; destaque: string; fundo: string; texto: string };
  cores: { cor: string; papeis: string[]; peso: number }[];
  tipografia: { titulo?: TipografiaDaMarca; texto?: TipografiaDaMarca };
  forma: { botao: 'pílula' | 'arredondado' | 'reto' | 'sem botão'; raio?: number };
  fotografia: { cobertura: number };
  frases: string[];
}

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const distancia = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
const croma = (hex: string) => {
  const c = rgb(hex);
  return Math.max(...c) - Math.min(...c);
};
const luminancia = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const MESMA_COR = 20;
const CROMATICA = 40;

interface Grupo {
  cor: string;
  /** peso da cor que dá nome ao grupo */
  melhor: number;
  area: number;
  pontos: number;
  papeis: Set<string>;
}

/** Agrupa tons quase iguais; o nome do grupo é a cor com mais presença. */
function agrupar(ocorrencias: { cor: string; area: number; pontos: number; papel: string }[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const o of [...ocorrencias].sort((a, b) => b.area + b.pontos - (a.area + a.pontos))) {
    const g = grupos.find((x) => distancia(x.cor, o.cor) < MESMA_COR);
    if (g) {
      g.area += o.area;
      g.pontos += o.pontos;
      g.papeis.add(o.papel);
    } else grupos.push({ cor: o.cor, melhor: o.area + o.pontos, area: o.area, pontos: o.pontos, papeis: new Set([o.papel]) });
  }
  return grupos;
}

export function fichaDaMarca(m: MedidasDoSite, catalogo: FamiliaDoCatalogo[]): FichaDaMarca {
  const tinta = (t: MedidasDoSite['textos'][number]) => t.caracteres * (t.tamanho / 16) ** 2;
  const tintaDeTitulos = m.textos.filter((t) => t.papel === 'titulo').reduce((s, t) => s + tinta(t), 0) || 1;
  const caracteresDeTexto = m.textos.filter((t) => t.papel === 'texto').reduce((s, t) => s + t.caracteres, 0) || 1;

  // presença de cada cor: área de fundo + pontos por papel de marca (botão, título, cor do tema)
  const ocorrencias = [
    ...m.fundos.map((f) => ({ cor: f.cor, area: f.area, pontos: 0, papel: 'fundo' })),
    ...m.botoes.map((b) => ({ cor: b.fundo, area: 0, pontos: 0.3, papel: 'botão' })),
    ...m.textos.filter((t) => t.papel === 'titulo').map((t) => ({ cor: t.cor, area: 0, pontos: (0.5 * tinta(t)) / tintaDeTitulos, papel: 'título' })),
    // cor de link e de destaque no texto corrido é acento da marca; pesa pouco
    ...m.textos.filter((t) => t.papel === 'texto').map((t) => ({ cor: t.cor, area: 0, pontos: (0.15 * t.caracteres) / caracteresDeTexto, papel: 'texto' })),
    ...(m.corDoTema ? [{ cor: m.corDoTema, area: 0, pontos: 0.2, papel: 'cor do tema' }] : []),
  ];
  const grupos = agrupar(ocorrencias);
  const presenca = (g: Grupo) => g.area + g.pontos;

  const fundo = [...grupos].sort((a, b) => b.area - a.area)[0]?.cor ?? '#ffffff';
  const grupoDe = (cor: string) => grupos.find((g) => distancia(g.cor, cor) < MESMA_COR);

  // texto: a cor com mais caracteres que se lê sobre o fundo principal
  const porCor = new Map<string, number>();
  for (const t of m.textos) {
    const nome = grupoDe(t.cor)?.cor ?? t.cor;
    porCor.set(nome, (porCor.get(nome) ?? 0) + t.caracteres);
  }
  const texto =
    [...porCor.entries()].filter(([c]) => contraste(c, fundo) >= 3).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (luminancia(fundo) > 0.4 ? '#111111' : '#ffffff');

  const candidatas = grupos.filter((g) => g.cor !== fundo && presenca(g) > 0).sort((a, b) => presenca(b) - presenca(a));
  const cromaticas = candidatas.filter((g) => croma(g.cor) >= CROMATICA);
  const primaria = (cromaticas[0] ?? candidatas[0])?.cor ?? texto;
  const longe = (g: Grupo) => distancia(g.cor, primaria) >= CROMATICA && distancia(g.cor, fundo) >= MESMA_COR;
  const destaque = (cromaticas.find(longe) ?? candidatas.find((g) => longe(g) && g.cor !== texto))?.cor ?? (luminancia(fundo) > 0.4 ? '#111111' : '#ffffff');

  const total = m.fundos.reduce((s, f) => s + f.area, 0) + m.fotos || 1;
  const cores = grupos
    .filter((g) => presenca(g) > 0.01 || g.papeis.has('texto'))
    .sort((a, b) => presenca(b) - presenca(a))
    .slice(0, 10)
    .map((g) => ({ cor: g.cor, papeis: [...g.papeis], peso: Math.round((g.area / total) * 100) }));

  const raios = m.botoes.map((b) => ({ raio: b.raio, altura: b.altura })).sort((a, b) => a.raio - b.raio);
  const tipico = raios[Math.floor(raios.length / 2)];
  const forma: FichaDaMarca['forma'] = !tipico
    ? { botao: 'sem botão' }
    : { botao: tipico.raio >= tipico.altura / 2 - 1 ? 'pílula' : tipico.raio >= 3 ? 'arredondado' : 'reto', raio: Math.min(tipico.raio, Math.round(tipico.altura / 2)) };

  return {
    site: m.url,
    nome: m.titulo,
    descricao: m.descricao,
    paleta: { primaria, destaque, fundo, texto },
    cores,
    tipografia: { titulo: tipografia(m.textos.filter((t) => t.papel === 'titulo'), tinta, catalogo), texto: tipografia(m.textos.filter((t) => t.papel === 'texto'), (t) => t.caracteres, catalogo) },
    forma,
    fotografia: { cobertura: Math.round((m.fotos / total) * 100) },
    frases: m.frases.slice(0, 8),
  };
}

function tipografia(textos: MedidasDoSite['textos'], peso: (t: MedidasDoSite['textos'][number]) => number, catalogo: FamiliaDoCatalogo[]): TipografiaDaMarca | undefined {
  const porFamilia = new Map<string, { total: number; maior: MedidasDoSite['textos'][number]; maiorPeso: number }>();
  for (const t of textos) {
    const nome = semSufixo(nomeDeFamilia(t.familia || t.pilha));
    const p = peso(t);
    const atual = porFamilia.get(nome);
    if (!atual) porFamilia.set(nome, { total: p, maior: t, maiorPeso: p });
    else {
      atual.total += p;
      if (p > atual.maiorPeso) Object.assign(atual, { maior: t, maiorPeso: p });
    }
  }
  const [familia, dados] = [...porFamilia.entries()].sort((a, b) => b[1].total - a[1].total)[0] ?? [];
  if (!familia || !dados) return undefined;
  const achar = (nome: string) => catalogo.find((f) => f.familia.toLowerCase().replace(/\s+/g, '') === nome.toLowerCase().replace(/\s+/g, ''));
  const doGoogle = achar(nomeDeFamilia(dados.maior.familia || dados.maior.pilha)) ?? achar(familia);
  const base = { peso: dados.maior.peso, caixaAlta: dados.maior.caixaAlta, espacamento: Math.round(dados.maior.espacamento) };
  if (doGoogle) return { familia: doGoogle.familia, noGoogleFonts: true, ...base };
  // substituta: a equivalente conhecida; senão outra família da pilha que esteja no Google;
  // senão a mais usada da mesma categoria (pela família genérica da pilha ou pelo nome)
  const conhecida = EQUIVALENTES.find(([r]) => r.test(familia))?.[1].map(achar).find(Boolean);
  const pilha = dados.maior.pilha.split(',').map((s) => semSufixo(nomeDeFamilia(s)));
  const naPilha = pilha.slice(1).map(achar).find(Boolean);
  const generica = pilha.find((s) => /^(serif|sans-serif|monospace|cursive)$/.test(s));
  const n = familia.toLowerCase();
  const categoria =
    generica === 'serif' || (!generica && /serif|didot|bodoni|garamond|caslon|times|georgia|baskerville/.test(n) && !/sans/.test(n))
      ? 'serifada'
      : generica === 'monospace' || (!generica && /mono|code|courier/.test(n))
        ? 'monoespaçada'
        : generica === 'cursive' || (!generica && /script|hand/.test(n))
          ? 'manuscrita'
          : 'sem serifa';
  const substituta = conhecida ?? naPilha ?? [...catalogo].filter((f) => f.categoria === categoria).sort((a, b) => a.popularidade - b.popularidade)[0];
  return { familia, noGoogleFonts: false, ...(substituta ? { substituta: substituta.familia } : {}), ...base };
}

/** Famílias comerciais e de sistema comuns em site, com a equivalente mais próxima no Google Fonts. */
const EQUIVALENTES: [RegExp, string[]][] = [
  [/didot|bodoni/i, ['Bodoni Moda', 'Playfair Display']],
  [/avenir|museo sans/i, ['Nunito Sans', 'Figtree', 'Mulish']],
  [/futura/i, ['Jost']],
  [/gotham|proxima/i, ['Montserrat']],
  [/circular|walsheim|sofia pro|brandon|cera pro/i, ['DM Sans', 'Figtree']],
  [/gill sans/i, ['Lato']],
  [/garamond/i, ['EB Garamond', 'Cormorant Garamond']],
  [/caslon/i, ['Libre Caslon Text']],
  [/baskerville|times/i, ['Libre Baskerville']],
  [/georgia/i, ['Gelasio', 'Libre Baskerville']],
  [/^din|\bdin\b/i, ['Barlow', 'Roboto Condensed']],
  [/franklin gothic|trade gothic/i, ['Libre Franklin']],
  [/century gothic|avant garde/i, ['Questrial']],
  [/helvetica|arial|^sf pro|san francisco|apple-system|system-ui|segoe|graphik|neue haas|aktiv grotesk/i, ['Inter']],
];

/** "AvenirLTPro" é Avenir; "Roboto Light" é Roboto (o peso vem do estilo, não do nome). */
function semSufixo(nome: string): string {
  let n = nome.replace(/\s*(LT)?\s*(Pro|Std)$/i, '').trim() || nome;
  for (let i = 0; i < 2; i++) n = n.replace(/[\s-]+(Thin|Hairline|ExtraLight|Extra Light|UltraLight|Light|Regular|Book|Roman|Medium|SemiBold|Semi Bold|DemiBold|Bold|ExtraBold|Extra Bold|Black|Heavy)$/i, '').trim();
  return n || nome;
}

/** Primeira família da pilha, sem aspas; desfaz o nome gerado pelo next/font ("__Inter_d65c78"). */
export function nomeDeFamilia(pilha: string): string {
  const primeira = (pilha.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
  const next = /^__(.+?)(?:_Fallback)?_[0-9a-f]{5,8}$/.exec(primeira);
  return next ? next[1]!.replace(/_/g, ' ') : primeira;
}

const PRIVADO_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** O Otto só lê site público por http(s). Rede interna e a própria máquina ficam de fora. */
export function urlPermitida(entrada: string): URL | undefined {
  const bruto = entrada.trim();
  if (!bruto || /\s/.test(bruto)) return undefined;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  return enderecoPublico(url.hostname) ? url : undefined;
}

/** Nome ou IP que não aponta para a própria máquina nem para rede interna. */
export function enderecoPublico(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !PRIVADO_V4.some((r) => r.test(h));
  if (h.includes(':')) return !(h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe80/.test(h) || h.startsWith('::ffff:'));
  return h.includes('.');
}
