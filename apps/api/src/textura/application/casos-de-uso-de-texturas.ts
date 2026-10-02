// Casos de uso das texturas do Otto. A textura é gerada uma vez (pelo worker ou pela semeadura, que têm o
// motor de render) e fica guardada no armazenamento da biblioteca, igual para todas as contas. Para entrar
// numa peça, vira arquivo DA CONTA (o documento só referencia arquivo da conta), com a origem "Texturas do Otto".
// A API não desenha: sem gerador, só entrega a textura que já está guardada.
import type { TexturaDaBiblioteca } from '@otto/agente';
import type { ListaDeTexturas, TexturaTrazida } from '@otto/shared';
import type { ArmazenamentoDeArquivo } from '../../arquivo/application/armazenamento-de-arquivo';
import type { CasosDeUsoDeArquivo } from '../../arquivo/application/casos-de-uso-de-arquivo';
import { chaveDeTexturaDaBiblioteca } from '../../arquivo/application/chave-de-objeto';
import { NaoEncontrado } from '../../plataforma/erros/erro-da-aplicacao';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { type GeradorDeTexturas, LADO_DA_TEXTURA, ORIGEM_DAS_TEXTURAS, TEXTURAS, type TexturaDoCatalogo } from './texturas';

/** Muda quando o desenho de alguma textura muda: as guardadas com a versão antiga deixam de ser lidas. */
const VERSAO = 'v1';
/** O nome vem do catálogo, nunca do pedido: não há como montar outro caminho. */
const chaveDe = (textura: TexturaDoCatalogo) => chaveDeTexturaDaBiblioteca(VERSAO, textura.nome);

export interface DependenciasDeTexturas {
  armazenamento: ArmazenamentoDeArquivo;
  arquivos: CasosDeUsoDeArquivo;
  gerador?: GeradorDeTexturas;
  uso?: RegistroDeUso;
}

export class CasosDeUsoDeTexturas {
  private readonly uso: RegistroDeUso;
  private readonly gerando = new Map<string, Promise<Uint8Array | undefined>>();

  constructor(private readonly d: DependenciasDeTexturas) {
    this.uso = d.uso ?? new RegistroDeUsoMudo();
  }

  listar(): ListaDeTexturas {
    return { itens: TEXTURAS.map((t) => ({ nome: t.nome, descricao: t.descricao, modoDeMesclagem: t.modoDeMesclagem, opacidade: t.opacidade, largura: LADO_DA_TEXTURA, altura: LADO_DA_TEXTURA })) };
  }

  /** Gera e guarda as que faltam. É o que a semeadura chama. Devolve quantas gerou. */
  async preparar(): Promise<number> {
    let geradas = 0;
    for (const textura of TEXTURAS) {
      if (await this.d.armazenamento.lerDaBiblioteca(chaveDe(textura))) continue;
      if (await this.bytesDe(textura)) geradas++;
    }
    return geradas;
  }

  private async bytesDe(textura: TexturaDoCatalogo): Promise<Uint8Array | undefined> {
    const guardada = await this.d.armazenamento.lerDaBiblioteca(chaveDe(textura));
    if (guardada) return guardada;
    const gerador = this.d.gerador;
    if (!gerador) return undefined;
    // duas tarefas pedindo a mesma textura ao mesmo tempo geram uma vez
    let emCurso = this.gerando.get(textura.nome);
    if (!emCurso) {
      emCurso = (async () => {
        const bytes = await gerador.gerar(textura.nome);
        await this.d.armazenamento.guardarNaBiblioteca(chaveDe(textura), bytes, 'image/jpeg');
        return bytes;
      })().finally(() => this.gerando.delete(textura.nome));
      this.gerando.set(textura.nome, emCurso);
    }
    return emCurso;
  }

  async trazer(escopo: EscopoDaConta, nome: string): Promise<TexturaTrazida> {
    const textura = TEXTURAS.find((t) => t.nome === nome);
    if (!textura) throw new NaoEncontrado();
    const trazida = await this.daConta(escopo, textura);
    if (!trazida) throw new NaoEncontrado();
    this.uso.registrar(escopo, { evento: 'textura_trazida', textura: textura.nome });
    return trazida;
  }

  private async daConta(escopo: EscopoDaConta, textura: TexturaDoCatalogo): Promise<TexturaTrazida | undefined> {
    const bytes = await this.bytesDe(textura);
    if (!bytes) return undefined;
    const enviado = await this.d.arquivos.enviarImagem(escopo, bytes, { origem: { ...ORIGEM_DAS_TEXTURAS }, nome: `${textura.nome}.jpg` });
    return {
      sha256: enviado.sha256,
      largura: enviado.largura,
      altura: enviado.altura,
      no: {
        tipo: 'imagem',
        arquivo: enviado.sha256,
        larguraOriginal: enviado.largura,
        alturaOriginal: enviado.altura,
        modoDeMesclagem: textura.modoDeMesclagem,
        opacidade: textura.opacidade,
        origem: { ...ORIGEM_DAS_TEXTURAS },
      },
    };
  }

  /** A biblioteca como a ferramenta listarTexturas do Otto espera: cada textura já é arquivo da conta. */
  async paraOOtto(escopo: EscopoDaConta): Promise<TexturaDaBiblioteca[]> {
    const lista: TexturaDaBiblioteca[] = [];
    for (const textura of TEXTURAS) {
      const trazida = await this.daConta(escopo, textura);
      if (trazida) lista.push({ nome: textura.nome, descricao: textura.descricao, modoDeMesclagem: textura.modoDeMesclagem, opacidade: textura.opacidade, no: trazida.no });
    }
    return lista;
  }
}
