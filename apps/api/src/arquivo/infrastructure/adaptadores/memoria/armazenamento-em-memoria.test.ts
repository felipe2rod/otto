import { contratoDoArmazenamentoDeArquivo } from '../../../application/armazenamento-de-arquivo.contrato';
import { baixarLinkLocal } from '../links-locais';
import { ArmazenamentoEmMemoria } from './armazenamento-em-memoria';

contratoDoArmazenamentoDeArquivo('em memória (adaptador falso)', async () => {
  const armazenamento = new ArmazenamentoEmMemoria();
  return { armazenamento, baixar: (link) => baixarLinkLocal(armazenamento, link), limpar: async () => undefined };
});
