// Texto com o módulo de parágrafo do Skia (modelagem por HarfBuzz, quebra de linha por ICU).
// As fontes são bytes entregues por quem chama: o motor nunca consulta fonte do sistema, e não troca
// uma fonte que falta por outra (o Skia, sozinho, trocaria em silêncio).
// A medida pela tinta sai da caixa de cada glifo já posicionado, sem rasterizar.
import { type Caixa, girarCaixa, type NoTexto, type TextoDiagramado } from '@otto/documento';
import type { Canvas, CanvasKit, Font, FontWeight, Paragraph, TextStyle, Typeface, TypefaceFontProvider } from 'canvaskit-wasm';

export interface FonteDeArquivo {
  familia: string;
  peso: number;
  bytes: Uint8Array;
}

/** A diagramação que o lint pede (@otto/documento), mais o que só o motor sabe. */
export interface TextoDoMotor extends TextoDiagramado {
  larguraMaxima: number;
  /** caracteres sem desenho nas fontes entregues */
  glifosAusentes: number;
  /** para cada linha, o trecho do conteúdo que ela mostra: [início, fim), em índices do texto exibido (mesmo tamanho do conteúdo) */
  intervalos: [number, number][];
}

export interface MotorDeTexto {
  registrar(fonte: FonteDeArquivo): void;
  /** Há arquivo desta família (de qualquer peso)? */
  tem(familia: string): boolean;
  diagramar(no: NoTexto): TextoDoMotor;
  /** Caixa da tinta já girada com a camada: é o que `alinhar`, `distribuir` e o lint usam. */
  medirTinta(no: NoTexto): Caixa;
  /** Desenha o texto. "cor" resolve token em #rrggbb. */
  desenhar(canvas: Canvas, no: NoTexto, cor: (c: string) => string): void;
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

interface Estilo {
  fonte: string;
  peso: number;
  tamanho: number;
  cor: string;
  espacamento: number;
}

/**
 * Versalete sintético, como o do Photoshop e o do Illustrator: minúscula vira maiúscula a 70% do corpo.
 * (Era 75%, herdado da POC. Medido no Photoshop 2025 em 2026-10-02: o texto em versalete estreitava ao ser atualizado.)
 */
export const FATOR_DO_VERSALETE = 0.7;

function rgb(cor: string): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * O arquivo que o motor usa para uma família e um peso: o da família com o peso mais próximo (empate fica com o primeiro).
 * Sem arquivo da família, não há substituto. A exportação usa a mesma regra para dizer ao Photoshop qual fonte procurar.
 */
export function escolherFonte<T extends { familia: string; peso: number }>(fontes: readonly T[], familia: string, peso: number): T | undefined {
  const daFamilia = fontes.filter((f) => f.familia === familia);
  if (daFamilia.length === 0) return undefined;
  return daFamilia.reduce((melhor, f) => (Math.abs(f.peso - peso) < Math.abs(melhor.peso - peso) ? f : melhor));
}

export function textoExibido(no: NoTexto): string {
  return no.caixaAlta || no.versalete ? no.conteudo.toLocaleUpperCase('pt-BR') : no.conteudo;
}

export function criarMotorDeTexto(ck: CanvasKit, fontes: readonly FonteDeArquivo[]): MotorDeTexto {
  const provedor: TypefaceFontProvider = ck.TypefaceFontProvider.Make();
  const registradas: FonteRegistrada[] = [];
  const pesos = Object.values(ck.FontWeight).filter((v): v is FontWeight => typeof v === 'object' && v !== null && 'value' in v);
  const pesoDoSkia = (peso: number): FontWeight => pesos.find((p) => p.value === peso) ?? ck.FontWeight.Normal;

  const registrar = (f: FonteDeArquivo): void => {
    if (registradas.some((r) => r.familia === f.familia && r.peso === f.peso)) return;
    const copia = f.bytes.slice();
    const tipo = ck.Typeface.MakeTypefaceFromData(copia.buffer);
    if (!tipo) throw new Error(`O arquivo da fonte ${f.familia} ${f.peso} não é uma fonte válida`);
    const apelido = `${f.familia}#${f.peso}`;
    provedor.registerFont(f.bytes, apelido);
    registradas.push({ familia: f.familia, peso: f.peso, apelido, tipo });
  };
  for (const f of fontes) registrar(f);

  /** Mesmo critério da POC: o arquivo da família com o peso mais próximo. Sem família, não há substituta. */
  const achar = (familia: string, peso: number): FonteRegistrada | undefined => escolherFonte(registradas, familia, peso);

  const estiloDoSkia = (no: NoTexto, e: Estilo, fonte: FonteRegistrada, cor: (c: string) => string): TextStyle => {
    const [r, g, b] = rgb(cor(e.cor));
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
      ...(no.kerning === 'nenhum' ? { fontFeatures: [{ name: 'kern', value: 0 }] } : {}),
    });
  };

  /** Estilo de cada caractere do texto exibido: o da camada, com os trechos por cima e o versalete. */
  const estilosPorCaractere = (no: NoTexto, exibido: string): Estilo[] | undefined => {
    const base: Estilo = { fonte: no.fonte, peso: no.peso, tamanho: no.tamanho, cor: no.cor, espacamento: no.espacamento };
    if (!achar(base.fonte, base.peso)) return undefined;
    const n = exibido.length;
    const estilos: Estilo[] = Array.from({ length: n }, () => base);
    for (const t of no.trechos ?? []) {
      const e: Estilo = { fonte: t.fonte ?? base.fonte, peso: t.peso ?? base.peso, tamanho: t.tamanho ?? base.tamanho, cor: t.cor ?? base.cor, espacamento: t.espacamento ?? base.espacamento };
      if (!achar(e.fonte, e.peso)) return undefined;
      for (let i = Math.max(0, t.inicio); i < Math.min(n, t.fim); i++) estilos[i] = e;
    }
    if (no.versalete && !no.caixaAlta) {
      // cada estilo ganha uma versão menor, usada nas letras que eram minúsculas
      const menores = new Map<Estilo, Estilo>();
      for (let i = 0; i < n; i++) {
        const original = no.conteudo[i] ?? '';
        if (original === original.toLocaleUpperCase('pt-BR')) continue;
        const e = estilos[i] as Estilo;
        let menor = menores.get(e);
        if (!menor) {
          menor = { ...e, tamanho: e.tamanho * FATOR_DO_VERSALETE };
          menores.set(e, menor);
        }
        estilos[i] = menor;
      }
    }
    return estilos;
  };

  /** Monta o parágrafo. Devolve undefined quando falta alguma fonte. */
  const montar = (no: NoTexto, cor: (c: string) => string): { paragrafo: Paragraph; exibido: string } | undefined => {
    const exibido = textoExibido(no);
    const estilos = estilosPorCaractere(no, exibido);
    const fonteBase = achar(no.fonte, no.peso);
    if (!estilos || !fonteBase) return undefined;
    const alinhamento = no.alinhamento === 'centro' ? ck.TextAlign.Center : no.alinhamento === 'direita' ? ck.TextAlign.Right : ck.TextAlign.Left;
    const construtor = ck.ParagraphBuilder.MakeFromFontProvider(
      new ck.ParagraphStyle({
        textStyle: estiloDoSkia(no, { fonte: no.fonte, peso: no.peso, tamanho: no.tamanho, cor: no.cor, espacamento: no.espacamento }, fonteBase, cor),
        textAlign: alinhamento,
        // como no Photoshop: a primeira linha encosta a ascendente da fonte no topo da caixa
        textHeightBehavior: ck.TextHeightBehavior.DisableFirstAscent,
        applyRoundingHack: false,
      }),
      provedor,
    );
    let i = 0;
    while (i < exibido.length) {
      const e = estilos[i] as Estilo;
      let j = i + 1;
      while (j < exibido.length && estilos[j] === e) j++;
      construtor.pushStyle(estiloDoSkia(no, e, achar(e.fonte, e.peso) as FonteRegistrada, cor));
      construtor.addText(exibido.slice(i, j));
      construtor.pop();
      i = j;
    }
    const paragrafo = construtor.build();
    construtor.delete();
    paragrafo.layout(no.largura);
    return { paragrafo, exibido };
  };

  /** Fonte de medida com a mesma configuração do desenho (subpixel, sem hinting). */
  const fonteDeMedida = (tipo: Typeface, tamanho: number): Font => {
    const f = new ck.Font(tipo, tamanho);
    f.setSubpixel(true);
    f.setLinearMetrics(true);
    f.setHinting(ck.FontHinting.None);
    return f;
  };

  const semFonte = (no: NoTexto): TextoDoMotor => ({
    linhas: [],
    alturaUsada: 0,
    larguraMaxima: 0,
    tinta: { x: no.x, y: no.y, w: 0, h: 0 },
    palavraEstourada: undefined,
    fonteEncontrada: false,
    glifosAusentes: 0,
    intervalos: [],
  });

  const medir = (no: NoTexto, paragrafo: Paragraph, exibido: string): TextoDoMotor => {
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
          const l = caixas[g * 4] as number;
          const t = caixas[g * 4 + 1] as number;
          const r = caixas[g * 4 + 2] as number;
          const b = caixas[g * 4 + 3] as number;
          if (r <= l || b <= t) continue; // espaço: sem tinta
          const px = trecho.positions[g * 2] as number;
          const py = trecho.positions[g * 2 + 1] as number;
          x0 = Math.min(x0, px + l);
          y0 = Math.min(y0, py + t);
          x1 = Math.max(x1, px + r);
          y1 = Math.max(y1, py + b);
        }
        fonte.delete();
        trecho.typeface.delete();
      }
    }
    const linhas = metricas.map((m, k) => ({
      texto: exibido.slice(m.startIndex, m.endIndex).replace(/\n$/, ''),
      x: no.x + m.left,
      largura: m.width,
      base: no.y + (formadas[k]?.baseline ?? m.baseline),
    }));
    // o Skia parte no meio a palavra que não cabe na largura: o corte cai entre duas letras
    let palavraEstourada: string | undefined;
    for (let k = 0; k + 1 < metricas.length && !palavraEstourada; k++) {
      const corte = (metricas[k + 1] as (typeof metricas)[number]).startIndex;
      const antes = exibido[corte - 1] ?? ' ';
      const depois = exibido[corte] ?? ' ';
      if (/\s/.test(antes) || /\s/.test(depois)) continue;
      const inicio = exibido.slice(0, corte).search(/\S+$/);
      const resto = exibido.slice(corte).match(/^\S+/)?.[0] ?? '';
      palavraEstourada = exibido.slice(inicio, corte) + resto;
    }
    return {
      linhas,
      alturaUsada: paragrafo.getHeight(),
      larguraMaxima: paragrafo.getLongestLine(),
      tinta: x1 > x0 ? { x: no.x + x0, y: no.y + y0, w: x1 - x0, h: y1 - y0 } : { x: no.x, y: no.y, w: 0, h: 0 },
      palavraEstourada,
      fonteEncontrada: true,
      glifosAusentes: paragrafo.unresolvedCodepoints().length,
      intervalos: metricas.map((m) => [m.startIndex, m.endIndex]),
    };
  };

  const semCor = (c: string): string => (c.startsWith('#') ? c : '#000000');

  return {
    registrar,
    tem: (familia) => registradas.some((f) => f.familia === familia),
    diagramar(no) {
      const montado = montar(no, semCor);
      if (!montado) return semFonte(no);
      const d = medir(no, montado.paragrafo, montado.exibido);
      montado.paragrafo.delete();
      return d;
    },
    medirTinta(no) {
      return girarCaixa(this.diagramar(no).tinta, no.x + no.largura / 2, no.y + no.altura / 2, no.rotacao);
    },
    desenhar(canvas, no, cor) {
      const montado = montar(no, cor);
      if (!montado) return;
      canvas.drawParagraph(montado.paragrafo, no.x, no.y);
      montado.paragrafo.delete();
    },
    metricas(familia, peso, tamanho) {
      const f = achar(familia, peso);
      if (!f) throw new Error(`A fonte ${familia} ${peso} não foi entregue ao motor`);
      const fonte = new ck.Font(f.tipo, tamanho);
      const m = fonte.getMetrics();
      fonte.delete();
      return { ascendente: -m.ascent, descendente: m.descent };
    },
    destruir() {
      for (const f of registradas) f.tipo.delete();
      registradas.length = 0;
      provedor.delete();
    },
  };
}
