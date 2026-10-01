// Sessão de render: tudo que o motor guarda entre desenhos vive aqui e morre com ela.
// Recursos entram por parâmetro, como bytes (R1). Não há cache global nem leitura de disco ou rede (R2).
import type { CanvasKit, Image } from 'canvaskit-wasm';
import { type Ajustador, criarAjustador } from './ajustes.ts';
import { criarMesclador, type Mesclador } from './mesclagem.ts';
import { criarMotorDeTexto, type FonteDeArquivo, type MotorDeTexto } from './texto.ts';

export type { FonteDeArquivo } from './texto.ts';

/** Nome e versão do motor: entram no registro da tarefa e na chave de qualquer cache de render (R8). */
export const MOTOR = { nome: 'canvaskit-wasm', versao: '0.42.0', raster: 'cpu' } as const;

export interface ImagemDeArquivo {
  /** chave pela qual o documento referencia o arquivo (no produto, o sha256 do conteúdo) */
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
  /** Bytes decodificados que a sessão segura (imagens com os níveis reduzidos). */
  readonly bytesDeImagem: number;
  destruir(): void;
}

export function criarSessao(ck: CanvasKit, recursos: RecursosDaSessao): Sessao {
  const texto = criarMotorDeTexto(ck, recursos.fontes);
  const mesclador = criarMesclador(ck);
  const ajustador = criarAjustador(ck);
  const imagens = new Map<string, Image>();
  let bytesDeImagem = 0;
  for (const i of recursos.imagens) {
    const codificada = ck.MakeImageFromEncoded(i.bytes);
    if (!codificada) throw new Error(`Imagem "${i.arquivo}": formato não reconhecido (o motor decodifica PNG, JPEG e WebP)`);
    // decodifica já e gera os níveis reduzidos: foto grande em caixa pequena não serrilha
    const pronta = codificada.makeCopyWithDefaultMipmaps();
    codificada.delete();
    imagens.set(i.arquivo, pronta);
    bytesDeImagem += Math.round(pronta.width() * pronta.height() * 4 * (4 / 3));
  }
  return {
    ck,
    texto,
    mesclador,
    ajustador,
    imagem: (arquivo) => imagens.get(arquivo),
    bytesDeImagem,
    destruir() {
      for (const img of imagens.values()) img.delete();
      imagens.clear();
      texto.destruir();
      mesclador.destruir();
      ajustador.destruir();
    },
  };
}
