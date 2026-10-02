// Adaptador de ModelosDoOtto que não fala com modelo nenhum: reproduz uma tarefa gravada pelo treinador
// (@otto/agente/roteiros). É como o worker e o editor rodam a tarefa de ponta a ponta sem gastar token
// (docs/mvp/backend.md, 8.5). O roteiro é escolhido pelo TIPO da entrada, e não pelo conteúdo dela:
//   briefing → briefing-dois-formatos   (Feed e Story; pede o "pode")
//   criar    → criar-uma-peca           (uma prancheta; não pede o "pode")
//   pedido   → pedido-dois-formatos     (um quadrado e um banner a mais na peça aberta; pede o "pode")
//   ajuste   → ajuste-em-qualquer-peca  (põe em azul a primeira camada de texto da peça)
// Os roteiros se adaptam à peça (leem dela o nome da prancheta e da camada) e não tocam no que já existia.
// O de briefing cria sempre Feed e Story: se o formulário pedir outros formatos, os lotes são recusados pela
// guarda do plano e a tarefa termina sem alterar nada. O roteiro é para desenvolver, não para acertar o pedido.
import { criarModeloRoteirizado, type EntradaDaTarefa, idsDoRoteiro, type PrecoDoModelo, type Roteiro } from '@otto/agente';
import roteiroDoAjuste from '@otto/agente/roteiros/ajuste-em-qualquer-peca.json' with { type: 'json' };
import roteiroDoBriefing from '@otto/agente/roteiros/briefing-dois-formatos.json' with { type: 'json' };
import roteiroDeCriar from '@otto/agente/roteiros/criar-uma-peca.json' with { type: 'json' };
import roteiroDoPedido from '@otto/agente/roteiros/pedido-dois-formatos.json' with { type: 'json' };
import { type ModeloAberto, ModelosDoOtto, type PedidoDeModelo } from '../../../application/modelos-do-otto';

/** O preço do Sonnet 5 (docs/tecnico/custos.md): o custo registrado no desenvolvimento tem a ordem de grandeza do de verdade. */
const PRECO_DE_REFERENCIA: PrecoDoModelo = { entrada: 2, saida: 10, cacheLido: 0.2, cacheCriado: 2.5 };
/** Os papéis da segunda parte da tarefa. A primeira (direção e plano) é tudo que vem antes. */
const PAPEIS_DA_EXECUCAO: readonly (string | undefined)[] = ['agente', 'ajuste'];

const ROTEIROS: Record<EntradaDaTarefa['tipo'], Roteiro> = {
  briefing: roteiroDoBriefing as Roteiro,
  criar: roteiroDeCriar as Roteiro,
  pedido: roteiroDoPedido as Roteiro,
  ajuste: roteiroDoAjuste as Roteiro,
};

export function roteiroPara(entrada: EntradaDaTarefa): Roteiro {
  return ROTEIROS[entrada.tipo];
}

export class ModelosRoteirizados extends ModelosDoOtto {
  /** @param velocidade 0: responde na hora. 1: demora o que demorou na gravação. */
  constructor(private readonly opcoes: { velocidade: number; roteiroPara?: (entrada: EntradaDaTarefa) => Roteiro }) {
    super();
  }

  abrir(pedido: PedidoDeModelo): ModeloAberto {
    const roteiro = (this.opcoes.roteiroPara ?? roteiroPara)(pedido.entrada);
    const primeiroDaExecucao = Math.max(
      0,
      roteiro.passos.findIndex((p) => PAPEIS_DA_EXECUCAO.includes(p.papel)),
    );
    // as duas partes da tarefa são conversas separadas, talvez em processos diferentes: cada uma pega a sua fatia
    const passos = pedido.parte === 'preparo' ? roteiro.passos.slice(0, primeiroDaExecucao) : roteiro.passos.slice(primeiroDaExecucao);
    const novoId = idsDoRoteiro(roteiro);
    // os ids dos nós saem dos ids da gravação: a segunda parte continua de onde a primeira parou
    if (pedido.parte === 'execucao') for (let i = 0; i < pedido.idsDoPreparo; i++) novoId();
    return { modelo: criarModeloRoteirizado({ passos }, { nome: `roteiro:${roteiro.nome}`, velocidade: this.opcoes.velocidade, preco: PRECO_DE_REFERENCIA }), novoId };
  }
}
