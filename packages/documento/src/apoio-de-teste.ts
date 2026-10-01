// Apoio dos testes deste pacote. O documento não conhece motor de render: aqui o medidor e os meios
// de verificação são de mentira, simples e determinísticos. Os de verdade são testados em @otto/render.
import { type Caixa, camadasVisuaisVisiveis, type Documento, documentoVazio, type No, type NoTexto, type Prancheta, resolverCor } from './esquema';
import type { MeiosDeVerificacao, TextoDiagramado } from './lint';
import { aplicarLote, type ContextoDoLote, type Medidor } from './operacoes';

export const designer = { tipo: 'designer' } as const;
export const agente = { tipo: 'agente', tarefaId: 't' } as const;

let contador = 0;
/** Contexto de lote com id próprio a cada chamada, como o editor e o agente fazem. */
export function contexto(extra: Partial<ContextoDoLote> = {}): ContextoDoLote {
  return { autoria: designer, idDoLote: `lote-de-teste-${++contador}`, ...extra };
}

/** Aplica e devolve o documento, ou falha o teste com a mensagem do erro. */
export function aplicar(doc: Documento, operacoes: unknown[], extra: Partial<ContextoDoLote> = {}): Documento {
  const r = aplicarLote(doc, operacoes, contexto(extra));
  if (!r.ok) throw new Error(`${r.erro.op}: ${r.erro.mensagem}`);
  return r.doc;
}

export function novoDocumento(operacoes: unknown[]): Documento {
  return aplicar(documentoVazio(), operacoes);
}

/** Congela a árvore inteira: qualquer mutação vira exceção (os testes rodam em modo estrito). */
export function congelar<T>(valor: T): T {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor)) congelar(v);
  }
  return valor;
}

/**
 * Tipografia de mentira: toda letra tem meio corpo de largura; a tinta começa a 20% do corpo abaixo do topo
 * e tem 70% do corpo de altura; a linha de base fica a 90% do corpo. Quebra por palavra.
 */
export function diagramarDeMentira(no: NoTexto): TextoDiagramado {
  const larguraDaLetra = no.tamanho * 0.5 * (1 + no.espacamento / 1000);
  const linhasDeTexto: string[] = [];
  let palavraEstourada: string | undefined;
  for (const paragrafo of no.conteudo.split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (palavra.length * larguraDaLetra > no.largura + 0.5) palavraEstourada ??= palavra;
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && tentativa.length * larguraDaLetra > no.largura + 0.5) {
        linhasDeTexto.push(atual);
        atual = palavra;
      } else atual = tentativa;
    }
    linhasDeTexto.push(atual);
  }
  const linhas = linhasDeTexto.map((texto, k) => {
    const largura = texto.length * larguraDaLetra;
    const x = no.alinhamento === 'esquerda' ? no.x : no.alinhamento === 'centro' ? no.x + (no.largura - largura) / 2 : no.x + no.largura - largura;
    return { texto, x, largura, base: no.y + no.tamanho * 0.9 + k * no.tamanho * no.entrelinha };
  });
  const comTinta = linhas.filter((l) => l.texto.trim());
  const tinta: Caixa =
    comTinta.length === 0
      ? { x: no.x, y: no.y, w: 0, h: 0 }
      : (() => {
          const esquerda = Math.min(...comTinta.map((l) => l.x));
          const direita = Math.max(...comTinta.map((l) => l.x + l.largura));
          const topo = (comTinta[0] as (typeof linhas)[number]).base - no.tamanho * 0.7;
          return { x: esquerda, y: topo, w: direita - esquerda, h: (comTinta.at(-1) as (typeof linhas)[number]).base - topo };
        })();
  return { linhas, alturaUsada: no.tamanho * 1.2 + (linhas.length - 1) * no.tamanho * no.entrelinha, tinta, palavraEstourada, fonteEncontrada: no.fonte !== 'Fonte Que Não Existe' };
}

export const medidorDeMentira: Medidor = {
  tinta: (no: No) => (no.tipo === 'texto' ? diagramarDeMentira(no).tinta : 'x' in no ? { x: no.x, y: no.y, w: no.largura, h: no.altura } : { x: 0, y: 0, w: 0, h: 0 }),
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Render de mentira: pinta a caixa de cada camada visível, chapada, de baixo para cima.
 * Forma e vetor pela cor do preenchimento, texto pela cor na caixa da tinta, imagem em cinza. Elipse é pintada como elipse.
 */
function renderizarDeMentira(doc: Documento, p: Prancheta, opcoes: { escala: number; excluir?: ReadonlySet<string> }): { largura: number; altura: number; rgba: Uint8ClampedArray } {
  const largura = Math.max(1, Math.round(p.largura * opcoes.escala));
  const altura = Math.max(1, Math.round(p.altura * opcoes.escala));
  const rgba = new Uint8ClampedArray(largura * altura * 4);
  const pintar = (c: Caixa, cor: string, elipse: boolean, alfa: number): void => {
    const [r, g, b] = rgb(cor);
    const x0 = Math.max(0, Math.round(c.x * opcoes.escala));
    const y0 = Math.max(0, Math.round(c.y * opcoes.escala));
    const x1 = Math.min(largura, Math.round((c.x + c.w) * opcoes.escala));
    const y1 = Math.min(altura, Math.round((c.y + c.h) * opcoes.escala));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (elipse) {
          const u = ((x + 0.5) / opcoes.escala - (c.x + c.w / 2)) / (c.w / 2);
          const v = ((y + 0.5) / opcoes.escala - (c.y + c.h / 2)) / (c.h / 2);
          if (u * u + v * v > 1) continue;
        }
        const i = (y * largura + x) * 4;
        rgba[i] = (rgba[i] as number) * (1 - alfa) + r * alfa;
        rgba[i + 1] = (rgba[i + 1] as number) * (1 - alfa) + g * alfa;
        rgba[i + 2] = (rgba[i + 2] as number) * (1 - alfa) + b * alfa;
        rgba[i + 3] = 255;
      }
    }
  };
  pintar({ x: 0, y: 0, w: p.largura, h: p.altura }, resolverCor(doc, p.fundo), false, 1);
  for (const no of camadasVisuaisVisiveis(p.filhos)) {
    if (opcoes.excluir?.has(no.id)) continue;
    const caixa = { x: no.x, y: no.y, w: no.largura, h: no.altura };
    if (no.tipo === 'forma')
      pintar(
        caixa,
        typeof no.preenchimento === 'string' ? resolverCor(doc, no.preenchimento) : resolverCor(doc, (no.preenchimento.paradas[0] as { cor: string }).cor),
        no.forma === 'elipse',
        no.opacidade,
      );
    else if (no.tipo === 'texto') pintar(diagramarDeMentira(no).tinta, resolverCor(doc, no.cor), false, no.opacidade);
    else if (no.tipo === 'vetor') pintar(caixa, resolverCor(doc, no.caminhos[0]?.preenchimento ?? no.caminhos[0]?.traco?.cor ?? '#000000'), false, no.opacidade);
    else pintar(caixa, '#808080', false, no.opacidade);
  }
  return { largura, altura, rgba };
}

export const meiosDeMentira: MeiosDeVerificacao = { diagramar: diagramarDeMentira, renderizar: renderizarDeMentira };
