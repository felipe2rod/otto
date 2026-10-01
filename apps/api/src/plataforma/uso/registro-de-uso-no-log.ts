// Adaptador de RegistroDeUso que escreve no log estruturado. A tabela de eventos entra com o
// catálogo do analista-de-produto.
import type { EscopoDaConta } from '../escopo/escopo-da-conta';
import type { Registro } from '../log/registro';
import { type EventoDeUso, RegistroDeUso } from './registro-de-uso';

export class RegistroDeUsoNoLog extends RegistroDeUso {
  constructor(private readonly registro: Registro) {
    super();
  }

  registrar(escopo: EscopoDaConta, evento: EventoDeUso): void {
    this.registro.log({ ...evento, contaId: escopo.contaId });
  }
}
