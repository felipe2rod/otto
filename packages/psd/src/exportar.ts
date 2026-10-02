// A exportação: junta o mapeamento (montar.ts), o render de referência em CPU (@otto/render) e a porta do formato.
// Recursos entram por parâmetro, como bytes: este pacote não lê disco, rede nem armazenamento, e quem confere a conta
// dona de cada arquivo é quem chama. Grava sempre a composta, o pixel de toda camada, os dados editáveis e o relatório
// (ADR 028, item 2).
import type { Documento, No, NoTexto, NoVisual, Prancheta } from '@otto/documento';
import { alturaDaMaiuscula, codificarPng, criarSessao, escolherFonte, limitesDoNo, nomePostScript, renderizarMascara, renderizarPrancheta, type Sessao } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { type FonteDePixels, type FonteDisponivel, type ImagemDisponivel, montar, type TipoDeImagem } from './montar';
import { perfilSrgb } from './perfil-srgb';
import type { FormatoDeArquivoEmCamadas, MascaraDoArquivo, PixelsDoArquivo } from './porta';
import { fecharRelatorio, type RelatorioDeExportacao, relatorioVazio } from './relatorio';

export interface FonteDaExportacao {
  familia: string;
  peso: number;
  bytes: Uint8Array;
  /** nome PostScript; sem ele, é lido do arquivo */
  postScript?: string;
  /** nome do arquivo, para o relatório */
  arquivo?: string;
}

export interface ImagemDaExportacao {
  /** chave pela qual o documento referencia o arquivo: o sha256 do conteúdo */
  arquivo: string;
  bytes: Uint8Array;
  /** sem ele, sai dos primeiros bytes do arquivo */
  tipo?: TipoDeImagem;
}

export interface RecursosDaExportacao {
  fontes: readonly FonteDaExportacao[];
  /** as fotos do documento e as máscaras de sujeito */
  imagens: readonly ImagemDaExportacao[];
}

/** O que o relatório precisa saber dos recursos, sem os bytes: é o que a API tem no banco. */
export interface RecursosConhecidos {
  fontes: readonly FonteDisponivel[];
  imagens: readonly { arquivo: string; tipo: TipoDeImagem }[];
}

export interface OpcoesDeExportacao {
  /** nome da peça: vira nome de arquivo */
  nome: string;
  /** ids das pranchetas, na ordem do documento. Sem isto, todas. */
  pranchetas?: readonly string[];
  /**
   * 'por-prancheta' (padrão): um arquivo por prancheta. 'juntas': um arquivo só, cada prancheta como prancheta do Photoshop.
   */
  arquivos?: 'por-prancheta' | 'juntas';
  /**
   * Chamada entre uma prancheta e outra e a cada camada renderizada. A exportação é trabalho de CPU e bloqueia o processo:
   * quem roda num worker com sinal de vida devolve aqui uma promessa que cede a vez (por exemplo, setImmediate).
   */
  entreEtapas?: () => Promise<void> | void;
}

export interface ArquivoExportado {
  nome: string;
  bytes: Uint8Array;
}

export interface ResultadoDaExportacao {
  arquivos: ArquivoExportado[];
  relatorio: RelatorioDeExportacao;
}

/** Tipo da imagem pelos primeiros bytes. O motor decodifica PNG, JPEG e WebP. */
export function tipoDaImagem(bytes: Uint8Array): TipoDeImagem | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return undefined;
}

/** Nome de arquivo seguro em qualquer sistema: sem barra, dois-pontos e afins. */
export function nomeDeArquivo(nome: string): string {
  const limpo = nome
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo || 'sem nome';
}

function pranchetasPedidas(doc: Documento, ids: readonly string[] | undefined): Prancheta[] {
  if (!ids) return doc.pranchetas;
  const desconhecida = ids.find((id) => !doc.pranchetas.some((p) => p.id === id));
  if (desconhecida) throw new Error(`A prancheta "${desconhecida}" não existe no documento`);
  return doc.pranchetas.filter((p) => ids.includes(p.id));
}

function fontesDisponiveis(fontes: readonly FonteDaExportacao[]): FonteDisponivel[] {
  return fontes.map((f) => {
    const postScript = f.postScript ?? nomePostScript(f.bytes);
    if (!postScript) throw new Error(`O arquivo da fonte ${f.familia} ${f.peso} não tem nome PostScript: sem ele o Photoshop não acha a fonte`);
    return { familia: f.familia, peso: f.peso, postScript, ...(f.arquivo ? { arquivo: f.arquivo } : {}) };
  });
}

function imagensDisponiveis(sessao: Sessao, imagens: readonly ImagemDaExportacao[]): ImagemDisponivel[] {
  return imagens.map((i) => {
    const tipo = i.tipo ?? tipoDaImagem(i.bytes);
    if (!tipo) throw new Error(`A imagem ${i.arquivo.slice(0, 12)} não é PNG, JPEG nem WebP`);
    const decodificada = sessao.imagem(i.arquivo);
    return { arquivo: i.arquivo, tipo, bytes: i.bytes, ...(decodificada ? { largura: decodificada.width(), altura: decodificada.height() } : {}) };
  });
}

/**
 * Onde o motor pôs a primeira linha do texto: a linha de base (y na prancheta, antes da rotação), a altura que o texto
 * ocupa, a largura da linha mais larga e a altura da maiúscula da primeira linha, em pixels. Texto sem fonte: undefined.
 * A exportação usa para pôr a caixa onde o Photoshop assenta a primeira linha; a importação, para o caminho de volta.
 */
export function primeiraLinhaDoTexto(sessao: Sessao, fontes: readonly FonteDaExportacao[], no: NoTexto): { base: number; alturaUsada: number; larguraMaxima: number; maiuscula: number } | undefined {
  const d = sessao.texto.diagramar(no);
  const linha = d.linhas[0];
  const [inicio, fim] = d.intervalos[0] ?? [0, 0];
  if (!d.fonteEncontrada || !linha) return undefined;
  // altura da maiúscula de cada arquivo de fonte, em fração do corpo. Fonte sem o campo: 0,7, que é o comum
  let maiuscula = 0;
  for (let i = inicio; i < Math.max(fim, inicio + 1); i++) {
    const t = [...(no.trechos ?? [])].reverse().find((x) => i >= x.inicio && i < x.fim);
    const fonte = escolherFonte(fontes, t?.fonte ?? no.fonte, t?.peso ?? no.peso);
    maiuscula = Math.max(maiuscula, ((fonte ? alturaDaMaiuscula(fonte.bytes) : undefined) ?? 0.7) * (t?.tamanho ?? no.tamanho));
  }
  return { base: linha.base, alturaUsada: d.alturaUsada, larguraMaxima: d.larguraMaxima, maiuscula };
}

/** Os pixels vindos do render de referência em CPU: o mesmo que o agente vê e o lint confere. */
function pixelsDoRender(sessao: Sessao, doc: Documento, fontes: readonly FonteDaExportacao[]): FonteDePixels {
  return {
    primeiraLinha: (no: NoTexto) => primeiraLinhaDoTexto(sessao, fontes, no),
    camada(p: Prancheta, no: NoVisual): PixelsDoArquivo | undefined {
      // só a área que a camada ocupa dentro da prancheta, em pixel inteiro
      const limites = limitesDoNo(sessao, no);
      const x0 = Math.max(0, Math.floor(limites.x));
      const y0 = Math.max(0, Math.floor(limites.y));
      const x1 = Math.min(p.largura, Math.ceil(limites.x + limites.w));
      const y1 = Math.min(p.altura, Math.ceil(limites.y + limites.h));
      if (x1 <= x0 || y1 <= y0) return undefined;
      const r = renderizarPrancheta(sessao, doc, { ...p, filhos: [no] }, { fundo: false, regiao: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
      return { x: x0, y: y0, largura: r.largura, altura: r.altura, rgba: r.rgba };
    },
    mascara(p: Prancheta, no: No): MascaraDoArquivo | undefined {
      const m = renderizarMascara(sessao, doc, p, no);
      return m ? { x: 0, y: 0, largura: m.largura, altura: m.altura, cobertura: m.cobertura, fora: 0 } : undefined;
    },
  };
}

function sessaoDaExportacao(ck: CanvasKit, recursos: RecursosDaExportacao): Sessao {
  return criarSessao(ck, {
    fontes: recursos.fontes.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })),
    imagens: recursos.imagens.map((i) => ({ arquivo: i.arquivo, bytes: i.bytes })),
  });
}

/**
 * Exporta o documento em PSD (PSB quando um lado passa de 30.000 px). A composta e o pixel de cada camada vêm do render
 * de referência em CPU. Devolve os arquivos e o relatório; empacotar (zip) e guardar é de quem chama.
 */
export async function exportarPsd(ck: CanvasKit, formato: FormatoDeArquivoEmCamadas, doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDeExportacao): Promise<ResultadoDaExportacao> {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const sessao = sessaoDaExportacao(ck, recursos);
  try {
    const fontes = fontesDisponiveis(recursos.fontes);
    const imagens = imagensDisponiveis(sessao, recursos.imagens);
    const rel = relatorioVazio(doc, pranchetas);
    const base = pixelsDoRender(sessao, doc, recursos.fontes);
    const arquivos: ArquivoExportado[] = [];
    const juntas = opcoes.arquivos === 'juntas';
    for (const grupo of juntas ? [pranchetas] : pranchetas.map((p) => [p])) {
      // o render de cada camada é síncrono: cede a vez antes de cada prancheta, e conta as camadas para ceder de tempos em tempos
      await opcoes.entreEtapas?.();
      const montagem = montar({ doc, pranchetas: grupo, comoPranchetas: juntas, fontes, imagens, pixels: base, rel });
      const composta = new Uint8Array(montagem.largura * montagem.altura * 4);
      for (const p of grupo) {
        await opcoes.entreEtapas?.();
        const r = renderizarPrancheta(sessao, doc, p);
        const dx = montagem.posicoes.get(p.id)?.x ?? 0;
        for (let y = 0; y < r.altura; y++) composta.set(r.rgba.subarray(y * r.largura * 4, (y + 1) * r.largura * 4), (y * montagem.largura + dx) * 4);
      }
      const gravado = await formato.escrever({ largura: montagem.largura, altura: montagem.altura, composta, camadas: montagem.camadas, embutidos: montagem.embutidos, perfilDeCor: perfilSrgb() });
      const nome = `${nomeDeArquivo(juntas ? `${opcoes.nome} (todas as pranchetas)` : grupo.length === 1 && pranchetas.length === 1 ? opcoes.nome : `${opcoes.nome} - ${(grupo[0] as Prancheta).nome}`)}.${gravado.extensao}`;
      rel.arquivos.push(nome);
      arquivos.push({ nome, bytes: gravado.bytes });
    }
    return { arquivos, relatorio: fecharRelatorio(rel) };
  } finally {
    sessao.destruir();
  }
}

export interface OpcoesDoPng extends Pick<OpcoesDeExportacao, 'nome' | 'pranchetas' | 'entreEtapas'> {
  /** pixels por unidade do documento. Padrão: 1. */
  escala?: number;
  /** sem o fundo da prancheta: o que não tem camada sai transparente */
  semFundo?: boolean;
}

/** Exporta um PNG por prancheta, com o render de referência em CPU. */
export async function exportarPng(ck: CanvasKit, doc: Documento, recursos: RecursosDaExportacao, opcoes: OpcoesDoPng): Promise<{ arquivos: ArquivoExportado[] }> {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const sessao = sessaoDaExportacao(ck, recursos);
  try {
    const arquivos: ArquivoExportado[] = [];
    for (const p of pranchetas) {
      await opcoes.entreEtapas?.();
      const r = renderizarPrancheta(sessao, doc, p, { ...(opcoes.escala !== undefined ? { escala: opcoes.escala } : {}), ...(opcoes.semFundo ? { fundo: false } : {}) });
      arquivos.push({ nome: `${nomeDeArquivo(pranchetas.length === 1 ? opcoes.nome : `${opcoes.nome} - ${p.nome}`)}.png`, bytes: codificarPng(sessao, r) });
    }
    return { arquivos };
  } finally {
    sessao.destruir();
  }
}

/**
 * O relatório de uma exportação que ainda não foi feita. Não renderiza nem lê arquivo: sai da árvore e do que a API
 * sabe dos recursos (que fontes a conta tem, com o nome PostScript, e o tipo de cada imagem). É o mesmo código que
 * monta o arquivo, então é o mesmo relatório que a exportação devolve, fora a lista de arquivos.
 */
export function relatorioDeExportacao(doc: Documento, recursos: RecursosConhecidos, opcoes: Pick<OpcoesDeExportacao, 'pranchetas' | 'arquivos'> = {}): RelatorioDeExportacao {
  const pranchetas = pranchetasPedidas(doc, opcoes.pranchetas);
  const rel = relatorioVazio(doc, pranchetas);
  const juntas = opcoes.arquivos === 'juntas';
  for (const grupo of juntas ? [pranchetas] : pranchetas.map((p) => [p])) montar({ doc, pranchetas: grupo, comoPranchetas: juntas, fontes: recursos.fontes, imagens: recursos.imagens, rel });
  return fecharRelatorio(rel);
}
