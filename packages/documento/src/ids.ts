// Ids de nó novo, derivados do id do lote (docs/mvp/backend.md, ponto P1).
// O navegador aplica o lote na hora e o servidor aplica de novo ao confirmar: os dois precisam chegar
// ao mesmo id para o nó criado, senão o lote seguinte do editor cita um id que o servidor não conhece.
// Por isso o id não é sorteado: sai do id do lote, do índice da operação e da ordem dentro dela.

/** Devolve o id do enésimo nó criado pela operação de índice dado. */
export type GeradorDeId = (indiceDaOperacao: number, sequencia: number) => string;

/** Mistura de 32 bits (finalizador do MurmurHash3). */
function misturar(h: number): number {
  let x = h;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Resumo de 128 bits de um texto, em quatro palavras de 32 bits. Não é criptográfico: só precisa espalhar bem. */
function resumo128(texto: string): [number, number, number, number] {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = 0xdeadbeef;
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i);
    a = Math.imul(a ^ k, 0x9e3779b1);
    b = Math.imul(b ^ k, 0x85ebca77);
    c = Math.imul(c ^ k, 0xc2b2ae3d);
    d = Math.imul(d ^ k, 0x27d4eb2f);
    // cruza as quatro trilhas para a posição do caractere pesar
    a = (a << 13) | (a >>> 19);
    b = (b + a) | 0;
    c = (c << 17) | (c >>> 15);
    d = (d + c) | 0;
    a = (a + d) | 0;
    c = (c + b) | 0;
  }
  a ^= texto.length;
  return [misturar(a ^ misturar(d)), misturar(b ^ misturar(a)), misturar(c ^ misturar(b)), misturar(d ^ misturar(c))];
}

const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/**
 * Gerador de ids de um lote. O id tem a forma de UUID (versão 8, a de conteúdo próprio, RFC 9562):
 * opaco e estável, como pede o ADR 027, e o mesmo em qualquer máquina para o mesmo lote.
 */
export function idsDoLote(idDoLote: string): GeradorDeId {
  return (indiceDaOperacao, sequencia) => {
    const [a, b, c, d] = resumo128(`${idDoLote}:${indiceDaOperacao}:${sequencia}`);
    const p1 = hex8(a);
    const p2 = hex8(b);
    const p3 = hex8(c);
    const p4 = hex8(d);
    // versão 8 no 13º dígito; variante 10xx no 17º
    const variante = ((Number.parseInt(p3[0] as string, 16) & 0x3) | 0x8).toString(16);
    return `${p1}-${p2.slice(0, 4)}-8${p2.slice(5, 8)}-${variante}${p3.slice(1, 4)}-${p3.slice(4, 8)}${p4}`;
  };
}
