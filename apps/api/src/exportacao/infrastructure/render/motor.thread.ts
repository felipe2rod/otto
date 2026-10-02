// Ponto de entrada da thread de render do worker. Roda o motor de verdade (render em CPU, PSD, SVG, PDF, e a
// importação de PSD) fora do laço principal do worker. Fala com o processo só por mensagem; não abre banco, fila nem
// armazenamento: recebe o documento e os recursos como dado e devolve os arquivos.
import { parentPort } from 'node:worker_threads';
import { MotorDeImportacaoComRender } from '../../../importacao/infrastructure/render/motor-de-importacao-com-render';
import { MotorDeExportacaoComRender } from './motor-de-exportacao-com-render';
import type { PedidoAThread, RespostaDaThread } from './motor-em-thread';

const porta = parentPort;
if (!porta) throw new Error('este arquivo só roda como thread de exportação');

const motor = new MotorDeExportacaoComRender();
// a importação usa o mesmo WebAssembly da exportação: uma instância por thread
const importacao = new MotorDeImportacaoComRender(() => motor.carregar());
// cede a vez entre as etapas, para a thread poder ser encerrada entre uma prancheta e outra
const entreEtapas = () => new Promise<void>((ok) => setImmediate(ok));

/** Os bytes num buffer próprio, que pode ser entregue ao processo sem cópia. */
function isolado(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes);
}

porta.on('message', async (pedido: PedidoAThread) => {
  try {
    if (pedido.formato === 'importar-psd') {
      const resultado = await importacao.importar(pedido.bytes, pedido.opcoes);
      const imagens = resultado.imagens.map((i) => ({ ...i, bytes: isolado(i.bytes) }));
      const resposta: RespostaDaThread = { id: pedido.id, ok: true, importacao: { ...resultado, imagens } };
      porta.postMessage(
        resposta,
        // a mesma imagem não aparece duas vezes na lista de transferência
        [...new Set(imagens.map((i) => i.bytes.buffer as ArrayBuffer))],
      );
      return;
    }
    const gerados = await (pedido.formato === 'psd'
      ? motor.psd(pedido.doc, pedido.recursos, pedido.opcoes, entreEtapas)
      : pedido.formato === 'png'
        ? motor.png(pedido.doc, pedido.recursos, pedido.opcoes, entreEtapas)
        : pedido.formato === 'svg'
          ? motor.svg(pedido.doc, pedido.recursos, pedido.opcoes, entreEtapas)
          : motor.pdf(pedido.doc, pedido.recursos, pedido.opcoes, entreEtapas));
    const arquivos = gerados.map((a) => ({ nome: a.nome, bytes: isolado(a.bytes) }));
    const resposta: RespostaDaThread = { id: pedido.id, ok: true, arquivos };
    porta.postMessage(
      resposta,
      arquivos.map((a) => a.bytes.buffer as ArrayBuffer),
    );
  } catch (erro) {
    const e = erro instanceof Error ? erro : new Error(String(erro));
    const codigo = (e as { codigo?: unknown }).codigo;
    const resposta: RespostaDaThread = { id: pedido.id, ok: false, erro: { nome: e.name, mensagem: e.message, pilha: e.stack ?? '', ...(typeof codigo === 'string' ? { codigo } : {}) } };
    porta.postMessage(resposta);
  }
});
