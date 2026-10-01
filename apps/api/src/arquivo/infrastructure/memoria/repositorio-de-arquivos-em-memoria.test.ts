import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeArquivos } from '../../application/repositorio-de-arquivos.contrato';
import { RepositorioDeArquivosEmMemoria } from './repositorio-de-arquivos-em-memoria';

contratoDoRepositorioDeArquivos('em memória (adaptador falso)', async () => ({
  repositorio: new RepositorioDeArquivosEmMemoria(),
  contaA: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a')),
  contaB: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b')),
}));
