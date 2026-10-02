// Adaptador de ModelosDoOtto com o modelo de verdade: o adaptador do Claude de @otto/agente (inferência na
// DigitalOcean, ADR 029). Nome de fornecedor só aparece aqui e na configuração (ADR 020).
// A chave vem da configuração do processo e não é escrita em log, evento nem resposta.
// A cada resposta o fornecedor diz quanto resta do limite diário dele: isso é anotado no contador da
// plataforma, e o caso de uso recusa tarefa nova (e para a que roda) quando o resto fica curto.
import { randomUUID } from 'node:crypto';
import { criarModeloClaude } from '@otto/agente/adaptadores/claude';
import type { ConsumoDoModelo } from '../../../application/consumo-do-modelo';
import { type ModeloAberto, ModelosDoOtto } from '../../../application/modelos-do-otto';

export class ModelosComClaude extends ModelosDoOtto {
  constructor(
    private readonly opcoes: { chave: string; endereco?: string; nome?: string },
    private readonly consumo: ConsumoDoModelo,
    private readonly agora: () => Date = () => new Date(),
  ) {
    super();
  }

  abrir(): ModeloAberto {
    const modelo = criarModeloClaude({
      chave: this.opcoes.chave,
      ...(this.opcoes.nome ? { modelo: this.opcoes.nome } : {}),
      ...(this.opcoes.endereco ? { endereco: this.opcoes.endereco } : {}),
      aoVerLimites: ({ restamNoDia }) => {
        // contador fora do ar não derruba a chamada ao modelo
        if (restamNoDia !== undefined) void this.consumo.anotarRestante(this.agora(), restamNoDia).catch(() => undefined);
      },
    });
    return { modelo, novoId: randomUUID };
  }
}
