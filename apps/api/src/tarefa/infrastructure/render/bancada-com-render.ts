// Adaptador de BancadaDoOtto: o motor de render único (@otto/render, CanvasKit em CPU), o resumo e a
// verificação de @otto/documento. É o que o Otto "enxerga" enquanto trabalha (ADR 027, item 9).
//
// Só o worker chama isto. O RENDER, A VERIFICAÇÃO E A REDUÇÃO DE FOTO RODAM NUMA THREAD (oficina-de-render.ts):
// são síncronos lá dentro e, no laço principal, seguravam o sinal de vida e as outras tarefas. No laço
// principal fica só o resumo (a porta do ciclo o quer síncrono), que mede texto e não desenha.
//
// Fonte: todas as da biblioteca do Otto (o agente pode escolher qualquer uma). Imagem: só a que a CONTA tem;
// a linha do arquivo, lida sob o escopo, é a autorização. Hash citado que não é da conta não é lido.
// A bancada guarda o que entregou à thread: se a thread cair, outra sobe e a sessão é remontada.
import type { FamiliaDeFonte, ImagemParaOModelo } from '@otto/agente';
import { type Documento, resumirDocumento } from '@otto/documento';
import { criarMedidor, criarSessao, type FonteDeArquivo, type ImagemDeArquivo } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import type { ArmazenamentoDeArquivo } from '../../../arquivo/application/armazenamento-de-arquivo';
import type { RepositorioDeArquivos } from '../../../arquivo/application/repositorio-de-arquivos';
import type { BibliotecaDeFontes } from '../../../biblioteca/application/biblioteca-de-fontes';
import { arquivosDaArvore } from '../../../documento/domain/arquivos-da-arvore';
import { familiasCitadas } from '../../../documento/domain/familias-citadas';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { type BancadaAberta, BancadaDoOtto } from '../../application/bancada-do-otto';
import { OficinaDeRender, OficinaInterrompida, type PedidoAOficina, type ResultadoDaOficina } from './oficina-de-render';

type Motor = Awaited<ReturnType<typeof carregarCanvasKit>>;

const TIPOS_QUE_O_MOTOR_ABRE: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
const emBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

function comoImagem(r: ResultadoDaOficina): ImagemParaOModelo | undefined {
  return r.tipo === 'imagem' ? { mime: 'image/jpeg', base64: emBase64(r.jpeg), largura: r.largura, altura: r.altura } : undefined;
}

export class BancadaComRender extends BancadaDoOtto {
  /** O motor do laço principal: só mede texto, para o resumo. A variante padrão basta (não codifica nada). */
  private motor: Promise<Motor> | undefined;
  /** As fontes da biblioteca são iguais para todas as contas: lidas uma vez por processo. */
  private biblioteca: Promise<{ arquivos: FonteDeArquivo[]; familias: FamiliaDeFonte[] }> | undefined;
  private readonly oficina: OficinaDeRender;
  private abertas = 0;

  /** Quantas threads de render este processo já criou. */
  get threadsCriadas(): number {
    return this.oficina.threadsCriadas;
  }

  constructor(
    private readonly fontes: BibliotecaDeFontes,
    private readonly arquivos: RepositorioDeArquivos,
    private readonly armazenamento: ArmazenamentoDeArquivo,
    opcoes: { ociosaPorMs?: number } = {},
  ) {
    super();
    this.oficina = new OficinaDeRender(opcoes);
  }

  private carregar(): Promise<Motor> {
    if (!this.motor) {
      this.motor = carregarCanvasKit();
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

  /** Encerra a thread de render como se tivesse caído. A bancada continua aceitando trabalho. */
  derrubarThread(): Promise<void> {
    return this.oficina.derrubar();
  }

  /** Desligamento do processo: encerra a thread de render. */
  override fechar(): Promise<void> {
    return this.oficina.fechar();
  }

  async abrir(escopo: EscopoDaConta, peca: { nome: string; arvore: Documento }): Promise<BancadaAberta> {
    const [ck, biblioteca] = await Promise.all([this.carregar(), this.lerBiblioteca()]);
    const oficina = this.oficina;
    // no laço principal, só o texto: é o que o resumo mede
    const medida = criarSessao(ck, { fontes: biblioteca.arquivos, imagens: [] });
    // o que já foi entregue à thread: é com isto que a sessão é remontada se a thread cair
    const fontesEntregues: FonteDeArquivo[] = [...biblioteca.arquivos];
    const imagensEntregues: ImagemDeArquivo[] = [];
    const sessao = oficina.novaSessao();
    let montadaNa: number | undefined;
    let fechada = false;
    this.abertas++;

    const montar = async (): Promise<void> => {
      if (montadaNa !== undefined && montadaNa === oficina.geracao && oficina.viva) return;
      await oficina.pedir({ tipo: 'abrir', sessao, fontes: fontesEntregues, imagens: imagensEntregues });
      montadaNa = oficina.geracao;
    };
    /** Uma chamada à thread, com a sessão garantida. Se a thread cair no meio, remonta e tenta uma vez mais. */
    const chamar = async (pedido: PedidoAOficina): Promise<ResultadoDaOficina> => {
      if (fechada) throw new Error('a bancada desta tarefa já foi fechada');
      try {
        await montar();
        return await oficina.pedir(pedido);
      } catch (erro) {
        if (!(erro instanceof OficinaInterrompida)) throw erro;
        montadaNa = undefined;
        await montar();
        return oficina.pedir(pedido);
      }
    };

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
        if (!bytes) continue;
        const imagem = { arquivo: sha256, bytes };
        imagensEntregues.push(imagem);
        if (montadaNa !== undefined) await chamar({ tipo: 'imagem', sessao, imagem });
      }
    };
    // A biblioteca cresce durante a tarefa (fonte trazida do catálogo sob demanda): a família que o documento
    // cita e a sessão ainda não tem é lida da biblioteca na hora.
    const familiasNaSessao = new Set(biblioteca.arquivos.map((f) => f.familia));
    const garantirFontes = async (doc: Documento): Promise<void> => {
      for (const familia of familiasCitadas(doc)) {
        if (familiasNaSessao.has(familia)) continue;
        familiasNaSessao.add(familia);
        for (const registro of await this.fontes.pesosDa(familia)) {
          const bytes = await this.fontes.bytes(registro);
          if (!bytes) continue;
          const fonte = { familia: registro.familia, peso: registro.peso, bytes };
          fontesEntregues.push(fonte);
          medida.adicionarFonte(fonte);
          if (montadaNa !== undefined) await chamar({ tipo: 'fonte', sessao, fonte });
        }
      }
    };
    await garantirImagens(peca.arvore);
    await garantirFontes(peca.arvore);

    return {
      fontes: biblioteca.familias,
      resumir: (doc, prancheta) => resumirDocumento(doc, { medidor: criarMedidor(medida), nome: peca.nome, ...(prancheta ? { prancheta } : {}) }),
      async renderizar(doc, pedido) {
        if (!doc.pranchetas.some((x) => x.id === pedido.prancheta)) throw new Error('prancheta desconhecida');
        await garantirImagens(doc);
        await garantirFontes(doc);
        const imagem = comoImagem(await chamar({ tipo: 'renderizar', sessao, doc, pedido }));
        if (!imagem) throw new Error('o motor não devolveu o render');
        return imagem;
      },
      async verificar(doc, prancheta) {
        await garantirImagens(doc);
        await garantirFontes(doc);
        const r = await chamar({ tipo: 'verificar', sessao, doc, ...(prancheta ? { prancheta } : {}) });
        return r.tipo === 'avisos' ? r.avisos : [];
      },
      async previaDeArquivo(arquivo, ladoMaximo) {
        const bytes = await bytesDaConta(arquivo);
        return bytes ? comoImagem(await chamar({ tipo: 'reduzir', sessao, bytes, ladoMaximo })) : undefined;
      },
      fechar: () => {
        if (fechada) return;
        fechada = true;
        medida.destruir();
        if (montadaNa !== undefined && montadaNa === oficina.geracao && oficina.viva) void oficina.pedir({ tipo: 'fechar', sessao }).catch(() => undefined);
        if (--this.abertas === 0) oficina.semSessoes();
      },
    };
  }
}
