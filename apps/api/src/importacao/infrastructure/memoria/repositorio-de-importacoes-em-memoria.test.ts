import { randomUUID } from 'node:crypto';
import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeImportacoes } from '../../application/repositorio-de-importacoes.contrato';
import { RepositorioDeImportacoesEmMemoria } from './repositorio-de-importacoes-em-memoria';

contratoDoRepositorioDeImportacoes('em memória (adaptador falso)', async () => ({
  repositorio: new RepositorioDeImportacoesEmMemoria(),
  novaConta: async () => EscopoDaConta.abrir(lerContaId(randomUUID())),
  criarPeca: async () => randomUUID(),
}));
