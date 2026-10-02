// A marca como estado de tela (docs/mvp/experiencia.md, 3.3). Só o nome é obrigatório, e não existe cor
// nem fonte padrão: campo vazio é "não definida", e é assim que vai ao servidor (ausente).
import type { DadosDaMarca, Marca } from '@otto/shared';

export const PAPEIS_DE_COR = ['primaria', 'destaque', 'fundo', 'texto'] as const;
export type PapelDeCor = (typeof PAPEIS_DE_COR)[number];

/** Logo ou ícone: o hash é o que vai ao servidor; o resto é para mostrar. */
export interface ArquivoDaMarca {
  sha256: string;
  nome?: string | undefined;
  /** O vetor como o Otto o entendeu, em SVG do servidor. Ausente em logo que é imagem (PNG). */
  miniatura?: string | undefined;
  /** O que o importador deixou de fora do SVG. */
  avisos?: readonly string[] | undefined;
  /** Logo em PNG, JPG ou WebP: não muda de cor. */
  imagem?: boolean | undefined;
}

export interface EstadoDaMarca {
  nome: string;
  site: string;
  /** Vazio: cor não definida. */
  cores: Record<PapelDeCor, string>;
  fonteDeTitulo: string;
  fonteDeTexto: string;
  logo: ArquivoDaMarca | null;
  icones: ArquivoDaMarca[];
  rodape: string;
  /** Uma restrição por linha. */
  restricoes: string;
}

export const MARCA_VAZIA: EstadoDaMarca = {
  nome: '',
  site: '',
  cores: { primaria: '', destaque: '', fundo: '', texto: '' },
  fonteDeTitulo: '',
  fonteDeTexto: '',
  logo: null,
  icones: [],
  rodape: '',
  restricoes: '',
};

const COR = /^#[0-9a-fA-F]{6}$/;

/** "Sem identidade definida: a direção de arte escolhe." */
export const semIdentidade = (m: Pick<EstadoDaMarca, 'cores' | 'fonteDeTitulo' | 'fonteDeTexto'>): boolean =>
  PAPEIS_DE_COR.every((papel) => !COR.test(m.cores[papel])) && m.fonteDeTitulo.trim() === '' && m.fonteDeTexto.trim() === '';

export function paraDados(m: EstadoDaMarca): DadosDaMarca {
  const cores = Object.fromEntries(PAPEIS_DE_COR.filter((papel) => COR.test(m.cores[papel])).map((papel) => [papel, m.cores[papel]]));
  const restricoes = [
    ...new Set(
      m.restricoes
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];
  const texto = (campo: string, valor: string) => (valor.trim() ? { [campo]: valor.trim() } : {});
  return {
    nome: m.nome.trim(),
    ...texto('site', m.site),
    ...(Object.keys(cores).length > 0 ? { cores } : {}),
    ...texto('fonteDeTitulo', m.fonteDeTitulo),
    ...texto('fonteDeTexto', m.fonteDeTexto),
    ...(m.logo ? { logo: { arquivo: m.logo.sha256 } } : {}),
    ...(m.icones.length > 0 ? { icones: m.icones.map((i) => ({ arquivo: i.sha256 })) } : {}),
    ...texto('rodape', m.rodape),
    ...(restricoes.length > 0 ? { restricoes } : {}),
  };
}

export function daMarca(marca: Marca): EstadoDaMarca {
  return {
    nome: marca.nome,
    site: marca.site ?? '',
    cores: { primaria: marca.cores?.primaria ?? '', destaque: marca.cores?.destaque ?? '', fundo: marca.cores?.fundo ?? '', texto: marca.cores?.texto ?? '' },
    fonteDeTitulo: marca.fonteDeTitulo ?? '',
    fonteDeTexto: marca.fonteDeTexto ?? '',
    logo: marca.logo ? { sha256: marca.logo.arquivo } : null,
    icones: (marca.icones ?? []).map((i) => ({ sha256: i.arquivo })),
    rodape: marca.rodape ?? '',
    restricoes: (marca.restricoes ?? []).join('\n'),
  };
}
