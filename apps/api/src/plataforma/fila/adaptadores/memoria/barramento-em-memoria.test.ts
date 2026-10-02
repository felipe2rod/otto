import { contratoDoBarramentoDeEventos } from '../../barramento-de-eventos.contrato';
import { BarramentoEmMemoria } from './barramento-em-memoria';

contratoDoBarramentoDeEventos('em memória (adaptador falso)', async () => ({ barramento: new BarramentoEmMemoria(20, 300), limpar: async () => undefined }), {
  entregaMs: 1000,
  reentregaMs: 500,
  adiamentoMs: 300,
});
