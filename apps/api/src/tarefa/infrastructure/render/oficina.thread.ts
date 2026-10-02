// Ponto de entrada da thread de render da tarefa do Otto. O render que o Otto pede para conferir a peça, a
// verificação (que mede a tinta do texto e amostra pixels) e a redução de fotos rodam AQUI, fora do laço
// principal do worker: um render síncrono de uma prancheta grande não segura o sinal de vida, a rota de saúde
// nem as outras tarefas. A thread não tem banco, fila nem armazenamento: recebe fontes, imagens e documento
// como dado e devolve bytes. Cada tarefa tem a sua sessão do motor aqui dentro.
import { parentPort } from 'node:worker_threads';
import { verificarDocumento } from '@otto/documento';
import { codificarJpeg, criarMeiosDeVerificacao, criarSessao, reduzirFoto, renderizarPrancheta, type Sessao } from '@otto/render';
import { carregarCanvasKit } from '@otto/render/node';
import type { PedidoAOficina, RespostaDaOficina, ResultadoDaOficina } from './oficina-de-render';

const porta = parentPort;
if (!porta) throw new Error('este arquivo só roda como thread de render');

// a variante completa codifica JPEG; os pixels são os mesmos da padrão (docs/tecnico/spike-render.md)
const motor = carregarCanvasKit('completa');
const sessoes = new Map<number, Sessao>();
/** A qualidade do JPEG do render que o modelo vê (a mesma da avaliação). */
const QUALIDADE_DO_RENDER = 85;

const sessaoDe = (id: number): Sessao => {
  const sessao = sessoes.get(id);
  if (!sessao) throw new Error('sessão de render desconhecida');
  return sessao;
};

async function atender(pedido: PedidoAOficina): Promise<ResultadoDaOficina> {
  switch (pedido.tipo) {
    case 'abrir':
      sessoes.set(pedido.sessao, criarSessao(await motor, { fontes: pedido.fontes, imagens: pedido.imagens }));
      return { tipo: 'feito' };
    case 'fonte':
      sessaoDe(pedido.sessao).adicionarFonte(pedido.fonte);
      return { tipo: 'feito' };
    case 'imagem':
      sessaoDe(pedido.sessao).adicionarImagem(pedido.imagem);
      return { tipo: 'feito' };
    case 'renderizar': {
      const sessao = sessaoDe(pedido.sessao);
      const p = pedido.doc.pranchetas.find((x) => x.id === pedido.pedido.prancheta);
      if (!p) throw new Error('prancheta desconhecida');
      const [x, y, w, h] = pedido.pedido.regiao ?? [0, 0, p.largura, p.altura];
      const regiao = { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(1, Math.min(w, p.largura - Math.max(0, x))), h: Math.max(1, Math.min(h, p.altura - Math.max(0, y))) };
      const escala = Math.min(1, pedido.pedido.ladoMaximo / Math.max(regiao.w, regiao.h));
      const render = renderizarPrancheta(sessao, pedido.doc, p, { escala, ...(pedido.pedido.regiao ? { regiao } : {}) });
      const jpeg = codificarJpeg(sessao, render, QUALIDADE_DO_RENDER);
      if (!jpeg) throw new Error('este motor não codifica JPEG: carregue a variante completa');
      return { tipo: 'imagem', jpeg, largura: render.largura, altura: render.altura };
    }
    case 'verificar':
      return { tipo: 'avisos', avisos: verificarDocumento(pedido.doc, criarMeiosDeVerificacao(sessaoDe(pedido.sessao)), pedido.prancheta) };
    case 'reduzir': {
      const reduzida = reduzirFoto(sessaoDe(pedido.sessao), pedido.bytes, pedido.ladoMaximo);
      return reduzida ? { tipo: 'imagem', ...reduzida } : { tipo: 'nada' };
    }
    case 'fechar':
      sessoes.get(pedido.sessao)?.destruir();
      sessoes.delete(pedido.sessao);
      return { tipo: 'feito' };
  }
}

porta.on('message', async (pedido: PedidoAOficina & { id: number }) => {
  try {
    const resultado = await atender(pedido);
    const resposta: RespostaDaOficina = { id: pedido.id, ok: true, resultado };
    porta.postMessage(resposta);
  } catch (erro) {
    const e = erro instanceof Error ? erro : new Error(String(erro));
    const resposta: RespostaDaOficina = { id: pedido.id, ok: false, erro: { nome: e.name, mensagem: e.message } };
    porta.postMessage(resposta);
  }
});
