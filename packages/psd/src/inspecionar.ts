// A inspeção do PSD antes de qualquer decodificação. PSD é entrada de terceiro: o arquivo pode estar cortado, mentir
// sobre os próprios tamanhos, ou dizer que tem uma camada de 30.000 × 30.000 px em vinte bytes. Aqui se lê só a
// estrutura (cabeçalho, recursos e os registros de camada), direto dos bytes, sem biblioteca e sem alocar pixel, e se
// recusa o que passa dos tetos ou o que a v1 não tem (ADR 028, item 3: RGB, 8 bits). Só o que passa daqui chega a quem
// decodifica.
//
// Formato: Adobe Photoshop File Formats Specification. Tudo em big-endian. PSB (versão 2) usa 8 bytes onde o PSD usa 4
// nos tamanhos da seção de camadas e de cada canal.

export type CodigoDeErroDeImportacao =
  /** não tem a assinatura nem a versão de um PSD ou PSB */
  | 'nao-e-psd'
  | 'arquivo-grande-demais'
  | 'dimensoes-grandes-demais'
  /** CMYK, tons de cinza, Lab, indexado, bitmap, duotone, multicanal */
  | 'modo-de-cor'
  /** 16 ou 32 bits por canal */
  | 'profundidade'
  | 'camadas-demais'
  | 'grupos-fundos-demais'
  /** uma camada, ou a soma delas, declara mais pixel do que o teto */
  | 'pixels-demais'
  /** um tamanho declarado passa do fim do arquivo */
  | 'arquivo-truncado'
  /** a estrutura não faz sentido (tamanho zero, área negativa, bloco que não fecha) */
  | 'arquivo-malformado';

/** O arquivo não pode ser importado, e por quê. `codigo` é para a interface escolher a frase; `message` é texto pronto, em português. */
export class ErroDeImportacao extends Error {
  readonly codigo: CodigoDeErroDeImportacao;
  constructor(codigo: CodigoDeErroDeImportacao, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeImportacao';
    this.codigo = codigo;
  }
}

export interface LimitesDeImportacao {
  bytesDoArquivo: number;
  /** maior lado do documento, em pixels */
  lado: number;
  /** largura × altura do documento */
  pixelsDoDocumento: number;
  /** registros de camada do arquivo (cada grupo conta dois: o começo e o fim) */
  camadas: number;
  profundidadeDeGrupo: number;
  /** largura × altura da maior camada (ou máscara): é o maior bloco de memória que a importação aloca de uma vez */
  pixelsDaMaiorCamada: number;
  /** soma da área de todas as camadas e máscaras: limita o tempo */
  pixelsDeTodasAsCamadas: number;
}

/**
 * Os tetos padrão. O lado é o da prancheta do Otto (e do PSD comum); a maior camada é o maior bloco que o motor aloca
 * de uma vez (64 milhões de pixels são 256 MB em RGBA); dez níveis de grupo é o que o próprio Photoshop permite.
 */
export const LIMITES_DE_IMPORTACAO: LimitesDeImportacao = {
  bytesDoArquivo: 300 * 1024 * 1024,
  lado: 30_000,
  pixelsDoDocumento: 100_000_000,
  camadas: 1_000,
  profundidadeDeGrupo: 10,
  pixelsDaMaiorCamada: 64_000_000,
  pixelsDeTodasAsCamadas: 400_000_000,
};

export interface PsdInspecionado {
  formato: 'psd' | 'psb';
  largura: number;
  altura: number;
  canais: number;
  bits: number;
  modoDeCor: 'rgb';
  /** registros de camada (cada grupo conta dois) */
  camadas: number;
  profundidadeDeGrupo: number;
  /** área da maior camada ou máscara, em pixels */
  maiorCamada: number;
  /** soma das áreas de todas as camadas e máscaras */
  pixelsDasCamadas: number;
  /** o perfil ICC embutido (recurso 1039), se houver */
  perfilDeCor?: Uint8Array;
}

const MODOS: Record<number, string> = { 0: 'bitmap', 1: 'tons de cinza', 2: 'cores indexadas', 3: 'RGB', 4: 'CMYK', 7: 'multicanal', 8: 'duotone', 9: 'Lab' };
const milhoes = (n: number): string => `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões de pixels`;
const megas = (n: number): string => `${Math.round(n / 1024 / 1024)} MB`;

/** Leitor com posição, que recusa qualquer leitura além do fim. */
class Leitor {
  private readonly v: DataView;
  p = 0;
  constructor(private readonly bytes: Uint8Array) {
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get fim(): number {
    return this.bytes.length;
  }
  private exigir(n: number): void {
    if (n < 0 || this.p + n > this.bytes.length)
      throw new ErroDeImportacao('arquivo-truncado', 'O arquivo está incompleto: termina antes do que ele próprio declara. Salve de novo no Photoshop e tente outra vez.');
  }
  u8(): number {
    this.exigir(1);
    return this.v.getUint8(this.p++);
  }
  u16(): number {
    this.exigir(2);
    this.p += 2;
    return this.v.getUint16(this.p - 2);
  }
  i16(): number {
    this.exigir(2);
    this.p += 2;
    return this.v.getInt16(this.p - 2);
  }
  u32(): number {
    this.exigir(4);
    this.p += 4;
    return this.v.getUint32(this.p - 4);
  }
  i32(): number {
    this.exigir(4);
    this.p += 4;
    return this.v.getInt32(this.p - 4);
  }
  /** tamanho de 4 bytes (PSD) ou de 8 (PSB). Acima de 2^53 não cabe em arquivo nenhum: é truncado. */
  tamanho(largo: boolean): number {
    if (!largo) return this.u32();
    const alto = this.u32();
    const baixo = this.u32();
    if (alto > 0x1fffff) this.exigir(Number.MAX_SAFE_INTEGER);
    return alto * 2 ** 32 + baixo;
  }
  texto(n: number): string {
    this.exigir(n);
    let t = '';
    for (let i = 0; i < n; i++) t += String.fromCharCode(this.v.getUint8(this.p + i));
    this.p += n;
    return t;
  }
  pular(n: number): void {
    this.exigir(n);
    this.p += n;
  }
  fatia(n: number): Uint8Array {
    this.exigir(n);
    this.p += n;
    return this.bytes.subarray(this.p - n, this.p);
  }
}

/** Blocos de informação adicional da camada cujo tamanho, no PSB, tem 8 bytes. */
const BLOCOS_LARGOS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD', 'cinf']);

/**
 * Lê a estrutura do PSD e confere os tetos. Não decodifica pixel nem aloca nada do tamanho da imagem.
 * Lança ErroDeImportacao quando o arquivo não é PSD, é de um modo que a v1 não tem, passa de um teto, está cortado
 * ou não faz sentido.
 */
export function inspecionarPsd(bytes: Uint8Array, limites: Partial<LimitesDeImportacao> = {}): PsdInspecionado {
  const teto = { ...LIMITES_DE_IMPORTACAO, ...limites };
  if (bytes.length < 26 || String.fromCharCode(bytes[0] as number, bytes[1] as number, bytes[2] as number, bytes[3] as number) !== '8BPS')
    throw new ErroDeImportacao('nao-e-psd', 'O arquivo não é um PSD nem um PSB.');
  if (bytes.length > teto.bytesDoArquivo)
    throw new ErroDeImportacao(
      'arquivo-grande-demais',
      `O arquivo tem ${megas(bytes.length)} (${bytes.length} bytes), e o Otto importa até ${megas(teto.bytesDoArquivo)} (${teto.bytesDoArquivo} bytes).`,
    );
  const l = new Leitor(bytes);
  l.pular(4);
  const versao = l.u16();
  if (versao !== 1 && versao !== 2) throw new ErroDeImportacao('nao-e-psd', `O arquivo diz ser um PSD de versão ${versao}, que não existe.`);
  const psb = versao === 2;
  l.pular(6);
  const canais = l.u16();
  const altura = l.u32();
  const largura = l.u32();
  const bits = l.u16();
  const modo = l.u16();
  if (largura === 0 || altura === 0 || canais === 0 || canais > 56) throw new ErroDeImportacao('arquivo-malformado', 'O cabeçalho do arquivo não faz sentido (largura, altura ou canais inválidos).');
  if (modo !== 3)
    throw new ErroDeImportacao(
      'modo-de-cor',
      `O arquivo está em ${MODOS[modo] ?? `um modo de cor desconhecido (${modo})`}, e o Otto trabalha só em RGB. No Photoshop: Imagem > Modo > Cores RGB, e salve de novo. O Otto não converte sozinho, porque a conversão muda as cores.`,
    );
  if (bits !== 8)
    throw new ErroDeImportacao(
      'profundidade',
      `O arquivo está em ${bits} bits por canal, e o Otto trabalha em 8. No Photoshop: Imagem > Modo > 8 Bits/Canal, e salve de novo. O Otto não converte sozinho.`,
    );
  if (largura > teto.lado || altura > teto.lado) throw new ErroDeImportacao('dimensoes-grandes-demais', `O arquivo tem ${largura} × ${altura} px, e o maior lado que o Otto aceita é ${teto.lado} px.`);
  if (largura * altura > teto.pixelsDoDocumento)
    throw new ErroDeImportacao('dimensoes-grandes-demais', `O arquivo tem ${largura} × ${altura} px (${milhoes(largura * altura)}), e o Otto importa até ${milhoes(teto.pixelsDoDocumento)}.`);

  // dados do modo de cor (vazio em RGB) e recursos de imagem
  l.pular(l.u32());
  const fimDosRecursos = l.u32() + l.p;
  if (fimDosRecursos > l.fim) l.pular(l.fim);
  let perfilDeCor: Uint8Array | undefined;
  while (l.p + 12 <= fimDosRecursos) {
    const assinatura = l.texto(4);
    if (assinatura !== '8BIM' && assinatura !== 'MeSa' && assinatura !== 'AgHg' && assinatura !== 'PHUT' && assinatura !== 'DCSR')
      throw new ErroDeImportacao('arquivo-malformado', 'A seção de recursos do arquivo não faz sentido.');
    const numero = l.u16();
    // nome: um byte de tamanho e o texto, alinhado a par
    const nome = l.u8();
    l.pular(nome + ((nome + 1) % 2));
    const tamanho = l.u32();
    if (l.p + tamanho > fimDosRecursos) l.pular(l.fim);
    const dados = l.fatia(tamanho);
    if (tamanho % 2 && l.p < fimDosRecursos) l.pular(1);
    if (numero === 1039) perfilDeCor = dados;
  }
  l.p = fimDosRecursos;

  // seção de camadas e máscaras
  const tamanhoDaSecao = l.tamanho(psb);
  const fimDaSecao = l.p + tamanhoDaSecao;
  if (fimDaSecao > l.fim) l.pular(l.fim);
  let camadas = 0;
  let profundidade = 0;
  let maiorProfundidade = 0;
  let maiorCamada = 0;
  let pixelsDasCamadas = 0;
  const contar = (topo: number, esquerda: number, base: number, direita: number): void => {
    const w = direita - esquerda;
    const h = base - topo;
    if (w < 0 || h < 0) throw new ErroDeImportacao('arquivo-malformado', 'O arquivo tem uma camada com área negativa.');
    const area = w * h;
    if (area > teto.pixelsDaMaiorCamada)
      throw new ErroDeImportacao('pixels-demais', `O arquivo tem uma camada de ${w} × ${h} px (${milhoes(area)}), e o Otto importa camadas de até ${milhoes(teto.pixelsDaMaiorCamada)}.`);
    maiorCamada = Math.max(maiorCamada, area);
    pixelsDasCamadas += area;
    if (pixelsDasCamadas > teto.pixelsDeTodasAsCamadas)
      throw new ErroDeImportacao(
        'pixels-demais',
        `As camadas do arquivo somam mais de ${milhoes(teto.pixelsDeTodasAsCamadas)}, que é o que o Otto importa de uma vez. Junte ou apague camadas no Photoshop e tente de novo.`,
      );
  };
  if (tamanhoDaSecao > 0) {
    const tamanhoDaLista = l.tamanho(psb);
    const fimDaLista = l.p + tamanhoDaLista;
    if (fimDaLista > fimDaSecao) l.pular(l.fim);
    if (tamanhoDaLista > 0) {
      camadas = Math.abs(l.i16());
      if (camadas > teto.camadas) throw new ErroDeImportacao('camadas-demais', `O arquivo tem ${camadas} camadas (cada grupo conta duas), e o Otto importa até ${teto.camadas}.`);
      let dadosDosCanais = 0;
      for (let i = 0; i < camadas; i++) {
        const topo = l.i32();
        const esquerda = l.i32();
        const base = l.i32();
        const direita = l.i32();
        contar(topo, esquerda, base, direita);
        const canaisDaCamada = l.u16();
        if (canaisDaCamada > 56) throw new ErroDeImportacao('arquivo-malformado', 'O arquivo tem uma camada com um número de canais que não existe.');
        for (let c = 0; c < canaisDaCamada; c++) {
          l.pular(2);
          dadosDosCanais += l.tamanho(psb);
        }
        const assinatura = l.texto(4);
        if (assinatura !== '8BIM') throw new ErroDeImportacao('arquivo-malformado', 'O registro de uma camada do arquivo não faz sentido.');
        // modo de mesclagem, opacidade, recorte, sinalizadores e preenchimento
        l.pular(8);
        const fimDoExtra = l.u32() + l.p;
        if (fimDoExtra > fimDaLista) l.pular(l.fim);
        // máscara de camada: a área dela também é pixel a decodificar
        const tamanhoDaMascara = l.u32();
        if (tamanhoDaMascara >= 16) {
          const fimDaMascara = l.p + tamanhoDaMascara;
          contar(l.i32(), l.i32(), l.i32(), l.i32());
          // máscara "real" (a de pixels, quando há também a vetorial): outra área, no fim do bloco
          if (tamanhoDaMascara >= 36) {
            l.p = fimDaMascara - 16;
            contar(l.i32(), l.i32(), l.i32(), l.i32());
          }
          l.p = fimDaMascara;
          if (l.p > fimDoExtra) l.pular(l.fim);
        } else l.pular(tamanhoDaMascara);
        // faixas de mesclagem e nome (alinhado a 4)
        l.pular(l.u32());
        const nome = l.u8();
        l.pular(nome + ((4 - ((nome + 1) % 4)) % 4));
        // blocos de informação adicional: só interessa o divisor de seção, que diz onde os grupos começam e terminam
        while (l.p + 12 <= fimDoExtra) {
          const marca = l.texto(4);
          if (marca !== '8BIM' && marca !== '8B64') break;
          const chave = l.texto(4);
          const tamanhoDoBloco = l.tamanho(psb && BLOCOS_LARGOS.has(chave));
          const fimDoBloco = l.p + tamanhoDoBloco;
          if (fimDoBloco > fimDoExtra) break;
          if ((chave === 'lsct' || chave === 'lsdk') && tamanhoDoBloco >= 4) {
            const tipo = l.u32();
            // no arquivo as camadas vêm de baixo para cima: o marcador de fim do grupo (3) chega antes do cabeçalho dele (1 ou 2)
            if (tipo === 3) {
              profundidade++;
              maiorProfundidade = Math.max(maiorProfundidade, profundidade);
              if (maiorProfundidade > teto.profundidadeDeGrupo)
                throw new ErroDeImportacao('grupos-fundos-demais', `O arquivo tem grupos dentro de grupos em mais de ${teto.profundidadeDeGrupo} níveis, que é o que o Otto importa.`);
            } else if (tipo === 1 || tipo === 2) profundidade = Math.max(0, profundidade - 1);
          }
          // o tamanho do bloco é alinhado a par
          l.p = fimDoBloco + (tamanhoDoBloco % 2);
        }
        l.p = fimDoExtra;
      }
      // os dados de pixel de todos os canais têm de caber no que sobra da lista
      if (l.p + dadosDosCanais > fimDaLista) l.pular(l.fim);
    }
  }
  l.p = fimDaSecao;

  // a imagem composta: o tipo de compressão e, pelo menos, o que ele obriga a existir
  const compressao = l.u16();
  if (compressao === 0) l.pular(largura * altura * canais);
  else if (compressao === 1) {
    // RLE: uma tabela com o tamanho de cada linha de cada canal, e depois as linhas
    let linhas = 0;
    for (let i = 0; i < altura * canais; i++) linhas += psb ? l.u32() : l.u16();
    l.pular(linhas);
  } else throw new ErroDeImportacao('arquivo-malformado', 'A imagem composta do arquivo usa uma compressão que o formato não prevê em RGB de 8 bits.');

  return {
    formato: psb ? 'psb' : 'psd',
    largura,
    altura,
    canais,
    bits,
    modoDeCor: 'rgb',
    camadas,
    profundidadeDeGrupo: maiorProfundidade,
    maiorCamada,
    pixelsDasCamadas,
    ...(perfilDeCor ? { perfilDeCor } : {}),
  };
}
