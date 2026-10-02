// Adaptador de BancadaDoOtto: o motor de render único (@otto/render, CanvasKit em CPU), o resumo e a
// verificação de @otto/documento. É o que o Otto "enxerga" enquanto trabalha (ADR 027, item 9).
//
// Só o worker chama isto. O WebAssembly é carregado uma vez por processo (a variante completa, que codifica
// JPEG; os pixels são os mesmos da padrão); cada tarefa abre e destrói a própria sessão.
// O render de conferência roda no laço principal do worker: são décimos de segundo por prancheta, em que o
// processo não atende outra coisa. Se pesar, o lugar dele é uma thread, como a exportação.
//
// Fonte: todas as da biblioteca do Otto (o agente pode escolher qualquer uma). Imagem: só a que a CONTA tem;
// a linha do arquivo, lida sob o escopo, é a autorização. Hash citado que não é da conta não é lido.
//
// PARA O ESPECIALISTA-GRAFICO: codificarJpeg e reduzirFoto vieram de avaliacao/src/ambiente.ts porque
// @otto/render não exporta nenhum dos dois. Deveriam morar lá, ao lado de codificarPng.
import type { FamiliaDeFonte, ImagemParaOModelo } from '@otto/agente';
import { type Documento, resumirDocumento, verificarDocumento } from '@otto/documento';
import { criarMedidor, criarMeiosDeVerificacao, criarSessao, type FonteDeArquivo, type RenderEmPixels, renderizarPrancheta, type Sessao } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import type { ArmazenamentoDeArquivo } from '../../../arquivo/application/armazenamento-de-arquivo';
import type { RepositorioDeArquivos } from '../../../arquivo/application/repositorio-de-arquivos';
import type { BibliotecaDeFontes } from '../../../biblioteca/application/biblioteca-de-fontes';
import { arquivosDaArvore } from '../../../documento/domain/arquivos-da-arvore';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { type BancadaAberta, BancadaDoOtto } from '../../application/bancada-do-otto';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

const TIPOS_QUE_O_MOTOR_ABRE: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
const QUALIDADE_DO_RENDER = 85;
const QUALIDADE_DA_PREVIA = 82;

const emBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

function codificarJpeg(sessao: Sessao, render: RenderEmPixels): Uint8Array {
  const { ck } = sessao;
  const img = ck.MakeImage(
    { width: render.largura, height: render.altura, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB },
    render.rgba,
    render.largura * 4,
  );
  if (!img) throw new Error('não foi possível montar a imagem do render');
  const bytes = img.encodeToBytes(ck.ImageFormat.JPEG, QUALIDADE_DO_RENDER);
  img.delete();
  if (!bytes) throw new Error('este motor não codifica JPEG: carregue a variante completa');
  return bytes;
}

/** Reduz uma foto para o modelo ver: lado maior de `ladoMaximo`, em JPEG. */
function reduzirFoto(sessao: Sessao, bytes: Uint8Array, ladoMaximo: number): ImagemParaOModelo | undefined {
  const { ck } = sessao;
  const img = ck.MakeImageFromEncoded(bytes);
  if (!img) return undefined;
  const escala = Math.min(1, ladoMaximo / Math.max(img.width(), img.height()));
  const largura = Math.max(1, Math.round(img.width() * escala));
  const altura = Math.max(1, Math.round(img.height() * escala));
  const superficie = ck.MakeSurface(largura, altura);
  if (!superficie) {
    img.delete();
    return undefined;
  }
  const tinta = new ck.Paint();
  superficie.getCanvas().drawImageRectOptions(img, ck.XYWHRect(0, 0, img.width(), img.height()), ck.XYWHRect(0, 0, largura, altura), ck.FilterMode.Linear, ck.MipmapMode.Linear, tinta);
  const reduzida = superficie.makeImageSnapshot();
  const jpeg = reduzida.encodeToBytes(ck.ImageFormat.JPEG, QUALIDADE_DA_PREVIA);
  tinta.delete();
  reduzida.delete();
  superficie.delete();
  img.delete();
  return jpeg ? { mime: 'image/jpeg', base64: emBase64(jpeg), largura, altura } : undefined;
}

export class BancadaComRender extends BancadaDoOtto {
  private motor: Promise<Motor> | undefined;
  /** As fontes da biblioteca são iguais para todas as contas: lidas uma vez por processo. */
  private biblioteca: Promise<{ arquivos: FonteDeArquivo[]; familias: FamiliaDeFonte[] }> | undefined;
  /** Quantas vezes o WebAssembly foi carregado neste processo. Deve ficar em 1. */
  cargasDoMotor = 0;

  constructor(
    private readonly fontes: BibliotecaDeFontes,
    private readonly arquivos: RepositorioDeArquivos,
    private readonly armazenamento: ArmazenamentoDeArquivo,
  ) {
    super();
  }

  private carregar(): Promise<Motor> {
    if (!this.motor) {
      this.cargasDoMotor++;
      this.motor = carregarCanvasKit('completa');
      // se a carga falhar, a próxima chamada tenta de novo em vez de guardar a falha
      this.motor.catch(() => {
        this.motor = undefined;
      });
    }
    return this.motor;
  }

  private lerBiblioteca(): Promise<{ arquivos: FonteDeArquivo[]; familias: FamiliaDeFonte[] }> {
    if (!this.biblioteca) {
      this.biblioteca = (async () => {
        const familias = await this.fontes.listar();
        const arquivos: FonteDeArquivo[] = [];
        for (const { familia } of familias)
          for (const registro of await this.fontes.pesosDa(familia)) {
            const bytes = await this.fontes.bytes(registro);
            if (bytes) arquivos.push({ familia: registro.familia, peso: registro.peso, bytes });
          }
        return { arquivos, familias: familias.map((f) => ({ familia: f.familia, pesos: f.pesos })) };
      })();
      this.biblioteca.catch(() => {
        this.biblioteca = undefined;
      });
    }
    return this.biblioteca;
  }

  async abrir(escopo: EscopoDaConta, peca: { nome: string; arvore: Documento }): Promise<BancadaAberta> {
    const [ck, biblioteca] = await Promise.all([this.carregar(), this.lerBiblioteca()]);
    const sessao = criarSessao(ck, { fontes: biblioteca.arquivos, imagens: [] });
    /** Hashes já procurados nesta conta (achados ou não): cada um é lido uma vez por tarefa. */
    const procurados = new Set<string>();

    const bytesDaConta = async (sha256: string): Promise<Uint8Array | undefined> => {
      const registro = await this.arquivos.buscar(escopo, sha256);
      if (!registro || !TIPOS_QUE_O_MOTOR_ABRE.includes(registro.tipoMime)) return undefined;
      return this.armazenamento.ler(escopo, registro.chaveDoObjeto);
    };
    /** Entrega ao motor as imagens que o documento cita e que a conta tem. O que faltar, o motor desenha em cinza. */
    const garantirImagens = async (doc: Documento): Promise<void> => {
      for (const sha256 of arquivosDaArvore(doc)) {
        if (procurados.has(sha256)) continue;
        procurados.add(sha256);
        const bytes = await bytesDaConta(sha256);
        if (bytes) sessao.adicionarImagem({ arquivo: sha256, bytes });
      }
    };
    await garantirImagens(peca.arvore);

    return {
      fontes: biblioteca.familias,
      resumir: (doc, prancheta) => resumirDocumento(doc, { medidor: criarMedidor(sessao), nome: peca.nome, ...(prancheta ? { prancheta } : {}) }),
      async renderizar(doc, pedido) {
        const p = doc.pranchetas.find((x) => x.id === pedido.prancheta);
        if (!p) throw new Error('prancheta desconhecida');
        await garantirImagens(doc);
        const [x, y, w, h] = pedido.regiao ?? [0, 0, p.largura, p.altura];
        const regiao = { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, Math.min(w, p.largura - Math.max(0, x))), h: Math.max(1, Math.min(h, p.altura - Math.max(0, y))) };
        const escala = Math.min(1, pedido.ladoMaximo / Math.max(regiao.w, regiao.h));
        const render = renderizarPrancheta(sessao, doc, p, { escala, ...(pedido.regiao ? { regiao } : {}) });
        return { mime: 'image/jpeg', base64: emBase64(codificarJpeg(sessao, render)), largura: render.largura, altura: render.altura };
      },
      async verificar(doc, prancheta) {
        await garantirImagens(doc);
        return verificarDocumento(doc, criarMeiosDeVerificacao(sessao), prancheta);
      },
      async previaDeArquivo(arquivo, ladoMaximo) {
        const bytes = await bytesDaConta(arquivo);
        return bytes ? reduzirFoto(sessao, bytes, ladoMaximo) : undefined;
      },
      fechar: () => sessao.destruir(),
    };
  }
}
