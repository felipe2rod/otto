// O mapeamento em ação: do documento do Otto para as camadas do arquivo (porta.ts) e para o relatório.
// Decide o destino de cada camada (docs/tecnico/psd.md) sem tocar em pixel: os pixels vêm de uma FonteDePixels,
// e sem ela a montagem produz só a estrutura e o relatório. É por isso que o relatório sai sem renderizar.
import {
  type Ajuste,
  type Degrade,
  type Documento,
  disporPranchetas,
  type Filtro,
  hexParaRgb,
  type No,
  type NoImagem,
  type NoTexto,
  type NoVetor,
  type NoVisual,
  type Prancheta,
  type Preenchimento,
  resolverCor,
} from '@otto/documento';
import { enquadrar, escolherFonte, sementeDe } from '@otto/render';
import { type Mapa, mapearNos, nosDaForma, nosDoSubcaminho, subcaminhosDe } from './caminho';
import type { ChaveDoMapeamento } from './mapeamento';
import type {
  ArquivoEmbutido,
  CamadaDoArquivo,
  DegradeDoArquivo,
  EfeitosDoArquivo,
  EstiloDeTextoDoArquivo,
  MascaraDoArquivo,
  ObjetoInteligenteDoArquivo,
  PixelsDoArquivo,
  PreenchimentoDoArquivo,
  Rgb,
  TextoDoArquivo,
} from './porta';
import { type Destino, type LinhaDoRelatorio, nomeDaCamada, type RelatorioDeExportacao } from './relatorio';

/** Uma fonte que a exportação tem: a família e o peso do documento, e o nome que o Photoshop procura. */
export interface FonteDisponivel {
  familia: string;
  peso: number;
  postScript: string;
  /** nome do arquivo da fonte, para o relatório */
  arquivo?: string;
}

export type TipoDeImagem = 'image/png' | 'image/jpeg' | 'image/webp';

/** Uma imagem que a exportação tem, pela chave do documento (sha256). Sem `bytes`, só o relatório pode ser montado. */
export interface ImagemDisponivel {
  arquivo: string;
  tipo: TipoDeImagem;
  /** dimensão real do arquivo; sem ela vale a que o nó declara */
  largura?: number;
  altura?: number;
  bytes?: Uint8Array;
}

/** De onde vêm os pixels. Tudo em coordenadas da prancheta: a montagem desloca para o arquivo. */
export interface FonteDePixels {
  /** o pixel de uma camada, já "limpa": sem opacidade, modo, máscara nem efeitos */
  camada(p: Prancheta, no: NoVisual): PixelsDoArquivo | undefined;
  mascara(p: Prancheta, no: No): MascaraDoArquivo | undefined;
  /**
   * Onde o motor pôs a primeira linha do texto: a linha de base (y na prancheta, antes da rotação), a altura que o
   * texto ocupa e a altura da maiúscula da primeira linha, em pixels. Texto sem fonte: undefined.
   */
  primeiraLinha?(no: NoTexto): { base: number; alturaUsada: number; maiuscula: number } | undefined;
}

export interface Montagem {
  largura: number;
  altura: number;
  camadas: CamadaDoArquivo[];
  embutidos: ArquivoEmbutido[];
  /** onde cada prancheta fica no arquivo */
  posicoes: Map<string, { x: number; y: number }>;
}

interface Contexto {
  doc: Documento;
  p: Prancheta;
  /** posição da prancheta dentro do arquivo */
  dx: number;
  dy: number;
  fontes: readonly FonteDisponivel[];
  imagens: ReadonlyMap<string, ImagemDisponivel>;
  pixels: FonteDePixels | undefined;
  rel: RelatorioDeExportacao;
  embutidos: Map<string, ArquivoEmbutido>;
}

const cor = (doc: Documento, c: string): Rgb => {
  const [r, g, b] = hexParaRgb(resolverCor(doc, c));
  return { r, g, b };
};

/** Id estável no formato de UUID, derivado de um texto: o mesmo documento dá o mesmo arquivo, byte a byte. */
export function idEstavel(texto: string): string {
  const partes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((semente) => {
    let h = semente;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  });
  const hex = partes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Leva um ponto da prancheta para o arquivo: gira em torno do centro da camada e desloca pela prancheta. */
function mapeador(no: NoVisual | undefined, cx: Contexto): Mapa {
  const graus = no?.rotacao ?? 0;
  if (!no || !graus) return (x, y) => [x + cx.dx, y + cx.dy];
  const a = (graus * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const ox = no.x + no.largura / 2;
  const oy = no.y + no.altura / 2;
  return (x, y) => [ox + (x - ox) * cos - (y - oy) * sin + cx.dx, oy + (x - ox) * sin + (y - oy) * cos + cx.dy];
}

/**
 * O nó como ele vai para o pixel da camada. Opacidade, modo, máscara e máscara de recorte ficam na camada do arquivo;
 * sombra, traço e efeitos viram efeitos de camada (senão o Photoshop desenharia duas vezes); o corte da foto vira
 * máscara vetorial e o ajuste de cor dela vira camada de ajuste presa a ela.
 */
export function soOPixel(no: NoVisual, manterAjusteDeCor = false): NoVisual {
  const { sombra: _sombra, efeitos: _efeitos, mascara: _mascara, ...resto } = no;
  const base = { ...resto, opacidade: 1, modoDeMesclagem: 'normal', visivel: true, recortadaNaDeBaixo: false } as NoVisual;
  if (base.tipo === 'forma') {
    const { traco: _traco, ...forma } = base;
    return forma;
  }
  if (base.tipo === 'imagem') {
    const { recorte: _recorte, ajusteDeCor, ...imagem } = base;
    return manterAjusteDeCor && ajusteDeCor ? { ...imagem, ajusteDeCor } : imagem;
  }
  return base;
}

function degrade(doc: Documento, d: Degrade): DegradeDoArquivo {
  return { estilo: d.tipo, angulo: d.angulo, paradas: [...d.paradas].sort((a, b) => a.posicao - b.posicao).map((q) => ({ cor: cor(doc, q.cor), posicao: q.posicao, opacidade: q.opacidade })) };
}

function preenchimento(doc: Documento, p: Preenchimento): PreenchimentoDoArquivo {
  return typeof p === 'string' ? { tipo: 'cor', cor: cor(doc, p) } : { tipo: 'degrade', ...degrade(doc, p) };
}

/** A camada de ajuste com as cores de token resolvidas. */
function ajusteResolvido(doc: Documento, a: Ajuste): Ajuste {
  if (a.tipo === 'filtro-de-foto') return { ...a, cor: resolverCor(doc, a.cor) };
  if (a.tipo === 'mapa-de-degrade') return { ...a, paradas: a.paradas.map((q) => ({ ...q, cor: resolverCor(doc, q.cor) })) };
  return a;
}

/**
 * Efeitos de camada. Os modos são os que o motor desenha: sombra projetada e brilho externo em modo normal
 * (o padrão do Photoshop seria multiplicação e tela), brilho interno em tela e sombra interna em multiplicação.
 */
function efeitosDoNo(doc: Documento, no: NoVisual): EfeitosDoArquivo | undefined {
  const fx: EfeitosDoArquivo = {};
  if (no.sombra)
    fx.sombraProjetada = { cor: cor(doc, no.sombra.cor), opacidade: no.sombra.opacidade, angulo: no.sombra.angulo, distancia: no.sombra.distancia, tamanho: no.sombra.desfoque, modo: 'normal' };
  if (no.tipo === 'forma' && no.traco) fx.tracoInterno = { cor: cor(doc, no.traco.cor), espessura: no.traco.espessura };
  const e = no.efeitos;
  if (e?.sombraInterna)
    fx.sombraInterna = {
      cor: cor(doc, e.sombraInterna.cor),
      opacidade: e.sombraInterna.opacidade,
      angulo: e.sombraInterna.angulo,
      distancia: e.sombraInterna.distancia,
      tamanho: e.sombraInterna.desfoque,
      modo: 'multiplicacao',
    };
  if (e?.brilhoExterno) fx.brilhoExterno = { cor: cor(doc, e.brilhoExterno.cor), opacidade: e.brilhoExterno.opacidade, tamanho: e.brilhoExterno.tamanho, modo: 'normal' };
  if (e?.brilhoInterno) fx.brilhoInterno = { cor: cor(doc, e.brilhoInterno.cor), opacidade: e.brilhoInterno.opacidade, tamanho: e.brilhoInterno.tamanho, modo: 'tela' };
  if (e?.sobreposicaoDeCor) fx.sobreposicaoDeCor = { cor: cor(doc, e.sobreposicaoDeCor.cor), opacidade: e.sobreposicaoDeCor.opacidade, modo: e.sobreposicaoDeCor.modoDeMesclagem };
  if (e?.sobreposicaoDeDegrade)
    fx.sobreposicaoDeDegrade = { degrade: degrade(doc, e.sobreposicaoDeDegrade.degrade), opacidade: e.sobreposicaoDeDegrade.opacidade, modo: e.sobreposicaoDeDegrade.modoDeMesclagem };
  return Object.keys(fx).length > 0 ? fx : undefined;
}

function nomesDosEfeitos(no: NoVisual): string {
  const e = no.efeitos ?? {};
  return [
    no.sombra && 'sombra projetada',
    no.tipo === 'forma' && no.traco && 'traço interno',
    e.sombraInterna && 'sombra interna',
    e.brilhoExterno && 'brilho externo',
    e.brilhoInterno && 'brilho interno',
    e.sobreposicaoDeCor && 'sobreposição de cor',
    e.sobreposicaoDeDegrade && 'sobreposição de degradê',
  ]
    .filter((x): x is string => Boolean(x))
    .join(', ');
}

const NOME_DO_AJUSTE: Record<Ajuste['tipo'], string> = {
  curvas: 'curvas',
  niveis: 'níveis',
  'matiz-saturacao': 'matiz e saturação',
  'brilho-contraste': 'brilho e contraste',
  vibracao: 'vibração',
  'equilibrio-de-cor': 'equilíbrio de cores',
  'filtro-de-foto': 'filtro de fotografia',
  'preto-e-branco': 'preto e branco',
  'mapa-de-degrade': 'mapa de degradê',
};

const NOME_DO_FILTRO: Record<Filtro['tipo'], string> = { desfoque: 'desfoque', 'desfoque-de-movimento': 'desfoque de movimento', ruido: 'ruído', nitidez: 'nitidez' };
const nomesDosFiltros = (filtros: readonly Filtro[]): string => filtros.map((f) => NOME_DO_FILTRO[f.tipo]).join(', ');

/** A máscara de sujeito só vale em foto, e só com os dois arquivos em mãos (é a regra do motor). */
function mascaraVale(no: No, cx: Contexto): boolean {
  const m = no.mascara;
  if (!m) return false;
  if (m.tipo !== 'sujeito') return true;
  return no.tipo === 'imagem' && cx.imagens.has(m.arquivo) && cx.imagens.has(no.arquivo);
}

function descreverMascara(no: No, cx: Contexto): string {
  const m = no.mascara;
  if (!m) return '';
  if (!mascaraVale(no, cx)) return 'máscara do sujeito não aplicada (só vale em foto, com o arquivo da máscara)';
  if (m.tipo === 'degrade') return `máscara em degradê (${m.angulo}°)`;
  if (m.tipo === 'forma') return `máscara de ${m.forma === 'elipse' ? 'elipse' : 'retângulo'}${m.suavizar ? ' suavizada' : ''}${m.inverter ? ' invertida' : ''}`;
  return `máscara do sujeito${m.inverter ? ' invertida' : ''}`;
}

/**
 * Brilho e contraste da foto como camada de Níveis. A conta do motor é saída = ganho × entrada + deslocamento
 * (ganho de 1 + contraste/50, ou 1 + contraste/100 se negativo; pivô em 128; brilho × 1,5 níveis), e Níveis com gama 1
 * é a mesma reta, dita pelos pontos em que ela cruza o preto e o branco.
 */
export function niveisDoBrilhoEContraste(brilho: number, contraste: number): Extract<Ajuste, { tipo: 'niveis' }> {
  const ganho = contraste >= 0 ? 1 + contraste / 50 : 1 + contraste / 100;
  const deslocamento = (128 / 255) * (1 - ganho) + (brilho * 1.5) / 255;
  const limitar = (v: number): number => Math.max(0, Math.min(1, v));
  const nivel = (v: number): number => Math.round(limitar(v) * 255);
  const reta = (v: number): number => limitar(ganho * v + deslocamento);
  // o trecho da entrada em que a reta ainda não bateu no preto nem no branco
  const de = ganho > 0 ? limitar(-deslocamento / ganho) : 0;
  const ate = ganho > 0 ? limitar((1 - deslocamento) / ganho) : 1;
  if (ganho <= 0 || nivel(ate) - nivel(de) < 2) {
    // a reta é plana, ou bate num extremo na entrada inteira: a saída é uma cor só
    const fixa = nivel(reta(0.5));
    return { tipo: 'niveis', pretoDeEntrada: 0, brancoDeEntrada: 255, gama: 1, pretoDeSaida: fixa, brancoDeSaida: fixa };
  }
  return { tipo: 'niveis', pretoDeEntrada: nivel(de), brancoDeEntrada: nivel(ate), gama: 1, pretoDeSaida: nivel(reta(de)), brancoDeSaida: nivel(reta(ate)) };
}

/** Saturação da foto como Misturador de canais: cada canal é ele mesmo puxado para o cinza (0,299 R + 0,587 G + 0,114 B), ou afastado dele. */
export function misturaDaSaturacao(saturacao: number): NonNullable<CamadaDoArquivo['misturaDeCanais']> {
  const s = 1 + saturacao / 100;
  const cinza = { vermelho: 0.299, verde: 0.587, azul: 0.114 };
  type Canal = 'vermelho' | 'verde' | 'azul';
  const canal = (proprio: Canal) => {
    const pct = (k: Canal): number => Math.round((cinza[k] * (1 - s) + (k === proprio ? s : 0)) * 100);
    // os três somam 100: o arredondamento não pode clarear nem escurecer o cinza
    const outros = (['vermelho', 'verde', 'azul'] as const).filter((k) => k !== proprio);
    const soma = outros.reduce((t, k) => t + pct(k), 0);
    return { vermelho: 0, verde: 0, azul: 0, ...Object.fromEntries(outros.map((k) => [k, pct(k)])), [proprio]: 100 - soma, constante: 0 } as Record<Canal | 'constante', number>;
  };
  return { vermelho: canal('vermelho'), verde: canal('verde'), azul: canal('azul') };
}

/** Os quatro cantos da foto inteira (não só do que a caixa mostra), em coordenadas da prancheta, sem a rotação. */
export function cantosDaFoto(larguraDaFoto: number, alturaDaFoto: number, no: NoImagem): number[] {
  const e = enquadrar(larguraDaFoto, alturaDaFoto, no.x, no.y, no.largura, no.altura, no.ajuste, no.foco, no.zoom);
  const k = e.dw / e.sw;
  const x0 = e.dx - e.sx * k;
  const y0 = e.dy - e.sy * k;
  return [x0, y0, x0 + larguraDaFoto * k, y0, x0 + larguraDaFoto * k, y0 + alturaDaFoto * k, x0, y0 + alturaDaFoto * k];
}

type Trecho = NonNullable<TextoDoArquivo['trechos']>[number];

/** As fontes de um texto (a da camada e as dos trechos), cada uma com o arquivo que o motor escolhe. */
function fontesDoTexto(no: NoTexto, cx: Contexto): { pedida: { familia: string; peso: number }; usada: FonteDisponivel | undefined }[] {
  const pedidas = [{ familia: no.fonte, peso: no.peso }, ...(no.trechos ?? []).map((t) => ({ familia: t.fonte ?? no.fonte, peso: t.peso ?? no.peso }))];
  const vistas = new Set<string>();
  return pedidas
    .filter((f) => {
      const chave = `${f.familia}#${f.peso}`;
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    })
    .map((pedida) => ({ pedida, usada: escolherFonte(cx.fontes, pedida.familia, pedida.peso) }));
}

/** Estilo por sequência de caracteres, cobrindo o texto inteiro, como o Photoshop guarda. */
function trechosDoTexto(no: NoTexto, cx: Contexto): Trecho[] | undefined {
  if (!no.trechos?.length) return undefined;
  const trechos: (Trecho & { chave: string })[] = [];
  for (let i = 0; i < no.conteudo.length; i++) {
    // o último trecho que cobre o caractere vence, como no motor
    const t = [...no.trechos].reverse().find((x) => i >= x.inicio && i < x.fim);
    const fonte = escolherFonte(cx.fontes, t?.fonte ?? no.fonte, t?.peso ?? no.peso);
    const tamanho = t?.tamanho ?? no.tamanho;
    const estilo = {
      fonte: fonte?.postScript ?? no.fonte,
      tamanho,
      cor: cor(cx.doc, t?.cor ?? no.cor),
      espacamento: t?.espacamento ?? no.espacamento,
      entrelinha: Math.round(tamanho * no.entrelinha * 100) / 100,
    };
    const chave = JSON.stringify(estilo);
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.comprimento++;
    else trechos.push({ comprimento: 1, estilo, chave });
  }
  return trechos.map(({ comprimento, estilo }) => ({ comprimento, estilo }));
}

function camadasDoNo(no: No, cx: Contexto): CamadaDoArquivo[] {
  const { doc, p, rel } = cx;
  const linha = (destino: Destino, mapeamento: ChaveDoMapeamento, observacao: string, extra: Partial<LinhaDoRelatorio> = {}): void => {
    rel.camadas.push({ prancheta: p.nome, camada: no.nome, idDoNo: no.id, tipo: no.tipo, destino, mapeamento, ...(observacao ? { observacao } : {}), ...extra });
  };
  const comum: CamadaDoArquivo = { nome: no.nome, opacidade: no.opacidade, modo: no.modoDeMesclagem, oculta: !no.visivel, recortadaNaDeBaixo: no.recortadaNaDeBaixo, bloqueada: no.bloqueado };
  if (mascaraVale(no, cx)) {
    const mascara = cx.pixels?.mascara(p, no);
    if (mascara) comum.mascara = { ...mascara, x: mascara.x + cx.dx, y: mascara.y + cx.dy };
  }
  const extras = [
    descreverMascara(no, cx),
    no.recortadaNaDeBaixo ? 'presa à camada de baixo por máscara de recorte' : '',
    no.modoDeMesclagem !== 'normal' && no.modoDeMesclagem !== 'atravessar' ? `modo ${no.modoDeMesclagem}` : '',
  ].filter(Boolean);

  if (no.tipo === 'grupo') {
    linha('nativo-editavel', 'no:grupo', ['grupo', ...extras].join('; '));
    return [{ ...comum, filhos: no.filhos.flatMap((f) => camadasDoNo(f, cx)) }];
  }
  if (no.tipo === 'ajuste') {
    linha('nativo-editavel', `ajuste:${no.ajuste.tipo}`, [`camada de ajuste de ${NOME_DO_AJUSTE[no.ajuste.tipo]}`, ...extras].join('; '));
    return [{ ...comum, ajuste: ajusteResolvido(doc, no.ajuste) }];
  }

  const f = mapeador(no, cx);
  const efeitos = efeitosDoNo(doc, no);
  if (no.rotacao) extras.push(`girada ${no.rotacao}°`);
  const notaDeEfeitos = nomesDosEfeitos(no);
  const detalhe = (t: string): string => [t, ...extras, notaDeEfeitos ? `${notaDeEfeitos} como efeito de camada` : ''].filter(Boolean).join('; ');
  /** A camada só com o pixel: é o que sobra quando o Photoshop não tem como guardar o recurso editável. */
  const soPixel = (manterAjusteDeCor = false): CamadaDoArquivo => {
    const pixels = deslocar(cx.pixels?.camada(p, soOPixel(no, manterAjusteDeCor)), cx);
    return { ...comum, ...(efeitos ? { efeitos } : {}), ...(pixels ? { pixels } : {}) };
  };
  const filtros = no.filtros ?? [];

  switch (no.tipo) {
    case 'forma': {
      if (filtros.length > 0) {
        linha('raster-com-aviso', 'filtro-fora-de-foto', detalhe(`forma com filtro (${nomesDosFiltros(filtros)}): no Photoshop, filtro editável só existe em objeto inteligente`));
        return [soPixel()];
      }
      const descricao = `forma vetorial (${no.forma === 'elipse' ? 'elipse' : 'retângulo'}${no.raio ? `, raio ${no.raio}` : ''})${typeof no.preenchimento === 'string' ? '' : `, preenchimento em degradê ${no.preenchimento.tipo}`}`;
      linha('nativo-editavel', 'no:forma', detalhe(descricao));
      return [
        {
          ...soPixel(),
          preenchimento: preenchimento(doc, no.preenchimento),
          mascaraVetorial: [{ aberto: false, regra: 'nao-zero', nos: mapearNos(nosDaForma(no.forma, no.x, no.y, no.largura, no.altura, no.raio), f) }],
          // forma viva só sem rotação: girada, vai como caminho comum
          ...(no.rotacao ? {} : { formaViva: { forma: no.forma, x: no.x + cx.dx, y: no.y + cx.dy, largura: no.largura, altura: no.altura, raio: Math.min(no.raio, no.largura / 2, no.altura / 2) } }),
        },
      ];
    }
    case 'imagem':
      return camadasDaFoto(no, soPixel, detalhe, linha, cx);
    case 'vetor':
      return camadasDoVetor(no, comum, efeitos, soPixel, detalhe, linha, cx);
    case 'texto': {
      const fontes = fontesDoTexto(no, cx);
      const emFalta = fontes.filter((x) => !x.usada);
      if (emFalta.length > 0) {
        for (const x of emFalta) {
          const registro = rel.emFalta.fontes.find((r) => r.familia === x.pedida.familia);
          if (registro) registro.camadas.push(nomeDaCamada(p, no.nome));
          else rel.emFalta.fontes.push({ familia: x.pedida.familia, camadas: [nomeDaCamada(p, no.nome)] });
        }
        linha('raster-com-aviso', 'texto-sem-fonte', detalhe(`a fonte ${emFalta.map((x) => `"${x.pedida.familia}"`).join(', ')} não foi encontrada: a camada saiu sem o texto`));
        return [soPixel()];
      }
      if (filtros.length > 0) {
        linha('raster-com-aviso', 'filtro-fora-de-foto', detalhe(`texto com filtro (${nomesDosFiltros(filtros)}): no Photoshop, filtro editável só existe em objeto inteligente`));
        return [soPixel()];
      }
      for (const { pedida, usada } of fontes) {
        if (!usada) continue;
        if (!rel.fontes.some((x) => x.postScript === usada.postScript))
          rel.fontes.push({ familia: usada.familia, peso: usada.peso, postScript: usada.postScript, ...(usada.arquivo ? { arquivo: usada.arquivo } : {}) });
        if (usada.peso !== pedida.peso) rel.substituicoes.push({ camada: nomeDaCamada(p, no.nome), pedida, usada: { familia: usada.familia, peso: usada.peso, postScript: usada.postScript } });
      }
      const principal = fontes[0]?.usada as FonteDisponivel;
      const trechos = trechosDoTexto(no, cx);
      const a = (no.rotacao * Math.PI) / 180;
      const estilo: EstiloDeTextoDoArquivo = {
        fonte: principal.postScript,
        tamanho: no.tamanho,
        cor: cor(doc, no.cor),
        entrelinha: Math.round(no.tamanho * no.entrelinha * 100) / 100,
        espacamento: no.espacamento,
        caixa: no.caixaAlta ? 'alta' : no.versalete ? 'versalete' : 'normal',
        kerning: no.kerning !== 'nenhum',
      };
      linha('nativo-editavel', 'no:texto', detalhe(`texto em caixa, ${principal.postScript}, ${no.tamanho} px${trechos ? `, ${trechos.length} trechos de estilo` : ''}`));
      // O Photoshop, ao refazer um texto em caixa gravado por esta biblioteca, encosta no topo da caixa a ALTURA DA
      // MAIÚSCULA da primeira linha; o motor do Otto encosta a ascendente. Sem compensar, o texto sobe
      // (ascendente − maiúscula) × tamanho ao ser atualizado ou editado (medido no Photoshop 2025, 2026-10-02).
      // A caixa gravada desce o quanto for preciso para a linha de base do Photoshop cair na do motor, e encolhe o mesmo tanto.
      const primeira = cx.pixels?.primeiraLinha?.(no);
      const desce = primeira ? Math.max(0, primeira.base - no.y - primeira.maiuscula) : 0;
      const [tx, ty] = f(no.x, no.y + desce);
      const alturaDaCaixa = Math.max(no.tamanho, Math.max(no.altura, Math.ceil(primeira?.alturaUsada ?? 0)) - desce);
      return [
        {
          ...soPixel(),
          texto: {
            conteudo: no.conteudo,
            // sem rotação o seno é zero, e o zero não pode sair negativo no arquivo
            transformacao: [Math.cos(a), Math.sin(a), 0 - Math.sin(a), Math.cos(a), tx, ty],
            caixa: { largura: no.largura, altura: Math.round(alturaDaCaixa * 100) / 100 },
            alinhamento: no.alinhamento,
            estilo,
            ...(trechos ? { trechos } : {}),
          },
        },
      ];
    }
  }
}

function deslocar(pixels: PixelsDoArquivo | undefined, cx: Contexto): PixelsDoArquivo | undefined {
  return pixels ? { ...pixels, x: pixels.x + cx.dx, y: pixels.y + cx.dy } : undefined;
}

type Linha = (destino: Destino, mapeamento: ChaveDoMapeamento, observacao: string, extra?: Partial<LinhaDoRelatorio>) => void;

/**
 * Foto como objeto inteligente: o arquivo original vai embutido, o enquadramento é a transformação, o corte da caixa
 * (ou o recorte em forma) é a máscara vetorial e os filtros são filtros inteligentes. O ajuste de cor da foto vira
 * camadas de ajuste presas a ela. É o que a POC fazia; objeto e filtro inteligente pedem ADR (o ADR 028 os lista fora da v1).
 */
function camadasDaFoto(no: NoImagem, soPixel: (manterAjusteDeCor?: boolean) => CamadaDoArquivo, detalhe: (t: string) => string, linha: Linha, cx: Contexto): CamadaDoArquivo[] {
  const { doc, p, rel } = cx;
  if (no.origem) rel.imagens.push({ camada: nomeDaCamada(p, no.nome), ...no.origem });
  const original = cx.imagens.get(no.arquivo);
  const f = mapeador(no, cx);
  const recorte = no.recorte ?? { forma: 'retangulo' as const, raio: 0 };
  const mascaraVetorial = [{ aberto: false, regra: 'nao-zero' as const, nos: mapearNos(nosDaForma(recorte.forma, no.x, no.y, no.largura, no.altura, recorte.raio), f) }];
  const filtros = no.filtros ?? [];
  const a = no.ajusteDeCor;
  const temAjusteDeCor = Boolean(a && (a.brilho !== 0 || a.contraste !== 0 || a.saturacao !== 0 || a.duotone));
  const tamanho = `${no.larguraOriginal} × ${no.alturaOriginal} px`;
  const corte = `corte da caixa como máscara vetorial${no.recorte ? ` (${no.recorte.forma === 'elipse' ? 'elipse' : 'retângulo'})` : ''}`;

  if (!original) {
    const registro = rel.emFalta.imagens.find((r) => r.arquivo === no.arquivo);
    if (registro) registro.camadas.push(nomeDaCamada(p, no.nome));
    else rel.emFalta.imagens.push({ arquivo: no.arquivo, camadas: [nomeDaCamada(p, no.nome)] });
    linha('nativo-pixel', 'no:imagem', detalhe(`o arquivo da foto não foi encontrado: a camada saiu como um retângulo cinza; ${corte}`));
    return [{ ...soPixel(true), mascaraVetorial }];
  }
  // presa à camada de baixo e com ajuste de cor: as camadas de ajuste ficariam presas à base do recorte, não à foto
  if (no.recortadaNaDeBaixo && temAjusteDeCor) {
    linha('raster-com-aviso', 'foto-recortada-com-ajuste-de-cor', detalhe(`foto (${tamanho}) com o ajuste de cor já aplicado no pixel; ${corte}`));
    return [{ ...soPixel(true), mascaraVetorial }];
  }

  const foto: CamadaDoArquivo = { ...soPixel(), mascaraVetorial };
  const embutivel = original.tipo === 'image/png' || original.tipo === 'image/jpeg';
  if (embutivel) {
    const embutido = idEstavel(`arquivo:${no.arquivo}`);
    // a mesma foto em várias camadas é embutida uma vez só: no Photoshop elas são instâncias do mesmo objeto inteligente
    if (original.bytes && !cx.embutidos.has(embutido)) {
      cx.embutidos.set(embutido, { id: embutido, nome: `${no.nome}.${original.tipo === 'image/png' ? 'png' : 'jpg'}`, tipo: original.tipo === 'image/png' ? 'png' : 'jpeg', bytes: original.bytes });
    }
    const largura = original.largura ?? no.larguraOriginal;
    const altura = original.altura ?? no.alturaOriginal;
    const cantos = cantosDaFoto(largura, altura, no);
    const objeto: ObjetoInteligenteDoArquivo = {
      embutido,
      instancia: idEstavel(`instancia:${no.id}`),
      cantos: [0, 2, 4, 6].flatMap((i) => f(cantos[i] as number, cantos[i + 1] as number)) as ObjetoInteligenteDoArquivo['cantos'],
      largura,
      altura,
      filtros: [...filtros],
      semente: sementeDe(no.id),
    };
    foto.objetoInteligente = objeto;
    linha(
      'nativo-editavel',
      'no:imagem',
      detalhe(`objeto inteligente com a foto original embutida (${tamanho}); ${corte}${filtros.length ? `; filtros inteligentes: ${nomesDosFiltros(filtros)}` : ''}`),
    );
  } else {
    linha(
      'raster-com-aviso',
      'foto-em-webp',
      detalhe(`foto em WebP (${tamanho}): saiu como pixel, sem o arquivo original embutido; ${corte}${filtros.length ? `; ${nomesDosFiltros(filtros)} já aplicado no pixel` : ''}`),
    );
  }

  const ajustes: CamadaDoArquivo[] = [];
  const preso = (nome: string, ajuste: Pick<CamadaDoArquivo, 'ajuste' | 'misturaDeCanais'>): void => {
    ajustes.push({ nome: `${no.nome}: ${nome}`, opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: true, bloqueada: false, ...ajuste });
    rel.camadas.push({
      prancheta: p.nome,
      camada: `${no.nome}: ${nome}`,
      tipo: 'ajuste',
      destino: 'nativo-editavel',
      mapeamento: 'ajuste-de-cor-da-foto',
      observacao: 'camada de ajuste presa à foto por máscara de recorte',
    });
  };
  // As duas contas do motor são lineares, e vão como ajustes lineares do Photoshop, que dão o mesmo resultado:
  // brilho e contraste como Níveis, saturação como Misturador de canais. (Os ajustes "Brilho/Contraste" e
  // "Matiz/Saturação" do Photoshop têm outra fórmula: medido em 2026-10-02, a foto saía 9 a 13 níveis diferente.)
  if (a && (a.brilho !== 0 || a.contraste !== 0)) preso('brilho e contraste', { ajuste: niveisDoBrilhoEContraste(a.brilho, a.contraste) });
  if (a && a.saturacao !== 0) preso('saturação', { misturaDeCanais: misturaDaSaturacao(a.saturacao) });
  if (a?.duotone)
    preso('duotone', {
      ajuste: {
        tipo: 'mapa-de-degrade',
        paradas: [
          { cor: resolverCor(doc, a.duotone.sombras), posicao: 0 },
          { cor: resolverCor(doc, a.duotone.luzes), posicao: 1 },
        ],
      },
    });
  return [foto, ...ajustes];
}

/** Vetor: um grupo com uma camada de forma por caminho (a cor de cada um fica editável no Photoshop). */
function camadasDoVetor(
  no: NoVetor,
  comum: CamadaDoArquivo,
  efeitos: EfeitosDoArquivo | undefined,
  soPixel: () => CamadaDoArquivo,
  detalhe: (t: string) => string,
  linha: Linha,
  cx: Contexto,
): CamadaDoArquivo[] {
  const { doc, p } = cx;
  const filtros = no.filtros ?? [];
  if (filtros.length > 0) {
    linha('raster-com-aviso', 'filtro-fora-de-foto', detalhe(`vetor com filtro (${nomesDosFiltros(filtros)}): no Photoshop, filtro editável só existe em objeto inteligente`));
    return [soPixel()];
  }
  const subcaminhos = no.caminhos.map((c) => subcaminhosDe(c.d));
  if (subcaminhos.some((s) => !s)) {
    linha('raster-com-aviso', 'vetor-fora-do-padrao', detalhe('vetor com caminho fora do padrão (só M, C e Z)'));
    return [soPixel()];
  }
  const sx = no.largura / no.moldura[0];
  const sy = no.altura / no.moldura[1];
  const girar = mapeador(no, cx);
  const f: Mapa = (x, y) => girar(no.x + x * sx, no.y + y * sy);
  const limpo = soOPixel(no) as NoVetor;
  const filhos = no.caminhos.map((c, i): CamadaDoArquivo => {
    const principal = c.preenchimento ?? (c.traco?.cor as string);
    const pixels = deslocar(cx.pixels?.camada(p, { ...limpo, caminhos: [c] }), cx);
    const camada: CamadaDoArquivo = {
      nome: `${no.nome} · ${resolverCor(doc, principal)}${no.caminhos.length > 1 ? ` (${i + 1})` : ''}`,
      opacidade: 1,
      modo: 'normal',
      oculta: false,
      recortadaNaDeBaixo: false,
      bloqueada: false,
      ...(pixels ? { pixels } : {}),
      preenchimento: { tipo: 'cor', cor: cor(doc, principal) },
      mascaraVetorial: (subcaminhos[i] ?? []).map((sub) => ({ ...nosDoSubcaminho(sub, f), regra: c.regra })),
    };
    // traço do caminho: traçado vetorial da camada de forma (editável no painel Propriedades do Photoshop)
    if (c.traco)
      camada.tracoVetorial = {
        cor: cor(doc, c.traco.cor),
        espessura: c.traco.espessura * Math.sqrt(sx * sy),
        ponta: c.traco.ponta,
        juncao: c.traco.juncao,
        comPreenchimento: c.preenchimento !== undefined,
      };
    return camada;
  });
  const comTraco = no.caminhos.filter((c) => c.traco).length;
  linha(
    'nativo-editavel',
    'no:vetor',
    detalhe(
      `vetor${no.origem ? ` importado (${no.origem.nome})` : ''}: grupo com ${filhos.length} ${filhos.length === 1 ? 'camada' : 'camadas'} de forma${comTraco ? `, ${comTraco} com traçado vetorial` : ''}`,
    ),
  );
  return [{ ...comum, ...(efeitos ? { efeitos } : {}), filhos }];
}

export interface PedidoDeMontagem {
  doc: Documento;
  /** as pranchetas que entram no arquivo, na ordem */
  pranchetas: readonly Prancheta[];
  /** várias pranchetas num arquivo só, cada uma como prancheta do Photoshop, lado a lado como no editor */
  comoPranchetas: boolean;
  fontes: readonly FonteDisponivel[];
  imagens: readonly ImagemDisponivel[];
  /** sem ela, a montagem não tem pixel: serve para o relatório */
  pixels?: FonteDePixels;
  rel: RelatorioDeExportacao;
}

function fundoDaPrancheta(p: Prancheta, cx: Contexto, comoPrancheta: boolean): CamadaDoArquivo {
  const fundo = cor(cx.doc, p.fundo);
  cx.rel.camadas.push({
    prancheta: p.nome,
    camada: 'Fundo',
    tipo: 'prancheta',
    destino: 'nativo-editavel',
    mapeamento: 'fundo-da-prancheta',
    observacao: comoPrancheta ? 'prancheta do Photoshop, com camada de preenchimento sólido' : 'camada de preenchimento sólido',
  });
  const camada: CamadaDoArquivo = { nome: 'Fundo', opacidade: 1, modo: 'normal', oculta: false, recortadaNaDeBaixo: false, bloqueada: false, preenchimento: { tipo: 'cor', cor: fundo } };
  if (cx.pixels) {
    const rgba = new Uint8Array(p.largura * p.altura * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = fundo.r;
      rgba[i + 1] = fundo.g;
      rgba[i + 2] = fundo.b;
      rgba[i + 3] = 255;
    }
    camada.pixels = { x: cx.dx, y: cx.dy, largura: p.largura, altura: p.altura, rgba };
  }
  return camada;
}

/** Monta as camadas do arquivo e preenche o relatório. Uma prancheta: o arquivo é ela. Várias: uma prancheta do Photoshop para cada. */
export function montar(pedido: PedidoDeMontagem): Montagem {
  const { doc, pranchetas, rel } = pedido;
  const imagens = new Map(pedido.imagens.map((i) => [i.arquivo, i]));
  const embutidos = new Map<string, ArquivoEmbutido>();
  const contexto = (p: Prancheta, dx: number): Contexto => ({ doc, p, dx, dy: 0, fontes: pedido.fontes, imagens, pixels: pedido.pixels, rel, embutidos });
  const primeira = pranchetas[0];
  if (!primeira) throw new Error('A exportação precisa de pelo menos uma prancheta');

  if (!pedido.comoPranchetas) {
    if (pranchetas.length !== 1) throw new Error('Arquivo sem pranchetas do Photoshop leva uma prancheta só');
    const cx = contexto(primeira, 0);
    const camadas = [fundoDaPrancheta(primeira, cx, false), ...primeira.filhos.flatMap((n) => camadasDoNo(n, cx))];
    return { largura: primeira.largura, altura: primeira.altura, camadas, embutidos: [...embutidos.values()], posicoes: new Map([[primeira.id, { x: 0, y: 0 }]]) };
  }

  const posicoes = disporPranchetas(pranchetas);
  let largura = 0;
  const camadas = pranchetas.map((p): CamadaDoArquivo => {
    const dx = posicoes.get(p.id)?.x ?? 0;
    largura = Math.max(largura, dx + p.largura);
    const cx = contexto(p, dx);
    return {
      nome: p.nome,
      opacidade: 1,
      modo: 'atravessar',
      oculta: false,
      recortadaNaDeBaixo: false,
      bloqueada: false,
      prancheta: { x: dx, y: 0, largura: p.largura, altura: p.altura, fundo: cor(doc, p.fundo) },
      filhos: [fundoDaPrancheta(p, cx, true), ...p.filhos.flatMap((n) => camadasDoNo(n, cx))],
    };
  });
  return { largura, altura: Math.max(...pranchetas.map((p) => p.altura)), camadas, embutidos: [...embutidos.values()], posicoes };
}
