// O contrato da fila contra o pg-boss de verdade, na base de teste, com otto_app (sem privilégio
// de esquema). O esquema da fila foi criado pelo migrador em testes/banco/preparar-banco-de-teste.ts.
import { urlDoAppDeTeste } from '../../../../../testes/banco/conexoes';
import { contratoDoBarramentoDeEventos } from '../../barramento-de-eventos.contrato';
import { BarramentoComPgBoss } from './barramento-com-pg-boss';

contratoDoBarramentoDeEventos(
  'pg-boss no PostgreSQL',
  async () => ({ barramento: new BarramentoComPgBoss(urlDoAppDeTeste(), { consumidor: true, intervaloDeConsultaEmSegundos: 0.5, intervaloDeManutencaoEmSegundos: 1 }), limpar: async () => undefined }),
  {
    entregaMs: 6000,
    reentregaMs: 8000,
  },
);
