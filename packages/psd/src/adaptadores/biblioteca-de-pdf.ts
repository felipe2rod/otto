// Adaptador PDF da porta FormatoDeArquivoEmCamadas (ADR 034), sobre a biblioteca @cantoo/pdf-lib.
// É o único arquivo que conhece a biblioteca. Só traduz o modelo da porta; o que vira vetor, imagem ou fica de fora
// foi decidido em montar-vetorial.ts.
//
// A biblioteca desenha, embute fonte e imagem, e lê camadas (conteúdo opcional), mas não as cria: aqui elas são
// montadas com os objetos de baixo nível dela (dicionário /OCG, /OCProperties no catálogo e /OC ... BDC no conteúdo).
// O que o Illustrator precisa achar: uma página por prancheta, cada camada do Otto como camada do PDF com o nome dela,
// o texto como texto com a fonte embutida inteira (sem recorte de glifos), e os recortes como caminho de recorte.

import fontkit from '@cantoo/fontkit';
import {
  appendBezierCurve,
  beginText,
  clip,
  clipEvenOdd,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  fillEvenOdd,
  moveTo,
  PDFArray,
  type PDFContext,
  type PDFDict,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFImage,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  type PDFRef,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
} from '@cantoo/pdf-lib';
import type { ModoDoGrupo } from '@otto/documento';
import { perfilSrgb } from '../perfil-srgb';
import type { ArquivoEmCamadas, ArquivoGravado, CamadaDoArquivo, CaminhoDoArquivo, DegradeDoArquivo, FormatoDeArquivoEmCamadas, Rgb } from '../porta';

/** Modo de mesclagem do Otto → nome do modo no PDF. Só os que o PDF tem chegam aqui. */
const MODO: Partial<Record<ModoDoGrupo, string>> = {
  escurecer: 'Darken',
  multiplicacao: 'Multiply',
  'subexposicao-de-cores': 'ColorBurn',
  clarear: 'Lighten',
  tela: 'Screen',
  'superexposicao-de-cores': 'ColorDodge',
  sobrepor: 'Overlay',
  'luz-suave': 'SoftLight',
  'luz-direta': 'HardLight',
  diferenca: 'Difference',
  exclusao: 'Exclusion',
  matiz: 'Hue',
  saturacao: 'Saturation',
  cor: 'Color',
  luminosidade: 'Luminosity',
};

type Matriz = readonly [number, number, number, number, number, number];
const arredondar = (v: number): number => Math.round(v * 10000) / 10000;

/** O documento em montagem: os recursos (fonte, imagem, estado gráfico, camada, degradê) são de todas as páginas. */
class Escritor {
  readonly ops: PDFOperator[] = [];
  private readonly contexto: PDFContext;
  private readonly recursos: Record<'Font' | 'XObject' | 'ExtGState' | 'Properties' | 'Shading', PDFDict>;
  readonly recursosRef: PDFRef;
  private readonly fontes: ReadonlyMap<string, PDFFont>;
  private readonly imagens: ReadonlyMap<Uint8Array, PDFImage>;
  private readonly nomesDeFonte = new Map<string, PDFName>();
  private readonly nomesDeImagem = new Map<Uint8Array, PDFName>();
  private readonly estados = new Map<string, PDFName>();
  private contador = 0;
  /** as camadas do PDF, na ordem do painel (de cima para baixo), com as que nascem ocultas */
  readonly camadas: { ref: PDFRef; oculta: boolean; filhas: Escritor['camadas'] }[] = [];

  constructor(pdf: PDFDocument, fontes: ReadonlyMap<string, PDFFont>, imagens: ReadonlyMap<Uint8Array, PDFImage>) {
    this.contexto = pdf.context;
    this.fontes = fontes;
    this.imagens = imagens;
    this.recursos = { Font: this.contexto.obj({}), XObject: this.contexto.obj({}), ExtGState: this.contexto.obj({}), Properties: this.contexto.obj({}), Shading: this.contexto.obj({}) };
    this.recursosRef = this.contexto.register(this.contexto.obj(this.recursos));
  }

  private nome(prefixo: string): PDFName {
    return PDFName.of(`${prefixo}${++this.contador}`);
  }

  private fonte(postScript: string): { nome: PDFName; fonte: PDFFont } {
    const fonte = this.fontes.get(postScript);
    if (!fonte) throw new Error(`A fonte ${postScript} não foi entregue ao PDF`);
    let nome = this.nomesDeFonte.get(postScript);
    if (!nome) {
      nome = this.nome('F');
      this.nomesDeFonte.set(postScript, nome);
      this.recursos.Font.set(nome, fonte.ref);
    }
    return { nome, fonte };
  }

  /** Estado gráfico com opacidade e modo de mesclagem. */
  private estado(opacidade: number, modo: string | undefined): PDFName {
    const chave = `${opacidade}|${modo ?? ''}`;
    let nome = this.estados.get(chave);
    if (!nome) {
      nome = this.nome('GS');
      this.estados.set(chave, nome);
      this.recursos.ExtGState.set(nome, this.contexto.obj({ Type: 'ExtGState', ca: arredondar(opacidade), CA: arredondar(opacidade), ...(modo ? { BM: modo } : {}) }));
    }
    return nome;
  }

  private caminho(caminhos: readonly CaminhoDoArquivo[], destino: PDFOperator[]): void {
    for (const c of caminhos) {
      const primeiro = c.nos[0];
      if (!primeiro) continue;
      destino.push(moveTo(arredondar(primeiro.ancora[0]), arredondar(primeiro.ancora[1])));
      const curva = (de: (typeof c.nos)[number], para: (typeof c.nos)[number]): void => {
        destino.push(
          appendBezierCurve(arredondar(de.saida[0]), arredondar(de.saida[1]), arredondar(para.chegada[0]), arredondar(para.chegada[1]), arredondar(para.ancora[0]), arredondar(para.ancora[1])),
        );
      };
      for (let i = 1; i < c.nos.length; i++) curva(c.nos[i - 1] as (typeof c.nos)[number], c.nos[i] as (typeof c.nos)[number]);
      if (!c.aberto) {
        curva(c.nos[c.nos.length - 1] as (typeof c.nos)[number], primeiro);
        destino.push(closePath());
      }
    }
  }

  private recortar(caminhos: readonly CaminhoDoArquivo[], destino: PDFOperator[]): void {
    this.caminho(caminhos, destino);
    destino.push(caminhos.some((c) => c.regra === 'par-impar') ? clipEvenOdd() : clip(), endPath());
  }

  private static cor(c: Rgb): [number, number, number] {
    return [arredondar(c.r / 255), arredondar(c.g / 255), arredondar(c.b / 255)];
  }

  /** Degradê como padrão de sombreamento: de parada em parada, interpolação linear. As paradas são opacas (quem monta garante). */
  private degrade(d: DegradeDoArquivo): PDFName {
    const g = d.geometria;
    if (!g) throw new Error('Degradê sem geometria não tem como ir para o PDF');
    const trechos = d.paradas.slice(1).map((ate, i) => {
      const de = d.paradas[i] as (typeof d.paradas)[number];
      return this.contexto.obj({ FunctionType: 2, Domain: [0, 1], C0: Escritor.cor(de.cor), C1: Escritor.cor(ate.cor), N: 1 });
    });
    const primeira = d.paradas[0] as (typeof d.paradas)[number];
    const ultima = d.paradas[d.paradas.length - 1] as (typeof d.paradas)[number];
    // antes da primeira parada e depois da última a cor é constante: o domínio vai de 0 a 1, e as bordas são as posições
    const funcao =
      trechos.length === 1 && primeira.posicao <= 0 && ultima.posicao >= 1
        ? (trechos[0] as PDFDict)
        : this.contexto.obj({
            FunctionType: 3,
            Domain: [0, 1],
            Functions: [
              this.contexto.obj({ FunctionType: 2, Domain: [0, 1], C0: Escritor.cor(primeira.cor), C1: Escritor.cor(primeira.cor), N: 1 }),
              ...trechos,
              this.contexto.obj({ FunctionType: 2, Domain: [0, 1], C0: Escritor.cor(ultima.cor), C1: Escritor.cor(ultima.cor), N: 1 }),
            ],
            Bounds: d.paradas.map((q) => arredondar(Math.min(1, Math.max(0, q.posicao)))),
            Encode: new Array<number>((trechos.length + 2) * 2).fill(0).map((_, i) => i % 2),
          });
    const nome = this.nome('Sh');
    const raio = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
    this.recursos.Shading.set(
      nome,
      this.contexto.obj({
        ShadingType: d.estilo === 'radial' ? 3 : 2,
        ColorSpace: 'DeviceRGB',
        Coords: d.estilo === 'radial' ? [g.x0, g.y0, 0, g.x0, g.y0, raio].map(arredondar) : [g.x0, g.y0, g.x1, g.y1].map(arredondar),
        Function: funcao,
        Extend: [true, true],
      }),
    );
    return nome;
  }

  private pintar(c: CamadaDoArquivo, destino: PDFOperator[]): void {
    if (c.filhos) {
      this.lista(c.filhos, destino);
      return;
    }
    if (c.texto) {
      const t = c.texto;
      const [a, b, cc, d, e, f] = t.transformacao;
      destino.push(beginText());
      for (const linha of t.linhas ?? []) {
        // a página está de cabeça para baixo (y cresce para baixo): a matriz do texto desvira as letras
        destino.push(setTextMatrix(arredondar(a), arredondar(b), arredondar(0 - cc), arredondar(0 - d), arredondar(a * linha.x + cc * linha.base + e), arredondar(b * linha.x + d * linha.base + f)));
        for (const pedaco of linha.pedacos) {
          const { nome, fonte } = this.fonte(pedaco.estilo.fonte);
          destino.push(
            setFontAndSize(nome, arredondar(pedaco.estilo.tamanho)),
            setCharacterSpacing(arredondar((pedaco.estilo.espacamento / 1000) * pedaco.estilo.tamanho)),
            setFillingRgbColor(...Escritor.cor(pedaco.estilo.cor)),
            showText(fonte.encodeText(pedaco.texto)),
          );
        }
      }
      destino.push(endText());
      return;
    }
    if (c.imagem) {
      const i = c.imagem;
      const imagem = this.imagens.get(i.bytes);
      if (!imagem) throw new Error(`A imagem da camada "${c.nome}" não foi embutida`);
      let nome = this.nomesDeImagem.get(i.bytes);
      if (!nome) {
        nome = this.nome('Im');
        this.nomesDeImagem.set(i.bytes, nome);
        this.recursos.XObject.set(nome, imagem.ref);
      }
      destino.push(pushGraphicsState());
      if (c.mascaraVetorial) this.recortar(c.mascaraVetorial, destino);
      // a imagem do PDF ocupa o quadrado de lado 1, com o topo em y = 1: a matriz leva esse quadrado aonde a imagem fica
      const [a, b, cc, d, e, f] = i.transformacao;
      destino.push(
        concatTransformationMatrix(
          arredondar(a * i.largura),
          arredondar(b * i.largura),
          arredondar(0 - cc * i.altura),
          arredondar(0 - d * i.altura),
          arredondar(cc * i.altura + e),
          arredondar(d * i.altura + f),
        ),
        drawObject(nome),
        popGraphicsState(),
      );
      return;
    }
    if (c.preenchimento && c.mascaraVetorial) {
      const parImpar = c.mascaraVetorial.some((k) => k.regra === 'par-impar');
      const t = c.tracoVetorial;
      if (!t || t.comPreenchimento) {
        if (c.preenchimento.tipo === 'cor') {
          destino.push(setFillingRgbColor(...Escritor.cor(c.preenchimento.cor)));
          this.caminho(c.mascaraVetorial, destino);
          destino.push(parImpar ? fillEvenOdd() : fill());
        } else {
          // degradê: corta pela forma e pinta o sombreamento por dentro
          destino.push(pushGraphicsState());
          this.recortar(c.mascaraVetorial, destino);
          const m = c.preenchimento.geometria?.matriz;
          if (m) destino.push(concatTransformationMatrix(...(m.map(arredondar) as unknown as Matriz)));
          destino.push(PDFOperator.of(PDFOperatorNames.ShadingFill, [this.degrade(c.preenchimento)]), popGraphicsState());
        }
      }
      if (t) {
        destino.push(
          setStrokingRgbColor(...Escritor.cor(t.cor)),
          setLineWidth(arredondar(t.espessura)),
          setLineCap({ reta: 0, redonda: 1, quadrada: 2 }[t.ponta]),
          setLineJoin({ angular: 0, redonda: 1, chanfrada: 2 }[t.juncao]),
        );
        this.caminho(c.mascaraVetorial, destino);
        destino.push(stroke());
      }
      const interno = c.efeitos?.tracoInterno;
      if (interno) {
        // traço por dentro: o contorno com o dobro da espessura, cortado pela própria forma
        destino.push(pushGraphicsState());
        this.recortar(c.mascaraVetorial, destino);
        destino.push(setStrokingRgbColor(...Escritor.cor(interno.cor)), setLineWidth(arredondar(interno.espessura * 2)));
        this.caminho(c.mascaraVetorial, destino);
        destino.push(stroke(), popGraphicsState());
      }
    }
  }

  /** A camada: uma camada do PDF com o nome dela; opacidade e modo de mesclagem por grupo de transparência. */
  private camada(c: CamadaDoArquivo, destino: PDFOperator[], registro: Escritor['camadas'], largura: number, altura: number): void {
    const ref = this.contexto.register(this.contexto.obj({ Type: 'OCG', Name: PDFHexString.fromText(c.nome) }));
    const propriedade = this.nome('OC');
    this.recursos.Properties.set(propriedade, ref);
    const filhas: Escritor['camadas'] = [];
    registro.unshift({ ref, oculta: c.oculta, filhas });
    destino.push(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), propriedade]));
    if (c.recorteVetorial) {
      destino.push(pushGraphicsState());
      this.recortar(c.recorteVetorial, destino);
    }
    const modo = MODO[c.modo];
    const isolada = c.opacidade < 1 || modo !== undefined || (c.filhos !== undefined && c.modo === 'normal');
    const antes = this.registroCorrente;
    this.registroCorrente = filhas;
    if (!isolada) this.pintar(c, destino);
    else {
      // um objeto de formulário com grupo de transparência: a opacidade e o modo valem para a camada inteira, não para cada pedaço
      const dentro: PDFOperator[] = [];
      this.pintar(c, dentro);
      const formulario = this.contexto.register(
        this.contexto.formXObject(dentro, { BBox: [0, 0, largura, altura], Resources: this.recursosRef, Group: { Type: 'Group', S: 'Transparency', I: true } }),
      );
      const nome = this.nome('Fm');
      this.recursos.XObject.set(nome, formulario);
      destino.push(pushGraphicsState(), setGraphicsState(this.estado(c.opacidade, modo)), drawObject(nome), popGraphicsState());
    }
    this.registroCorrente = antes;
    if (c.recorteVetorial) destino.push(popGraphicsState());
    destino.push(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  private registroCorrente: Escritor['camadas'] = this.camadas;
  private tamanho: [number, number] = [0, 0];

  /** As camadas de uma lista, de baixo para cima. As presas à de baixo são cortadas pela forma dela. */
  private lista(camadas: readonly CamadaDoArquivo[], destino: PDFOperator[]): void {
    for (let i = 0; i < camadas.length; i++) {
      const base = camadas[i] as CamadaDoArquivo;
      this.camada(base, destino, this.registroCorrente, ...this.tamanho);
      const presas: CamadaDoArquivo[] = [];
      while (camadas[i + 1]?.recortadaNaDeBaixo) presas.push(camadas[++i] as CamadaDoArquivo);
      if (presas.length === 0) continue;
      const forma = base.mascaraVetorial ?? base.filhos?.flatMap((f) => f.mascaraVetorial ?? []) ?? [];
      destino.push(pushGraphicsState());
      this.recortar(forma, destino);
      for (const p of presas) this.camada(p, destino, this.registroCorrente, ...this.tamanho);
      destino.push(popGraphicsState());
    }
  }

  /** O conteúdo de uma página: as camadas dela, com o eixo y virado para baixo, como no documento. */
  pagina(camadas: readonly CamadaDoArquivo[], largura: number, altura: number, registro: Escritor['camadas']): PDFOperator[] {
    const ops: PDFOperator[] = [pushGraphicsState(), concatTransformationMatrix(1, 0, 0, -1, 0, altura)];
    this.registroCorrente = registro;
    this.tamanho = [largura, altura];
    this.lista(camadas, ops);
    ops.push(popGraphicsState());
    return ops;
  }
}

export function criarFormatoPdf(): FormatoDeArquivoEmCamadas {
  return {
    capacidades: { paginas: true, degradeTransparente: false },
    async escrever(arquivo: ArquivoEmCamadas): Promise<ArquivoGravado> {
      const pdf = await PDFDocument.create({ updateMetadata: false });
      pdf.registerFontkit(fontkit);
      // data fixa: o mesmo documento dá o mesmo arquivo
      const data = new Date(Date.UTC(2026, 9, 1));
      pdf.setCreationDate(data);
      pdf.setModificationDate(data);
      if (arquivo.titulo) pdf.setTitle(arquivo.titulo);
      pdf.setProducer('Otto');
      pdf.setCreator('Otto');

      // a fonte vai inteira, sem recorte de glifos: é o que deixa o texto editável
      const fontes = new Map<string, PDFFont>();
      for (const f of arquivo.fontes ?? []) fontes.set(f.postScript, await pdf.embedFont(f.bytes, { subset: false, customName: f.postScript }));
      const imagens = new Map<Uint8Array, PDFImage>();
      const embutir = async (c: CamadaDoArquivo): Promise<void> => {
        if (c.imagem && !imagens.has(c.imagem.bytes)) imagens.set(c.imagem.bytes, c.imagem.tipo === 'png' ? await pdf.embedPng(c.imagem.bytes) : await pdf.embedJpg(c.imagem.bytes));
        for (const f of c.filhos ?? []) await embutir(f);
      };
      for (const c of arquivo.camadas) await embutir(c);

      const e = new Escritor(pdf, fontes, imagens);
      // cada prancheta é uma página; sem pranchetas, o arquivo é uma página só
      const paginas = arquivo.camadas.every((c) => c.prancheta)
        ? arquivo.camadas.map((c) => ({ nome: c.nome, largura: c.prancheta?.largura ?? arquivo.largura, altura: c.prancheta?.altura ?? arquivo.altura, camadas: c.filhos ?? [] }))
        : [{ nome: '', largura: arquivo.largura, altura: arquivo.altura, camadas: arquivo.camadas }];
      const ordem: unknown[] = [];
      const todas: PDFRef[] = [];
      const ocultas: PDFRef[] = [];
      for (const p of paginas) {
        const pagina = pdf.addPage([p.largura, p.altura]);
        const registro: Escritor['camadas'] = [];
        const conteudo = pdf.context.register(pdf.context.contentStream(e.pagina(p.camadas, p.largura, p.altura, registro)));
        pagina.node.set(PDFName.of('Contents'), conteudo);
        pagina.node.set(PDFName.of('Resources'), e.recursosRef);
        // a árvore do painel de camadas: de cima para baixo, com as camadas de dentro de um grupo logo depois dele
        const arvore = (lista: Escritor['camadas']): unknown[] =>
          lista.flatMap((c) => {
            todas.push(c.ref);
            if (c.oculta) ocultas.push(c.ref);
            return c.filhas.length > 0 ? [c.ref, arvore(c.filhas)] : [c.ref];
          });
        if (paginas.length > 1) ordem.push([PDFHexString.fromText(p.nome), ...arvore(registro)]);
        else ordem.push(...arvore(registro));
      }
      pdf.catalog.set(PDFName.of('OCProperties'), pdf.context.obj({ OCGs: todas, D: { Order: ordem as PDFArray[], OFF: ocultas, BaseState: 'ON' } }));
      // as cores do arquivo são sRGB: o perfil vai como intenção de saída
      const perfil = pdf.context.register(pdf.context.flateStream(perfilSrgb(), { N: 3 }));
      pdf.catalog.set(
        PDFName.of('OutputIntents'),
        pdf.context.obj([{ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFHexString.fromText('sRGB IEC61966-2.1'), DestOutputProfile: perfil }]),
      );
      const bytes = await pdf.save({ useObjectStreams: false });
      return { bytes, extensao: 'pdf' };
    },
  };
}
