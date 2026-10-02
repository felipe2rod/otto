// Sem rede: o adaptador só é montado. A conversa com o fornecedor é testada no pacote do agente, contra
// respostas gravadas (packages/agente/src/adaptadores/claude.test.ts).
import { describe, expect, it } from 'vitest';
import { ConsumoDoModeloEmMemoria } from '../../../application/consumo-do-modelo';
import { contratoDeModelosDoOtto } from '../../../application/modelos-do-otto.contrato';
import { ModelosComClaude } from './modelos-com-claude';

contratoDeModelosDoOtto('claude', () => new ModelosComClaude({ chave: 'chave-de-mentira-123' }, new ConsumoDoModeloEmMemoria()));

describe('ModelosComClaude', () => {
  it('o nome do modelo vem da configuração, e a chave não aparece em nada que o modelo aberto expõe', () => {
    const { modelo } = new ModelosComClaude({ chave: 'chave-de-mentira-123', nome: 'anthropic-claude-haiku-4.5' }, new ConsumoDoModeloEmMemoria()).abrir();
    expect(modelo.nome).toContain('haiku');
    expect(JSON.stringify(modelo)).not.toContain('chave-de-mentira');
  });
});
