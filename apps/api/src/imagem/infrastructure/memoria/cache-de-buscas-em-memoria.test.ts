import { contratoDoCacheDeBuscas } from '../../application/cache-de-buscas.contrato';
import { CacheDeBuscasEmMemoria } from './cache-de-buscas-em-memoria';

contratoDoCacheDeBuscas('em memória (adaptador falso)', async () => new CacheDeBuscasEmMemoria());
