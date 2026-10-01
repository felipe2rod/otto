// Texto com o módulo de parágrafo do Skia (modelagem por HarfBuzz, quebra de linha por ICU).
// As fontes são bytes entregues por quem chama: o motor nunca consulta fonte do sistema.
// A medida pela tinta sai da caixa de cada glifo já posicionado, sem rasterizar: é o medidor do R3.
import type { Canvas, CanvasKit, Font, FontWeight, Paragraph, TextStyle, Typeface, TypefaceFontProvider } from 'canvaskit-wasm';
import { type CaixaMedida, type NoTexto, rgbDe } from './tipos.ts';

export interface FonteDeArquivo {
  familia: string;
  peso: number;
  bytes: Uint8Array;
}

export interface LinhaDiagramada {
  /** x de início da linha, já com o alinhamento, em coordenadas da prancheta */
  x: number;
  largura: number;
  /** y da linha de base */
  base: number;
}

export interface TextoDiagramado {
  linhas: LinhaDiagramada[];
  /** altura pela caixa da fonte: é o que precisa caber na caixa da camada */
  alturaUsada: number;
  larguraMaxima: number;
  /** onde as letras de fato estão, em coordenadas da prancheta, antes da rotação */
  tinta: CaixaMedida;
  fonteEncontrada: boolean;
  /** caracteres sem desenho nas fontes entregues */
  glifosAusentes: number;
}

export interface MotorDeTexto {
  diagramar(no: NoTexto): TextoDiagramado;
  /** Caixa da tinta já girada com a camada: é o que `alinhar`, `distribuir` e o lint usam. */
  medirTinta(no: NoTexto): CaixaMedida;
  desenhar(canvas: Canvas, no: NoTexto): void;
  metricas(familia: string, peso: number, tamanho: number): { ascendente: number; descendente: number };
  destruir(): void;
}

interface FonteRegistrada {
  familia: string;
  peso: number;
  /** nome único com que o arquivo foi registrado: um arquivo, um apelido, sem escolha por estilo dentro do Skia */
  apelido: string;
  tipo: Typeface;
}

export function girarCaixa(c: CaixaMedida, cx: number, cy: number, graus: number): CaixaMedida {
  if (!graus) return c;
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  const cantos = [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]].map(([x, y]) => [cx + (x! - cx) * cos - (y! - cy) * sen, cy + (x! - cx) * sen + (y! - cy) * cos]);
  const xs = cantos.map((p) => p[0]!);
  const ys = cantos.map((p) => p[1]!);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

export function criarMotorDeTexto(ck: CanvasKit, fontes: readonly FonteDeArquivo[]): MotorDeTexto {
  const provedor: TypefaceFontProvider = ck.TypefaceFontProvider.Make();
  const registradas: FonteRegistrada[] = [];
  for (const f of fontes) {
    const tipo = ck.Typeface.MakeTypefaceFromData(f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
    if (!tipo) throw new Error(`Arquivo de fonte inválido: ${f.familia} ${f.peso}`);
    const apelido = `${f.familia}#${f.peso}`;
    provedor.registerFont(f.bytes, apelido);
    registradas.push({ familia: f.familia, peso: f.peso, apelido, tipo });
  }
  const pesos = Object.values(ck.FontWeight).filter((v): v is FontWeight => typeof v === 'object' && v !== null && 'value' in v);
  const pesoDoSkia = (peso: number): FontWeight => pesos.find((p) => p.value === peso) ?? ck.FontWeight.Normal;

  /** Mesmo critério da POC: o arquivo da família com o peso mais próximo. Sem família, não há substituta. */
  const achar = (familia: string, peso: number): FonteRegistrada | undefined => {
    const daFamilia = registradas.filter((f) => f.familia === familia);
    if (daFamilia.length === 0) return undefined;
    return daFamilia.reduce((melhor, f) => (Math.abs(f.peso - peso) < Math.abs(melhor.peso - peso) ? f : melhor));
  };

  interface Estilo {
    fonte: string;
    peso: number;
    tamanho: number;
    cor: string;
    espacamento: number;
  }

  const estiloDoSkia = (no: NoTexto, e: Estilo, fonte: FonteRegistrada): TextStyle => {
    const [r, g, b] = rgbDe(e.cor);
    const recursos = [...(no.recursosOpenType ?? []).map((nome) => ({ name: nome, value: 1 })), ...(no.kerning === 'nenhum' ? [{ name: 'kern', value: 0 }] : [])];
    return new ck.TextStyle({
      color: ck.Color(r, g, b, 1),
      fontFamilies: [fonte.apelido],
      fontSize: e.tamanho,
      // o peso é o do arquivo escolhido: se pedisse outro, o Skia engrossaria a letra por conta própria
      fontStyle: { weight: pesoDoSkia(fonte.peso) },
      heightMultiplier: no.entrelinha,
      halfLeading: false,
      // tracking em milésimos de eme, como no Photoshop
      letterSpacing: (e.espacamento / 1000) * e.tamanho,
      ...(recursos.length ? { fontFeatures: recursos } : {}),
    });
  };

  /** Monta o parágrafo. Devolve undefined quando falta alguma fonte: o motor não substitui em silêncio. */
  const montar = (no: NoTexto): Paragraph | undefined => {
    const base: Estilo = { fonte: no.fonte, peso: no.peso, tamanho: no.tamanho, cor: no.cor, espacamento: no.espacamento };
    const fonteBase = achar(base.fonte, base.peso);
    if (!fonteBase) return undefined;
    // estilo por caractere: o da camada com os trechos por cima
    const n = no.conteudo.length;
    const estilos: Estilo[] = Array.from({ length: n }, () => base);
    for (const t of no.trechos ?? []) {
      const e: Estilo = { fonte: t.fonte ?? base.fonte, peso: t.peso ?? base.peso, tamanho: t.tamanho ?? base.tamanho, cor: t.cor ?? base.cor, espacamento: t.espacamento ?? base.espacamento };
      if (!achar(e.fonte, e.peso)) return undefined;
      for (let i = Math.max(0, t.inicio); i < Math.min(n, t.fim); i++) estilos[i] = e;
    }
    const alinhamento = no.alinhamento === 'centro' ? ck.TextAlign.Center : no.alinhamento === 'direita' ? ck.TextAlign.Right : ck.TextAlign.Left;
    const construtor = ck.ParagraphBuilder.MakeFromFontProvider(
      new ck.ParagraphStyle({
        textStyle: estiloDoSkia(no, base, fonteBase),
        textAlign: alinhamento,
        // como no Photoshop: a primeira linha encosta a ascendente da fonte no topo da caixa
        textHeightBehavior: ck.TextHeightBehavior.DisableFirstAscent,
        // sem arredondar as linhas para pixel inteiro: a linha de base fica onde a métrica da fonte manda
        applyRoundingHack: false,
      }),
      provedor,
    );
    let i = 0;
    while (i < n) {
      const e = estilos[i]!;
      let j = i + 1;
      while (j < n && estilos[j] === e) j++;
      construtor.pushStyle(estiloDoSkia(no, e, achar(e.fonte, e.peso)!));
      construtor.addText(no.conteudo.slice(i, j));
      construtor.pop();
      i = j;
    }
    const paragrafo = construtor.build();
    construtor.delete();
    paragrafo.layout(no.largura);
    return paragrafo;
  };

  /** Fonte de medida com a mesma configuração do desenho (subpixel, sem hinting). */
  const fonteDeMedida = (tipo: Typeface, tamanho: number): Font => {
    const f = new ck.Font(tipo, tamanho);
    f.setSubpixel(true);
    f.setLinearMetrics(true);
    f.setHinting(ck.FontHinting.None);
    return f;
  };

  const medir = (no: NoTexto, paragrafo: Paragraph | undefined): TextoDiagramado => {
    if (!paragrafo) return { linhas: [], alturaUsada: 0, larguraMaxima: 0, tinta: { x: no.x, y: no.y, w: 0, h: 0 }, fonteEncontrada: false, glifosAusentes: 0 };
    const metricas = paragrafo.getLineMetrics();
    const formadas = paragrafo.getShapedLines();
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const linha of formadas) {
      for (const trecho of linha.runs) {
        // o Typeface do trecho vem do próprio parágrafo: é o arquivo que de fato desenhou aquele glifo
        const fonte = fonteDeMedida(trecho.typeface, trecho.size);
        const caixas = fonte.getGlyphBounds(trecho.glyphs);
        for (let g = 0; g < trecho.glyphs.length; g++) {
          const l = caixas[g * 4]!;
          const t = caixas[g * 4 + 1]!;
          const r = caixas[g * 4 + 2]!;
          const b = caixas[g * 4 + 3]!;
          if (r <= l || b <= t) continue; // espaço: sem tinta
          const px = trecho.positions[g * 2]!;
          const py = trecho.positions[g * 2 + 1]!;
          x0 = Math.min(x0, px + l);
          y0 = Math.min(y0, py + t);
          x1 = Math.max(x1, px + r);
          y1 = Math.max(y1, py + b);
        }
        fonte.delete();
        trecho.typeface.delete();
      }
    }
    const temTinta = x1 > x0;
    const linhas: LinhaDiagramada[] = metricas.map((m, k) => ({ x: no.x + m.left, largura: m.width, base: no.y + (formadas[k]?.baseline ?? m.baseline) }));
    return {
      linhas,
      alturaUsada: paragrafo.getHeight(),
      larguraMaxima: paragrafo.getLongestLine(),
      tinta: temTinta ? { x: no.x + x0, y: no.y + y0, w: x1 - x0, h: y1 - y0 } : { x: no.x, y: no.y, w: 0, h: 0 },
      fonteEncontrada: true,
      glifosAusentes: paragrafo.unresolvedCodepoints().length,
    };
  };

  return {
    diagramar(no) {
      const paragrafo = montar(no);
      const d = medir(no, paragrafo);
      paragrafo?.delete();
      return d;
    },
    medirTinta(no) {
      const tinta = this.diagramar(no).tinta;
      return girarCaixa(tinta, no.x + no.largura / 2, no.y + no.altura / 2, no.rotacao ?? 0);
    },
    desenhar(canvas, no) {
      const paragrafo = montar(no);
      if (!paragrafo) return;
      canvas.drawParagraph(paragrafo, no.x, no.y);
      paragrafo.delete();
    },
    metricas(familia, peso, tamanho) {
      const f = achar(familia, peso);
      if (!f) throw new Error(`Fonte não entregue ao motor: ${familia} ${peso}`);
      const fonte = new ck.Font(f.tipo, tamanho);
      const m = fonte.getMetrics();
      fonte.delete();
      return { ascendente: -m.ascent, descendente: m.descent };
    },
    destruir() {
      for (const f of registradas) f.tipo.delete();
      provedor.delete();
    },
  };
}
