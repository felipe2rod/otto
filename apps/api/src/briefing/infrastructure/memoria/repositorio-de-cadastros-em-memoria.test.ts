import { randomUUID } from 'node:crypto';
import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeCadastros } from '../../application/repositorio-de-cadastros.contrato';
import { RepositorioDeCadastrosEmMemoria } from './repositorio-de-cadastros-em-memoria';

const repositorio = new RepositorioDeCadastrosEmMemoria();
contratoDoRepositorioDeCadastros('em memória (adaptador falso)', async () => ({
  repositorio,
  contaA: EscopoDaConta.abrir(lerContaId(randomUUID())),
  contaB: EscopoDaConta.abrir(lerContaId(randomUUID())),
}));
