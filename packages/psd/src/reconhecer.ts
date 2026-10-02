// Reconhecimento, na importação: o PSD guarda caminho, quatro cantos e máscara de pixels, e o Otto guarda "retângulo
// de raio 12", "foto com foco em 0,6" e "máscara em degradê a 90°". Aqui se propõe a forma do Otto que daria aquele
// resultado, e ela só é aceita quando, refeita pelo mesmo código da exportação (nosDaForma, cantosDaFoto) ou desenhada
// pelo motor, bate com o que o arquivo traz. O que não bate não é adivinhado: fica como caminho livre, ou como pixel.
import type { Mascara, NoImagem } from '@otto/documento';
import { type Mapa, mapearNos, nosDaForma } from './caminho';
import { cantosDaFoto } from './montar';
import type { CaminhoDoArquivo, MascaraDoArquivo, NoDeBezier } from './porta';

type Ponto = [number, number];

export interface FormaReconhecida {
  forma: 'retangulo' | 'elipse';
  x: number;
  y: number;
  largura: number;
  altura: number;
  raio: number;
  /** graus, sentido horário, em torno do centro */
  rotacao: number;
}

const arredondar = (v: number, casas = 2): number => {
  const k = 10 ** casas;
  const r = Math.round(v * k) / k;
  return r === 0 ? 0 : r;
};
const distancia = (a: Ponto, b: Ponto): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Rotação de `graus` em torno de (ox, oy). */
export function girar(graus: number, ox: number, oy: number): Mapa {
  if (!graus) return (x, y) => [x, y];
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y) => [ox + (x - ox) * cos - (y - oy) * sin, oy + (x - ox) * sin + (y - oy) * cos];
}

/** Os dois caminhos têm os mesmos nós (âncoras e controles), na mesma ordem a menos de onde começam e do sentido? */
function mesmosNos(a: readonly NoDeBezier[], b: readonly NoDeBezier[], folga: number): boolean {
  if (a.length !== b.length) return false;
  const n = a.length;
  const igual = (x: NoDeBezier, y: NoDeBezier, invertido: boolean): boolean =>
    distancia(x.ancora, y.ancora) <= folga && distancia(x.chegada, invertido ? y.saida : y.chegada) <= folga && distancia(x.saida, invertido ? y.chegada : y.saida) <= folga;
  for (let inicio = 0; inicio < n; inicio++) {
    if (a.every((x, i) => igual(x, b[(inicio + i) % n] as NoDeBezier, false))) return true;
    if (a.every((x, i) => igual(x, b[(inicio - i + n) % n] as NoDeBezier, true))) return true;
  }
  return false;
}

/**
 * O caminho é um retângulo (com raio) ou uma elipse do Otto, talvez girado? Propõe pelos pontos e confere refazendo o
 * caminho com nosDaForma, que é quem o grava na exportação. `folga` em pixels.
 */
export function reconhecerForma(caminho: CaminhoDoArquivo, folga = 0.25): FormaReconhecida | undefined {
  if (caminho.aberto) return undefined;
  const nos = caminho.nos;
  const ancoras = nos.map((n) => n.ancora);
  const cx = ancoras.reduce((s, p) => s + p[0], 0) / ancoras.length;
  const cy = ancoras.reduce((s, p) => s + p[1], 0) / ancoras.length;
  const conferir = (forma: 'retangulo' | 'elipse', largura: number, altura: number, raio: number, graus: number): FormaReconhecida | undefined => {
    if (!(largura > 0.01 && altura > 0.01)) return undefined;
    // o ângulo fica entre -45° e 45°: um retângulo girado 90° é o mesmo retângulo com os lados trocados
    let rotacao = graus;
    let w = largura;
    let h = altura;
    while (rotacao > 45) {
      rotacao -= 90;
      [w, h] = [h, w];
    }
    while (rotacao <= -45) {
      rotacao += 90;
      [w, h] = [h, w];
    }
    if (Math.abs(rotacao) < 0.01) rotacao = 0;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const refeito = mapearNos(nosDaForma(forma, x, y, w, h, raio), girar(rotacao, cx, cy));
    if (!mesmosNos(refeito, nos, folga)) return undefined;
    return { forma, x: arredondar(x), y: arredondar(y), largura: arredondar(w), altura: arredondar(h), raio: arredondar(raio), rotacao: arredondar(rotacao) };
  };
  const angulo = (a: Ponto, b: Ponto): number => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (nos.length === 4) {
    const [a, b, c] = ancoras as [Ponto, Ponto, Ponto, Ponto];
    const reto = nos.every((n) => distancia(n.chegada, n.ancora) <= folga && distancia(n.saida, n.ancora) <= folga);
    if (reto) return conferir('retangulo', distancia(a, b), distancia(b, c), 0, angulo(a, b));
    // elipse: as âncoras são as pontas dos dois eixos
    const eixo1 = distancia(a, c);
    const eixo2 = distancia(b, ancoras[3] as Ponto);
    return conferir('elipse', eixo2, eixo1, 0, angulo(ancoras[3] as Ponto, b)) ?? conferir('elipse', eixo1, eixo2, 0, angulo(a, c));
  }
  if (nos.length === 8) {
    // retângulo arredondado: os lados retos são os pares de âncoras vizinhas ligados por uma reta (sem controle entre elas)
    for (let i = 0; i < 8; i++) {
      const p = nos[i] as NoDeBezier;
      const q = nos[(i + 1) % 8] as NoDeBezier;
      if (distancia(p.saida, p.ancora) > folga || distancia(q.chegada, q.ancora) > folga) continue;
      // este é um lado reto; o canto seguinte vai de q até a âncora depois dela
      const r = nos[(i + 2) % 8] as NoDeBezier;
      const s = nos[(i + 3) % 8] as NoDeBezier;
      const dir: Ponto = [(q.ancora[0] - p.ancora[0]) / (distancia(p.ancora, q.ancora) || 1), (q.ancora[1] - p.ancora[1]) / (distancia(p.ancora, q.ancora) || 1)];
      // o raio é o quanto o canto avança na direção do lado
      const raio = Math.abs((r.ancora[0] - q.ancora[0]) * dir[0] + (r.ancora[1] - q.ancora[1]) * dir[1]);
      const lado1 = distancia(p.ancora, q.ancora) + 2 * raio;
      const lado2 = distancia(r.ancora, s.ancora) + 2 * raio;
      const achada = conferir('retangulo', lado1, lado2, raio, angulo(p.ancora, q.ancora));
      if (achada) return achada;
    }
  }
  return undefined;
}

/** A caixa exata de um caminho de Bézier (as curvas, não os controles). */
export function caixaDosCaminhos(caminhos: readonly CaminhoDoArquivo[]): { x: number; y: number; largura: number; altura: number } | undefined {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const ponto = (x: number, y: number): void => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  const em = (a: number, b: number, c: number, d: number, t: number): number => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
  /** onde a derivada da cúbica zera, entre 0 e 1 */
  const extremos = (a: number, b: number, c: number, d: number): number[] => {
    const qa = -a + 3 * b - 3 * c + d;
    const qb = 2 * (a - 2 * b + c);
    const qc = b - a;
    if (Math.abs(qa) < 1e-9) return Math.abs(qb) < 1e-9 ? [] : [-qc / qb];
    const delta = qb * qb - 4 * qa * qc;
    if (delta < 0) return [];
    return [(-qb + Math.sqrt(delta)) / (2 * qa), (-qb - Math.sqrt(delta)) / (2 * qa)];
  };
  for (const c of caminhos) {
    const n = c.nos.length;
    for (let i = 0; i < n; i++) {
      const p = c.nos[i] as NoDeBezier;
      ponto(...p.ancora);
      if (c.aberto && i === n - 1) break;
      const q = c.nos[(i + 1) % n] as NoDeBezier;
      for (const eixo of [0, 1] as const)
        for (const t of extremos(p.ancora[eixo], p.saida[eixo], q.chegada[eixo], q.ancora[eixo]))
          if (t > 0 && t < 1) ponto(em(p.ancora[0], p.saida[0], q.chegada[0], q.ancora[0], t), em(p.ancora[1], p.saida[1], q.chegada[1], q.ancora[1], t));
    }
  }
  return x1 >= x0 ? { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 } : undefined;
}

/** Os caminhos como o "d" de um vetor do Otto (só M, C e Z), com a origem em (ox, oy). */
export function caminhosEmD(caminhos: readonly CaminhoDoArquivo[], ox: number, oy: number): string {
  const n = (v: number): string => String(arredondar(v, 3));
  const p = (q: Ponto): string => `${n(q[0] - ox)} ${n(q[1] - oy)}`;
  return caminhos
    .filter((c) => c.nos.length > 1)
    .map((c) => {
      const nos = c.nos;
      let d = `M${p((nos[0] as NoDeBezier).ancora)}`;
      for (let i = 1; i < nos.length; i++) d += `C${p((nos[i - 1] as NoDeBezier).saida)} ${p((nos[i] as NoDeBezier).chegada)} ${p((nos[i] as NoDeBezier).ancora)}`;
      if (!c.aberto) d += `C${p((nos[nos.length - 1] as NoDeBezier).saida)} ${p((nos[0] as NoDeBezier).chegada)} ${p((nos[0] as NoDeBezier).ancora)}Z`;
      return d;
    })
    .join('');
}

export interface FotoReconhecida {
  x: number;
  y: number;
  largura: number;
  altura: number;
  rotacao: number;
  ajuste: 'cobrir' | 'conter';
  foco: { x: number; y: number };
  zoom: number;
}

/**
 * A foto do Otto que daria estes quatro cantos (superior esquerdo, superior direito, inferior direito, inferior
 * esquerdo, da foto inteira). `caixa` é a forma que corta a foto, já reconhecida; sem ela, a caixa é a própria foto.
 * Só aceita o que o Otto tem: escala igual nos dois eixos, sem espelhar nem inclinar, foto cobrindo a caixa (com
 * aproximação de 1 a 4) ou inteira dentro dela. Confere refazendo os cantos com cantosDaFoto.
 */
export function reconhecerFoto(cantos: readonly number[], larguraDaFoto: number, alturaDaFoto: number, caixa: FormaReconhecida | undefined, folga = 0.75): FotoReconhecida | undefined {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = cantos as [number, number, number, number, number, number, number, number];
  const lado = distancia([x0, y0], [x1, y1]);
  const outro = distancia([x0, y0], [x3, y3]);
  if (!(lado > 0.01 && outro > 0.01 && larguraDaFoto > 0 && alturaDaFoto > 0)) return undefined;
  const k = lado / larguraDaFoto;
  if (Math.abs(outro / alturaDaFoto - k) > k * 0.01) return undefined;
  // lados perpendiculares, no sentido horário (sem espelho)
  const ux = (x1 - x0) / lado;
  const uy = (y1 - y0) / lado;
  const vx = (x3 - x0) / outro;
  const vy = (y3 - y0) / outro;
  if (Math.abs(ux * vx + uy * vy) > 0.005 || ux * vy - uy * vx < 0.99) return undefined;
  // tem de ser mesmo um paralelogramo: o quarto canto fecha
  if (distancia([x2, y2], [x1 + x3 - x0, y1 + y3 - y0]) > folga) return undefined;
  let rotacao = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (Math.abs(rotacao) < 0.01) rotacao = 0;
  if (caixa && Math.abs(caixa.rotacao - rotacao) > 0.05) return undefined;
  // tudo no referencial sem a rotação, em torno do centro da caixa (o Otto gira a camada em torno do centro dela)
  const centroDaFoto: Ponto = [(x0 + x2) / 2, (y0 + y2) / 2];
  const cx = caixa ? caixa.x + caixa.largura / 2 : centroDaFoto[0];
  const cy = caixa ? caixa.y + caixa.altura / 2 : centroDaFoto[1];
  const [fx, fy] = girar(-rotacao, cx, cy)(x0, y0);
  const larguraNaTela = larguraDaFoto * k;
  const alturaNaTela = alturaDaFoto * k;
  const c = caixa ?? { x: fx, y: fy, largura: larguraNaTela, altura: alturaNaTela };
  const base = { x: arredondar(c.x), y: arredondar(c.y), largura: arredondar(c.largura), altura: arredondar(c.altura), rotacao: arredondar(rotacao) };
  const candidatos: FotoReconhecida[] = [];
  // cobrir: a foto cobre a caixa, com aproximação e foco
  const cobrir = Math.max(c.largura / larguraDaFoto, c.altura / alturaDaFoto);
  const zoom = k / cobrir;
  const sobraX = larguraDaFoto - c.largura / k;
  const sobraY = alturaDaFoto - c.altura / k;
  const foco = { x: sobraX > 1e-6 ? (c.x - fx) / k / sobraX : 0.5, y: sobraY > 1e-6 ? (c.y - fy) / k / sobraY : 0.5 };
  if (zoom > 0.999 && zoom < 4.001 && foco.x > -0.002 && foco.x < 1.002 && foco.y > -0.002 && foco.y < 1.002)
    candidatos.push({
      ...base,
      ajuste: 'cobrir',
      zoom: Math.max(1, Math.min(4, arredondar(zoom, 4))),
      foco: { x: Math.max(0, Math.min(1, arredondar(foco.x, 4))), y: Math.max(0, Math.min(1, arredondar(foco.y, 4))) },
    });
  candidatos.push({ ...base, ajuste: 'conter', zoom: 1, foco: { x: 0.5, y: 0.5 } });
  for (const candidato of candidatos) {
    const refeitos = cantosDaFoto(larguraDaFoto, alturaDaFoto, candidato as unknown as NoImagem);
    const f = girar(candidato.rotacao, candidato.x + candidato.largura / 2, candidato.y + candidato.altura / 2);
    const ok = [0, 2, 4, 6].every((i) => distancia(f(refeitos[i] as number, refeitos[i + 1] as number), [cantos[i] as number, cantos[i + 1] as number]) <= folga);
    if (ok) return candidato;
  }
  return undefined;
}

/** A máscara como um plano do tamanho pedido (um byte por pixel), com o valor de fora onde ela não tem área. */
export function estenderMascara(m: MascaraDoArquivo, x: number, y: number, largura: number, altura: number): Uint8Array {
  const plano = new Uint8Array(largura * altura).fill(m.fora);
  const x0 = Math.max(x, m.x);
  const x1 = Math.min(x + largura, m.x + m.largura);
  for (let py = Math.max(y, m.y); py < Math.min(y + altura, m.y + m.altura); py++) {
    if (x1 <= x0) break;
    plano.set(m.cobertura.subarray((py - m.y) * m.largura + (x0 - m.x), (py - m.y) * m.largura + (x1 - m.x)), (py - y) * largura + (x0 - x));
  }
  return plano;
}

/** As máscaras do Otto que são geometria (as que não dependem de um arquivo). */
export type MascaraGeometrica = Exclude<Mascara, { tipo: 'sujeito' }>;

/**
 * As máscaras do Otto que poderiam ter dado este plano de cobertura (do tamanho da prancheta): uma forma (retângulo,
 * com raio, ou elipse; com borda suave; invertida) e um degradê. São só propostas: quem chama desenha cada uma com o
 * motor e fica com a que bater. `caixa` é a caixa da camada, a que o degradê do Otto se refere.
 */
export function proporMascaras(plano: Uint8Array, largura: number, altura: number, caixa: { x: number; y: number; w: number; h: number }): MascaraGeometrica[] {
  const propostas: MascaraGeometrica[] = [];
  const em = (x: number, y: number): number => plano[Math.max(0, Math.min(altura - 1, y)) * largura + Math.max(0, Math.min(largura - 1, x))] as number;

  // ---- forma: a região acima (ou abaixo, se invertida) de meio-tom
  const cantos = [em(0, 0), em(largura - 1, 0), em(0, altura - 1), em(largura - 1, altura - 1)];
  const inverter = cantos.filter((v) => v > 127).length >= 3;
  const dentro = (v: number): boolean => (inverter ? v <= 127 : v > 127);
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++)
      if (dentro(plano[y * largura + x] as number)) {
        area++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 >= x0 && y1 >= y0) {
    // a borda entre pixels: onde a cobertura cruza o meio-tom, na linha e na coluna do centro
    const cyL = Math.round((y0 + y1) / 2);
    const cxC = Math.round((x0 + x1) / 2);
    const valor = (v: number): number => (inverter ? 255 - v : v);
    const cruzar = (a: number, b: number): number => (a === b ? 0.5 : (127.5 - a) / (b - a));
    const esquerda = x0 > 0 ? x0 - 1 + cruzar(valor(em(x0 - 1, cyL)), valor(em(x0, cyL))) + 0.5 : 0;
    const direita = x1 < largura - 1 ? x1 + cruzar(valor(em(x1, cyL)), valor(em(x1 + 1, cyL))) + 0.5 : largura;
    const topo = y0 > 0 ? y0 - 1 + cruzar(valor(em(cxC, y0 - 1)), valor(em(cxC, y0))) + 0.5 : 0;
    const base = y1 < altura - 1 ? y1 + cruzar(valor(em(cxC, y1)), valor(em(cxC, y1 + 1))) + 0.5 : altura;
    const meio = (v: number): number => Math.round(v * 2) / 2;
    // borda suave: a largura da passagem de 10% a 90% é 2,563 desvios padrão do desfoque
    let suavizar = 0;
    if (x0 > 0) {
      let de: number | undefined;
      let ate: number | undefined;
      for (let x = Math.max(0, x0 - 200); x <= Math.min(largura - 1, x0 + 200); x++) {
        const v = valor(em(x, cyL));
        if (de === undefined && v >= 25.5) de = x - (x > 0 ? cruzarEm(valor(em(x - 1, cyL)), v, 25.5) : 0);
        if (v >= 229.5) {
          ate = x - (x > 0 ? cruzarEm(valor(em(x - 1, cyL)), v, 229.5) : 0);
          break;
        }
      }
      if (de !== undefined && ate !== undefined && ate - de > 1.6) suavizar = Math.round(((ate - de) / 2.563) * 2) / 2;
    }
    // a caixa medida; e, com borda suave, a mesma arredondada para fora (o desfoque encolhe o meio-tom de uma forma curva)
    const caixas = [{ x: meio(esquerda), y: meio(topo), w: meio(direita) - meio(esquerda), h: meio(base) - meio(topo) }];
    if (suavizar > 0)
      caixas.push({ x: Math.floor(esquerda + 0.01), y: Math.floor(topo + 0.01), w: Math.ceil(direita - 0.01) - Math.floor(esquerda + 0.01), h: Math.ceil(base - 0.01) - Math.floor(topo + 0.01) });
    for (const k of caixas) {
      if (!(k.w > 0 && k.h > 0)) continue;
      // retângulo, retângulo arredondado (o raio sai da área que falta nos cantos) e elipse
      const falta = Math.max(0, k.w * k.h - area);
      const raio = Math.round(Math.sqrt(falta / (4 - Math.PI)));
      // raio de metade do lado menor é a elipse (ou o círculo): não entra como retângulo
      const arredondado = raio > 0 && raio < Math.min(k.w, k.h) / 2 - 0.5;
      const formas = [{ forma: 'retangulo' as const, raio: 0 }, ...(arredondado ? [{ forma: 'retangulo' as const, raio }] : []), { forma: 'elipse' as const, raio: 0 }];
      for (const f of formas) propostas.push({ tipo: 'forma', forma: f.forma, x: k.x, y: k.y, largura: k.w, altura: k.h, raio: f.raio, suavizar, inverter });
    }
  }

  // ---- degradê: a direção em que a cobertura cai, e onde ela começa e termina de cair
  let gx = 0;
  let gy = 0;
  const passo = Math.max(1, Math.floor(Math.min(largura, altura) / 200));
  for (let y = passo; y < altura - passo; y += passo)
    for (let x = passo; x < largura - passo; x += passo) {
      gx += em(x + passo, y) - em(x - passo, y);
      gy += em(x, y + passo) - em(x, y - passo);
    }
  const modulo = Math.hypot(gx, gy);
  if (modulo > 0) {
    // o degradê do Otto vai do opaco para o transparente na direção do ângulo: contra o gradiente da cobertura
    const angulo = Math.round(((Math.atan2(gy, -gx) * 180) / Math.PI) * 2) / 2;
    const a = (angulo * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = -Math.sin(a);
    const metade = (Math.abs(caixa.w * dx) + Math.abs(caixa.h * dy)) / 2;
    if (metade > 0) {
      const ox = caixa.x + caixa.w / 2 - dx * metade;
      const oy = caixa.y + caixa.h / 2 - dy * metade;
      // regressão da cobertura contra a posição ao longo do degradê, só no trecho em que ela está caindo
      let n = 0;
      let st = 0;
      let sv = 0;
      let stt = 0;
      let stv = 0;
      for (let y = 0; y < altura; y += passo)
        for (let x = 0; x < largura; x += passo) {
          const v = plano[y * largura + x] as number;
          if (v < 16 || v > 239) continue;
          const t = ((x + 0.5 - ox) * dx + (y + 0.5 - oy) * dy) / (2 * metade);
          n++;
          st += t;
          sv += v;
          stt += t * t;
          stv += t * v;
        }
      const den = n * stt - st * st;
      if (n > 8 && Math.abs(den) > 1e-9) {
        const inclinacao = (n * stv - st * sv) / den;
        const corte = (sv - inclinacao * st) / n;
        if (inclinacao < 0) {
          const inicio = Math.round(((255 - corte) / inclinacao) * 200) / 200;
          const fim = Math.round((-corte / inclinacao) * 200) / 200;
          if (inicio >= -0.01 && fim <= 1.01 && fim > inicio) propostas.push({ tipo: 'degrade', angulo: angulo === 0 ? 0 : angulo, inicio: Math.max(0, inicio), fim: Math.min(1, fim) });
        }
      }
    }
  }
  return propostas;
}

/** Fração do caminho de `a` até `b` em que o valor cruza `alvo`, contada a partir de `b` para trás. */
function cruzarEm(a: number, b: number, alvo: number): number {
  return b === a ? 0 : Math.max(0, Math.min(1, (b - alvo) / (b - a)));
}

/** Diferença entre dois planos de cobertura: a média e a maior, em níveis de 0 a 255. */
export function diferencaDePlanos(a: Uint8Array, b: Uint8Array): { media: number; maior: number } {
  let soma = 0;
  let maior = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs((a[i] as number) - (b[i] as number));
    soma += d;
    if (d > maior) maior = d;
  }
  return { media: a.length ? soma / a.length : 0, maior };
}
