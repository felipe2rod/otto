import { contratoDaBibliotecaDeFontes } from '../../application/biblioteca-de-fontes.contrato';
import { BibliotecaDeFontesEmMemoria } from './biblioteca-de-fontes-em-memoria';

contratoDaBibliotecaDeFontes('em memória (adaptador falso)', async () => new BibliotecaDeFontesEmMemoria());
