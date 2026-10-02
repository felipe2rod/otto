// A importação de PSD (ADR 028, item 4): do arquivo para a árvore do Otto, com os recursos extraídos e o relatório.
// Junta a inspeção (inspecionar.ts: tetos e modo de cor, antes de decodificar), a leitura pela porta do formato, o
// mapeamento de volta (desmontar.ts) e o motor (medir texto, conferir máscara, codificar PNG).
//
// Como a exportação, este pacote não lê disco, rede nem armazenamento: o arquivo e as fontes entram por parâmetro, e as
// imagens saem como bytes com a chave (sha256) que o documento usa. Guardar é de quem chama.
// A árvore nasce pelo catálogo de operações (criarPrancheta, criarNo), validada pelo mesmo esquema de qualquer mudança.
import { aplicarLote, type Documento, documentoVazio, idsDoLote, type No, type NoTexto, type Prancheta } from '@otto/documento';
import { codificarPng, criarSessao, nomePostScript, renderizarMascara, renderizarPrancheta } from '@otto/render';
import type { CanvasKit } from 'canvaskit-wasm';
import { desmontar, type ImagemImportada, type MeiosDaImportacao } from './desmontar';
import { type FonteDaExportacao, primeiraLinhaDoTexto } from './exportar';
import { ErroDeImportacao, inspecionarPsd, type LimitesDeImportacao } from './inspecionar';
import type { FonteDisponivel } from './montar';
import { conversaoParaSrgb } from './perfil-de-cor';
import type { ArquivoLido, CamadaLida, FormatoDeArquivoEmCamadas } from './porta';
import { caminhosEmD } from './reconhecer';
import { fecharRelatorioDeImportacao, type RelatorioDeImportacao, relatorioDeImportacaoVazio } from './relatorio-de-importacao';
import { sha256 } from './sha256';

export interface OpcoesDeImportacao {
  /** nome da prancheta, quando o arquivo não tem pranchetas do Photoshop. Padrão: "Prancheta 1". */
  nomeDaPrancheta?: string;
  /**
   * As fontes que o Otto tem para este arquivo (as que `fontesDoPsd` listou e a conta possui). Texto com fonte que não
   * está aqui vem como imagem, e o relatório a lista em `emFalta`.
   */
  fontes?: readonly FonteDaExportacao[];
  /**
   * Troca de fonte, quando quem importa quer o texto editável mesmo sem a fonte: recebe o nome PostScript que o arquivo
   * pede e devolve o de uma fonte de `fontes`. A troca nunca é silenciosa: vai para `relatorio.substituicoes`.
   */
  substituir?: (postScript: string) => string | undefined;
  limites?: Partial<LimitesDeImportacao>;
  /**
   * De onde saem os ids dos nós. O mesmo arquivo com o mesmo id dá a mesma árvore, id por id.
   * Padrão: o sha256 do arquivo.
   */
  idDoLote?: string;
  /**
   * Chamada depois da leitura e antes de montar a árvore. A importação é trabalho de CPU, síncrono entre essas chamadas
   * (segundos, num arquivo de dezenas de camadas): rode fora da requisição, na thread de render.
   */
  entreEtapas?: () => Promise<void> | void;
}

export interface ResultadoDaImportacao {
  doc: Documento;
  /** as imagens que o documento referencia (fotos embutidas, camadas que vieram como imagem, máscaras de recorte de foto) */
  imagens: ImagemImportada[];
  relatorio: RelatorioDeImportacao;
}

/** Lê o arquivo pela porta, depois da inspeção. Erro de leitura vira ErroDeImportacao: o arquivo é que está errado. */
function ler(formato: FormatoDeArquivoEmCamadas, bytes: Uint8Array, limites: Partial<LimitesDeImportacao> | undefined): { lido: ArquivoLido; inspecao: ReturnType<typeof inspecionarPsd> } {
  if (!formato.ler) throw new Error('Este formato não tem leitura');
  const inspecao = inspecionarPsd(bytes, limites);
  let lido: ArquivoLido;
  try {
    // o teto de memória da leitura é o da maior camada, em RGBA, com folga para a máscara
    lido = formato.ler(bytes);
  } catch (erro) {
    if (erro instanceof ErroDeImportacao) throw erro;
    throw new ErroDeImportacao(
      'arquivo-malformado',
      `O arquivo não pôde ser lido como PSD: a estrutura dele não faz sentido. Salve de novo no Photoshop e tente outra vez. (${erro instanceof Error ? erro.message : String(erro)})`,
    );
  }
  return { lido, inspecao };
}

const todas = (camadas: readonly CamadaLida[]): CamadaLida[] => camadas.flatMap((c) => [c, ...todas(c.filhos ?? [])]);

/**
 * Os nomes PostScript das fontes que o texto do arquivo pede. Não decodifica pixel: é o primeiro passo de quem importa,
 * para buscar as fontes que tem antes de chamar `importarPsd`.
 */
export function fontesDoPsd(formato: FormatoDeArquivoEmCamadas, bytes: Uint8Array, limites?: Partial<LimitesDeImportacao>): string[] {
  const { lido } = ler(formato, bytes, limites);
  const nomes = new Set<string>();
  for (const c of todas(lido.camadas)) {
    if (!c.texto) continue;
    nomes.add(c.texto.estilo.fonte);
    for (const t of c.texto.trechos ?? []) nomes.add(t.estilo.fonte);
  }
  nomes.delete('');
  return [...nomes].sort();
}

/**
 * Importa um PSD (ou PSB) como documento do Otto. O que o Otto representa vem editável; o que não representa vem como
 * imagem, com o pixel que o arquivo traz; o que não tem pixel e o Otto não tem (camada de ajuste desconhecida, efeito
 * desconhecido) não vem, e o relatório diz. Lança ErroDeImportacao quando o arquivo não pode ser importado.
 */
export async function importarPsd(ck: CanvasKit, formato: FormatoDeArquivoEmCamadas, bytes: Uint8Array, opcoes: OpcoesDeImportacao = {}): Promise<ResultadoDaImportacao> {
  const { lido, inspecao } = ler(formato, bytes, opcoes.limites);
  await opcoes.entreEtapas?.();
  const cor = conversaoParaSrgb(inspecao.perfilDeCor);
  const recursos = opcoes.fontes ?? [];
  const fontes: FonteDisponivel[] = recursos.flatMap((f) => {
    const postScript = f.postScript ?? nomePostScript(f.bytes);
    return postScript ? [{ familia: f.familia, peso: f.peso, postScript, ...(f.arquivo ? { arquivo: f.arquivo } : {}) }] : [];
  });
  const sessao = criarSessao(ck, { fontes: recursos.map((f) => ({ familia: f.familia, peso: f.peso, bytes: f.bytes })), imagens: [] });
  try {
    const vazio = documentoVazio();
    const prancheta = (largura: number, altura: number, filhos: No[]): Prancheta => ({ id: 'medida', nome: 'medida', tipo: 'prancheta', largura, altura, fundo: '#000000', filhos });
    const meios: MeiosDaImportacao = {
      png: (largura, altura, rgba) => codificarPng(sessao, { largura, altura, rgba }),
      sha256,
      tamanhoDaImagem(dados) {
        const imagem = ck.MakeImageFromEncoded(dados);
        if (!imagem) return undefined;
        const tamanho = { largura: imagem.width(), altura: imagem.height() };
        imagem.delete();
        return tamanho;
      },
      medirTexto(no) {
        const texto = { ...no, id: 'medida' } as NoTexto;
        const primeira = primeiraLinhaDoTexto(sessao, recursos, texto);
        if (!primeira) return undefined;
        return { base: primeira.base - texto.y, maiuscula: primeira.maiuscula, larguraMaxima: primeira.larguraMaxima, alturaUsada: primeira.alturaUsada };
      },
      mascaraDoNo(largura, altura, no) {
        const p = prancheta(largura, altura, [no]);
        return renderizarMascara(sessao, vazio, p, no)?.cobertura;
      },
      cobertura(caminhos, area) {
        const d = caminhosEmD(caminhos, area.x, area.y);
        const plano = new Uint8Array(area.largura * area.altura);
        if (!d) return plano;
        const no = {
          id: 'cobertura',
          tipo: 'vetor',
          nome: 'cobertura',
          x: 0,
          y: 0,
          largura: area.largura,
          altura: area.altura,
          rotacao: 0,
          opacidade: 1,
          visivel: true,
          bloqueado: false,
          recortadaNaDeBaixo: false,
          modoDeMesclagem: 'normal',
          moldura: [area.largura, area.altura],
          caminhos: [{ d, preenchimento: '#ffffff', regra: caminhos[0]?.regra ?? 'nao-zero' }],
        } as unknown as No;
        const r = renderizarPrancheta(sessao, vazio, prancheta(area.largura, area.altura, [no]), { fundo: false });
        for (let i = 0; i < plano.length; i++) plano[i] = r.rgba[i * 4 + 3] as number;
        return plano;
      },
    };
    const rel = relatorioDeImportacaoVazio({
      formato: inspecao.formato,
      largura: inspecao.largura,
      altura: inspecao.altura,
      camadas: inspecao.camadas,
      ...(cor.nome ? { perfilDeCor: cor.nome } : {}),
      conversaoDeCor: cor.situacao,
    });
    const idDoLote = opcoes.idDoLote ?? `importacao-${sha256(bytes)}`;
    const gerar = idsDoLote(idDoLote);
    const desmontado = desmontar({
      arquivo: lido,
      nomeDaPrancheta: opcoes.nomeDaPrancheta ?? 'Prancheta 1',
      fontes,
      ...(opcoes.substituir ? { substituir: opcoes.substituir } : {}),
      cor,
      meios,
      rel,
      idDaOperacao: (indice) => gerar(indice, 0),
    });
    await opcoes.entreEtapas?.();
    const aplicado = aplicarLote(vazio, desmontado.operacoes, { autoria: { tipo: 'designer' }, idDoLote });
    // operação recusada aqui é defeito do mapeamento, não do arquivo: o erro diz qual camada e qual campo
    if (!aplicado.ok)
      throw new Error(
        `A importação montou uma operação que o documento recusa: operação ${aplicado.erro.indice} (${aplicado.erro.op})${aplicado.erro.campo ? `, campo ${aplicado.erro.campo}` : ''}: ${aplicado.erro.mensagem}`,
      );
    return { doc: aplicado.doc, imagens: desmontado.imagens, relatorio: fecharRelatorioDeImportacao(rel, { fundoTransparente: desmontado.fundoTransparente }) };
  } finally {
    sessao.destruir();
  }
}
