import { contratoDoBarramentoDeEventos } from '../../barramento-de-eventos.contrato';
import { BarramentoEmMemoria } from './barramento-em-memoria';

contratoDoBarramentoDeEventos('em memória (adaptador falso)', async () => ({ barramento: new BarramentoEmMemoria(), limpar: async () => undefined }), { entregaMs: 1000, reentregaMs: 500 });
