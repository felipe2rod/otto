// Geometria do documento que não depende de motor: onde cada prancheta fica no plano do editor,
// e o deslocamento de nós sem mutação (a prévia de um gesto de arrastar).
import { type Caixa, ehVisual, type No, type Prancheta } from './esquema';

/** Vão entre pranchetas no plano do editor, em unidades do documento. */
export const VAO_ENTRE_PRANCHETAS = 160;

/**
 * Posição de cada prancheta no plano do editor: lado a lado, da esquerda para a direita, alinhadas pelo topo.
 * A posição não é dado do documento (o PSD e o render de uma prancheta não a conhecem): é convenção do editor,
 * e mora aqui para o motor, as sobreposições e o teste de alvo usarem a mesma.
 */
export function disporPranchetas(pranchetas: readonly Pick<Prancheta, 'id' | 'largura'>[]): Map<string, { x: number; y: number }> {
  const posicoes = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const p of pranchetas) {
    posicoes.set(p.id, { x, y: 0 });
    x += p.largura + VAO_ENTRE_PRANCHETAS;
  }
  return posicoes;
}

/** Caixa que contém todas as pranchetas, no plano do editor. */
export function caixaDasPranchetas(pranchetas: readonly Pick<Prancheta, 'id' | 'largura' | 'altura'>[]): Caixa | undefined {
  if (pranchetas.length === 0) return undefined;
  return { x: 0, y: 0, w: pranchetas.reduce((soma, p) => soma + p.largura, 0) + VAO_ENTRE_PRANCHETAS * (pranchetas.length - 1), h: Math.max(...pranchetas.map((p) => p.altura)) };
}

/** A camada deslocada (e, se for grupo, tudo dentro); máscara de forma vai junto, como no Photoshop. Devolve um nó novo. */
export function deslocarNo(no: No, dx: number, dy: number): No {
  if (dx === 0 && dy === 0) return no;
  const r = (v: number) => Math.round(v * 100) / 100;
  const comMascara: No = no.mascara?.tipo === 'forma' ? { ...no, mascara: { ...no.mascara, x: r(no.mascara.x + dx), y: r(no.mascara.y + dy) } } : no;
  if (ehVisual(comMascara)) return { ...comMascara, x: r(comMascara.x + dx), y: r(comMascara.y + dy) };
  if (comMascara.tipo === 'grupo') return { ...comMascara, filhos: comMascara.filhos.map((f) => deslocarNo(f, dx, dy)) };
  return comMascara;
}

function deslocarNaLista(filhos: readonly No[], ids: ReadonlySet<string>, dx: number, dy: number): No[] {
  let mudou = false;
  const novos = filhos.map((n) => {
    let novo = n;
    if (ids.has(n.id)) novo = deslocarNo(n, dx, dy);
    else if (n.tipo === 'grupo') {
      const dentro = deslocarNaLista(n.filhos, ids, dx, dy);
      if (dentro !== n.filhos) novo = { ...n, filhos: dentro };
    }
    if (novo !== n) mudou = true;
    return novo;
  });
  return mudou ? novos : (filhos as No[]);
}

/** A prancheta com os nós de "ids" deslocados. O que não mudou continua sendo o mesmo objeto; sem mudança, a mesma prancheta. */
export function deslocarNos(p: Prancheta, ids: ReadonlySet<string>, dx: number, dy: number): Prancheta {
  const filhos = deslocarNaLista(p.filhos, ids, dx, dy);
  return filhos === p.filhos ? p : { ...p, filhos };
}
