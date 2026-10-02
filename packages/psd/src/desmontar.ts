// O mapeamento de volta (ADR 028, item 4): das camadas lidas do arquivo (porta.ts) para a árvore do Otto e para o
// relatório de importação. É o avesso de montar.ts, com uma diferença: lá tudo o que o Otto tem cabe no PSD; aqui o
// arquivo pode trazer o que o Otto não tem. A regra é a do ADR: o que não tem mapeamento vira imagem, com o pixel que o
// arquivo traz, e o relatório diz qual camada e por quê. Nada é trocado em silêncio.
//
// Como montar.ts, não desenha: o que precisa do motor (medir texto, conferir uma máscara, codificar PNG) vem por
// MeiosDaImportacao. A árvore não é montada aqui: saem as operações do catálogo que a criam, e quem chama as aplica.
import type { Ajuste, Degrade, Efeitos, Filtro, Mascara, No, NoTexto } from '@otto/documento';
import { escolherFonte } from '@otto/render';
import type { ChaveDoMapeamento } from './mapeamento';
import type { ChaveDeImportacao } from './mapeamento-de-importacao';
import { type FonteDisponivel, misturaDaSaturacao, niveisDoBrilhoEContraste } from './montar';
import type { ConversaoDeCor } from './perfil-de-cor';
import type { ArquivoEmbutido, ArquivoLido, CamadaLida, CaminhoDoArquivo, DegradeDoArquivo, EfeitosDoArquivo, MascaraDoArquivo, PixelsDoArquivo, Rgb } from './porta';
import { caixaDosCaminhos, caminhosEmD, diferencaDePlanos, estenderMascara, type FormaReconhecida, type MascaraGeometrica, proporMascaras, reconhecerForma, reconhecerFoto } from './reconhecer';
import type { DestinoDeImportacao, LinhaDoRelatorioDeImportacao, RelatorioDeImportacao } from './relatorio-de-importacao';

/** O nó como vai para a operação "criarNo": sem id, e o grupo com os filhos à parte. */
type NoNovo = Record<string, unknown> & { tipo: No['tipo']; nome: string };

/** O texto como o motor precisa para medir: tudo o que o nó de texto tem, menos o id. */
export type TextoParaMedir = Omit<NoTexto, 'id'>;

export interface MeiosDaImportacao {
  /** PNG de pixels RGBA de 8 bits, não premultiplicados */
  png(largura: number, altura: number, rgba: Uint8Array): Uint8Array;
  sha256(bytes: Uint8Array): string;
  /** tamanho, em pixels, de uma imagem PNG ou JPEG */
  tamanhoDaImagem(bytes: Uint8Array): { largura: number; altura: number } | undefined;
  /**
   * Como o motor diagrama o texto: a distância do topo da caixa à linha de base da primeira linha, a altura da
   * maiúscula dela, a largura da linha mais larga e a altura do texto todo. Sem a fonte: undefined.
   */
  medirTexto(no: TextoParaMedir): { base: number; maiuscula: number; larguraMaxima: number; alturaUsada: number } | undefined;
  /** a máscara do nó desenhada pelo motor, numa prancheta de largura × altura: um byte por pixel */
  mascaraDoNo(largura: number, altura: number, no: No): Uint8Array | undefined;
  /** a cobertura dos caminhos (em coordenadas do arquivo) dentro da área: um byte por pixel */
  cobertura(caminhos: readonly CaminhoDoArquivo[], area: { x: number; y: number; largura: number; altura: number }): Uint8Array;
}

export interface ImagemImportada {
  /** a chave pela qual o documento referencia a imagem: o sha256 do conteúdo */
  arquivo: string;
  bytes: Uint8Array;
  tipo: 'image/png' | 'image/jpeg';
  largura: number;
  altura: number;
  /** de onde veio: a foto original de um objeto inteligente, o pixel de uma camada, ou uma máscara de recorte de foto */
  origem: 'foto-embutida' | 'camada' | 'mascara';
}

export interface PedidoDeDesmontagem {
  arquivo: ArquivoLido;
  /** nome da prancheta, quando o arquivo não tem pranchetas */
  nomeDaPrancheta: string;
  /** as fontes que o Otto tem para este arquivo, pelo nome PostScript */
  fontes: readonly FonteDisponivel[];
  /** troca de fonte pedida por quem importa: do nome PostScript que o arquivo pede para o de uma fonte entregue */
  substituir?: (postScript: string) => string | undefined;
  cor: ConversaoDeCor;
  meios: MeiosDaImportacao;
  rel: RelatorioDeImportacao;
  /** id do nó que a operação de índice dado vai criar (o mesmo gerador de aplicarLote) */
  idDaOperacao: (indice: number) => string;
}

export interface Desmontagem {
  /** as operações do catálogo que criam o documento, na ordem */
  operacoes: unknown[];
  imagens: ImagemImportada[];
  fundoTransparente: boolean;
}

const PESOS = [300, 400, 500, 600, 700] as const;
const a2 = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};
const limitar = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
/** O ângulo entre −180° e 180°, em centésimos. */
const emGraus = (v: number): number => a2(v - 360 * Math.round(v / 360));
const hex = (c: Rgb): string => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const deHex = (h: string): Rgb => ({ r: Number.parseInt(h.slice(1, 3), 16), g: Number.parseInt(h.slice(3, 5), 16), b: Number.parseInt(h.slice(5, 7), 16) });

interface Perda {
  mapeamento: ChaveDeImportacao;
  detalhe: string;
}

/** O que uma camada do arquivo virou, antes de entrar na árvore. */
interface Convertida {
  lida: CamadaLida;
  no?: NoNovo;
  filhos?: Convertida[];
  destino: DestinoDeImportacao;
  mapeamento: ChaveDoMapeamento | ChaveDeImportacao;
  observacao: string;
  perdas: Perda[];
  /** a foto veio de um objeto inteligente: é a única que aceita o ajuste de cor de volta */
  fotoEmbutida?: boolean;
  /** a camada é uma imagem opaca que cobre a prancheta inteira (a camada "Fundo" do Photoshop): atrás dela nada aparece */
  cobreTudo?: boolean;
  /** camada de ajuste de misturador de canais: só entra na árvore como saturação de uma foto */
  mistura?: NonNullable<CamadaLida['misturaDeCanais']>;
}

interface Contexto extends PedidoDeDesmontagem {
  /** origem da prancheta dentro do arquivo */
  ox: number;
  oy: number;
  largura: number;
  altura: number;
  prancheta: string;
  imagens: Map<string, ImagemImportada>;
  embutidos: Map<string, ArquivoEmbutido>;
}

/** O que o adaptador viu e não coube no modelo, como perda (a camada vem, sem aquilo) ou como motivo de virar imagem. */
const VIRA_IMAGEM = new Set([
  'conteudo-desconhecido',
  'texto-em-caminho',
  'texto-deformado',
  'texto-vertical',
  'estilo-de-texto',
  'preenchimento',
  'caminho-composto',
  'traco-vetorial',
  'objeto-inteligente',
  'objeto-inteligente-deformado',
  'filtro-inteligente',
]);

function perdasDe(c: CamadaLida): Perda[] {
  return c.foraDoModelo.filter((f) => !VIRA_IMAGEM.has(f.recurso)).map((f) => ({ mapeamento: `psd:${f.recurso}` as ChaveDeImportacao, detalhe: f.detalhe }));
}
const motivoDeImagem = (c: CamadaLida): { mapeamento: ChaveDeImportacao; detalhe: string } | undefined => {
  const f = c.foraDoModelo.find((x) => VIRA_IMAGEM.has(x.recurso));
  return f
    ? {
        mapeamento: `psd:${f.recurso}` as ChaveDeImportacao,
        detalhe: c.foraDoModelo
          .filter((x) => VIRA_IMAGEM.has(x.recurso))
          .map((x) => x.detalhe)
          .join('; '),
      }
    : undefined;
};

function degradeDoOtto(d: DegradeDoArquivo, cx: Contexto, rotacao = 0): Degrade {
  // o degradê do Otto gira com a camada; o do arquivo, não
  return { tipo: d.estilo, angulo: rotacao ? emGraus(d.angulo + rotacao) : d.angulo, paradas: d.paradas.map((q) => ({ cor: hex(cx.cor.cor(q.cor)), posicao: q.posicao, opacidade: q.opacidade })) };
}

/** Os efeitos da camada no modelo do Otto. O traço só existe em forma: nas outras camadas é perda. */
function efeitosDoOtto(
  e: EfeitosDoArquivo | undefined,
  cx: Contexto,
  perdas: Perda[],
  ehForma: boolean,
): { sombra?: Record<string, unknown>; efeitos?: Efeitos; traco?: { cor: string; espessura: number } } {
  if (!e) return {};
  const cor = (c: Rgb): string => hex(cx.cor.cor(c));
  const preto = (c: Rgb): boolean => c.r + c.g + c.b <= 6;
  const branco = (c: Rgb): boolean => c.r + c.g + c.b >= 759;
  const parcial = (detalhe: string): void => {
    perdas.push({ mapeamento: 'psd:efeito-parcial', detalhe });
  };
  const saida: { sombra?: Record<string, unknown>; efeitos?: Efeitos; traco?: { cor: string; espessura: number } } = {};
  const efeitos: Efeitos = {};
  if (e.sombraProjetada) {
    const s = e.sombraProjetada;
    // o motor desenha a sombra projetada em modo normal: só é a mesma coisa com sombra preta em multiplicação
    if (s.modo !== 'normal' && !(s.modo === 'multiplicacao' && preto(s.cor))) parcial(`sombra projetada em modo ${s.modo}: o Otto a desenha em modo normal`);
    saida.sombra = { cor: cor(s.cor), opacidade: limitar(s.opacidade, 0, 1), distancia: a2(Math.max(0, s.distancia)), angulo: a2(s.angulo), desfoque: a2(Math.max(0, s.tamanho)) };
  }
  if (e.sombraInterna) {
    const s = e.sombraInterna;
    if (s.modo !== 'multiplicacao' && !(s.modo === 'normal' && preto(s.cor))) parcial(`sombra interna em modo ${s.modo}: o Otto a desenha em multiplicação`);
    efeitos.sombraInterna = { cor: cor(s.cor), opacidade: limitar(s.opacidade, 0, 1), distancia: a2(Math.max(0, s.distancia)), angulo: a2(s.angulo), desfoque: a2(Math.max(0, s.tamanho)) };
  }
  if (e.brilhoExterno) {
    const b = e.brilhoExterno;
    if (b.modo !== 'normal' && !(b.modo === 'tela' && branco(b.cor))) parcial(`brilho externo em modo ${b.modo}: o Otto o desenha em modo normal`);
    efeitos.brilhoExterno = { cor: cor(b.cor), opacidade: limitar(b.opacidade, 0, 1), tamanho: a2(limitar(b.tamanho, 0, 250)) };
  }
  if (e.brilhoInterno) {
    const b = e.brilhoInterno;
    if (b.modo !== 'tela' && !(b.modo === 'normal' && branco(b.cor))) parcial(`brilho interno em modo ${b.modo}: o Otto o desenha em modo tela`);
    efeitos.brilhoInterno = { cor: cor(b.cor), opacidade: limitar(b.opacidade, 0, 1), tamanho: a2(limitar(b.tamanho, 0, 250)) };
  }
  if (e.sobreposicaoDeCor) {
    const s = e.sobreposicaoDeCor;
    efeitos.sobreposicaoDeCor = { cor: cor(s.cor), opacidade: limitar(s.opacidade, 0, 1), modoDeMesclagem: s.modo };
  }
  if (e.sobreposicaoDeDegrade) {
    const s = e.sobreposicaoDeDegrade;
    efeitos.sobreposicaoDeDegrade = { degrade: degradeDoOtto(s.degrade, cx), opacidade: limitar(s.opacidade, 0, 1), modoDeMesclagem: s.modo };
  }
  if (e.tracoInterno) {
    if (ehForma && e.tracoInterno.espessura > 0) saida.traco = { cor: cor(e.tracoInterno.cor), espessura: a2(e.tracoInterno.espessura) };
    else perdas.push({ mapeamento: 'psd:efeito-desconhecido', detalhe: 'traço em camada que não é forma' });
  }
  if (Object.keys(efeitos).length > 0) saida.efeitos = efeitos;
  return saida;
}

/** O que toda camada tem: nome, opacidade, visibilidade, bloqueio, modo e máscara de recorte. */
function comum(c: CamadaLida, perdas: Perda[], temEfeitos: boolean): Record<string, unknown> {
  let opacidade = c.opacidade;
  if (c.opacidadeDoPreenchimento < 0.999) {
    if (temEfeitos)
      perdas.push({ mapeamento: 'psd:opacidade-do-preenchimento', detalhe: `opacidade do preenchimento de ${Math.round(c.opacidadeDoPreenchimento * 100)}% com efeito de camada: não veio` });
    else opacidade *= c.opacidadeDoPreenchimento;
  }
  return { nome: c.nome, opacidade: a2(limitar(opacidade, 0, 1)), visivel: !c.oculta, bloqueado: c.bloqueada, recortadaNaDeBaixo: c.recortadaNaDeBaixo };
}
const modoDe = (c: CamadaLida): string => (c.modo === 'atravessar' ? 'normal' : c.modo);

function guardarImagem(cx: Contexto, bytes: Uint8Array, tipo: ImagemImportada['tipo'], largura: number, altura: number, origem: ImagemImportada['origem']): string {
  const arquivo = cx.meios.sha256(bytes);
  if (!cx.imagens.has(arquivo)) cx.imagens.set(arquivo, { arquivo, bytes, tipo, largura, altura, origem });
  return arquivo;
}

/**
 * A camada como imagem, com o pixel que o arquivo traz. As máscaras (de pixels e vetorial) são aplicadas no pixel:
 * é o que o Otto não tem como guardar à parte. Sem pixel nenhum: undefined.
 */
function comoImagem(c: CamadaLida, pixels: PixelsDoArquivo | undefined, mascaras: { pixels?: MascaraDoArquivo; vetorial?: CamadaLida['mascaraVetorial'] }, cx: Contexto): NoNovo | undefined {
  if (!pixels || pixels.largura <= 0 || pixels.altura <= 0) return undefined;
  const { largura, altura, rgba } = pixels;
  if (mascaras.pixels) {
    const plano = estenderMascara(mascaras.pixels, pixels.x, pixels.y, largura, altura);
    for (let i = 0; i < plano.length; i++) rgba[i * 4 + 3] = Math.round(((rgba[i * 4 + 3] as number) * (plano[i] as number)) / 255);
  }
  if (mascaras.vetorial) {
    const plano = cx.meios.cobertura(mascaras.vetorial.caminhos, { x: pixels.x, y: pixels.y, largura, altura });
    for (let i = 0; i < plano.length; i++) {
      const v = mascaras.vetorial.invertida ? 255 - (plano[i] as number) : (plano[i] as number);
      rgba[i * 4 + 3] = Math.round(((rgba[i * 4 + 3] as number) * v) / 255);
    }
  }
  // camada sem nada visível não vira imagem
  let visivel = false;
  for (let i = 3; i < rgba.length && !visivel; i += 4) visivel = (rgba[i] as number) > 0;
  if (!visivel) return undefined;
  cx.cor.pixels?.(rgba);
  const arquivo = guardarImagem(cx, cx.meios.png(largura, altura, rgba), 'image/png', largura, altura, 'camada');
  return { tipo: 'imagem', nome: c.nome, arquivo, larguraOriginal: largura, alturaOriginal: altura, x: pixels.x - cx.ox, y: pixels.y - cx.oy, largura, altura };
}

/** A caixa a que a máscara em degradê de um nó se refere, como o motor a calcula: a da camada, ou a do que está dentro do grupo. */
function caixaDe(no: Record<string, unknown>): { x: number; y: number; w: number; h: number } | undefined {
  if (typeof no.x === 'number') return { x: no.x, y: no.y as number, w: no.largura as number, h: no.altura as number };
  if (no.tipo !== 'grupo') return undefined;
  const caixas = ((no.filhos as Record<string, unknown>[] | undefined) ?? []).flatMap((f) => caixaDe(f) ?? []);
  if (caixas.length === 0) return undefined;
  const x0 = Math.min(...caixas.map((k) => k.x));
  const y0 = Math.min(...caixas.map((k) => k.y));
  return { x: x0, y: y0, w: Math.max(...caixas.map((k) => k.x + k.w)) - x0, h: Math.max(...caixas.map((k) => k.y + k.h)) - y0 };
}

/** A máscara do Otto (forma ou degradê) que dá a máscara de pixels lida. Vale a que, desenhada pelo motor, mais se parece com a do arquivo; nenhuma parecida, nenhuma. */
function mascaraReconhecida(mascara: MascaraDoArquivo, no: NoNovo, cx: Contexto): MascaraGeometrica | undefined {
  const plano = estenderMascara(mascara, cx.ox, cx.oy, cx.largura, cx.altura);
  const caixa = caixaDe(no) ?? { x: 0, y: 0, w: cx.largura, h: cx.altura };
  let melhor: { proposta: MascaraGeometrica; media: number } | undefined;
  for (const proposta of proporMascaras(plano, cx.largura, cx.altura, caixa)) {
    const desenhada = cx.meios.mascaraDoNo(cx.largura, cx.altura, { ...no, id: 'candidata', mascara: proposta } as unknown as No);
    if (!desenhada) continue;
    const d = diferencaDePlanos(plano, desenhada);
    // a borda suavizada varia um pouco de um desenho para outro; o miolo, não
    if (d.media <= 1 && d.maior <= 48 && (!melhor || d.media < melhor.media - 0.01)) melhor = { proposta, media: d.media };
  }
  return melhor?.proposta;
}

/** A máscara vetorial como máscara de forma do Otto: retângulo (com raio) ou elipse, sem rotação. */
function mascaraDeForma(v: NonNullable<CamadaLida['mascaraVetorial']>, cx: Contexto): Mascara | undefined {
  if (v.caminhos.length !== 1) return undefined;
  const f = reconhecerForma(v.caminhos[0] as CaminhoDoArquivo);
  if (f?.rotacao !== 0) return undefined;
  return { tipo: 'forma', forma: f.forma, x: f.x - cx.ox, y: f.y - cx.oy, largura: f.largura, altura: f.altura, raio: f.raio, suavizar: 0, inverter: v.invertida };
}

interface MascarasDaCamada {
  /** máscara do Otto, para ir no nó */
  doOtto?: Mascara;
  /** o que sobrou e o Otto não guarda: só dá para aplicar no pixel */
  pixels?: MascaraDoArquivo;
  vetorial?: CamadaLida['mascaraVetorial'];
  /** a máscara esconde a camada inteira */
  escondeTudo: boolean;
}

/**
 * Resolve as máscaras da camada. `no` é o nó como vai ficar (a máscara em degradê do Otto se refere à caixa dele).
 * `vetorialUsada`: a máscara vetorial já entrou na geometria do nó (forma, corte da foto).
 */
function mascarasDa(c: CamadaLida, lida: MascaraDoArquivo | undefined, no: NoNovo, vetorialUsada: boolean, cx: Contexto): MascarasDaCamada {
  const saida: MascarasDaCamada = { escondeTudo: false };
  const vetorial = !vetorialUsada && c.mascaraVetorial && !c.mascaraVetorial.desativada ? c.mascaraVetorial : undefined;
  let dePixels: MascaraDoArquivo | undefined;
  if (c.mascara && !c.mascara.desativada) {
    if (!lida) {
      // máscara sem área: vale o fundo dela
      if (c.mascara.fora === 0) saida.escondeTudo = true;
    } else {
      // o que a máscara faz dentro da prancheta: é o que se vê
      const plano = estenderMascara(lida, cx.ox, cx.oy, cx.largura, cx.altura);
      let minimo = 255;
      let maximo = 0;
      for (let i = 0; i < plano.length; i++) {
        const v = plano[i] as number;
        if (v < minimo) minimo = v;
        if (v > maximo) maximo = v;
      }
      if (maximo === 0) saida.escondeTudo = true;
      // máscara toda branca não faz nada
      else if (minimo < 255) dePixels = lida;
    }
  }
  if (vetorial) {
    const forma = mascaraDeForma(vetorial, cx);
    if (forma && !dePixels) saida.doOtto = forma;
    else saida.vetorial = vetorial;
  }
  if (dePixels) {
    const reconhecida = saida.vetorial ? undefined : mascaraReconhecida(dePixels, no, cx);
    if (reconhecida && !saida.doOtto) saida.doOtto = reconhecida;
    else saida.pixels = dePixels;
  }
  return saida;
}

/** A máscara de pixels de uma foto embutida como máscara de recorte da foto: uma imagem do tamanho da foto, com a cobertura no alfa. */
function mascaraDaFoto(mascara: MascaraDoArquivo, cantos: readonly number[], larguraDaFoto: number, alturaDaFoto: number, cx: Contexto): Mascara {
  // na resolução em que a foto aparece no documento, sem passar da resolução dela
  const naTela = Math.hypot((cantos[2] as number) - (cantos[0] as number), (cantos[3] as number) - (cantos[1] as number));
  const escala = Math.min(1, naTela / larguraDaFoto);
  const w = Math.max(1, Math.round(larguraDaFoto * escala));
  const h = Math.max(1, Math.round(alturaDaFoto * escala));
  const [x0, y0, x1, y1, , , x3, y3] = cantos as [number, number, number, number, number, number, number, number];
  const rgba = new Uint8Array(w * h * 4).fill(255);
  const em = (x: number, y: number): number =>
    x < mascara.x || y < mascara.y || x >= mascara.x + mascara.largura || y >= mascara.y + mascara.altura
      ? mascara.fora
      : (mascara.cobertura[(y - mascara.y) * mascara.largura + (x - mascara.x)] as number);
  for (let v = 0; v < h; v++)
    for (let u = 0; u < w; u++) {
      // o centro do pixel da máscara, levado ao arquivo pelos cantos da foto
      const s = (u + 0.5) / w;
      const t = (v + 0.5) / h;
      const x = x0 + (x1 - x0) * s + (x3 - x0) * t - 0.5;
      const y = y0 + (y1 - y0) * s + (y3 - y0) * t - 0.5;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const fx = x - xi;
      const fy = y - yi;
      rgba[(v * w + u) * 4 + 3] = Math.round((em(xi, yi) * (1 - fx) + em(xi + 1, yi) * fx) * (1 - fy) + (em(xi, yi + 1) * (1 - fx) + em(xi + 1, yi + 1) * fx) * fy);
    }
  return { tipo: 'sujeito', arquivo: guardarImagem(cx, cx.meios.png(w, h, rgba), 'image/png', w, h, 'mascara'), inverter: false };
}

/** A fonte do Otto para um nome PostScript: a entregue, ou a substituta pedida por quem importa. */
function fonteDe(postScript: string, cx: Contexto, camada: string): { familia: string; peso: (typeof PESOS)[number]; postScript: string } | undefined {
  const achar = (nome: string) => cx.fontes.find((f) => f.postScript === nome);
  let fonte = achar(postScript);
  let trocada = false;
  if (!fonte) {
    const outra = cx.substituir?.(postScript);
    fonte = outra ? achar(outra) : undefined;
    trocada = fonte !== undefined;
  }
  if (!fonte) return undefined;
  // o texto do Otto tem cinco pesos: a fonte entra pelo mais próximo, desde que o motor escolha este mesmo arquivo
  const peso = PESOS.reduce((melhor, p) => (Math.abs(p - (fonte as FonteDisponivel).peso) < Math.abs(melhor - (fonte as FonteDisponivel).peso) ? p : melhor), 400 as (typeof PESOS)[number]);
  if (escolherFonte(cx.fontes, fonte.familia, peso)?.postScript !== fonte.postScript) return undefined;
  if (trocada && !cx.rel.substituicoes.some((s) => s.camada === camada && s.pedida === postScript))
    cx.rel.substituicoes.push({ camada, pedida: postScript, usada: { familia: fonte.familia, peso: fonte.peso, postScript: fonte.postScript } });
  if (!cx.rel.fontes.some((f) => f.postScript === fonte?.postScript))
    cx.rel.fontes.push({ familia: fonte.familia, peso: fonte.peso, postScript: fonte.postScript, ...(fonte.arquivo ? { arquivo: fonte.arquivo } : {}) });
  return { familia: fonte.familia, peso, postScript: fonte.postScript };
}

/** O texto do arquivo como nó de texto do Otto, ou o motivo de não caber nele. */
function noDeTexto(c: CamadaLida, cx: Contexto, perdas: Perda[]): NoNovo | { mapeamento: ChaveDeImportacao; detalhe: string } {
  const t = c.texto;
  if (!t) return { mapeamento: 'psd:conteudo-desconhecido', detalhe: 'camada de texto sem os dados do texto' };
  const [ma, mb, mc, md, tx, ty] = t.transformacao;
  const escalaX = Math.hypot(ma, mb);
  const escalaY = Math.hypot(mc, md);
  if (!(escalaX > 0.001) || Math.abs(escalaX - escalaY) > escalaX * 0.01 || Math.abs(ma * mc + mb * md) > escalaX * escalaY * 0.005 || ma * md - mb * mc <= 0)
    return { mapeamento: 'psd:texto-deformado', detalhe: 'texto inclinado, espelhado, ou com escala diferente nos dois eixos' };
  const escala = escalaX;
  const rotacao = (Math.atan2(mb, ma) * 180) / Math.PI;
  const camada = `${cx.prancheta} / ${c.nome}`;
  // as fontes: a da camada e as dos trechos
  const nomes = [...new Set([t.estilo.fonte, ...(t.trechos ?? []).map((r) => r.estilo.fonte)])];
  const fontes = new Map(nomes.map((n) => [n, fonteDe(n, cx, camada)]));
  const emFalta = nomes.filter((n) => !fontes.get(n));
  if (emFalta.length > 0) {
    for (const nome of emFalta) {
      const registro = cx.rel.emFalta.fontes.find((f) => f.postScript === nome);
      if (registro) registro.camadas.push(camada);
      else cx.rel.emFalta.fontes.push({ postScript: nome, camadas: [camada] });
    }
    return { mapeamento: 'psd:texto-sem-fonte', detalhe: `o Otto não tem a fonte ${emFalta.map((n) => `"${n}"`).join(', ')}` };
  }
  const conteudo = t.conteudo;
  if (conteudo.trim() === '') return { mapeamento: 'psd:camada-vazia', detalhe: 'texto vazio' };

  // o estilo da camada é o que cobre mais texto; o resto vira trecho
  const pedacos = t.trechos && t.trechos.length > 0 ? t.trechos : [{ comprimento: conteudo.length, estilo: t.estilo }];
  const chaveDe = (e: (typeof pedacos)[number]['estilo']): string => `${e.fonte}|${e.tamanho}|${hex(e.cor)}|${e.espacamento}`;
  const cobertura = new Map<string, number>();
  for (const r of pedacos) cobertura.set(chaveDe(r.estilo), (cobertura.get(chaveDe(r.estilo)) ?? 0) + r.comprimento);
  const principal = [...pedacos].sort((x, y) => (cobertura.get(chaveDe(y.estilo)) ?? 0) - (cobertura.get(chaveDe(x.estilo)) ?? 0))[0]?.estilo ?? t.estilo;
  const fontePrincipal = fontes.get(principal.fonte) as NonNullable<ReturnType<typeof fonteDe>>;
  const tamanho = a2(principal.tamanho * escala);
  const entrelinha = Math.round((principal.entrelinha / principal.tamanho) * 1000) / 1000;
  if (pedacos.some((r) => Math.abs(r.estilo.entrelinha / r.estilo.tamanho - principal.entrelinha / principal.tamanho) > 0.02))
    perdas.push({ mapeamento: 'psd:paragrafo-de-texto', detalhe: 'entrelinha diferente por trecho: veio a do estilo principal' });
  const trechos: Record<string, unknown>[] = [];
  let posicao = 0;
  for (const r of pedacos) {
    const inicio = posicao;
    posicao += r.comprimento;
    const f = fontes.get(r.estilo.fonte) as NonNullable<ReturnType<typeof fonteDe>>;
    const diferente = {
      ...(hex(r.estilo.cor) !== hex(principal.cor) ? { cor: hex(cx.cor.cor(r.estilo.cor)) } : {}),
      ...(f.peso !== fontePrincipal.peso ? { peso: f.peso } : {}),
      ...(f.familia !== fontePrincipal.familia ? { fonte: f.familia } : {}),
      ...(r.estilo.tamanho !== principal.tamanho ? { tamanho: a2(r.estilo.tamanho * escala) } : {}),
      ...(r.estilo.espacamento !== principal.espacamento ? { espacamento: r.estilo.espacamento } : {}),
    };
    if (Object.keys(diferente).length === 0 || posicao <= inicio) continue;
    const anterior = trechos[trechos.length - 1];
    // trechos vizinhos com o mesmo estilo são um só
    if (anterior && anterior.fim === inicio && JSON.stringify({ ...anterior, inicio: 0, fim: 0 }) === JSON.stringify({ inicio: 0, fim: 0, ...diferente })) anterior.fim = posicao;
    else trechos.push({ inicio, fim: posicao, ...diferente });
  }
  if (trechos.length > 40) return { mapeamento: 'psd:estilo-de-texto', detalhe: `texto com ${trechos.length} trechos de estilo (o Otto tem até 40)` };

  const estilo = {
    tipo: 'texto' as const,
    conteudo,
    fonte: fontePrincipal.familia,
    peso: fontePrincipal.peso,
    tamanho,
    entrelinha,
    espacamento: principal.espacamento,
    alinhamento: t.alinhamento,
    cor: hex(cx.cor.cor(principal.cor)),
    caixaAlta: t.estilo.caixa === 'alta',
    versalete: t.estilo.caixa === 'versalete',
    kerning: t.estilo.kerning ? ('metrico' as const) : ('nenhum' as const),
    ...(trechos.length > 0 ? { trechos } : {}),
  };
  // a caixa: no referencial do texto (sem a rotação), e depois em torno do centro dela, como o Otto gira a camada
  const medir = (largura: number) =>
    cx.meios.medirTexto({
      ...estilo,
      nome: c.nome,
      x: 0,
      y: 0,
      largura,
      altura: tamanho,
      rotacao: 0,
      opacidade: 1,
      visivel: true,
      bloqueado: false,
      recortadaNaDeBaixo: false,
      modoDeMesclagem: 'normal',
    } as unknown as TextoParaMedir);
  let local: { x: number; y: number; largura: number; altura: number };
  if (t.forma === 'caixa') {
    const largura = t.caixa.largura * escala;
    const altura = t.caixa.altura * escala;
    const medida = medir(largura);
    // O Photoshop assenta a primeira linha de um texto em caixa com a altura da maiúscula encostada no topo da caixa
    // (medido na conferência de 2026-10-02 e nos arquivos de fora: o topo da tinta coincide com o topo da caixa).
    // O motor do Otto encosta a ascendente. A caixa do Otto sobe a diferença, para a linha de base cair no mesmo lugar:
    // é o avesso do que a exportação faz.
    const desce = medida ? Math.max(0, medida.base - medida.maiuscula) : 0;
    local = { x: 0, y: -desce, largura, altura: altura + desce };
  } else {
    // texto de ponto: a origem é o começo da linha de base da primeira linha; a caixa é a que cabe a linha mais larga
    const medida = medir(100_000);
    if (!medida) return { mapeamento: 'psd:texto-sem-fonte', detalhe: 'o motor não conseguiu medir o texto' };
    const largura = Math.ceil(medida.larguraMaxima) + 2;
    const x = t.alinhamento === 'centro' ? -largura / 2 : t.alinhamento === 'direita' ? -largura : 0;
    local = { x, y: -medida.base, largura, altura: Math.ceil(medida.alturaUsada) };
  }
  const cos = ma / escala;
  const sen = mb / escala;
  const lx = local.x + local.largura / 2;
  const ly = local.y + local.altura / 2;
  const centroX = tx - cx.ox + cos * lx - sen * ly;
  const centroY = ty - cx.oy + sen * lx + cos * ly;
  return {
    ...estilo,
    nome: c.nome,
    x: a2(centroX - local.largura / 2),
    y: a2(centroY - local.altura / 2),
    largura: a2(Math.max(1, local.largura)),
    altura: a2(Math.max(1, local.altura)),
    rotacao: Math.abs(rotacao) < 0.01 ? 0 : a2(rotacao),
  };
}

/** A forma do arquivo como forma (retângulo, elipse) ou vetor (caminho livre) do Otto, ou o motivo de não caber. */
function noDeForma(c: CamadaLida, cx: Contexto, perdas: Perda[], traco: { cor: string; espessura: number } | undefined): NoNovo | { mapeamento: ChaveDeImportacao; detalhe: string } {
  const p = c.preenchimento;
  if (!p) return { mapeamento: 'psd:preenchimento', detalhe: 'forma sem preenchimento que o Otto tenha' };
  const vetorial = c.mascaraVetorial && !c.mascaraVetorial.desativada ? c.mascaraVetorial : undefined;
  if (vetorial?.invertida) return { mapeamento: 'psd:caminho-composto', detalhe: 'forma com o caminho invertido' };
  const cor = (rgb: Rgb): string => hex(cx.cor.cor(rgb));
  const tv = c.tracoVetorial;
  // sem caminho: camada de preenchimento, do tamanho da prancheta
  const reconhecida: FormaReconhecida | undefined = !vetorial
    ? { forma: 'retangulo', x: cx.ox, y: cx.oy, largura: cx.largura, altura: cx.altura, raio: 0, rotacao: 0 }
    : c.formaViva
      ? { ...c.formaViva, raio: Math.min(c.formaViva.raio, c.formaViva.largura / 2, c.formaViva.altura / 2), rotacao: 0 }
      : vetorial.caminhos.length === 1
        ? reconhecerForma(vetorial.caminhos[0] as CaminhoDoArquivo)
        : undefined;
  // traçado da forma: por dentro é o traço da forma do Otto; pelo centro, só o vetor tem; por fora, ninguém tem
  if (tv && tv.alinhamento === 'fora') return { mapeamento: 'psd:traco-vetorial', detalhe: 'traçado por fora da forma' };
  const comoForma = reconhecida && (!tv || (tv.alinhamento === 'dentro' && tv.comPreenchimento));
  if (reconhecida && comoForma) {
    const tracoDaForma = tv ? { cor: cor(tv.cor), espessura: a2(tv.espessura) } : traco;
    if (tv && traco) perdas.push({ mapeamento: 'psd:efeito-repetido', detalhe: 'traçado da forma e efeito de traço na mesma camada: veio o traçado' });
    return {
      tipo: 'forma',
      nome: c.nome,
      forma: reconhecida.forma,
      x: a2(reconhecida.x - cx.ox),
      y: a2(reconhecida.y - cx.oy),
      largura: reconhecida.largura,
      altura: reconhecida.altura,
      rotacao: reconhecida.rotacao,
      raio: reconhecida.raio,
      preenchimento: p.tipo === 'cor' ? cor(p.cor) : degradeDoOtto(p, cx, reconhecida.rotacao),
      ...(tracoDaForma && tracoDaForma.espessura > 0 ? { traco: tracoDaForma } : {}),
    };
  }
  // caminho livre (ou forma com traçado pelo centro): vetor, que só tem cor sólida
  if (!vetorial) return { mapeamento: 'psd:traco-vetorial', detalhe: 'camada de preenchimento com traçado' };
  if (p.tipo !== 'cor') return { mapeamento: 'psd:preenchimento', detalhe: 'forma de caminho livre com degradê (o vetor do Otto só tem cor sólida)' };
  if (traco) perdas.push({ mapeamento: 'psd:efeito-desconhecido', detalhe: 'traço em camada que não é forma' });
  const caixa = caixaDosCaminhos(vetorial.caminhos);
  if (!caixa || caixa.largura <= 0 || caixa.altura <= 0) return { mapeamento: 'psd:camada-vazia', detalhe: 'forma sem área' };
  const regras = new Set(vetorial.caminhos.map((k) => k.regra));
  if (regras.size > 1) return { mapeamento: 'psd:caminho-composto', detalhe: 'forma com regras de preenchimento diferentes por caminho' };
  const d = caminhosEmD(vetorial.caminhos, caixa.x, caixa.y);
  if (!d) return { mapeamento: 'psd:camada-vazia', detalhe: 'forma sem área' };
  const semPreenchimento = tv && !tv.comPreenchimento;
  return {
    tipo: 'vetor',
    nome: c.nome,
    x: a2(caixa.x - cx.ox),
    y: a2(caixa.y - cx.oy),
    largura: a2(caixa.largura),
    altura: a2(caixa.altura),
    moldura: [a2(caixa.largura), a2(caixa.altura)],
    caminhos: [
      {
        d,
        ...(semPreenchimento ? {} : { preenchimento: cor(p.cor) }),
        ...(tv ? { traco: { cor: cor(tv.cor), espessura: a2(tv.espessura), ponta: tv.ponta, juncao: tv.juncao } } : {}),
        regra: vetorial.caminhos[0]?.regra ?? 'nao-zero',
      },
    ],
  };
}

/** O objeto inteligente como foto do Otto: a foto original, a caixa, o foco e a aproximação. Ou o motivo de não caber. */
function noDeFoto(c: CamadaLida, cx: Contexto): { no: NoNovo; cantos: number[]; largura: number; altura: number } | { mapeamento: ChaveDeImportacao; detalhe: string } {
  const o = c.objetoInteligente;
  const embutido = o ? cx.embutidos.get(o.embutido) : undefined;
  if (!o || !embutido) return { mapeamento: 'psd:objeto-inteligente', detalhe: 'objeto inteligente sem a foto embutida' };
  const tamanho = cx.meios.tamanhoDaImagem(embutido.bytes);
  if (!tamanho) return { mapeamento: 'psd:objeto-inteligente', detalhe: 'a foto embutida no objeto inteligente não pôde ser lida' };
  const vetorial = c.mascaraVetorial && !c.mascaraVetorial.desativada ? c.mascaraVetorial : undefined;
  let caixa: FormaReconhecida | undefined;
  if (vetorial) {
    caixa = vetorial.caminhos.length === 1 && !vetorial.invertida ? reconhecerForma(vetorial.caminhos[0] as CaminhoDoArquivo) : undefined;
    if (!caixa) return { mapeamento: 'psd:mascara-vetorial-livre', detalhe: 'foto cortada por um caminho livre' };
  }
  const foto = reconhecerFoto(o.cantos, tamanho.largura, tamanho.altura, caixa);
  if (!foto)
    return { mapeamento: 'psd:objeto-inteligente-deformado', detalhe: 'foto com um enquadramento que o Otto não tem (escala diferente nos dois eixos, espelhada, ou sem cobrir a caixa de corte)' };
  const arquivo = guardarImagem(cx, embutido.bytes, embutido.tipo === 'png' ? 'image/png' : 'image/jpeg', tamanho.largura, tamanho.altura, 'foto-embutida');
  const filtros: Filtro[] = o.filtros;
  const recorte = caixa && (caixa.forma === 'elipse' || caixa.raio > 0) ? { recorte: { forma: caixa.forma, raio: caixa.raio } } : {};
  return {
    no: {
      tipo: 'imagem',
      nome: c.nome,
      arquivo,
      larguraOriginal: tamanho.largura,
      alturaOriginal: tamanho.altura,
      x: a2(foto.x - cx.ox),
      y: a2(foto.y - cx.oy),
      largura: foto.largura,
      altura: foto.altura,
      rotacao: foto.rotacao,
      ajuste: foto.ajuste,
      foco: foto.foco,
      zoom: foto.zoom,
      ...recorte,
      ...(filtros.length > 0 ? { filtros } : {}),
    },
    cantos: [...o.cantos],
    largura: tamanho.largura,
    altura: tamanho.altura,
  };
}

function ajusteDoOtto(a: Ajuste, cx: Contexto): Ajuste {
  const cor = (h: string): string => hex(cx.cor.cor(deHex(h)));
  if (a.tipo === 'filtro-de-foto') return { ...a, cor: cor(a.cor) };
  if (a.tipo === 'mapa-de-degrade') return { ...a, paradas: a.paradas.map((q) => ({ ...q, cor: cor(q.cor) })) };
  return a;
}

const DESCRICAO: Record<CamadaLida['tipo'], string> = {
  grupo: 'grupo',
  ajuste: 'camada de ajuste',
  texto: 'texto',
  forma: 'forma',
  'objeto-inteligente': 'objeto inteligente',
  pixels: 'camada de pixels',
};

function converter(c: CamadaLida, cx: Contexto): Convertida {
  const perdas = perdasDe(c);
  const base = { lida: c, perdas };
  if (c.tipo === 'grupo') {
    const filhos = (c.filhos ?? []).map((f) => converter(f, cx));
    return grupoConvertido(c, dobrarAjustesDasFotos(filhos), cx, perdas);
  }
  const { pixels, mascara: mascaraLida } = c.decodificar();
  const temEfeitos = c.efeitos !== undefined && Object.keys(c.efeitos).length > 0;

  if (c.tipo === 'ajuste') {
    if (!c.ajuste && !c.misturaDeCanais)
      return {
        ...base,
        destino: 'ignorado',
        mapeamento: 'psd:ajuste-desconhecido',
        observacao: `camada de ajuste que o Otto não tem (${c.foraDoModelo.map((f) => f.detalhe).join(', ')}): a cor do que está abaixo dela fica diferente`,
        perdas: [],
      };
    const no: NoNovo = { tipo: 'ajuste', ...comum(c, perdas, false), nome: c.nome, modoDeMesclagem: modoDe(c), ajuste: c.ajuste ? ajusteDoOtto(c.ajuste, cx) : { tipo: 'niveis' } };
    const m = mascarasDa(c, mascaraLida, no, false, cx);
    if (m.escondeTudo) no.visivel = false;
    if (m.doOtto) no.mascara = m.doOtto;
    if (m.pixels) perdas.push({ mapeamento: 'psd:mascara-de-pixels', detalhe: 'máscara de pixels em camada de ajuste: não veio, e o ajuste vale para a área inteira' });
    if (m.vetorial) perdas.push({ mapeamento: 'psd:mascara-vetorial-livre', detalhe: 'máscara vetorial de caminho livre em camada de ajuste: não veio' });
    if (c.misturaDeCanais)
      return { ...base, no, destino: 'ignorado', mapeamento: 'psd:ajuste-desconhecido', observacao: 'misturador de canais: o Otto só o lê como a saturação de uma foto', mistura: c.misturaDeCanais };
    return { ...base, no, destino: 'editavel', mapeamento: `ajuste:${(c.ajuste as Ajuste).tipo}`, observacao: 'camada de ajuste' };
  }

  const fx = efeitosDoOtto(c.efeitos, cx, perdas, c.tipo === 'forma');
  const acabamento = { ...comum(c, perdas, temEfeitos), modoDeMesclagem: modoDe(c), ...(fx.sombra ? { sombra: fx.sombra } : {}), ...(fx.efeitos ? { efeitos: fx.efeitos } : {}) };

  /** Fecha a camada como imagem, com as máscaras aplicadas no pixel. */
  const imagem = (mapeamento: ChaveDoMapeamento | ChaveDeImportacao, observacao: string): Convertida => {
    const vetorial = c.tipo !== 'forma' && c.mascaraVetorial && !c.mascaraVetorial.desativada ? c.mascaraVetorial : undefined;
    const esconde = c.mascara && !c.mascara.desativada && !mascaraLida && c.mascara.fora === 0;
    const no = esconde ? undefined : comoImagem(c, pixels, { ...(mascaraLida && !c.mascara?.desativada ? { pixels: mascaraLida } : {}), ...(vetorial ? { vetorial } : {}) }, cx);
    if (!no) return { ...base, destino: 'ignorado', mapeamento: 'psd:camada-vazia', observacao: 'camada sem pixel visível', perdas: [] };
    // opaca e do tamanho da prancheta, sem modo nem opacidade: é o fundo de fato
    let opaca = pixels !== undefined && pixels.x <= cx.ox && pixels.y <= cx.oy && pixels.x + pixels.largura >= cx.ox + cx.largura && pixels.y + pixels.altura >= cx.oy + cx.altura;
    if (opaca && pixels) for (let i = 3; i < pixels.rgba.length && opaca; i += 4) opaca = pixels.rgba[i] === 255;
    const cobreTudo = opaca && !c.oculta && c.opacidade >= 1 && c.opacidadeDoPreenchimento >= 1 && c.modo === 'normal' && !c.recortadaNaDeBaixo;
    return { ...base, no: { ...no, ...acabamento, nome: c.nome }, destino: 'imagem', mapeamento, observacao, ...(cobreTudo ? { cobreTudo: true } : {}) };
  };
  const motivo = motivoDeImagem(c);
  if (motivo) return imagem(motivo.mapeamento, `${DESCRICAO[c.tipo]} com ${motivo.detalhe}: veio como imagem`);
  if (c.tipo === 'pixels') {
    const m: string[] = [];
    if (c.mascara && !c.mascara.desativada && mascaraLida) m.push('máscara de camada');
    if (c.mascaraVetorial && !c.mascaraVetorial.desativada) m.push('máscara vetorial');
    return imagem('psd:camada-de-pixels', m.length ? `camada de pixels, com a ${m.join(' e a ')} aplicada no pixel` : 'camada de pixels');
  }

  // texto, forma e foto: o nó editável, ou o motivo de não caber
  let no: NoNovo;
  let mapeamento: ChaveDoMapeamento | ChaveDeImportacao;
  let observacao: string;
  let vetorialUsada = false;
  let foto: { cantos: number[]; largura: number; altura: number } | undefined;
  if (c.tipo === 'texto') {
    const lido = noDeTexto(c, cx, perdas);
    if (!('tipo' in lido))
      return lido.mapeamento === 'psd:camada-vazia'
        ? { ...base, destino: 'ignorado', mapeamento: lido.mapeamento, observacao: lido.detalhe as string, perdas: [] }
        : imagem(lido.mapeamento as ChaveDeImportacao, `texto que veio como imagem: ${lido.detalhe}`);
    no = lido as NoNovo;
    mapeamento = 'no:texto';
    observacao = `texto ${c.texto?.forma === 'ponto' ? 'de ponto' : 'em caixa'}, ${c.texto?.estilo.fonte}, ${no.tamanho} px${Array.isArray(no.trechos) ? `, ${(no.trechos as unknown[]).length} trechos de estilo` : ''}`;
  } else if (c.tipo === 'forma') {
    const lido = noDeForma(c, cx, perdas, fx.traco);
    if (!('tipo' in lido))
      return lido.mapeamento === 'psd:camada-vazia'
        ? { ...base, destino: 'ignorado', mapeamento: lido.mapeamento, observacao: lido.detalhe as string, perdas: [] }
        : imagem(lido.mapeamento as ChaveDeImportacao, `forma que veio como imagem: ${lido.detalhe}`);
    no = lido as NoNovo;
    vetorialUsada = true;
    mapeamento = no.tipo === 'forma' ? 'no:forma' : 'psd:forma-livre';
    observacao =
      no.tipo === 'forma'
        ? `forma (${no.forma === 'elipse' ? 'elipse' : 'retângulo'}${no.raio ? `, raio ${no.raio}` : ''})${typeof no.preenchimento === 'string' ? '' : ', com degradê'}`
        : 'forma de caminho livre: veio como vetor';
  } else {
    const lido = noDeFoto(c, cx);
    if (!('no' in lido)) return imagem(lido.mapeamento, `objeto inteligente que veio como imagem: ${lido.detalhe}`);
    no = lido.no;
    foto = lido;
    vetorialUsada = true;
    mapeamento = 'no:imagem';
    observacao = `foto original do objeto inteligente (${lido.largura} × ${lido.altura} px)${Array.isArray(no.filtros) ? `, com ${(no.filtros as unknown[]).length} ${(no.filtros as unknown[]).length === 1 ? 'filtro' : 'filtros'}` : ''}`;
  }
  no = { ...no, ...acabamento, nome: c.nome };
  // a sobreposição de degradê também gira com a camada no Otto: o ângulo do arquivo ganha a rotação dela
  const sobreposicao = fx.efeitos?.sobreposicaoDeDegrade;
  if (sobreposicao && typeof no.rotacao === 'number' && no.rotacao !== 0)
    no.efeitos = { ...fx.efeitos, sobreposicaoDeDegrade: { ...sobreposicao, degrade: { ...sobreposicao.degrade, angulo: emGraus(sobreposicao.degrade.angulo + no.rotacao) } } };
  const m = mascarasDa(c, mascaraLida, no, vetorialUsada, cx);
  if (m.escondeTudo) no.visivel = false;
  if (m.doOtto) no.mascara = m.doOtto;
  if (m.pixels || m.vetorial) {
    // foto embutida com máscara de pixels: é a máscara de recorte da foto, que o Otto tem
    if (foto && m.pixels && !m.vetorial && !m.doOtto) {
      no.mascara = mascaraDaFoto(m.pixels, foto.cantos, foto.largura, foto.altura, cx);
      observacao += '; a máscara de camada veio como máscara de recorte da foto';
    } else {
      const chave: ChaveDeImportacao = m.pixels && (m.vetorial || m.doOtto) ? 'psd:duas-mascaras' : m.pixels ? 'psd:mascara-de-pixels' : 'psd:mascara-vetorial-livre';
      return imagem(chave, `${DESCRICAO[c.tipo]} com ${m.pixels ? 'máscara de pixels' : 'máscara vetorial de caminho livre'} que o Otto não tem: veio como imagem, com a máscara aplicada`);
    }
  }
  return { ...base, no, destino: 'editavel', mapeamento, observacao, ...(foto ? { fotoEmbutida: true } : {}) };
}

/** Grupo só com vetores simples, que a exportação grava a partir de um vetor só (nomes "Vetor · #cor"), ou que traz efeito de camada: volta a ser um vetor. */
function comoVetorUnico(c: CamadaLida, filhos: Convertida[], cx: Contexto, perdas: Perda[]): NoNovo | undefined {
  if (filhos.length === 0 || filhos.length > 400) return undefined;
  const simples = filhos.every(
    (f) =>
      f.no?.tipo === 'vetor' &&
      f.no.opacidade === 1 &&
      f.no.visivel === true &&
      f.no.modoDeMesclagem === 'normal' &&
      !f.no.mascara &&
      !f.no.sombra &&
      !f.no.efeitos &&
      !f.no.recortadaNaDeBaixo &&
      f.perdas.length === 0,
  );
  if (!simples) return undefined;
  const doOtto = filhos.every((f) => new RegExp(`^${c.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · #[0-9a-f]{6}( \\(\\d+\\))?$`).test(f.lida.nome));
  const temEfeitos = c.efeitos !== undefined && Object.keys(c.efeitos).length > 0;
  if (!doOtto && !temEfeitos) return undefined;
  if (c.mascara || c.mascaraVetorial) return undefined;
  // a caixa do vetor é a de todos os caminhos; cada caminho passa para a moldura dela
  const caixas = filhos.map((f) => f.no as NoNovo & { x: number; y: number; largura: number; altura: number });
  const x0 = Math.min(...caixas.map((k) => k.x));
  const y0 = Math.min(...caixas.map((k) => k.y));
  const x1 = Math.max(...caixas.map((k) => k.x + k.largura));
  const y1 = Math.max(...caixas.map((k) => k.y + k.altura));
  const caminhos = filhos.map((f) => {
    const lida = f.lida.mascaraVetorial as NonNullable<CamadaLida['mascaraVetorial']>;
    const original = ((f.no as NoNovo).caminhos as Record<string, unknown>[])[0] as Record<string, unknown>;
    return { ...original, d: caminhosEmD(lida.caminhos, x0 + cx.ox, y0 + cx.oy) };
  });
  const fx = efeitosDoOtto(c.efeitos, cx, perdas, false);
  return {
    tipo: 'vetor',
    ...comum(c, perdas, temEfeitos),
    nome: c.nome,
    modoDeMesclagem: modoDe(c),
    x: a2(x0),
    y: a2(y0),
    largura: a2(x1 - x0),
    altura: a2(y1 - y0),
    moldura: [a2(x1 - x0), a2(y1 - y0)],
    caminhos,
    ...(fx.sombra ? { sombra: fx.sombra } : {}),
    ...(fx.efeitos ? { efeitos: fx.efeitos } : {}),
  };
}

function grupoConvertido(c: CamadaLida, filhos: Convertida[], cx: Contexto, perdas: Perda[]): Convertida {
  const vetor = comoVetorUnico(c, filhos, cx, perdas);
  if (vetor)
    return {
      lida: c,
      perdas,
      no: vetor,
      destino: 'editavel',
      mapeamento: 'psd:grupo-de-formas',
      observacao: `grupo de ${filhos.length} ${filhos.length === 1 ? 'forma' : 'formas'}: veio como um vetor só`,
      filhos: filhos.map(({ no: _no, ...f }) => ({ ...f, destino: 'editavel' as const, mapeamento: 'psd:grupo-de-formas' as const, observacao: `caminho do vetor "${c.nome}"` })),
    };
  if (c.efeitos && Object.keys(c.efeitos).length > 0) perdas.push({ mapeamento: 'psd:efeito-em-grupo', detalhe: 'efeito de camada em grupo: não veio' });
  const no: NoNovo = { tipo: 'grupo', ...comum(c, perdas, false), nome: c.nome, modoDeMesclagem: c.modo };
  // a máscara do grupo: só a que o Otto tem
  const lida = c.mascara && !c.mascara.desativada ? c.decodificar().mascara : undefined;
  // a máscara em degradê do grupo se refere à caixa do que está dentro dele: o motor a confere com os filhos no lugar
  const comFilhos = (item: Convertida): Record<string, unknown>[] =>
    item.no ? [{ ...item.no, id: 'filho', ...(item.no.tipo === 'grupo' ? { filhos: (item.filhos ?? []).flatMap(comFilhos) } : {}) }] : [];
  const m = mascarasDa(c, lida, { ...no, filhos: filhos.flatMap(comFilhos) }, false, cx);
  if (m.escondeTudo) no.visivel = false;
  if (m.doOtto) no.mascara = m.doOtto;
  if (m.pixels) perdas.push({ mapeamento: 'psd:mascara-de-pixels', detalhe: 'máscara de pixels em grupo: não veio, e o grupo aparece inteiro' });
  if (m.vetorial) perdas.push({ mapeamento: 'psd:mascara-vetorial-livre', detalhe: 'máscara vetorial de caminho livre em grupo: não veio' });
  return { lida: c, perdas, no, filhos, destino: 'editavel', mapeamento: 'no:grupo', observacao: 'grupo' };
}

/**
 * O ajuste de cor da foto, de volta (é o avesso de camadasDaFoto, em montar.ts): logo acima de uma foto embutida,
 * presas a ela, uma camada de Níveis que é a reta de brilho e contraste, um Misturador de canais que é a saturação e
 * um Mapa de degradê de duas paradas que é o duotone. Só dobra o que, refeito pela exportação, dá a mesma camada.
 */
function dobrarAjustesDasFotos(lista: Convertida[]): Convertida[] {
  const saida = [...lista];
  for (let i = 0; i < saida.length; i++) {
    const foto = saida[i] as Convertida;
    if (!foto.fotoEmbutida || !foto.no || foto.no.recortadaNaDeBaixo) continue;
    const ajusteDeCor: { brilho: number; contraste: number; saturacao: number; duotone?: { sombras: string; luzes: string } } = { brilho: 0, contraste: 0, saturacao: 0 };
    let etapa = 0;
    let ficou = false;
    let j = i + 1;
    const dobradas: number[] = [];
    for (; j < saida.length; j++) {
      const a = saida[j] as Convertida;
      const no = a.no;
      const simples = no?.tipo === 'ajuste' && no.recortadaNaDeBaixo === true && no.opacidade === 1 && no.visivel === true && no.modoDeMesclagem === 'normal' && !no.mascara && a.perdas.length === 0;
      if (!simples || !no) break;
      const ajuste = no.ajuste as Ajuste;
      if (a.mistura && etapa <= 1) {
        const s = saturacaoDe(a.mistura);
        if (s === undefined) break;
        ajusteDeCor.saturacao = s;
        etapa = 2;
      } else if (!a.mistura && ajuste.tipo === 'niveis' && etapa === 0) {
        const achado = brilhoEContrasteDe(ajuste);
        etapa = 1;
        if (!achado) {
          // Níveis que não é a reta de brilho e contraste: fica como camada de ajuste presa à foto. A saturação que vem
          // depois ainda pode entrar na foto (as duas contas são lineares, e a ordem não muda o resultado); o duotone, não
          ficou = true;
          continue;
        }
        ajusteDeCor.brilho = achado.brilho;
        ajusteDeCor.contraste = achado.contraste;
      } else if (!a.mistura && !ficou && ajuste.tipo === 'mapa-de-degrade' && etapa <= 2 && ajuste.paradas.length === 2 && ajuste.paradas[0]?.posicao === 0 && ajuste.paradas[1]?.posicao === 1) {
        ajusteDeCor.duotone = { sombras: (ajuste.paradas[0] as { cor: string }).cor, luzes: (ajuste.paradas[1] as { cor: string }).cor };
        etapa = 3;
      } else break;
      dobradas.push(j);
      if (etapa === 3) break;
    }
    if (dobradas.length === 0) continue;
    saida[i] = { ...foto, no: { ...foto.no, ajusteDeCor }, observacao: `${foto.observacao}; com ajuste de cor` };
    for (const k of dobradas) {
      const a = saida[k] as Convertida;
      const { no: _no, mistura: _mistura, ...resto } = a;
      saida[k] = { ...resto, destino: 'editavel', mapeamento: 'ajuste-de-cor-da-foto', observacao: `camada de ajuste presa à foto: veio como o ajuste de cor de "${foto.lida.nome}"`, perdas: [] };
    }
  }
  // o misturador de canais que não é a saturação de uma foto não tem como vir
  return saida.map((a) => {
    if (!a.mistura) return a;
    const { no: _no, mistura: _mistura, ...resto } = a;
    return resto;
  });
}

/** A saturação (inteira) cujo Misturador de canais, refeito pela exportação, é exatamente este. */
export function saturacaoDe(m: NonNullable<CamadaLida['misturaDeCanais']>): number | undefined {
  // cada canal diz a saturação pelo próprio peso: s = (peso − cinza) / (1 − cinza). Os pesos são inteiros: procura em volta
  const estimativa = ((m.vermelho.vermelho / 100 - 0.299) / 0.701 + (m.verde.verde / 100 - 0.587) / 0.413 + (m.azul.azul / 100 - 0.114) / 0.886) / 3;
  const centro = Math.round((estimativa - 1) * 100);
  const alvo = JSON.stringify(m);
  for (let d = 0; d <= 4; d++) for (const s of d === 0 ? [centro] : [centro - d, centro + d]) if (s >= -100 && s <= 100 && s !== 0 && JSON.stringify(misturaDaSaturacao(s)) === alvo) return s;
  return undefined;
}

/** Brilho e contraste (inteiros) cuja camada de Níveis, refeita pela exportação, é exatamente esta. */
export function brilhoEContrasteDe(n: Extract<Ajuste, { tipo: 'niveis' }>): { brilho: number; contraste: number } | undefined {
  if (Math.abs(n.gama - 1) > 0.005 || n.brancoDeEntrada <= n.pretoDeEntrada) return undefined;
  const ganho = (n.brancoDeSaida - n.pretoDeSaida) / (n.brancoDeEntrada - n.pretoDeEntrada);
  const deslocamento = n.pretoDeSaida / 255 - (ganho * n.pretoDeEntrada) / 255;
  const contraste = Math.round(ganho >= 1 ? (ganho - 1) * 50 : (ganho - 1) * 100);
  const igual = (b: number, c: number): boolean => {
    const r = niveisDoBrilhoEContraste(b, c);
    return r.pretoDeEntrada === n.pretoDeEntrada && r.brancoDeEntrada === n.brancoDeEntrada && r.pretoDeSaida === n.pretoDeSaida && r.brancoDeSaida === n.brancoDeSaida;
  };
  // os Níveis são inteiros: procura em volta da conta
  for (let dc = 0; dc <= 3; dc++)
    for (const c of dc === 0 ? [contraste] : [contraste - dc, contraste + dc]) {
      if (c < -100 || c > 100) continue;
      const g = c >= 0 ? 1 + c / 50 : 1 + c / 100;
      const brilho = Math.round(((deslocamento - (128 / 255) * (1 - g)) * 255) / 1.5);
      for (let db = 0; db <= 3; db++)
        for (const b of db === 0 ? [brilho] : [brilho - db, brilho + db]) if (b >= -100 && b <= 100 && (b !== 0 || c !== 0) && igual(b, c)) return { brilho: b, contraste: c };
    }
  return undefined;
}

/** A camada é o fundo da prancheta: a de baixo, de uma cor só, sem nada além da cor, cobrindo a prancheta inteira? */
function corDeFundo(c: CamadaLida | undefined, cx: Contexto): Rgb | undefined {
  if (c?.tipo !== 'forma' || c.preenchimento?.tipo !== 'cor') return undefined;
  if (c.oculta || c.opacidade < 1 || c.opacidadeDoPreenchimento < 1 || c.modo !== 'normal' || c.recortadaNaDeBaixo || c.efeitos || c.tracoVetorial || c.foraDoModelo.length > 0) return undefined;
  if (c.mascara && !c.mascara.desativada) return undefined;
  if (c.mascaraVetorial && !c.mascaraVetorial.desativada) {
    const f = c.mascaraVetorial.caminhos.length === 1 && !c.mascaraVetorial.invertida ? reconhecerForma(c.mascaraVetorial.caminhos[0] as CaminhoDoArquivo) : undefined;
    const cobre = f && f.forma === 'retangulo' && f.raio === 0 && f.rotacao === 0 && f.x <= cx.ox && f.y <= cx.oy && f.x + f.largura >= cx.ox + cx.largura && f.y + f.altura >= cx.oy + cx.altura;
    if (!cobre) return undefined;
  }
  return c.preenchimento.cor;
}

/** Monta as operações que criam o documento e preenche o relatório. Arquivo com pranchetas: uma prancheta do Otto para cada. Sem: uma, do tamanho do arquivo. */
export function desmontar(pedido: PedidoDeDesmontagem): Desmontagem {
  const { arquivo, rel } = pedido;
  const operacoes: unknown[] = [];
  const imagens = new Map<string, ImagemImportada>();
  const embutidos = new Map(arquivo.embutidos.map((e) => [e.id, e]));
  let fundoTransparente = false;
  const comPranchetas = arquivo.camadas.some((c) => c.prancheta);
  const pranchetas = comPranchetas
    ? arquivo.camadas
        .filter((c) => c.prancheta)
        .map((c) => ({
          nome: c.nome,
          camadas: c.filhos ?? [],
          area: c.prancheta as NonNullable<CamadaLida['prancheta']>,
          transparente: c.prancheta?.transparente === true,
          fundo: c.prancheta?.fundo as Rgb,
        }))
    : [{ nome: pedido.nomeDaPrancheta, camadas: arquivo.camadas, area: { x: 0, y: 0, largura: arquivo.largura, altura: arquivo.altura }, transparente: true, fundo: { r: 255, g: 255, b: 255 } }];
  if (comPranchetas)
    for (const c of arquivo.camadas.filter((x) => !x.prancheta))
      rel.camadas.push({ prancheta: '—', camada: c.nome, destino: 'ignorado', mapeamento: 'psd:fora-das-pranchetas', observacao: 'camada fora de qualquer prancheta: não veio' });

  const nomesDePrancheta = new Set<string>();
  for (const p of pranchetas) {
    let nome = p.nome.trim() || 'Prancheta';
    for (let n = 2; nomesDePrancheta.has(nome); n++) nome = `${p.nome.trim() || 'Prancheta'} ${n}`;
    nomesDePrancheta.add(nome);
    const largura = Math.max(1, Math.round(p.area.largura));
    const altura = Math.max(1, Math.round(p.area.altura));
    const cx: Contexto = { ...pedido, ox: p.area.x, oy: p.area.y, largura, altura, prancheta: nome, imagens, embutidos };
    // o fundo: a cor da prancheta do Photoshop, ou a camada de cor sólida que a exportação grava embaixo de tudo
    let camadas = p.camadas;
    let fundo = p.fundo;
    let transparente = p.transparente;
    const deBaixo = corDeFundo(camadas[0], cx);
    if (deBaixo) {
      fundo = deBaixo;
      transparente = false;
      rel.camadas.push({
        prancheta: nome,
        camada: (camadas[0] as CamadaLida).nome,
        tipo: 'prancheta',
        destino: 'editavel',
        mapeamento: 'psd:fundo-de-cor-solida',
        observacao: 'camada de cor sólida embaixo de tudo: virou a cor de fundo da prancheta',
      });
      camadas = camadas.slice(1);
    }
    const indiceDaPrancheta = operacoes.length;
    operacoes.push({ op: 'criarPrancheta', nome, largura, altura, fundo: hex(transparente ? { r: 255, g: 255, b: 255 } : pedido.cor.cor(fundo)) });
    const idDaPrancheta = pedido.idDaOperacao(indiceDaPrancheta);

    const convertidas = dobrarAjustesDasFotos(camadas.map((c) => converter(c, cx)));
    // fundo transparente só é notícia quando dá para ver o fundo: com uma camada opaca cobrindo a prancheta, não dá
    if (transparente && !convertidas.some((item) => item.cobreTudo)) fundoTransparente = true;
    const nomes = new Set<string>();
    const emitir = (item: Convertida, grupo: string | undefined): void => {
      const linha: LinhaDoRelatorioDeImportacao = {
        prancheta: nome,
        camada: item.lida.nome,
        destino: item.destino,
        mapeamento: item.mapeamento,
        ...(item.observacao ? { observacao: item.observacao } : {}),
        ...(item.perdas.length > 0 ? { perdas: item.perdas } : {}),
      };
      rel.camadas.push(linha);
      if (!item.no) {
        for (const f of item.filhos ?? []) emitir(f, grupo);
        return;
      }
      // nome único na prancheta, e nunca vazio: é pelo nome que o agente e o designer chamam a camada
      const original = item.no.nome;
      let unico = original.trim() === '' ? 'Camada' : original;
      for (let n = 2; nomes.has(unico); n++) unico = `${original.trim() === '' ? 'Camada' : original} ${n}`;
      nomes.add(unico);
      if (unico !== original) linha.nomeNoOtto = unico;
      const indice = operacoes.length;
      operacoes.push({ op: 'criarNo', prancheta: idDaPrancheta, no: { ...item.no, nome: unico }, ...(grupo ? { grupo } : {}) });
      const id = pedido.idDaOperacao(indice);
      linha.idDoNo = id;
      linha.tipo = item.no.tipo;
      if (item.no.tipo === 'grupo') for (const f of item.filhos ?? []) emitir(f, id);
      else for (const f of item.filhos ?? []) rel.camadas.push({ prancheta: nome, camada: f.lida.nome, destino: f.destino, mapeamento: f.mapeamento, idDoNo: id, observacao: f.observacao });
    };
    for (const item of convertidas) emitir(item, undefined);
    // arquivo salvo achatado: não tem camada nenhuma, e a imagem está só na composta
    if (!comPranchetas && arquivo.camadas.length === 0) {
      const composta = arquivo.composta();
      if (composta && composta.length === arquivo.largura * arquivo.altura * 4) {
        pedido.cor.pixels?.(composta);
        const chave = guardarImagem(cx, pedido.meios.png(arquivo.largura, arquivo.altura, composta), 'image/png', arquivo.largura, arquivo.altura, 'camada');
        const indice = operacoes.length;
        operacoes.push({
          op: 'criarNo',
          prancheta: idDaPrancheta,
          no: { tipo: 'imagem', nome: 'Fundo', arquivo: chave, larguraOriginal: arquivo.largura, alturaOriginal: arquivo.altura, x: 0, y: 0, largura: arquivo.largura, altura: arquivo.altura },
        });
        rel.camadas.push({
          prancheta: nome,
          camada: 'Fundo',
          idDoNo: pedido.idDaOperacao(indice),
          tipo: 'imagem',
          destino: 'imagem',
          mapeamento: 'psd:arquivo-achatado',
          observacao: 'o arquivo não tem camadas: veio a imagem composta dele',
        });
        fundoTransparente = false;
      }
    }
  }
  return { operacoes, imagens: [...imagens.values()], fundoTransparente };
}
