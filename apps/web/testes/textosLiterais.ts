// Acha texto visível escrito direto no componente. Lê a árvore sintática (não é busca por texto),
// para não confundir genérico e comparação com etiqueta.
//
// O que pega: texto entre etiquetas, literal dentro de chaves, atributo que a pessoa lê ou ouve
// e título/descrição de página em arquivo de rota. O que não pega: texto montado em variável antes
// de chegar ao JSX. Isso continua sendo da revisão.
import { parse } from '@babel/parser';

export interface TextoLiteral {
  linha: number;
  onde: string;
  trecho: string;
}

/** Atributos cujo valor chega a uma pessoa, pela tela ou pelo leitor de tela. */
const ATRIBUTOS_VISIVEIS: ReadonlySet<string> = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder', 'title', 'alt', 'placeholder', 'label']);
const METADADOS: ReadonlySet<string> = new Set(['title', 'description']);
const TEM_LETRA = /\p{L}/u;

interface No {
  type: string;
  loc?: { start: { line: number } };
  [chave: string]: unknown;
}

const ehNo = (v: unknown): v is No => typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';

/** Texto de um literal em aspas ou em crase (só as partes fixas). Qualquer outra expressão devolve vazio. */
function textoDoLiteral(no: unknown): string {
  if (!ehNo(no)) return '';
  if (no.type === 'StringLiteral') return String(no.value);
  if (no.type === 'TemplateLiteral') return (no.quasis as { value: { cooked?: string } }[]).map((q) => q.value.cooked ?? '').join(' ');
  return '';
}

const limpo = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

export function textosLiteraisEm(fonte: string, arquivo: string): TextoLiteral[] {
  const arvore = parse(fonte, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const achados: TextoLiteral[] = [];
  const ehRota = /[\\/]app[\\/]/.test(arquivo);

  const anotar = (no: No, onde: string, texto: string) => {
    const trecho = limpo(texto);
    if (TEM_LETRA.test(trecho)) achados.push({ linha: no.loc?.start.line ?? 0, onde, trecho });
  };

  function visitar(no: No, pai: No | undefined): void {
    if (no.type === 'JSXText') anotar(no, 'filho', String(no.value));

    if (no.type === 'JSXExpressionContainer' && (pai?.type === 'JSXElement' || pai?.type === 'JSXFragment')) anotar(no, 'filho', textoDoLiteral(no.expression));

    if (no.type === 'JSXAttribute') {
      const nome = String((no.name as { name?: unknown }).name);
      if (ATRIBUTOS_VISIVEIS.has(nome)) {
        const valor = no.value;
        anotar(no, `atributo ${nome}`, ehNo(valor) && valor.type === 'JSXExpressionContainer' ? textoDoLiteral(valor.expression) : textoDoLiteral(valor));
      }
    }

    if (ehRota && no.type === 'ObjectProperty') {
      const chave = no.key as { name?: unknown; value?: unknown };
      const nome = String(chave.name ?? chave.value);
      if (METADADOS.has(nome)) anotar(no, `metadado ${nome}`, textoDoLiteral(no.value));
    }

    for (const [chave, valor] of Object.entries(no)) {
      if (chave === 'loc' || chave === 'leadingComments' || chave === 'trailingComments' || chave === 'innerComments') continue;
      if (Array.isArray(valor)) for (const filho of valor) if (ehNo(filho)) visitar(filho, no);
      if (ehNo(valor)) visitar(valor, no);
    }
  }

  visitar(arvore.program as unknown as No, undefined);
  return achados.sort((a, b) => a.linha - b.linha);
}
