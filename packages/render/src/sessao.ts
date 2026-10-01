// Sessão de render: tudo que o motor guarda entre desenhos vive aqui e morre com ela.
// Recursos entram por parâmetro, como bytes: o motor não lê disco, rede nem armazenamento, e quem confere
// a conta dona do arquivo é quem chama. Não há cache global entre sessões.
import type { CanvasKit, Image } from 'canvaskit-wasm';
import { type Ajustador, criarAjustador } from './ajustes';
import { criarMesclador, type Mesclador } from './mesclagem';
import { criarMotorDeTexto, type FonteDeArquivo, type MotorDeTexto } from './texto';

export type { FonteDeArquivo } from './texto';

export interface ImagemDeArquivo {
  /** chave pela qual o documento referencia o arquivo: o sha256 do conteúdo */
  arquivo: string;
  /** PNG, JPEG ou WebP. A decodificação é a do próprio WebAssembly, igual no navegador e no Node. */
  bytes: Uint8Array;
}

export interface RecursosDaSessao {
  fontes: readonly FonteDeArquivo[];
  imagens: readonly ImagemDeArquivo[];
}

export interface Sessao {
  readonly ck: CanvasKit;
  readonly texto: MotorDeTexto;
  readonly mesclador: Mesclador;
  readonly ajustador: Ajustador;
  imagem(arquivo: string): Image | undefined;
  /** Entrega mais uma fonte. Repetir a mesma família e peso não faz nada. */
  adicionarFonte(fonte: FonteDeArquivo): void;
  /** Entrega mais uma imagem, decodificada na hora. Repetir a mesma chave não faz nada. */
  adicionarImagem(imagem: ImagemDeArquivo): void;
  destruir(): void;
}

export function criarSessao(ck: CanvasKit, recursos: RecursosDaSessao): Sessao {
  const texto = criarMotorDeTexto(ck, recursos.fontes);
  const mesclador = criarMesclador(ck);
  const ajustador = criarAjustador(ck);
  const imagens = new Map<string, Image>();
  const adicionarImagem = (i: ImagemDeArquivo): void => {
    if (imagens.has(i.arquivo)) return;
    const codificada = ck.MakeImageFromEncoded(i.bytes);
    if (!codificada) throw new Error(`A imagem ${i.arquivo.slice(0, 12)} não foi reconhecida: o motor decodifica PNG, JPEG e WebP`);
    // decodifica já e gera os níveis reduzidos: foto grande em caixa pequena não serrilha
    const pronta = codificada.makeCopyWithDefaultMipmaps();
    codificada.delete();
    imagens.set(i.arquivo, pronta);
  };
  for (const i of recursos.imagens) adicionarImagem(i);
  return {
    ck,
    texto,
    mesclador,
    ajustador,
    imagem: (arquivo) => imagens.get(arquivo),
    adicionarFonte: (f) => texto.registrar(f),
    adicionarImagem,
    destruir() {
      for (const img of imagens.values()) img.delete();
      imagens.clear();
      texto.destruir();
      mesclador.destruir();
      ajustador.destruir();
    },
  };
}
