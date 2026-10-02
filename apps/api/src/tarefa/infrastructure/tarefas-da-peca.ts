// O que o módulo de documento pergunta ao de tarefa: esta peça tem tarefa viva? Lê só o repositório (o caso
// de uso de tarefa depende do de documento, e não o contrário). Antes de responder dá baixa na tarefa cujo
// worker caiu: a peça não fica presa a uma tarefa parada só porque ninguém abriu o painel dela.
import type { TarefasDaPeca, TarefaVivaDaPeca } from '../../documento/application/casos-de-uso-de-documento';
import type { EscopoDaConta } from '../../plataforma/escopo/escopo-da-conta';
import { type RegistroDeUso, RegistroDeUsoMudo } from '../../plataforma/uso/registro-de-uso';
import { registrarBaixa, SEM_SINAL_DA_TAREFA_MS } from '../application/casos-de-uso-de-tarefa';
import type { RepositorioDeTarefas } from '../application/repositorio-de-tarefas';

export function tarefasDaPeca(tarefas: RepositorioDeTarefas, uso: RegistroDeUso = new RegistroDeUsoMudo(), agora: () => Date = () => new Date()): TarefasDaPeca {
  const viva = (escopo: EscopoDaConta, documentoId: string): Promise<TarefaVivaDaPeca | undefined> => tarefas.vivaDoDocumento(escopo, documentoId);
  return {
    async viva(escopo, documentoId) {
      const achada = await viva(escopo, documentoId);
      if (!achada || (achada.estado !== 'preparando' && achada.estado !== 'rodando')) return achada;
      const fechadas = await tarefas.darBaixaNasParadas(escopo, agora(), new Date(agora().getTime() - SEM_SINAL_DA_TAREFA_MS));
      for (const fechada of fechadas) registrarBaixa(uso, escopo, fechada);
      return fechadas.length > 0 ? viva(escopo, documentoId) : achada;
    },
    vivas: (escopo) => tarefas.vivasDaConta(escopo),
  };
}
