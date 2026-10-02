// Adaptador de GeradorDeTexturas com o CanvasKit (o mesmo motor do render, variante completa, que codifica
// JPEG). Os desenhos vieram de poc/src/servidor/texturas.ts, que usava outro canvas: a receita de cada
// textura é a mesma (manchas de baixa frequência, fibras, vincos, retícula, grão, poros), mas os pixels não
// são idênticos aos da POC. Tudo sai de um gerador de números com semente fixa: o mesmo nome dá sempre os
// mesmos bytes neste motor.
// Só o worker e a semeadura usam isto: é render, e não cabe numa requisição da API.
import { carregarCanvasKit } from '@otto/render/node';
import { GeradorDeTexturas, LADO_DA_TEXTURA, TEXTURAS } from '../../application/texturas';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;
type Tela = ReturnType<NonNullable<ReturnType<Motor['MakeSurface']>>['getCanvas']>;

const LADO = LADO_DA_TEXTURA;
const QUALIDADE = 90;

function aleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sementeDe = (nome: string): number => [...nome].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

class Desenho {
  constructor(
    private readonly ck: Motor,
    private readonly tela: Tela,
  ) {}

  private info(lado: number) {
    const { ck } = this;
    return { width: lado, height: lado, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
  }

  fundo(r: number, g: number, b: number): void {
    const tinta = new this.ck.Paint();
    tinta.setColor(this.ck.Color(r, g, b, 1));
    this.tela.drawRect(this.ck.XYWHRect(0, 0, LADO, LADO), tinta);
    tinta.delete();
  }

  /** Ruído de baixa frequência: cinzas aleatórios numa grade pequena, ampliados com suavização e sobrepostos. */
  manchas(escala: number, forca: number, semente: number): void {
    const { ck } = this;
    const n = Math.ceil(LADO / escala);
    const r = aleatorio(semente);
    const pixels = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const v = Math.max(0, Math.min(255, Math.round(128 + (r() - 0.5) * 2 * forca)));
      pixels.set([v, v, v, 255], i * 4);
    }
    const pequena = ck.MakeImage(this.info(n), pixels, n * 4);
    if (!pequena) return;
    const tinta = new ck.Paint();
    tinta.setBlendMode(ck.BlendMode.Overlay);
    this.tela.drawImageRectCubic(pequena, ck.XYWHRect(0, 0, n, n), ck.XYWHRect(0, 0, LADO, LADO), 1 / 3, 1 / 3, tinta);
    tinta.delete();
    pequena.delete();
  }

  linha(x0: number, y0: number, x1: number, y1: number, cor: [number, number, number, number], espessura: number): void {
    const tinta = this.traco(cor, espessura);
    this.tela.drawLine(x0, y0, x1, y1, tinta);
    tinta.delete();
  }

  curva(pontos: [number, number, number, number, number, number, number, number], cor: [number, number, number, number], espessura: number): void {
    const construtor = new this.ck.PathBuilder();
    construtor.moveTo(pontos[0], pontos[1]);
    construtor.cubicTo(pontos[2], pontos[3], pontos[4], pontos[5], pontos[6], pontos[7]);
    const caminho = construtor.detachAndDelete();
    const tinta = this.traco(cor, espessura);
    this.tela.drawPath(caminho, tinta);
    tinta.delete();
    caminho.delete();
  }

  private traco(cor: [number, number, number, number], espessura: number) {
    const tinta = new this.ck.Paint();
    tinta.setAntiAlias(true);
    tinta.setStyle(this.ck.PaintStyle.Stroke);
    tinta.setStrokeWidth(espessura);
    tinta.setColor(this.ck.Color(...cor));
    return tinta;
  }

  ponto(x: number, y: number, raio: number, cor: [number, number, number, number]): void {
    const tinta = new this.ck.Paint();
    tinta.setAntiAlias(true);
    tinta.setColor(this.ck.Color(...cor));
    this.tela.drawCircle(x, y, raio, tinta);
    tinta.delete();
  }

  /** Mexe nos pixels do que já foi desenhado. */
  pixels(f: (dados: Uint8Array) => void): void {
    const dados = this.tela.readPixels(0, 0, this.info(LADO)) as Uint8Array | null;
    if (!dados) return;
    f(dados);
    const imagem = this.ck.MakeImage(this.info(LADO), dados, LADO * 4);
    if (!imagem) return;
    const tinta = new this.ck.Paint();
    tinta.setBlendMode(this.ck.BlendMode.Src);
    this.tela.drawImage(imagem, 0, 0, tinta);
    tinta.delete();
    imagem.delete();
  }

  /** Grão: soma a cada pixel um desvio aleatório, igual nos três canais. */
  ruido(intensidade: number, semente: number): void {
    const r = aleatorio(semente);
    this.pixels((d) => {
      for (let i = 0; i < d.length; i += 4) {
        const desvio = (r() - 0.5) * 2 * intensidade * 255;
        for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] as number) + desvio)));
      }
    });
  }

  girar(graus: number, f: () => void): void {
    this.tela.save();
    this.tela.rotate(graus, LADO / 2, LADO / 2);
    f();
    this.tela.restore();
  }
}

const RECEITAS: Record<string, (d: Desenho, r: () => number) => { desfoque?: number; graoDepois?: [number, number] }> = {
  papel(d, r) {
    d.fundo(236, 235, 230);
    d.manchas(80, 18, 3);
    d.manchas(12, 10, 4);
    // fibras curtas, claras e escuras
    for (let i = 0; i < 9000; i++) {
      const [x, y, a, l] = [r() * LADO, r() * LADO, r() * Math.PI, 4 + r() * 18];
      const clara = r() > 0.5;
      d.linha(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, clara ? [255, 255, 255, 0.35] : [90, 85, 75, 0.18], 0.6 + r() * 0.8);
    }
    return { graoDepois: [0.04, 11] };
  },
  'papel-amassado'(d, r) {
    d.fundo(233, 231, 225);
    d.manchas(220, 60, 5);
    d.manchas(60, 30, 6);
    // vincos: faixa clara ao lado de faixa escura
    for (let i = 0; i < 26; i++) {
      const [x0, y0, a, l] = [r() * LADO, r() * LADO, r() * Math.PI, 300 + r() * 900];
      for (const [cor, desvio] of [
        [[255, 255, 255, 0.55], -1.5],
        [[60, 55, 45, 0.35], 1.5],
      ] as const) {
        d.linha(x0 + desvio, y0 + desvio, x0 + Math.cos(a) * l + desvio, y0 + Math.sin(a) * l + desvio, [...cor] as [number, number, number, number], 2 + r() * 2);
      }
    }
    return { desfoque: 2.2, graoDepois: [0.03, 12] };
  },
  reticula(d) {
    // meio-tom a 45°, com o tamanho do ponto variando numa onda suave
    d.fundo(255, 255, 255);
    const passo = 14;
    d.girar(45, () => {
      for (let gy = -LADO; gy < LADO; gy += passo) {
        for (let gx = -LADO; gx < LADO; gx += passo) {
          const t = 0.5 + 0.5 * Math.sin(gx / 260 + 1.3) * Math.cos(gy / 330);
          d.ponto(gx + LADO / 2, gy + LADO / 2, (passo / 2) * (0.25 + 0.7 * t), [0, 0, 0, 1]);
        }
      }
    });
    return {};
  },
  'grao-de-filme'(d) {
    d.fundo(128, 128, 128);
    d.ruido(0.22, 21);
    return { desfoque: 0.6 };
  },
  'poeira-e-arranhoes'(d, r) {
    d.fundo(0, 0, 0);
    for (let i = 0; i < 1400; i++) d.ponto(r() * LADO, r() * LADO, 0.5 + r() ** 3 * 4, [255, 255, 255, 0.2 + r() * 0.7]);
    for (let i = 0; i < 60; i++) {
      const [x0, y0] = [r() * LADO, r() * LADO];
      const cor: [number, number, number, number] = [255, 255, 255, 0.15 + r() * 0.4];
      const espessura = 0.6 + r();
      d.curva([x0, y0, x0 + (r() - 0.5) * 200, y0 + r() * 200, x0 + (r() - 0.5) * 300, y0 + r() * 400, x0 + (r() - 0.5) * 100, y0 + 150 + r() * 500], cor, espessura);
    }
    return {};
  },
  concreto(d, r) {
    d.fundo(154, 152, 147);
    d.manchas(300, 40, 31);
    d.manchas(70, 30, 32);
    d.manchas(14, 24, 33);
    // poros
    for (let i = 0; i < 5000; i++) d.ponto(r() * LADO, r() * LADO, 0.5 + r() ** 4 * 3, [40, 38, 35, 0.2 + r() * 0.4]);
    return { graoDepois: [0.05, 34] };
  },
};

export class GeradorComCanvasKit extends GeradorDeTexturas {
  private motor: Promise<Motor> | undefined;

  /** @param motor o CanvasKit já carregado por outro adaptador do processo, se houver: o WebAssembly é pesado. */
  constructor(motor?: () => Promise<Motor>) {
    super();
    if (motor) this.carregar = motor;
  }

  private carregar = (): Promise<Motor> => {
    this.motor ??= carregarCanvasKit('completa');
    return this.motor;
  };

  async gerar(nome: string): Promise<Uint8Array> {
    const receita = RECEITAS[nome];
    if (!receita || !TEXTURAS.some((t) => t.nome === nome)) throw new Error('textura desconhecida');
    const ck = await this.carregar();
    const superficie = ck.MakeSurface(LADO, LADO);
    if (!superficie) throw new Error('o motor não criou a superfície da textura');
    try {
      const tela = superficie.getCanvas();
      const desenho = new Desenho(ck, tela);
      const depois = receita(desenho, aleatorio(sementeDe(nome)));
      if (depois.desfoque) {
        // desfoca o que foi desenhado até aqui, por cima de si mesmo
        const antes = superficie.makeImageSnapshot();
        const tinta = new ck.Paint();
        tinta.setBlendMode(ck.BlendMode.Src);
        tinta.setImageFilter(ck.ImageFilter.MakeBlur(depois.desfoque, depois.desfoque, ck.TileMode.Clamp, null));
        tela.drawImage(antes, 0, 0, tinta);
        tinta.delete();
        antes.delete();
      }
      if (depois.graoDepois) desenho.ruido(depois.graoDepois[0], depois.graoDepois[1]);
      const pronta = superficie.makeImageSnapshot();
      const bytes = pronta.encodeToBytes(ck.ImageFormat.JPEG, QUALIDADE);
      pronta.delete();
      if (!bytes) throw new Error('este motor não codifica JPEG: carregue a variante completa');
      return bytes;
    } finally {
      superficie.delete();
    }
  }
}
