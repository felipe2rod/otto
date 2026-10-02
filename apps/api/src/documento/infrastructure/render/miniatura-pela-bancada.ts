// Adaptador de RenderDeMiniatura: usa a bancada de render do Otto (a thread de render do worker, com as fontes
// da biblioteca e as imagens que a conta tem). Uma sessão por miniatura, aberta e fechada aqui.
import type { Documento } from '@otto/documento';
import type { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import type { BancadaDoOtto } from '../../../tarefa/application/bancada-do-otto';
import { RenderDeMiniatura } from '../../application/casos-de-uso-de-miniatura';

export class MiniaturaPelaBancada extends RenderDeMiniatura {
  constructor(private readonly bancada: BancadaDoOtto) {
    super();
  }

  async renderizar(escopo: EscopoDaConta, peca: { nome: string; arvore: Documento }, prancheta: string, ladoMaximo: number): Promise<Uint8Array> {
    const aberta = await this.bancada.abrir(escopo, peca);
    try {
      const imagem = await aberta.renderizar(peca.arvore, { prancheta, ladoMaximo });
      return Buffer.from(imagem.base64, 'base64');
    } finally {
      aberta.fechar();
    }
  }
}
