// O escopo de um trabalho da fila (ADR 023, item 5b). O `contaId` que vem no trabalho é HIPÓTESE:
// este escopo só serve para reler o agregado sob RLS. Se a linha não existe nesse escopo, o
// trabalho não é processado. Trabalho adulterado vira trabalho morto, não vazamento.
import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from './escopo-da-conta';

export function escopoDoTrabalho(trabalho: { contaId: string }): EscopoDaConta {
  return EscopoDaConta.abrir(lerContaId(trabalho.contaId));
}
