import { lerContaId } from '@otto/shared';
import { EscopoDaConta } from '../../../plataforma/escopo/escopo-da-conta';
import { contratoDoRepositorioDeDocumentos } from '../../application/repositorio-de-documentos.contrato';
import { RepositorioDeDocumentosEmMemoria } from './repositorio-de-documentos-em-memoria';

contratoDoRepositorioDeDocumentos('em memória (adaptador falso)', async () => ({
  repositorio: new RepositorioDeDocumentosEmMemoria(),
  contaA: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000a')),
  contaB: EscopoDaConta.abrir(lerContaId('01990000-0000-7000-8000-00000000000b')),
}));
