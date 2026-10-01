// De onde a bancada tira a peça, os recursos e para onde vai cada lote: tudo local, sem API.
// É o que o editor recebe por propriedade no lugar das rotas de documento, que ainda não estão
// ligadas à tela. O lote é confirmado aqui mesmo: prova que gesto vira operação, não que salva.
import type { Documento, Operacao } from '@otto/documento';
import type { ResultadoDeAbrir } from '../../api/pecas';
import type { RecursosDoRender } from '../canvas/motor';
import type { LoteDoEditor, RespostaDoEnvio } from '../nucleo/sessaoDoDocumento';
import { FONTES_DE_EXEMPLO, type ImagemDeExemplo, montarDocumentoDeExemplo } from './documentoDeExemplo';

export interface ImagemGerada extends ImagemDeExemplo {
  bytes: ArrayBuffer;
}

export interface FonteDeExemplo {
  abrirPeca(id: string): Promise<ResultadoDeAbrir>;
  enviarLote(lote: LoteDoEditor<Operacao>): Promise<RespostaDoEnvio<Documento>>;
  recursos: RecursosDoRender;
  /** Os lotes que o editor mandou, em ordem. Para conferir no console que o gesto virou operação. */
  lotes: LoteDoEditor<Operacao>[];
}

export function criarFonteDeExemplo(deps: { gerarImagem(): Promise<ImagemGerada>; buscarFonte(arquivo: string): Promise<ArrayBuffer>; nomeDaPeca: string }): FonteDeExemplo {
  let imagem: Promise<ImagemGerada> | undefined;
  const aImagem = () => {
    imagem ??= deps.gerarImagem();
    return imagem;
  };
  const lotes: LoteDoEditor<Operacao>[] = [];

  return {
    lotes,
    async abrirPeca(id) {
      const arvore = montarDocumentoDeExemplo(await aImagem());
      return { estado: 'aberta', peca: { id, nome: deps.nomeDaPeca, versao: 1, arvore, historico: { podeDesfazer: false, podeRefazer: false } } };
    },
    async enviarLote(lote) {
      lotes.push(lote);
      return { tipo: 'confirmado', versao: lote.versaoBase + 1 };
    },
    recursos: {
      async imagem(hash) {
        const gerada = await aImagem();
        if (hash !== gerada.hash) throw new Error(`a bancada não tem a imagem ${hash}`);
        return gerada.bytes;
      },
      async fonte(familia, peso) {
        const fonte = FONTES_DE_EXEMPLO.find((f) => f.familia === familia && f.peso === peso);
        if (!fonte) throw new Error(`a bancada não tem a fonte ${familia} ${peso}`);
        return deps.buscarFonte(fonte.arquivo);
      },
    },
  };
}
