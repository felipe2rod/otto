// Uma chamada ao modelo, com o que toda chamada precisa: cancelamento conferido antes, tempo medido pelo
// relógio da porta, custo somado e registrado. Direção, plano, ciclo e revisor passam por aqui.
import type { Contador } from './custo';
import { type AmbienteBase, ErroDoModelo, type ModeloDoAgente, type PedidoAoModelo, type RespostaDoModelo } from './portas';

export interface MeiosDeChamada {
  amb: Pick<AmbienteBase, 'relogio' | 'registrarChamada' | 'sinal'>;
  contador: Contador;
}

/** Imagens que o pedido leva e que ainda não tinham sido mandadas (as da última mensagem). */
function imagensNovas(pedido: Omit<PedidoAoModelo, 'sinal'>): number {
  const ultima = pedido.mensagens.at(-1);
  if (!ultima) return 0;
  const partes = ultima.papel === 'usuario' ? ultima.partes : ultima.papel === 'ferramentas' ? ultima.anexos : [];
  return partes.filter((p) => p.tipo === 'imagem').length;
}

export async function chamar(meios: MeiosDeChamada, modelo: ModeloDoAgente, pedido: Omit<PedidoAoModelo, 'sinal'>): Promise<RespostaDoModelo> {
  const { amb, contador } = meios;
  if (amb.sinal.aborted) throw new ErroDoModelo('cancelada', 'tarefa cancelada antes da chamada ao modelo');
  const imagens = modelo.capacidades.imagem ? imagensNovas(pedido) : 0;
  const inicio = amb.relogio.agora();
  try {
    const resposta = await modelo.responder({ ...pedido, sinal: amb.sinal });
    contador.chamada(pedido.papel, resposta.uso, modelo.preco);
    contador.imagens(imagens);
    await amb.registrarChamada?.({ papel: pedido.papel, modelo: modelo.nome, uso: resposta.uso, duracaoMs: amb.relogio.agora() - inicio, imagens, resultado: 'ok' });
    return resposta;
  } catch (e) {
    const erro = amb.sinal.aborted
      ? new ErroDoModelo('cancelada', 'tarefa cancelada durante a chamada ao modelo')
      : e instanceof ErroDoModelo
        ? e
        : new ErroDoModelo('desconhecido', 'o modelo falhou sem código');
    await amb.registrarChamada?.({
      papel: pedido.papel,
      modelo: modelo.nome,
      uso: { entrada: 0, cacheLido: 0, cacheCriado: 0, saida: 0 },
      duracaoMs: amb.relogio.agora() - inicio,
      imagens: 0,
      resultado: erro.codigo,
    });
    throw erro;
  }
}
