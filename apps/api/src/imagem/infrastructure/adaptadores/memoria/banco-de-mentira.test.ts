import { contratoDoBancoDeImagens } from '../../../application/banco-de-imagens.contrato';
import { BancoDeMentira } from './banco-de-mentira';

contratoDoBancoDeImagens('falso', () => {
  const banco = new BancoDeMentira(new Uint8Array(2048).fill(7));
  return { banco, consulta: 'café', idas: () => banco.buscas.length + banco.baixados.length };
});
