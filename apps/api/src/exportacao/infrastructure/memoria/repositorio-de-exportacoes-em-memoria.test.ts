import { randomUUID } from 'node:crypto';
import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeExportacoes } from '../../application/repositorio-de-exportacoes.contrato';
import { RepositorioDeExportacoesEmMemoria } from './repositorio-de-exportacoes-em-memoria';

contratoDoRepositorioDeExportacoes('em memória (adaptador falso)', async () => ({
  repositorio: new RepositorioDeExportacoesEmMemoria(),
  contaA: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a')),
  contaB: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b')),
  criarDocumento: async () => randomUUID(),
}));
