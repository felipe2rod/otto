import { contratoDoArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo.contrato';
import { ArmazenamentoEmMemoria } from './armazenamento-em-memoria';

contratoDoArmazenamentoDeArquivo('em memória (adaptador falso)', async () => ({
  armazenamento: new ArmazenamentoEmMemoria(),
  limpar: async () => undefined,
}));
