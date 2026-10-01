// Adaptador SVG da porta FormatoDeArquivoEmCamadas (ADR 034, item 4). Escrito aqui, sem biblioteca: o formato é texto.
// Só traduz o modelo da porta; o que vira vetor, imagem ou fica de fora foi decidido em montar-vetorial.ts.
//
// O que o Illustrator precisa achar no arquivo: cada camada com o nome dela no `id` (ele mostra o id como nome),
// o texto como <text>, a imagem embutida em base64 e os recortes como <clipPath>.
import type { ModoDoGrupo } from '@otto/documento';
import type { ArquivoEmCamadas, ArquivoGravado, CamadaDoArquivo, CaminhoDoArquivo, DegradeDoArquivo, FormatoDeArquivoEmCamadas, PreenchimentoDoArquivo, Rgb } from '../porta';

/** Modo de mesclagem do Otto → `mix-blend-mode` do SVG. Só os que o SVG tem chegam aqui. */
const MODO: Partial<Record<ModoDoGrupo, string>> = {
  escurecer: 'darken',
  multiplicacao: 'multiply',
  'subexposicao-de-cores': 'color-burn',
  clarear: 'lighten',
  tela: 'screen',
  'superexposicao-de-cores': 'color-dodge',
  sobrepor: 'overlay',
  'luz-suave': 'soft-light',
  'luz-direta': 'hard-light',
  diferenca: 'difference',
  exclusao: 'exclusion',
  matiz: 'hue',
  saturacao: 'saturation',
  cor: 'color',
  luminosidade: 'luminosity',
};

/** Número curto e estável: três casas, sem zero à direita. */
const n = (v: number): string => {
  const t = (Math.round(v * 1000) / 1000).toString();
  return t === '-0' ? '0' : t;
};
const hex = (c: Rgb): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const xml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const matriz = (m: readonly number[]): string => `matrix(${m.map(n).join(' ')})`;

/**
 * O nome da camada como `id` do SVG, na convenção que o Illustrator usa ao gravar e desfaz ao abrir: espaço vira "_",
 * e o que não cabe num nome XML vira "_xHH_" com o código do caractere.
 */
export function idDoSvg(nome: string): string {
  let id = '';
  for (const c of nome) {
    if (c === ' ') id += '_';
    else if (/[A-Za-z0-9.\-À-ɏ]/.test(c)) id += c;
    else id += `_x${(c.codePointAt(0) as number).toString(16).toUpperCase()}_`;
  }
  // um nome XML não começa por número, ponto ou traço
  return /^[A-Za-z_À-ɏ]/.test(id) ? id : `_x${(id.codePointAt(0) as number).toString(16).toUpperCase()}_${id.slice(1)}`;
}

function base64(bytes: Uint8Array): string {
  const TABELA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let saida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    saida += TABELA[a >> 2];
    saida += TABELA[((a & 3) << 4) | ((b ?? 0) >> 4)];
    saida += b === undefined ? '=' : TABELA[((b & 15) << 2) | ((c ?? 0) >> 6)];
    saida += c === undefined ? '=' : TABELA[c & 63];
  }
  return saida;
}

/** O caminho em sintaxe de SVG: M, C e Z. */
export function caminhoEmSvg(caminhos: readonly CaminhoDoArquivo[]): string {
  return caminhos
    .map((c) => {
      const primeiro = c.nos[0];
      if (!primeiro) return '';
      let d = `M${n(primeiro.ancora[0])} ${n(primeiro.ancora[1])}`;
      for (let i = 1; i < c.nos.length; i++) {
        const de = c.nos[i - 1] as (typeof c.nos)[number];
        const para = c.nos[i] as (typeof c.nos)[number];
        d += `C${n(de.saida[0])} ${n(de.saida[1])} ${n(para.chegada[0])} ${n(para.chegada[1])} ${n(para.ancora[0])} ${n(para.ancora[1])}`;
      }
      if (!c.aberto) {
        const ultimo = c.nos[c.nos.length - 1] as (typeof c.nos)[number];
        d += `C${n(ultimo.saida[0])} ${n(ultimo.saida[1])} ${n(primeiro.chegada[0])} ${n(primeiro.chegada[1])} ${n(primeiro.ancora[0])} ${n(primeiro.ancora[1])}Z`;
      }
      return d;
    })
    .join('');
}
const regra = (caminhos: readonly CaminhoDoArquivo[]): string => (caminhos.some((c) => c.regra === 'par-impar') ? 'evenodd' : 'nonzero');

class Escritor {
  private readonly ids = new Set<string>();
  private definicoes: string[] = [];
  private recursos = 0;

  /** id único no arquivo, a partir do nome da camada */
  id(nome: string): string {
    const base = idDoSvg(nome);
    let id = base;
    for (let k = 2; this.ids.has(id); k++) id = `${base}_${k}`;
    this.ids.add(id);
    return id;
  }

  private recurso(prefixo: string): string {
    return this.id(`${prefixo}-${++this.recursos}`);
  }

  private degrade(d: DegradeDoArquivo): string {
    const id = this.recurso('degrade');
    const g = d.geometria;
    if (!g) throw new Error('Degradê sem geometria não tem como ir para o SVG');
    const paradas = d.paradas.map((q) => `<stop offset="${n(q.posicao)}" stop-color="${hex(q.cor)}"${q.opacidade < 1 ? ` stop-opacity="${n(q.opacidade)}"` : ''}/>`).join('');
    const transformacao = g.matriz ? ` gradientTransform="${matriz(g.matriz)}"` : '';
    if (d.estilo === 'radial')
      this.definicoes.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(g.x0)}" cy="${n(g.y0)}" r="${n(Math.hypot(g.x1 - g.x0, g.y1 - g.y0))}"${transformacao}>${paradas}</radialGradient>`,
      );
    else this.definicoes.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(g.x0)}" y1="${n(g.y0)}" x2="${n(g.x1)}" y2="${n(g.y1)}"${transformacao}>${paradas}</linearGradient>`);
    return `url(#${id})`;
  }

  private tinta(p: PreenchimentoDoArquivo): string {
    return p.tipo === 'cor' ? hex(p.cor) : this.degrade(p);
  }

  private recorte(caminhos: readonly CaminhoDoArquivo[]): string {
    const id = this.recurso('recorte');
    this.definicoes.push(`<clipPath id="${id}"><path d="${caminhoEmSvg(caminhos)}" clip-rule="${regra(caminhos)}"/></clipPath>`);
    return `url(#${id})`;
  }

  /** Atributos que toda camada leva: opacidade, modo de mesclagem e visibilidade. */
  private comuns(c: CamadaDoArquivo): string {
    const modo = MODO[c.modo];
    const estilo = [modo ? `mix-blend-mode:${modo}` : '', c.filhos && c.modo === 'normal' ? 'isolation:isolate' : ''].filter(Boolean).join(';');
    return `${c.opacidade < 1 ? ` opacity="${n(c.opacidade)}"` : ''}${estilo ? ` style="${estilo}"` : ''}${c.oculta ? ' display="none"' : ''}`;
  }

  /** O elemento da camada, sem o recorte de quem a contém. */
  private elemento(c: CamadaDoArquivo): string {
    const id = this.id(c.nome);
    const comuns = this.comuns(c);
    if (c.filhos) return `<g id="${id}"${comuns}>${this.lista(c.filhos)}</g>`;
    if (c.texto) {
      const t = c.texto;
      // a família primeiro (é por ela e pelo peso que navegador e Illustrator acham a fonte); o nome PostScript de reserva
      const fonte = (e: { fonte: string; familia?: string }): string => xml(e.familia ? `'${e.familia}', '${e.fonte}'` : `'${e.fonte}'`);
      const espaco = (e: { espacamento: number; tamanho: number }): string => (e.espacamento ? ` letter-spacing="${n((e.espacamento / 1000) * e.tamanho)}"` : '');
      const linhas = (t.linhas ?? [])
        .map((l) =>
          l.pedacos
            .map((p, i) => {
              const e = p.estilo;
              const proprio = [
                e.fonte !== t.estilo.fonte ? ` font-family="${fonte(e)}"` : '',
                e.peso !== undefined && e.peso !== t.estilo.peso ? ` font-weight="${e.peso}"` : '',
                e.tamanho !== t.estilo.tamanho ? ` font-size="${n(e.tamanho)}"` : '',
                hex(e.cor) !== hex(t.estilo.cor) ? ` fill="${hex(e.cor)}"` : '',
                e.espacamento !== t.estilo.espacamento || e.tamanho !== t.estilo.tamanho ? ` letter-spacing="${n((e.espacamento / 1000) * e.tamanho)}"` : '',
              ].join('');
              // só o primeiro pedaço da linha diz onde ela começa: os outros seguem o texto
              return `<tspan${i === 0 ? ` x="${n(l.x)}" y="${n(l.base)}"` : ''}${proprio}>${xml(p.texto)}</tspan>`;
            })
            .join(''),
        )
        .join('');
      return `<text id="${id}"${comuns} transform="${matriz(t.transformacao)}" font-family="${fonte(t.estilo)}"${t.estilo.peso !== undefined ? ` font-weight="${t.estilo.peso}"` : ''} font-size="${n(t.estilo.tamanho)}" fill="${hex(t.estilo.cor)}"${espaco(t.estilo)}${t.estilo.kerning ? '' : ' font-kerning="none"'} xml:space="preserve">${linhas}</text>`;
    }
    if (c.imagem) {
      const i = c.imagem;
      const recorte = c.mascaraVetorial ? ` clip-path="${this.recorte(c.mascaraVetorial)}"` : '';
      const imagem = `<image${recorte ? '' : ` id="${id}"${comuns}`} width="${i.largura}" height="${i.altura}" transform="${matriz(i.transformacao)}" preserveAspectRatio="none" xlink:href="data:image/${i.tipo};base64,${base64(i.bytes)}"/>`;
      // o recorte fica num grupo em volta: a imagem tem transformação própria, e o caminho do recorte está em coordenadas da prancheta
      return recorte ? `<g id="${id}"${comuns}${recorte}>${imagem}</g>` : imagem;
    }
    if (c.preenchimento && c.mascaraVetorial) {
      const d = caminhoEmSvg(c.mascaraVetorial);
      const regraDoCaminho = regra(c.mascaraVetorial) === 'evenodd' ? ' fill-rule="evenodd"' : '';
      if (c.tracoVetorial) {
        const t = c.tracoVetorial;
        const ponta = { reta: 'butt', redonda: 'round', quadrada: 'square' }[t.ponta];
        const juncao = { angular: 'miter', redonda: 'round', chanfrada: 'bevel' }[t.juncao];
        return `<path id="${id}"${comuns} d="${d}" fill="${t.comPreenchimento ? this.tinta(c.preenchimento) : 'none'}"${regraDoCaminho} stroke="${hex(t.cor)}" stroke-width="${n(t.espessura)}" stroke-linecap="${ponta}" stroke-linejoin="${juncao}"/>`;
      }
      const traco = c.efeitos?.tracoInterno;
      if (!traco) return `<path id="${id}"${comuns} d="${d}" fill="${this.tinta(c.preenchimento)}"${regraDoCaminho}/>`;
      // traço por dentro: o contorno com o dobro da espessura, cortado pela própria forma
      return `<g id="${id}"${comuns}><path d="${d}" fill="${this.tinta(c.preenchimento)}"${regraDoCaminho}/><path d="${d}" fill="none" stroke="${hex(traco.cor)}" stroke-width="${n(traco.espessura * 2)}" clip-path="${this.recorte(c.mascaraVetorial)}"/></g>`;
    }
    // camada sem nada a desenhar (texto sem fonte, imagem que não veio): um grupo vazio guarda o nome
    return `<g id="${id}"${comuns}/>`;
  }

  private camada(c: CamadaDoArquivo): string {
    const elemento = this.elemento(c);
    return c.recorteVetorial ? `<g clip-path="${this.recorte(c.recorteVetorial)}">${elemento}</g>` : elemento;
  }

  /** As camadas de uma lista, de baixo para cima. As presas à de baixo entram num grupo cortado pela forma dela. */
  lista(camadas: readonly CamadaDoArquivo[]): string {
    let saida = '';
    for (let i = 0; i < camadas.length; i++) {
      const base = camadas[i] as CamadaDoArquivo;
      saida += this.camada(base);
      const presas: CamadaDoArquivo[] = [];
      while (camadas[i + 1]?.recortadaNaDeBaixo) presas.push(camadas[++i] as CamadaDoArquivo);
      if (presas.length === 0) continue;
      const forma = base.mascaraVetorial ?? base.filhos?.flatMap((f) => f.mascaraVetorial ?? []) ?? [];
      saida += `<g clip-path="${this.recorte(forma)}">${presas.map((p) => this.camada(p)).join('')}</g>`;
    }
    return saida;
  }

  defs(): string {
    return this.definicoes.length > 0 ? `<defs>${this.definicoes.join('')}</defs>` : '';
  }
}

export function criarFormatoSvg(): FormatoDeArquivoEmCamadas {
  return {
    capacidades: { paginas: false, degradeTransparente: true },
    escrever(arquivo: ArquivoEmCamadas): ArquivoGravado {
      if (arquivo.camadas.some((c) => c.prancheta)) throw new Error('O SVG leva uma prancheta por arquivo');
      const e = new Escritor();
      const corpo = e.lista(arquivo.camadas);
      const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${arquivo.largura}" height="${arquivo.altura}" viewBox="0 0 ${arquivo.largura} ${arquivo.altura}">${arquivo.titulo ? `<title>${xml(arquivo.titulo)}</title>` : ''}${e.defs()}${corpo}</svg>\n`;
      return { bytes: new TextEncoder().encode(svg), extensao: 'svg' };
    },
  };
}
