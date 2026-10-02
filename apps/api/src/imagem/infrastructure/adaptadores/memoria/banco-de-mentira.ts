// Adaptador falso de BancoDeImagens: uma lista fixa de resultados e um arquivo de verdade para baixar.
// Conta as idas ao "banco", para os testes provarem que o cache e a recusa de endereço não o chamam.
import type { BancoDeImagensId, OrientacaoDeImagem } from '@otto/shared';
import { BancoDeImagens, BancoIndisponivel, type CapacidadesDoBanco, type ImagemNoBanco } from '../../../application/banco-de-imagens';

const HOST = 'banco-de-mentira.invalid';

export class BancoDeMentira extends BancoDeImagens {
  readonly id: BancoDeImagensId = 'banco-de-mentira';
  readonly nome = 'Banco de mentira';
  readonly licenca = 'Licença de mentira';
  readonly capacidades: CapacidadesDoBanco = { ladoMaximo: 1280, cacheObrigatorioEmHoras: 24, linkDiretoProibido: true, requisicoesPorMinuto: 100, enderecosValemPorHoras: 24 };
  buscas: { consulta: string; orientacao: OrientacaoDeImagem }[] = [];
  baixados: string[] = [];
  /** Para simular o banco fora do ar. */
  falha: BancoIndisponivel | undefined;

  /** @param arquivo os bytes que `baixar` devolve, para qualquer resultado. */
  constructor(
    private readonly arquivo: Uint8Array,
    private readonly itens: readonly { id: string; descricao: string; largura: number; altura: number; autor: string }[] = [
      { id: '1001', descricao: 'café, xícara, mesa', largura: 1280, altura: 853, autor: 'fulana' },
      { id: '1002', descricao: 'grãos de café', largura: 853, altura: 1280, autor: 'beltrano' },
    ],
  ) {
    super();
  }

  async buscar(consulta: string, orientacao: OrientacaoDeImagem): Promise<ImagemNoBanco[]> {
    this.buscas.push({ consulta, orientacao });
    if (this.falha) throw this.falha;
    return this.itens
      .filter((i) => orientacao === 'todas' || (orientacao === 'vertical' ? i.altura > i.largura : i.largura >= i.altura))
      .map((i) => ({ ...i, pagina: `https://${HOST}/fotos/${i.id}/`, urlDoArquivo: `https://${HOST}/get/${i.id}_1280.jpg`, urlDaPrevia: `https://${HOST}/get/${i.id}_640.jpg` }));
  }

  async baixar(url: string, limiteEmBytes: number): Promise<Uint8Array> {
    let destino: URL;
    try {
      destino = new URL(url);
    } catch {
      throw new BancoIndisponivel('endereco');
    }
    if (destino.protocol !== 'https:' || destino.hostname !== HOST) throw new BancoIndisponivel('endereco');
    this.baixados.push(url);
    if (this.falha) throw this.falha;
    if (this.arquivo.byteLength > limiteEmBytes) throw new BancoIndisponivel('tamanho');
    return this.arquivo;
  }
}
