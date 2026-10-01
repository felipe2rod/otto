// Teste de alvo: que camada está sob um ponto. É geometria do documento, não do motor: roda na linha principal
// do editor sem esperar render, e responde igual para qualquer motor.
//
// Vale a caixa da camada com a rotação dela, e a forma quando ela é barata de testar (elipse, canto arredondado).
// Texto, foto e vetor respondem pela caixa inteira, mesmo onde são transparentes: testar pelo pixel pede o render.
import { type Documento, ehVisual, type No, type NoVisual, type Prancheta } from './esquema';
import { disporPranchetas } from './geometria';

export interface Ponto {
  x: number;
  y: number;
}

export interface Alvo {
  prancheta: Prancheta;
  /** Ausente: o ponto está na prancheta, fora de qualquer camada que se possa pegar. */
  no?: NoVisual;
}

export interface OpcoesDoAlvo {
  /** Margem em volta de cada camada, em unidades do documento. O editor passa alguns pixels de tela divididos pelo zoom. */
  folga?: number;
  /** Camada bloqueada (ou dentro de grupo bloqueado) também responde. No canvas ela não se pega; na lista, sim. */
  comBloqueadas?: boolean;
}

/** O ponto (em coordenadas da prancheta) está dentro da camada, com a rotação e a forma dela? */
export function noContemPonto(no: NoVisual, x: number, y: number, folga = 0): boolean {
  const meiaLargura = no.largura / 2;
  const meiaAltura = no.altura / 2;
  // o ponto no sistema da camada: origem no centro, sem a rotação
  let dx = x - (no.x + meiaLargura);
  let dy = y - (no.y + meiaAltura);
  if (no.rotacao) {
    const a = (-no.rotacao * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    [dx, dy] = [dx * cos - dy * sin, dx * sin + dy * cos];
  }
  const a = meiaLargura + folga;
  const b = meiaAltura + folga;
  if (Math.abs(dx) > a || Math.abs(dy) > b) return false;
  if (no.tipo !== 'forma') return true;
  if (no.forma === 'elipse') return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1;
  const raio = Math.min(no.raio, meiaLargura, meiaAltura);
  if (raio <= 0) return true;
  // canto arredondado: fora do miolo, vale a distância ao centro do arco
  const fx = Math.abs(dx) - (meiaLargura - raio);
  const fy = Math.abs(dy) - (meiaAltura - raio);
  if (fx <= 0 || fy <= 0) return true;
  return Math.hypot(fx, fy) <= raio + folga;
}

/** As camadas visuais que podem ser alvo, de baixo para cima. Grupo oculto esconde, e grupo bloqueado bloqueia, tudo dentro. */
function candidatas(filhos: readonly No[], comBloqueadas: boolean): NoVisual[] {
  return filhos.flatMap((n) => {
    if (!n.visivel || (n.bloqueado && !comBloqueadas)) return [];
    if (n.tipo === 'grupo') return candidatas(n.filhos, comBloqueadas);
    return ehVisual(n) ? [n] : [];
  });
}

/** A camada de cima sob o ponto, em coordenadas da prancheta. */
export function noSobOPonto(prancheta: Prancheta, x: number, y: number, opcoes: OpcoesDoAlvo = {}): NoVisual | undefined {
  const lista = candidatas(prancheta.filhos, opcoes.comBloqueadas ?? false);
  for (let i = lista.length - 1; i >= 0; i--) {
    const no = lista[i] as NoVisual;
    if (noContemPonto(no, x, y, opcoes.folga ?? 0)) return no;
  }
  return undefined;
}

/**
 * A prancheta e a camada sob o ponto.
 * @param ponto no plano do editor (unidades do documento, com as pranchetas lado a lado, como em disporPranchetas)
 */
export function acharEm(doc: Documento, ponto: Ponto, opcoes: OpcoesDoAlvo = {}): Alvo | undefined {
  const posicoes = disporPranchetas(doc.pranchetas);
  for (const prancheta of doc.pranchetas) {
    const origem = posicoes.get(prancheta.id);
    if (!origem) continue;
    const x = ponto.x - origem.x;
    const y = ponto.y - origem.y;
    if (x < 0 || y < 0 || x > prancheta.largura || y > prancheta.altura) continue;
    const no = noSobOPonto(prancheta, x, y, opcoes);
    return no ? { prancheta, no } : { prancheta };
  }
  return undefined;
}
